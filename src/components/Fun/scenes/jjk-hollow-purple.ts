import { clamp, createCanvasScene, damp, easeInOutCubic, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { burst, emit, freeCanvas, glow, glowSprite, layer, makePool, mulberry, setHum, shakeX, shakeY, startHum, stepPool, stopHum } from './heroes-kit';
import type { Hum, Pool } from './heroes-kit';
import { capsule, cel, elbow, hand, inked, spiky, within } from './anime-more-kit';
import type { C, Grip } from './anime-more-kit';

/**
 * Hollow Purple: Gojo Satoru over a night city. Hold to gather Blue in one hand and Red in the
 * other (the blindfold comes down as the Six Eyes open), let go to fold them together and fire
 * a purple sphere that erases a channel through the skyline toward the pointer. Press D or
 * double tap for Domain Expansion: the world is swallowed by the Unlimited Void.
 */

const INK = '#141626';
const SKIN = '#fbe6d8';
const SKIN_SH = '#e8b9a8';
const HAIR = '#f6f8fd';
const HAIR_SH = '#c3cce2';
const HAIR_DEEP = '#93a0c2';
const CLOTH = '#1b2135';
const CLOTH_SH = '#0d1120';
const CLOTH_HI = '#2c3552';

const SPARK = 0;
const DEBRIS = 1;
const MOTE = 2;

/** Hair outline around the top of the head: tip and valley points, local units */
const HAIR_PTS = [
  -46, -84, -74, -96, -56, -112, -96, -132, -60, -138, -90, -178, -50, -164, -60, -216, -26, -180, -22, -234, -4, -190, 14, -240, 18,
  -190, 48, -224, 40, -170, 84, -190, 56, -140, 98, -140, 58, -114, 78, -96, 46, -84, 28, -102, 10, -98, -10, -102, -28, -98,
];
const SHOULDER = 100;
const L1 = 118;
const L2 = 110;

interface Scar {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  life: number;
}

interface State {
  press: { pointer: boolean; key: boolean; touched: boolean; lastTap: number };
  holding: boolean;
  /** 0 idle, 1 charging, 2 merging, 3 sphere in flight */
  phase: number;
  c: number;
  fireC: number;
  phaseT: number;
  reveal: number;
  revealHold: number;
  out: number;
  merge: number;
  point: number;
  sign: number;
  aim: number;
  aimTarget: number;
  sx: number;
  sy: number;
  sr: number;
  svx: number;
  svy: number;
  sAlive: boolean;
  sTrail: number;
  scars: Scar[];
  regrow: number;
  flash: number;
  kick: number;
  dom: number;
  domOn: boolean;
  domT: number;
  demoT: number;
  t: number;
  pool: Pool;
  hum: Hum | null;
  // layout
  u: number;
  ox: number;
  oy: number;
  horizon: number;
  portrait: boolean;
  bg: HTMLCanvasElement | null;
  city: HTMLCanvasElement | null;
  cityClean: HTMLCanvasElement | null;
  /** Hand and orb anchors in screen px, written by the rig */
  bx: number;
  by: number;
  rx: number;
  ry: number;
  hx: number;
  hy: number;
  arms: number[];
  sprites: Record<'blue' | 'red' | 'purple' | 'white' | 'eye', HTMLCanvasElement>;
  stars: Float32Array;
}

/* ---------- backdrop ---------- */

function paintSky(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.bg, w, h, dpr);
  s.bg = cv;
  if (!c) return;
  const hz = s.horizon;
  const sky = c.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#03040c');
  sky.addColorStop(0.55, '#0b1030');
  sky.addColorStop(1, '#2b1b4f');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, hz + 2);
  // the trench left by an erased city reads as a deep void
  const pit = c.createLinearGradient(0, hz, 0, h);
  pit.addColorStop(0, '#1a0f33');
  pit.addColorStop(0.3, '#07040f');
  pit.addColorStop(1, '#020106');
  c.fillStyle = pit;
  c.fillRect(0, hz, w, h - hz);
  const rnd = mulberry(7);
  for (let i = 0; i < (w * hz) / 2200; i++) {
    c.globalAlpha = 0.15 + rnd() * 0.6;
    c.fillStyle = rnd() < 0.25 ? '#b9c8ff' : '#ffffff';
    const r = rnd() < 0.08 ? 1.5 : 0.8;
    c.fillRect(rnd() * w, rnd() * hz * 0.85, r, r);
  }
  c.globalAlpha = 1;
  // a big pale moon framing his head
  const mx = s.portrait ? w * 0.74 : w * 0.66;
  const my = s.portrait ? hz * 0.2 : h * 0.22;
  const mr = Math.min(w, h) * (s.portrait ? 0.13 : 0.17);
  const halo = c.createRadialGradient(mx, my, mr * 0.9, mx, my, mr * 2.6);
  halo.addColorStop(0, 'rgba(150,170,255,0.22)');
  halo.addColorStop(1, 'rgba(90,80,200,0)');
  c.fillStyle = halo;
  c.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
  const disc = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.35, mr * 0.1, mx, my, mr);
  disc.addColorStop(0, '#f4f2ff');
  disc.addColorStop(0.75, '#cdd3f4');
  disc.addColorStop(1, '#a6aee0');
  c.fillStyle = disc;
  c.beginPath();
  c.arc(mx, my, mr, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(110,120,190,0.16)';
  for (const [a, b, r] of [
    [-0.3, -0.2, 0.2],
    [0.28, 0.25, 0.26],
    [0.35, -0.4, 0.1],
    [-0.2, 0.45, 0.12],
  ]) {
    c.beginPath();
    c.arc(mx + a * mr, my + b * mr, r * mr, 0, TAU);
    c.fill();
  }
}

function paintCity(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const a = layer(s.cityClean, w, h, dpr);
  s.cityClean = a.cv;
  const c = a.c;
  if (!c) return;
  c.clearRect(0, 0, w, h);
  const hz = s.horizon;
  const u = Math.max(0.6, s.u);
  const rnd = mulberry(23);
  // haze on the horizon
  const haze = c.createLinearGradient(0, hz - 90 * u, 0, hz);
  haze.addColorStop(0, 'rgba(120,80,200,0)');
  haze.addColorStop(1, 'rgba(120,80,200,0.25)');
  c.fillStyle = haze;
  c.fillRect(0, hz - 90 * u, w, 90 * u);
  // three rows of towers, far to near
  const rows: [number, number, string, string, number][] = [
    [hz, 150, '#171a3a', 'rgba(150,170,255,0.35)', 0.5],
    [hz + 8 * u, 120, '#0e1029', 'rgba(255,214,150,0.55)', 0.75],
    [hz + 22 * u, 90, '#07081a', 'rgba(140,230,255,0.7)', 1],
  ];
  for (const [base, tall, col, lit, k] of rows) {
    let x = -10;
    while (x < w + 10) {
      const bw = (24 + rnd() * 46) * u * (0.7 + k * 0.4);
      const bh = (24 + rnd() * rnd() * tall + (rnd() < 0.12 ? tall * 0.8 : 0)) * u;
      const top = base - bh;
      c.fillStyle = col;
      c.fillRect(x, top, bw - 2 * u, h - top);
      if (rnd() < 0.3) {
        // antenna with a red light
        c.fillRect(x + bw * 0.45, top - 16 * u, 1.5 * u, 16 * u);
        c.fillStyle = '#ff4d5e';
        c.fillRect(x + bw * 0.45 - u, top - 17 * u, 3 * u, 2.5 * u);
      }
      // windows
      c.fillStyle = lit;
      const ww = 3 * u;
      const wh = 4 * u;
      for (let yy = top + 6 * u; yy < base + 30 * u; yy += 9 * u) {
        for (let xx = x + 4 * u; xx < x + bw - 8 * u; xx += 7 * u) {
          if (rnd() < 0.32) c.fillRect(xx, yy, ww, wh);
        }
      }
      x += bw;
    }
  }
  // street level glow
  const street = c.createLinearGradient(0, hz + 20 * u, 0, h);
  street.addColorStop(0, '#0a0b1c');
  street.addColorStop(1, '#04040c');
  c.fillStyle = street;
  c.fillRect(0, hz + 30 * u, w, h);
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w;
    const y = hz + 34 * u + rnd() * (h - hz) * 0.5;
    c.fillStyle = rnd() < 0.5 ? 'rgba(255,190,120,0.25)' : 'rgba(120,200,255,0.22)';
    c.fillRect(x, y, (6 + rnd() * 20) * u, 1.5 * u);
  }
  c.globalCompositeOperation = 'source-over';
  const b = layer(s.city, w, h, dpr);
  s.city = b.cv;
  if (b.c) {
    b.c.clearRect(0, 0, w, h);
    b.c.drawImage(a.cv, 0, 0, w, h);
  }
}

/* ---------- Gojo ---------- */

const ARM = [0, 0, 0, 0];

/** Pick the elbow that sits outward and low, so arms never fold through the chest */
function solveArm(side: number, hx: number, hy: number) {
  const sx = side * SHOULDER;
  const sy = 84;
  elbow(ARM, sx, sy, hx, hy, L1, L2, 1);
  const ax = ARM[0];
  const ay = ARM[1];
  elbow(ARM, sx, sy, hx, hy, L1, L2, -1);
  const score = (x: number, y: number) => x * side + y * 0.6;
  if (score(ax, ay) > score(ARM[0], ARM[1])) {
    ARM[0] = ax;
    ARM[1] = ay;
  }
  return ARM;
}

function torso(c: C) {
  c.moveTo(-36, 20);
  c.bezierCurveTo(-70, 40, -104, 52, -120, 76);
  c.bezierCurveTo(-134, 110, -128, 220, -118, 380);
  c.lineTo(118, 380);
  c.bezierCurveTo(128, 220, 134, 110, 120, 76);
  c.bezierCurveTo(104, 52, 70, 40, 36, 20);
  c.closePath();
}

function collar(c: C) {
  c.moveTo(-38, -22);
  c.quadraticCurveTo(0, -12, 38, -22);
  c.lineTo(42, 34);
  c.quadraticCurveTo(0, 46, -42, 34);
  c.closePath();
}

function face(c: C) {
  c.moveTo(-43, -100);
  c.bezierCurveTo(-46, -70, -42, -46, -28, -28);
  c.quadraticCurveTo(-12, -10, 0, -9);
  c.quadraticCurveTo(12, -10, 28, -28);
  c.bezierCurveTo(42, -46, 46, -70, 43, -100);
  c.closePath();
}

function drawArm(c: C, s: State, side: number, hx: number, hy: number, grip: Grip, ha: number) {
  const j = solveArm(side, hx, hy);
  const sx = side * SHOULDER;
  const sy = 84;
  const ex = j[0];
  const ey = j[1];
  const wx = j[2];
  const wy = j[3];
  cel(c, (g) => capsule(g, sx, sy, 30, ex, ey, 25), CLOTH, CLOTH_SH, -6, -5, INK, 3);
  cel(c, (g) => capsule(g, ex, ey, 25, wx, wy, 21), CLOTH, CLOTH_SH, -6, -5, INK, 3);
  // cuff
  const fa = Math.atan2(wy - ey, wx - ex);
  c.save();
  c.translate(wx, wy);
  c.rotate(fa);
  inked(c, (g) => g.rect(-12, -22, 12, 44), CLOTH_HI, INK, 2.5);
  c.restore();
  hand(c, wx + Math.cos(fa) * 6, wy + Math.sin(fa) * 6, ha, grip === 'cross' ? 27 : 24, grip, side, SKIN, SKIN_SH, INK, 2.4);
  // creases at the elbow
  c.strokeStyle = CLOTH_SH;
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(ex - 10, ey - 6);
  c.quadraticCurveTo(ex, ey + 4, ex + 10, ey - 4);
  c.stroke();
  return { wx, wy, fa };
}

function drawEyes(c: C, s: State, t: number) {
  const k = s.reveal;
  if (k <= 0.01) return;
  const blink = Math.abs(Math.sin(t * 0.37)) > 0.995 ? 0.2 : 1;
  for (const side of [-1, 1]) {
    const ex = side * 18;
    const ey = -80;
    const eh = 10 * blink;
    // sclera
    c.beginPath();
    c.moveTo(ex - 15, ey + 1);
    c.quadraticCurveTo(ex - side * 2, ey - eh * 1.2, ex + 15, ey - 1 - side * 1);
    c.quadraticCurveTo(ex, ey + eh * 0.9, ex - 15, ey + 1);
    c.closePath();
    c.fillStyle = '#ffffff';
    c.fill();
    c.save();
    c.clip();
    const ir = c.createRadialGradient(ex, ey - 1, 1, ex, ey, 9);
    ir.addColorStop(0, '#f2fdff');
    ir.addColorStop(0.35, '#8fe4ff');
    ir.addColorStop(0.75, '#2a8ff0');
    ir.addColorStop(1, '#123a9a');
    c.fillStyle = ir;
    c.beginPath();
    c.arc(ex, ey, 8.5, 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(ex - 3, ey - 3.5, 2.6, 0, TAU);
    c.arc(ex + 3.5, ey + 2.5, 1.2, 0, TAU);
    c.fill();
    c.restore();
    // white lashes over a thin dark lid
    c.strokeStyle = INK;
    c.lineWidth = 3.4;
    c.beginPath();
    c.moveTo(ex - 16, ey + 2);
    c.quadraticCurveTo(ex - side * 2, ey - eh * 1.25, ex + 16, ey - 1);
    c.stroke();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(ex - 15, ey + 1);
    c.quadraticCurveTo(ex - side * 2, ey - eh * 1.25, ex + 15, ey - 1);
    for (let i = 0; i < 3; i++) {
      const lx = ex + side * (8 + i * 4);
      const ly = ey - eh * 0.8 + i * 1.6;
      c.moveTo(lx, ly);
      c.lineTo(lx + side * 6, ly - 4 + i);
    }
    c.stroke();
    // brows
    c.strokeStyle = '#e9eef9';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(ex - side * 12, ey - 17);
    c.quadraticCurveTo(ex, ey - 21, ex + side * 13, ey - 17);
    c.stroke();
  }
}

function drawHead(c: C, s: State, t: number) {
  // ears
  for (const side of [-1, 1]) cel(c, (g) => g.ellipse(side * 44, -70, 7, 12, side * 0.2, 0, TAU), SKIN, SKIN_SH, -2, -2, INK, 2.4);
  cel(c, face, SKIN, SKIN_SH, -7, -4, INK, 3);
  // neck shadow under the jaw
  within(c, face, () => {
    c.fillStyle = 'rgba(200,140,140,0.35)';
    c.beginPath();
    c.ellipse(0, -6, 40, 14, 0, 0, TAU);
    c.fill();
  });
  // nose and a small confident smirk
  c.strokeStyle = '#b07a6c';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(1, -60);
  c.lineTo(4, -50);
  c.lineTo(0, -48);
  c.stroke();
  c.strokeStyle = INK;
  c.lineWidth = 2.3;
  c.beginPath();
  c.moveTo(-10, -32);
  c.quadraticCurveTo(0, -29 + s.c * 2, 11, -35);
  c.stroke();

  drawEyes(c, s, t);

  // blindfold: slides down off the eyes and fades as the Six Eyes open
  const k = easeInOutCubic(s.reveal);
  if (k < 0.98) {
    c.save();
    c.globalAlpha = 1 - k;
    c.translate(0, k * 70);
    const band = (g: C) => {
      g.moveTo(-48, -102);
      g.quadraticCurveTo(0, -96, 48, -102);
      g.lineTo(46, -68);
      g.quadraticCurveTo(0, -62, -46, -68);
      g.closePath();
    };
    inked(c, band, '#0e0f15', INK, 3);
    c.strokeStyle = 'rgba(120,130,170,0.5)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-40, -95);
    c.quadraticCurveTo(0, -90, 40, -95);
    c.stroke();
    c.restore();
  }

  // hair: big upswept white spikes
  const sway = Math.sin(t * 1.4) * 2 + s.c * Math.sin(t * 9) * 2;
  const pts = HAIR_PTS.slice();
  for (let i = 0; i < pts.length; i += 2) if (pts[i + 1] < -150) pts[i] += sway * ((pts[i + 1] + 150) / -90);
  const hairPath = (g: C) => spiky(g, pts, -0.1);
  // a darker back layer gives the mop some depth
  c.save();
  c.translate(0, -100);
  c.scale(1.07, 1.04);
  c.rotate(0.05);
  c.translate(0, 100);
  inked(c, (g) => spiky(g, pts, -0.06), HAIR_DEEP, INK, 3);
  c.restore();
  cel(c, hairPath, HAIR, HAIR_SH, -9, -7, INK, 3.2);
  within(c, hairPath, () => {
    c.fillStyle = HAIR_DEEP;
    c.globalAlpha = 0.55;
    c.beginPath();
    c.ellipse(26, -100, 40, 14, 0, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = HAIR_SH;
    c.lineWidth = 2;
    c.beginPath();
    for (const [x0, y0, x1, y1] of [
      [-30, -110, -52, -176],
      [-8, -116, -16, -196],
      [12, -116, 24, -200],
      [30, -112, 52, -170],
      [-40, -102, -66, -138],
    ]) {
      c.moveTo(x0, y0);
      c.quadraticCurveTo((x0 + x1) / 2 + 6, (y0 + y1) / 2, x1, y1);
    }
    c.stroke();
  });
  // loose locks falling over the band and between the eyes
  const lock = (x: number, len: number, bend: number, wd: number) => {
    const side = (g: C) => {
      g.moveTo(x - wd, -108);
      g.quadraticCurveTo(x - wd * 0.6 + bend * 0.5, -106 + len * 0.55, x + bend, -106 + len);
      g.quadraticCurveTo(x + wd * 0.5 + bend * 0.4, -106 + len * 0.45, x + wd, -108);
    };
    c.beginPath();
    side(c);
    c.closePath();
    c.fillStyle = HAIR;
    c.fill();
    c.beginPath();
    side(c);
    c.strokeStyle = INK;
    c.lineWidth = 2.2;
    c.stroke();
    c.strokeStyle = HAIR_SH;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x + 1, -104);
    c.quadraticCurveTo(x + bend * 0.5, -104 + len * 0.5, x + bend * 0.8, -108 + len * 0.85);
    c.stroke();
  };
  const fall = 0.35 + 0.65 * easeInOutCubic(s.reveal);
  lock(-38, 26 * fall, -7, 10);
  lock(-2, 42 * fall, 3, 8);
  lock(36, 24 * fall, 7, 10);
}

function drawGojo(c: C, s: State, t: number) {
  const u = s.u;
  c.save();
  c.translate(s.ox, s.oy);
  c.scale(u, u);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const breath = Math.sin(t * 1.8) * 2;
  c.translate(0, breath * (1 - s.out));

  cel(c, torso, CLOTH, CLOTH_SH, -10, -6, INK, 3.4);
  // coloured light spilling from Blue and Red onto the jacket
  const spill = s.out * (s.phase === 1 || s.phase === 2 ? s.c : 0);
  if (spill > 0.02) {
    within(c, torso, () => {
      for (const [side, col] of [
        [-1, '80,150,255'],
        [1, '255,60,80'],
      ] as const) {
        const g = c.createRadialGradient(side * 250, 40, 10, side * 250, 40, 300);
        g.addColorStop(0, `rgba(${col},${(0.55 * spill).toFixed(3)})`);
        g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g;
        c.fillRect(-140, 0, 280, 400);
      }
    });
  }
  // centre placket and folds
  c.strokeStyle = CLOTH_SH;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(0, 40);
  c.lineTo(0, 380);
  c.moveTo(-60, 150);
  c.quadraticCurveTo(-50, 220, -70, 300);
  c.moveTo(64, 140);
  c.quadraticCurveTo(54, 230, 74, 320);
  c.stroke();
  c.strokeStyle = CLOTH_HI;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-100, 80);
  c.quadraticCurveTo(-80, 66, -50, 56);
  c.stroke();
  cel(c, collar, CLOTH, CLOTH_SH, -6, -3, INK, 3.2);
  // the inside of the collar and its swirl button
  inked(c, (g) => g.ellipse(0, -18, 37, 7, 0, Math.PI, TAU), CLOTH_SH, INK, 2.4);
  inked(c, (g) => g.arc(0, 40, 7, 0, TAU), '#c9a24a', INK, 2);
  c.strokeStyle = '#7d5f1f';
  c.lineWidth = 1.6;
  c.beginPath();
  c.arc(0, 40, 3.5, 0, Math.PI * 1.5);
  c.stroke();

  c.save();
  c.translate(0, -14);
  c.scale(1.2, 1.2);
  c.translate(0, 14);
  drawHead(c, s, t);
  c.restore();

  // arms
  const outK = easeInOutCubic(s.out);
  const mergeK = easeInOutCubic(s.merge);
  const pointK = easeOutCubic(s.point);
  const signK = easeInOutCubic(s.sign);
  const jit = s.c * Math.sin(t * 50) * 1.5;
  const dirX = Math.cos(s.aim);
  const dirY = Math.sin(s.aim);
  for (const side of [-1, 1]) {
    // idle: hands loose by the hips
    let hx = side * 124;
    let hy = 316;
    let ha = Math.PI / 2 - side * 0.15;
    let grip: Grip = 'fist';
    // charge: arms out wide, palms up under each orb
    hx = lerp(hx, side * (s.portrait ? 180 : 250) + jit, outK);
    hy = lerp(hy, (s.portrait ? -110 : -10) - jit, outK);
    ha = lerp(ha, side > 0 ? (s.portrait ? -1.1 : -0.5) : Math.PI + (s.portrait ? 1.1 : 0.5), outK);
    if (outK > 0.4) grip = 'open';
    // merge: palms brought together in front of the chest
    hx = lerp(hx, side * 34, mergeK);
    hy = lerp(hy, 168, mergeK);
    ha = lerp(ha, side > 0 ? -2.2 : -0.94, mergeK);
    // fire: the lead hand thrusts toward the aim, the other drops away
    if (side > 0) {
      hx = lerp(hx, SHOULDER + dirX * 214, pointK);
      hy = lerp(hy, 84 + dirY * 214, pointK);
      ha = lerp(ha, s.aim, pointK);
      if (pointK > 0.5) grip = 'point';
      // domain sign held up in front of the chin
      hx = lerp(hx, 26, signK);
      hy = lerp(hy, 30, signK);
      ha = lerp(ha, -Math.PI / 2 - 0.2, signK);
      if (signK > 0.5) grip = 'cross';
    } else {
      hx = lerp(hx, -128, pointK);
      hy = lerp(hy, 300, pointK);
      ha = lerp(ha, Math.PI / 2 + 0.15, pointK);
      if (pointK > 0.6) grip = 'fist';
    }
    const a = drawArm(c, s, side, hx, hy, grip, ha);
    const px = s.ox + (a.wx + Math.cos(ha) * 28) * u;
    const py = s.oy + (a.wy + Math.sin(ha) * 28 + breath * (1 - s.out)) * u;
    if (side < 0) {
      s.bx = px;
      s.by = py - 24 * u * outK;
    } else {
      s.rx = px;
      s.ry = py - 24 * u * outK;
      s.hx = s.ox + (a.wx + Math.cos(ha) * 48) * u;
      s.hy = s.oy + (a.wy + Math.sin(ha) * 48) * u;
    }
  }
  c.restore();

  // glowing eyes under the domain
  if (s.reveal > 0.5) {
    const eg = (s.reveal - 0.5) * 2 * (0.25 + 0.75 * s.dom);
    c.globalCompositeOperation = 'lighter';
    for (const side of [-1, 1]) glow(c, s.sprites.eye, s.ox + side * 21.6 * u, s.oy - 113 * u, 12 * u * (1 + s.dom * 0.5), eg * 0.7);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }
}

/* ---------- energy ---------- */

function drawBlue(c: C, s: State, x: number, y: number, r: number, t: number) {
  if (r < 1) return;
  c.globalCompositeOperation = 'lighter';
  glow(c, s.sprites.blue, x, y, r * 4.2, 0.9);
  // attraction: streaks spiralling inward
  c.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const p = (t * 0.9 + i / 16) % 1;
    const rad = r * (3.4 - 2.5 * p);
    const a0 = i * 2.4 + p * 5;
    c.strokeStyle = `rgba(${i % 3 ? '120,200,255' : '220,245,255'},${(p * 0.8).toFixed(3)})`;
    c.lineWidth = Math.max(1, r * 0.08 * (0.5 + p));
    c.beginPath();
    c.arc(x, y, rad, a0, a0 + 0.7 + p * 0.6);
    c.stroke();
  }
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.05, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, '#b9ecff');
  g.addColorStop(0.7, '#3d8cff');
  g.addColorStop(1, 'rgba(30,70,230,0.2)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
}

function drawRed(c: C, s: State, x: number, y: number, r: number, t: number) {
  if (r < 1) return;
  c.globalCompositeOperation = 'lighter';
  glow(c, s.sprites.red, x, y, r * 4.2, 0.9);
  // repulsion: rings and spikes pushing outward
  for (let i = 0; i < 3; i++) {
    const p = (t * 1.3 + i / 3) % 1;
    c.strokeStyle = `rgba(255,90,90,${((1 - p) * 0.7).toFixed(3)})`;
    c.lineWidth = Math.max(1, r * 0.12 * (1 - p));
    c.beginPath();
    c.arc(x, y, r * (1.1 + p * 2.4), 0, TAU);
    c.stroke();
  }
  c.strokeStyle = 'rgba(255,170,150,0.75)';
  c.lineWidth = Math.max(1, r * 0.06);
  c.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = i * 0.52 + t * 2 + Math.sin(t * 7 + i) * 0.2;
    const r0 = r * 1.05;
    const r1 = r * (1.6 + 0.6 * Math.abs(Math.sin(t * 9 + i * 1.7)));
    c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
  }
  c.stroke();
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.05, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, '#ffc2b8');
  g.addColorStop(0.7, '#ff2f3f');
  g.addColorStop(1, 'rgba(200,10,40,0.2)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
}

function drawPurple(c: C, s: State, x: number, y: number, r: number, t: number) {
  if (r < 1) return;
  c.globalCompositeOperation = 'lighter';
  glow(c, s.sprites.purple, x, y, r * 3.6, 1);
  const g = c.createRadialGradient(x, y, r * 0.05, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, '#f1c8ff');
  g.addColorStop(0.7, '#a548ff');
  g.addColorStop(0.95, '#5a12c8');
  g.addColorStop(1, 'rgba(60,0,140,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  // blue and red ribbons still circling inside
  c.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = t * (i % 2 ? 7 : -6) + i;
    c.strokeStyle = i % 2 ? 'rgba(255,90,120,0.75)' : 'rgba(110,190,255,0.75)';
    c.lineWidth = Math.max(1.2, r * 0.07);
    c.beginPath();
    c.ellipse(x, y, r * (0.75 + 0.2 * Math.sin(t * 3 + i)), r * 0.3, a, 0, Math.PI * 1.3);
    c.stroke();
  }
  // crackling edge
  c.strokeStyle = 'rgba(240,200,255,0.9)';
  c.lineWidth = Math.max(1, r * 0.035);
  c.beginPath();
  for (let i = 0; i < 9; i++) {
    let a = rand(0, TAU);
    let rr = r * 0.95;
    c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    for (let k = 0; k < 3; k++) {
      a += rand(-0.25, 0.25);
      rr += r * rand(0.12, 0.3);
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
  }
  c.stroke();
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
}

/* ---------- Unlimited Void ---------- */

function drawVoid(c: C, s: State, env: SceneEnv, t: number) {
  const { w, h } = env;
  const cx = s.ox;
  const cy = s.oy - 110 * s.u;
  const R = Math.hypot(w, h);
  const bgG = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.7);
  bgG.addColorStop(0, '#0b1636');
  bgG.addColorStop(0.35, '#050818');
  bgG.addColorStop(1, '#000000');
  c.fillStyle = bgG;
  c.fillRect(0, 0, w, h);
  // infinite information: streaks rushing outward from the centre
  c.globalCompositeOperation = 'lighter';
  const st = s.stars;
  for (let i = 0; i < st.length; i += 3) {
    const a = st[i] * TAU;
    const p = (st[i + 1] + t * (0.18 + st[i + 2] * 0.25)) % 1;
    const d0 = p * p * R * 0.75;
    const d1 = d0 + 4 + p * p * R * 0.08;
    c.strokeStyle = `rgba(${st[i + 2] > 0.7 ? '255,255,255' : st[i + 2] > 0.35 ? '150,210,255' : '200,160,255'},${(p * 0.9).toFixed(3)})`;
    c.lineWidth = 0.6 + p * 2;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0);
    c.lineTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1);
    c.stroke();
  }
  // the bright ring of the void behind him
  const rr = Math.min(w, h) * (s.portrait ? 0.34 : 0.36);
  glow(c, s.sprites.white, cx, cy, rr * 1.9, 0.5);
  c.globalAlpha = 1;
  for (let i = 0; i < 4; i++) {
    c.strokeStyle = i === 0 ? 'rgba(255,255,255,0.95)' : `rgba(140,200,255,${0.5 - i * 0.1})`;
    c.lineWidth = i === 0 ? Math.max(2, rr * 0.03) : 1.5;
    c.beginPath();
    c.arc(cx, cy, rr * (1 + i * 0.06) + Math.sin(t * 2 + i) * 2, 0, TAU);
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#000000';
  c.beginPath();
  c.arc(cx, cy, rr * 0.985, 0, TAU);
  c.fill();
  // rotating bands of light inside the ring
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    c.strokeStyle = `rgba(120,190,255,${0.12 + i * 0.03})`;
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(cx, cy, rr * (0.4 + i * 0.11), rr * (0.12 + i * 0.05), t * 0.3 * (i % 2 ? 1 : -1) + i, 0, TAU);
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
}

/* ---------- actions ---------- */

function fire(s: State, env: SceneEnv) {
  s.fireC = s.c;
  if (s.c < 0.18) {
    // too little gathered: the two techniques fizzle out
    burst(s.pool, 14, s.bx, s.by, 0, Math.PI, 120 * s.u, 0.5, 3, MOTE, 3);
    burst(s.pool, 14, s.rx, s.ry, 0, Math.PI, 120 * s.u, 0.5, 3, SPARK, 3);
    s.phase = 0;
    return;
  }
  s.phase = 2;
  s.phaseT = 0;
  const bus = s.press.touched ? env.audio() : null;
  if (bus) {
    tone(bus, 220, { type: 'sine', glideTo: 880, decay: 0.35, gain: 0.08 });
    tone(bus, 330, { type: 'triangle', glideTo: 660, decay: 0.35, gain: 0.06 });
  }
}

function launch(s: State, env: SceneEnv) {
  s.phase = 3;
  s.phaseT = 0;
  const u = s.u;
  s.sx = s.hx;
  s.sy = s.hy;
  s.sr = (34 + 64 * s.fireC) * u;
  const sp = (380 + 300 * s.fireC) * u;
  s.svx = Math.cos(s.aim) * sp;
  s.svy = Math.sin(s.aim) * sp;
  s.sAlive = true;
  s.scars.push({ x0: s.sx, y0: s.sy, x1: s.sx, y1: s.sy, r: s.sr, life: 1 });
  if (s.scars.length > 4) s.scars.shift();
  s.flash = env.reducedMotion ? 0.4 : 1;
  s.kick = 1;
  s.regrow = 0;
  const bus = s.press.touched ? env.audio() : null;
  if (bus) {
    tone(bus, 90, { type: 'sawtooth', glideTo: 30, decay: 1.6, gain: 0.22 });
    tone(bus, 180, { type: 'square', glideTo: 60, decay: 0.8, gain: 0.05 });
    noise(bus, { duration: 1.8, freq: 500, q: 0.6, gain: 0.32 });
    noise(bus, { duration: 0.4, freq: 3000, q: 1, gain: 0.1 });
  }
}

function startDomain(s: State, env: SceneEnv) {
  if (s.domOn) {
    s.domT = Math.max(s.domT, 5.2);
    return;
  }
  s.domOn = true;
  s.domT = 0;
  const bus = s.press.touched ? env.audio() : null;
  if (bus) {
    tone(bus, 55, { type: 'sine', attack: 0.4, decay: 3.5, gain: 0.25 });
    [523, 659, 784, 988, 1319].forEach((f, i) => tone(bus, f, { type: 'sine', attack: 0.05, decay: 1.6, gain: 0.04, delay: 0.25 + i * 0.12 }));
    noise(bus, { duration: 1.2, freq: 6000, q: 0.5, gain: 0.06 });
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 2.4,
    init: () => {
      const rnd = mulberry(91);
      const stars = new Float32Array(220 * 3);
      for (let i = 0; i < stars.length; i++) stars[i] = rnd();
      return {
        press: { pointer: false, key: false, touched: false, lastTap: -9 },
        holding: false,
        phase: 0,
        c: 0,
        fireC: 0,
        phaseT: 0,
        reveal: 0,
        revealHold: 0,
        out: 0,
        merge: 0,
        point: 0,
        sign: 0,
        aim: 0,
        aimTarget: 0,
        sx: 0,
        sy: 0,
        sr: 0,
        svx: 0,
        svy: 0,
        sAlive: false,
        sTrail: 0,
        scars: [],
        regrow: 1,
        flash: 0,
        kick: 0,
        dom: 0,
        domOn: false,
        domT: 0,
        demoT: 0,
        t: 0,
        pool: makePool(420),
        hum: null,
        u: 1,
        ox: 0,
        oy: 0,
        horizon: 0,
        portrait: false,
        bg: null,
        city: null,
        cityClean: null,
        bx: 0,
        by: 0,
        rx: 0,
        ry: 0,
        hx: 0,
        hy: 0,
        arms: [],
        stars,
        sprites: {
          blue: glowSprite(128, [
            [0, 'rgba(200,240,255,0.9)'],
            [0.25, 'rgba(60,150,255,0.45)'],
            [0.6, 'rgba(30,80,255,0.12)'],
            [1, 'rgba(20,40,200,0)'],
          ]),
          red: glowSprite(128, [
            [0, 'rgba(255,220,210,0.9)'],
            [0.25, 'rgba(255,50,70,0.45)'],
            [0.6, 'rgba(220,20,60,0.12)'],
            [1, 'rgba(160,0,40,0)'],
          ]),
          purple: glowSprite(128, [
            [0, 'rgba(255,240,255,1)'],
            [0.22, 'rgba(200,110,255,0.6)'],
            [0.55, 'rgba(120,40,255,0.18)'],
            [1, 'rgba(70,0,180,0)'],
          ]),
          white: glowSprite(128, [
            [0, 'rgba(255,255,255,0.0)'],
            [0.42, 'rgba(255,255,255,0.0)'],
            [0.5, 'rgba(210,235,255,0.9)'],
            [0.62, 'rgba(120,180,255,0.25)'],
            [1, 'rgba(60,90,255,0)'],
          ]),
          eye: glowSprite(64, [
            [0, 'rgba(230,250,255,1)'],
            [0.3, 'rgba(90,200,255,0.5)'],
            [1, 'rgba(40,120,255,0)'],
          ]),
        },
      };
    },
    resize: (s, env) => {
      const { w, h } = env;
      s.portrait = h > w * 1.1;
      if (s.portrait) {
        s.u = Math.min((h * 0.56) / 600, (w * 0.98) / 440);
        s.ox = w * 0.5;
        s.oy = h - 280 * s.u;
        s.horizon = h * 0.56;
        s.aimTarget = s.aim = -Math.PI / 2 + 0.25;
      } else {
        s.u = Math.min((h * 0.98) / 620, (w * 0.5) / 560);
        s.ox = Math.max(w * 0.27, 330 * s.u);
        s.oy = h - 280 * s.u;
        s.horizon = h * 0.6;
        s.aimTarget = s.aim = -0.08;
      }
      paintSky(s, env);
      paintCity(s, env);
      s.scars.length = 0;
    },
    update: (s, env, dt, t) => {
      s.t = t;
      const rm = env.reducedMotion;
      const p = s.press;
      const demo = !p.touched && (!env.interactive || rm);
      let holding = p.pointer || p.key;
      if (demo) {
        s.demoT += dt;
        const ph = s.demoT % 8;
        holding = ph > 0.2 && ph < 3;
      }
      // aim from his chest toward the pointer while it is over the canvas
      if (env.pointer.inside && p.touched) {
        const dx = env.pointer.x - (s.ox + SHOULDER * s.u);
        const dy = env.pointer.y - (s.oy + 84 * s.u);
        if (Math.hypot(dx, dy) > 60 * s.u) s.aimTarget = Math.atan2(dy, dx);
      }
      if (s.phase < 2) s.aim = damp(s.aim, s.aimTarget, 10, dt);

      if (holding && !s.holding && s.phase === 0 && !s.domOn) {
        s.phase = 1;
        s.c = 0;
      }
      if (!holding && s.holding && s.phase === 1) fire(s, env);
      s.holding = holding;

      if (s.phase === 1) {
        s.c = Math.min(1, s.c + dt * 0.42 * (1.1 - s.c * 0.4));
        if (rm && p.touched) env.wake(300);
      }
      s.phaseT += dt;
      if (s.phase === 2) {
        s.c = damp(s.c, s.fireC, 6, dt);
        if (s.phaseT > 0.42) launch(s, env);
      }
      if (s.phase === 3) {
        if (rm && p.touched) env.wake(300);
        if (s.sAlive) {
          const acc = 1 + s.phaseT * 1.6;
          s.sx += s.svx * dt * acc;
          s.sy += s.svy * dt * acc;
          s.sr *= 1 + dt * 0.25;
          const sc = s.scars[s.scars.length - 1];
          if (sc) {
            sc.x1 = s.sx;
            sc.y1 = s.sy;
            sc.r = s.sr;
            sc.life = 1;
          }
          // erase the city under the sphere
          const cc = s.city?.getContext('2d');
          if (cc) {
            cc.save();
            cc.globalCompositeOperation = 'destination-out';
            cc.fillStyle = '#000';
            cc.beginPath();
            cc.arc(s.sx, s.sy, s.sr * 0.92, 0, TAU);
            cc.fill();
            cc.restore();
          }
          // debris torn off the edges
          if (s.sy + s.sr > s.horizon - 200 * s.u) {
            for (let i = 0; i < 3; i++) {
              const a = s.aim + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + rand(-0.4, 0.4));
              emit(s.pool, s.sx + Math.cos(a) * s.sr, s.sy + Math.sin(a) * s.sr, Math.cos(a) * rand(60, 220) * s.u + s.svx * 0.15, Math.sin(a) * rand(60, 220) * s.u - 80 * s.u, rand(0.6, 1.3), rand(2, 6) * s.u, DEBRIS, 1.2, 500 * s.u);
            }
          }
          if (Math.random() < 0.8) emit(s.pool, s.sx + rand(-1, 1) * s.sr, s.sy + rand(-1, 1) * s.sr, rand(-40, 40), rand(-40, 40), rand(0.3, 0.7), rand(1.5, 3.5), SPARK, 2);
          const m = s.sr * 1.2;
          if (s.sx < -m || s.sx > env.w + m || s.sy < -m || s.sy > env.h + m) s.sAlive = false;
        }
        if (!s.sAlive && s.phaseT > 1) {
          s.phase = 0;
          s.c = 0;
        }
      } else {
        s.c = s.phase === 0 ? damp(s.c, 0, 4, dt) : s.c;
      }

      // after a while the city knits itself back together
      if (!s.sAlive && s.regrow < 1) {
        s.regrow += dt / 4;
        if (s.regrow > 0.45 && s.city && s.cityClean) {
          const cc = s.city.getContext('2d');
          if (cc) {
            cc.save();
            cc.setTransform(1, 0, 0, 1, 0, 0);
            cc.globalAlpha = clamp(dt * 1.6, 0, 1);
            cc.drawImage(s.cityClean, 0, 0);
            cc.restore();
          }
          if (s.regrow >= 1) {
            const c2 = s.city.getContext('2d');
            if (c2) {
              c2.save();
              c2.setTransform(1, 0, 0, 1, 0, 0);
              c2.clearRect(0, 0, s.city.width, s.city.height);
              c2.drawImage(s.cityClean, 0, 0);
              c2.restore();
            }
          }
        }
        if (rm && p.touched) env.wake(300);
      }
      for (const sc of s.scars) if (!(s.sAlive && sc === s.scars[s.scars.length - 1])) sc.life -= dt / 3.2;
      while (s.scars.length && s.scars[0].life <= 0) s.scars.shift();

      // domain timeline
      if (s.domOn) {
        s.domT += dt;
        if (rm) env.wake(300);
        if (s.domT > 6) s.domOn = false;
      }
      s.dom = damp(s.dom, s.domOn ? 1 : 0, s.domOn ? 3.2 : 4, dt);
      if (s.dom < 0.002 && !s.domOn) s.dom = 0;

      // pose blends
      const charging = s.phase === 1;
      const merging = s.phase === 2;
      const firing = s.phase === 3 && s.phaseT < 1.4;
      s.out = damp(s.out, charging || merging ? 1 : 0, charging ? 7 : 5, dt);
      s.merge = merging ? Math.min(1, s.merge + dt / 0.3) : damp(s.merge, 0, 6, dt);
      s.point = firing ? Math.min(1, s.point + dt / 0.1) : damp(s.point, 0, 3.5, dt);
      s.sign = damp(s.sign, s.domOn ? 1 : 0, 6, dt);
      if (charging && s.c > 0.25) s.revealHold = 6;
      if (s.domOn) s.revealHold = 6;
      s.revealHold -= dt;
      s.reveal = damp(s.reveal, s.revealHold > 0 ? 1 : 0, s.revealHold > 0 ? 3 : 1.2, dt);

      s.flash = Math.max(0, s.flash - dt * 2.2);
      s.kick = Math.max(0, s.kick - dt * 1.6);

      // particles: motes drawn into Blue, sparks pushed out of Red
      if (charging && s.c > 0.05) {
        const u = s.u;
        if (Math.random() < 0.7) {
          const a = rand(0, TAU);
          const r = rand(90, 160) * u;
          emit(s.pool, s.bx + Math.cos(a) * r, s.by + Math.sin(a) * r, -Math.cos(a) * r * 1.6, -Math.sin(a) * r * 1.6, 0.55, rand(1.5, 3) * u, MOTE, 0);
        }
        if (Math.random() < 0.7) emit(s.pool, s.rx, s.ry, rand(-1, 1) * 200 * u, rand(-1, 1) * 200 * u, rand(0.3, 0.6), rand(1.5, 3) * u, SPARK, 1.5);
      }
      stepPool(s.pool, dt);

      // hum while gathering
      if ((charging || merging) && !s.hum && p.touched) {
        const bus = env.audio();
        if (bus) s.hum = startHum(bus, { type: 'triangle', freq: 70, cutoff: 500, noiseAmt: 0.15 });
      }
      if (s.hum) {
        if (charging || merging) setHum(s.hum, 70 + 160 * s.c, 0.05 + 0.12 * s.c, 500 + 2400 * s.c);
        else {
          stopHum(s.hum);
          s.hum = null;
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx: c, w, h } = env;
      const rm = env.reducedMotion;
      const amp = rm ? 0 : (s.kick * 10 + (s.phase === 1 ? s.c * s.c * 3 : 0) + (s.sAlive ? 3 : 0)) * s.u;
      c.save();
      c.translate(shakeX(amp, t), shakeY(amp, t));
      if (s.bg) c.drawImage(s.bg, -20, -20, w + 40, h + 40);
      if (s.city) c.drawImage(s.city, 0, 0, w, h);

      // burnt purple edges along each erased channel
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      for (const sc of s.scars) {
        const L = Math.hypot(sc.x1 - sc.x0, sc.y1 - sc.y0);
        if (L < 2) continue;
        const nx = -(sc.y1 - sc.y0) / L;
        const ny = (sc.x1 - sc.x0) / L;
        const a = clamp(sc.life, 0, 1);
        c.strokeStyle = `rgba(150,70,255,${(0.16 * a).toFixed(3)})`;
        c.lineWidth = sc.r * 2.1;
        c.beginPath();
        c.moveTo(sc.x0, sc.y0);
        c.lineTo(sc.x1, sc.y1);
        c.stroke();
        for (const side of [-1, 1]) {
          c.strokeStyle = `rgba(220,150,255,${(0.6 * a).toFixed(3)})`;
          c.lineWidth = 2.5;
          c.beginPath();
          c.moveTo(sc.x0 + nx * sc.r * 0.92 * side, sc.y0 + ny * sc.r * 0.92 * side);
          c.lineTo(sc.x1 + nx * sc.r * 0.92 * side, sc.y1 + ny * sc.r * 0.92 * side);
          c.stroke();
        }
      }
      c.globalCompositeOperation = 'source-over';

      // the Unlimited Void opens out of his hand sign
      if (s.dom > 0.001) {
        const R = Math.hypot(w, h) * 1.1 * easeInOutCubic(s.dom);
        const cx = s.ox + 30 * s.u;
        const cy = s.oy + 40 * s.u;
        c.save();
        c.beginPath();
        c.arc(cx, cy, R, 0, TAU);
        c.clip();
        drawVoid(c, s, env, t);
        c.restore();
        if (s.dom < 0.98) {
          c.globalCompositeOperation = 'lighter';
          c.strokeStyle = 'rgba(190,230,255,0.9)';
          c.lineWidth = 3;
          c.beginPath();
          c.arc(cx, cy, R, 0, TAU);
          c.stroke();
          c.globalCompositeOperation = 'source-over';
        }
      }

      drawGojo(c, s, t);

      // techniques in his hands
      const u = s.u;
      const out = s.out * (1 - s.merge);
      const ch = s.phase === 1 || s.phase === 2 ? s.c : 0;
      if (ch > 0.01 && s.phase !== 3) {
        const pulse = 1 + Math.sin(t * 13) * 0.05;
        const rb = (8 + 34 * ch) * u * pulse;
        const mk = easeInOutCubic(s.merge);
        const mx = s.ox + 0 * u;
        const my = s.oy + 120 * u;
        const bx = lerp(s.bx, mx - 6 * u, mk);
        const by = lerp(s.by, my, mk);
        const rx = lerp(s.rx, mx + 6 * u, mk);
        const ry = lerp(s.ry, my, mk);
        if (out > 0.05 || mk > 0) {
          drawBlue(c, s, bx, by, rb * (1 - mk * 0.4), t);
          drawRed(c, s, rx, ry, rb * (1 - mk * 0.4), t);
        }
        if (mk > 0.5) drawPurple(c, s, mx, my, (mk - 0.5) * 2 * (30 + 50 * s.fireC) * u, t);
      }
      if (s.phase === 3 && s.sAlive) drawPurple(c, s, s.sx, s.sy, s.sr, t);

      // particles
      c.globalCompositeOperation = 'lighter';
      for (const p of s.pool.items) {
        if (p.life <= 0) continue;
        const k = p.life / p.max;
        if (p.kind === DEBRIS) continue;
        c.globalAlpha = k;
        c.fillStyle = p.kind === MOTE ? '#bfe9ff' : p.kind === SPARK ? '#ff8f8f' : '#e1b6ff';
        c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      c.globalCompositeOperation = 'source-over';
      for (const p of s.pool.items) {
        if (p.life <= 0 || p.kind !== DEBRIS) continue;
        c.globalAlpha = Math.min(1, p.life * 2);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = '#0b0c1e';
        c.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
        c.fillStyle = 'rgba(190,120,255,0.8)';
        c.fillRect(-p.size, -p.size * 0.6, p.size * 2, Math.max(1, p.size * 0.25));
        c.restore();
      }
      c.globalAlpha = 1;
      c.restore();

      if (s.flash > 0) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(200,150,255,${(s.flash * 0.45).toFixed(3)})`;
        c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
      }
      // vignette
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,10,0.55)');
      c.fillStyle = v;
      c.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env) => {
      const p = s.press;
      p.touched = true;
      if (s.t - p.lastTap < 0.32) {
        p.lastTap = -9;
        p.pointer = false;
        if (s.phase === 1) s.phase = 0;
        startDomain(s, env);
        return;
      }
      p.lastTap = s.t;
      p.pointer = true;
    },
    onPointerUp: (s) => {
      s.press.pointer = false;
    },
    onKey: (s, env, e, down) => {
      if (e.key === 'd' || e.key === 'D') {
        if (down && !e.repeat) {
          s.press.touched = true;
          startDomain(s, env);
        }
        return true;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (e.repeat && down) return true;
      s.press.key = down;
      if (down) s.press.touched = true;
      return true;
    },
    dispose: (s) => {
      stopHum(s.hum);
      s.hum = null;
      freeCanvas(s.bg, s.city, s.cityClean);
    },
  });
