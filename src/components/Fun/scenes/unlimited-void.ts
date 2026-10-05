import { clamp, createCanvasScene, damp, easeInOutCubic, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import { freeCanvas, glow, glowSprite, layer, mulberry, setHum, shakeX, shakeY, startHum, stopHum } from './heroes-kit';
import type { Hum } from './heroes-kit';
import { capsule, cel, elbow, hand, inked, smooth, spiky, within } from './anime-more-kit';
import type { Build, C, Grip } from './anime-more-kit';

/**
 * Unlimited Void: Gojo Satoru stands on a dim night street, hands in his pockets, while a
 * cursed spirit closes in. Holding plays the hand sign and the Six Eyes as close up cut-ins
 * ("Domain Expansion"); letting go (or holding to the end) swallows the world in his domain:
 * a black void spreads from his body, then an endless space with a ring of light, streaming
 * stars and rivers of information rushing at the viewer. The spirit freezes mid-step,
 * drowning in it. Moving the pointer drifts the camera; once the viewer stops interacting
 * the void implodes back into him, the blindfold comes down and he looks very pleased.
 */

const INK = '#141626';
const SKIN = '#fbe6d8';
const SKIN_SH = '#e8b9a8';
const SKIN_DEEP = '#c99484';
const HAIR = '#f6f8fd';
const HAIR_SH = '#c3cce2';
const HAIR_DEEP = '#93a0c2';
const CLOTH = '#1b2135';
const CLOTH_SH = '#0d1120';
const CLOTH_HI = '#2c3552';
const BAND = '#0c0d13';

const IDLE = 0;
const CHARGE = 1;
const EXPAND = 2;
const DOMAIN = 3;
const COLLAPSE = 4;
const SMUG = 5;

/* charge timeline, seconds held */
const LIFT_END = 0.6;
const CANCEL_BEFORE = 0.45;
const HAND_IN = 0.55;
const HAND_OUT = 1.55;
const SUB_IN = 0.85;
const EYE_IN = 1.6;
const BLIND_UP = 1.85;
const EYES_GLOW = 2.3;
const EYE_OUT = 2.8;
const CHARGE_END = 3.15;
const EXPAND_LEN = 1.5;
const COLLAPSE_LEN = 1.45;
const POP = 0.95;

const SHOULDER = 100;
const SH_Y = 84;
const L1 = 150;
const L2 = 140;
/** Figure layer bounds in local units around the neck base */
const FIG_L = 270;
const FIG_T = 340;
const FIG_W = 540;
const FIG_H = 1180;

/** Hair outline around the top of the head: tip and valley points, local units */
const HAIR_PTS = [
  -46, -84, -74, -96, -56, -112, -96, -132, -60, -138, -90, -178, -50, -164, -60, -216, -26, -180, -22, -234, -4, -190, 14, -240, 18,
  -190, 48, -224, 40, -170, 84, -190, 56, -140, 98, -140, 58, -114, 78, -96, 46, -84, 28, -102, 10, -98, -10, -102, -28, -98,
];

const GLYPHS = '01∞∑λπΩ∫≡∴アイウエオカキクケコサシスセソタチツテト73';
const CELL = 40;

const easeInCubic = (k: number) => k * k * k;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);

interface State {
  press: { pointer: boolean; key: boolean; touched: boolean };
  wasHolding: boolean;
  phase: number;
  pt: number;
  chT: number;
  prevCh: number;
  commit: boolean;
  popped: boolean;
  lift: number;
  float: number;
  smug: number;
  slump: number;
  reveal: number;
  bars: number;
  camX: number;
  camY: number;
  camTX: number;
  camTY: number;
  lastInput: number;
  flash: number;
  kick: number;
  demo: boolean;
  t: number;
  hum: Hum | null;
  nextSparkle: number;
  nextWhoosh: number;
  // layout
  u: number;
  ox: number;
  oy: number;
  ground: number;
  fx: number;
  fu: number;
  vcx: number;
  vcy: number;
  ringR: number;
  rMax: number;
  portrait: boolean;
  /** right hand position in figure units, written while drawing */
  hlx: number;
  hly: number;
  street: HTMLCanvasElement | null;
  nebula: HTMLCanvasElement | null;
  far: HTMLCanvasElement | null;
  fig: HTMLCanvasElement | null;
  rim: HTMLCanvasElement | null;
  glyphs: HTMLCanvasElement;
  sprites: Record<'ring' | 'eye' | 'lamp' | 'soft' | 'violet', HTMLCanvasElement>;
  tunnel: Float32Array;
  streams: Float32Array;
  info: Float32Array;
  bokeh: Float32Array;
  rain: Float32Array;
}

/* ---------- prerendered layers ---------- */

function glyphAtlas() {
  const cv = document.createElement('canvas');
  cv.width = CELL * GLYPHS.length;
  cv.height = CELL;
  const g = cv.getContext('2d');
  if (g) {
    g.font = '600 26px ui-monospace, Menlo, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(90,180,255,0.95)';
    g.shadowBlur = 8;
    g.fillStyle = '#e8f6ff';
    for (let i = 0; i < GLYPHS.length; i++) g.fillText(GLYPHS[i], i * CELL + CELL / 2, CELL / 2 + 1);
  }
  return cv;
}

function paintStreet(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.street, w, h, dpr);
  s.street = cv;
  if (!c) return;
  const u = s.u;
  const g = s.ground;
  const hz = g - 170 * u;
  const sky = c.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#030409');
  sky.addColorStop(0.6, '#080c19');
  sky.addColorStop(1, '#121a2e');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, hz + 2);
  const rnd = mulberry(41);
  // two rows of dark blocks with a handful of lit windows
  const rows: [number, number, string, number][] = [
    [hz, 520, '#0b1020', 0.07],
    [hz + 12 * u, 360, '#070a15', 0.1],
  ];
  for (const [base, tall, col, lit] of rows) {
    let x = -20;
    while (x < w + 20) {
      const bw = (60 + rnd() * 120) * u;
      const bh = (80 + rnd() * tall) * u;
      const top = base - bh;
      c.fillStyle = col;
      c.fillRect(x, top, bw - 3 * u, h - top);
      for (let yy = top + 12 * u; yy < base - 6 * u; yy += 18 * u) {
        for (let xx = x + 8 * u; xx < x + bw - 16 * u; xx += 14 * u) {
          if (rnd() < lit) {
            c.fillStyle = rnd() < 0.6 ? 'rgba(255,196,130,0.32)' : 'rgba(140,200,255,0.26)';
            c.fillRect(xx, yy, 6 * u, 8 * u);
          }
        }
      }
      x += bw;
    }
  }
  // low fog on the horizon
  const fog = c.createLinearGradient(0, hz - 120 * u, 0, hz + 30 * u);
  fog.addColorStop(0, 'rgba(70,90,140,0)');
  fog.addColorStop(1, 'rgba(70,90,140,0.22)');
  c.fillStyle = fog;
  c.fillRect(0, hz - 120 * u, w, 150 * u);
  // wet asphalt
  const road = c.createLinearGradient(0, hz, 0, h);
  road.addColorStop(0, '#0d1220');
  road.addColorStop(1, '#04060b');
  c.fillStyle = road;
  c.fillRect(0, hz, w, h - hz);
  const vx = w * 0.55;
  c.strokeStyle = 'rgba(130,150,200,0.08)';
  c.lineWidth = 1.5;
  c.beginPath();
  for (const k of [-1.6, -0.7, 0.35, 1.4]) {
    c.moveTo(vx + k * 40 * u, hz);
    c.lineTo(vx + k * w * 0.9, h);
  }
  c.stroke();
  // reflections of the windows smeared on the wet ground
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const y0 = hz + rnd() * 20 * u;
    const len = (40 + rnd() * 90) * u;
    const rg = c.createLinearGradient(0, y0, 0, y0 + len);
    const col = rnd() < 0.6 ? '255,190,130' : '130,190,255';
    rg.addColorStop(0, `rgba(${col},0.12)`);
    rg.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = rg;
    c.fillRect(x, y0, (3 + rnd() * 5) * u, len);
  }
  c.globalCompositeOperation = 'source-over';
  // curb
  c.fillStyle = '#0a0e18';
  c.fillRect(0, g + 6 * u, w, 5 * u);
  // street lamp leaning over him
  const lx = s.ox - 250 * u;
  const top = s.oy - 330 * u;
  c.fillStyle = '#0e121c';
  c.fillRect(lx - 5 * u, top, 10 * u, g - top + 4 * u);
  c.fillStyle = 'rgba(120,140,180,0.25)';
  c.fillRect(lx + 2 * u, top, 2 * u, g - top);
  c.strokeStyle = '#0e121c';
  c.lineWidth = 8 * u;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(lx, top + 10 * u);
  c.quadraticCurveTo(lx + 10 * u, top - 40 * u, lx + 110 * u, top - 36 * u);
  c.stroke();
  c.fillStyle = '#151a26';
  c.beginPath();
  c.moveTo(lx + 80 * u, top - 46 * u);
  c.lineTo(lx + 150 * u, top - 46 * u);
  c.lineTo(lx + 160 * u, top - 26 * u);
  c.lineTo(lx + 70 * u, top - 26 * u);
  c.closePath();
  c.fill();
  // pool of lamp light on the ground
  const pool = c.createRadialGradient(s.ox - 40 * u, g, 10 * u, s.ox - 40 * u, g, 420 * u);
  pool.addColorStop(0, 'rgba(170,215,235,0.2)');
  pool.addColorStop(1, 'rgba(170,215,235,0)');
  c.save();
  c.translate(0, g);
  c.scale(1, 0.18);
  c.translate(0, -g);
  c.fillStyle = pool;
  c.fillRect(s.ox - 480 * u, g - 420 * u, 960 * u, 840 * u);
  c.restore();
}

function paintSpace(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  // nebula at low resolution, it is all soft anyway
  const nw = w * 1.5;
  const nh = h * 1.5;
  const a = layer(s.nebula, nw, nh, Math.min(1, dpr) * 0.5);
  s.nebula = a.cv;
  const c = a.c;
  if (c) {
    c.fillStyle = '#000';
    c.fillRect(0, 0, nw, nh);
    const rnd = mulberry(77);
    const R = Math.min(nw, nh);
    c.globalCompositeOperation = 'lighter';
    const cols = ['70,40,160', '30,70,190', '20,130,170', '150,50,170', '40,30,110'];
    for (let i = 0; i < 70; i++) {
      // clustered along a tilted galactic band
      const k = rnd();
      const x = nw * (0.05 + k * 0.9) + (rnd() - 0.5) * R * 0.25;
      const y = nh * (0.75 - k * 0.5) + (rnd() - 0.5) * R * 0.3;
      const r = R * (0.08 + rnd() * 0.22);
      const col = cols[Math.floor(rnd() * cols.length)];
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${col},${(0.1 + rnd() * 0.12).toFixed(3)})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = gr;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.globalCompositeOperation = 'source-over';
    // dark dust lanes
    for (let i = 0; i < 26; i++) {
      const k = rnd();
      const x = nw * (0.1 + k * 0.8);
      const y = nh * (0.72 - k * 0.45) + (rnd() - 0.5) * R * 0.1;
      const r = R * (0.03 + rnd() * 0.08);
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(0,0,6,0.5)');
      gr.addColorStop(1, 'rgba(0,0,6,0)');
      c.fillStyle = gr;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const fw = w * 1.3;
  const fh = h * 1.3;
  const b = layer(s.far, fw, fh, dpr);
  s.far = b.cv;
  const f = b.c;
  if (f) {
    f.clearRect(0, 0, fw, fh);
    const rnd = mulberry(5);
    const n = Math.round((fw * fh) / 900);
    for (let i = 0; i < n; i++) {
      const x = rnd() * fw;
      const y = rnd() * fh;
      const big = rnd();
      f.globalAlpha = 0.2 + rnd() * 0.7;
      f.fillStyle = big < 0.15 ? '#bcd4ff' : big < 0.22 ? '#e3c8ff' : '#ffffff';
      const r = big > 0.985 ? 1.8 : big > 0.9 ? 1.2 : 0.7;
      f.fillRect(x, y, r, r);
      if (big > 0.993) {
        // a few bright stars with cross glints
        f.globalAlpha = 0.6;
        f.fillRect(x - 6, y + 0.4, 13, 0.7);
        f.fillRect(x + 0.4, y - 6, 0.7, 13);
      }
    }
    f.globalAlpha = 1;
  }
}

/* ---------- Gojo ---------- */

const ARM = [0, 0, 0, 0];

/** Pick the elbow that sits outward and low, so arms never fold through the chest */
function solveArm(side: number, hx: number, hy: number) {
  const sx = side * SHOULDER;
  elbow(ARM, sx, SH_Y, hx, hy, L1, L2, 1);
  const ax = ARM[0];
  const ay = ARM[1];
  elbow(ARM, sx, SH_Y, hx, hy, L1, L2, -1);
  const score = (x: number, y: number) => x * side * 0.5 + y;
  if (score(ax, ay) > score(ARM[0], ARM[1])) {
    ARM[0] = ax;
    ARM[1] = ay;
  }
  return ARM;
}

function torso(c: C) {
  c.moveTo(-36, 20);
  c.bezierCurveTo(-70, 40, -104, 52, -120, 78);
  c.bezierCurveTo(-134, 120, -124, 240, -102, 330);
  c.quadraticCurveTo(-106, 380, -112, 432);
  c.quadraticCurveTo(0, 444, 112, 432);
  c.quadraticCurveTo(106, 380, 102, 330);
  c.bezierCurveTo(124, 240, 134, 120, 120, 78);
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

/** Ink every part, then fill every part, so overlapping pieces read as one shape */
function union(c: C, parts: Build[], base: string, shade: string, dx: number, dy: number, ink: string, lw: number) {
  c.strokeStyle = ink;
  c.lineWidth = lw * 2;
  for (const b of parts) {
    c.beginPath();
    b(c);
    c.stroke();
  }
  for (const b of parts) {
    c.save();
    c.beginPath();
    b(c);
    c.fillStyle = shade;
    c.fill();
    c.clip();
    c.translate(dx, dy);
    c.beginPath();
    b(c);
    c.fillStyle = base;
    c.fill();
    c.restore();
  }
}

function drawLegs(c: C, s: State, t: number) {
  const f = easeInOutCubic(s.float);
  const sway = Math.sin(t * 1.1) * 6 * f;
  for (const side of [-1, 1]) {
    // standing: weight on the left leg, the right one relaxed and out; floating: both dangle
    const hx = side * 48;
    const hy = 400;
    const kx = lerp(side < 0 ? -52 : 66, side < 0 ? -40 : 72, f) + sway * 0.5;
    const ky = lerp(590, side < 0 ? 584 : 548, f);
    const ax = lerp(side < 0 ? -54 : 76, side < 0 ? -22 : 30, f) + sway;
    const ay = lerp(side < 0 ? 772 : 768, side < 0 ? 766 : 712, f);
    union(
      c,
      [(g) => capsule(g, hx, hy, 46, kx, ky, 36), (g) => capsule(g, kx, ky, 36, ax, ay, 28)],
      CLOTH,
      CLOTH_SH,
      -8,
      -4,
      INK,
      3
    );
    // fabric creases at the knee and ankle
    c.strokeStyle = CLOTH_SH;
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(kx - 18, ky - 8);
    c.quadraticCurveTo(kx, ky + 4, kx + 16, ky - 10);
    c.moveTo(ax - 20, ay - 30);
    c.quadraticCurveTo(ax, ay - 20, ax + 18, ay - 32);
    c.stroke();
    // shoe, toes tip down while floating
    c.save();
    c.translate(ax, ay + 14);
    c.rotate(side * lerp(0.12, 0.3, f));
    c.scale(side, lerp(1, 1.3, f));
    // front view: a rounded toe cap, splayed a little outward
    inked(
      c,
      (g) => {
        g.moveTo(-26, 2);
        g.quadraticCurveTo(-28, -16, -6, -18);
        g.lineTo(18, -18);
        g.quadraticCurveTo(46, -16, 48, 4);
        g.quadraticCurveTo(48, 18, 30, 18);
        g.lineTo(-14, 18);
        g.quadraticCurveTo(-26, 18, -26, 2);
        g.closePath();
      },
      '#0b0c12',
      INK,
      2.6
    );
    c.fillStyle = 'rgba(130,150,200,0.35)';
    c.fillRect(-4, -13, 30, 3);
    c.restore();
  }
}

function drawArm(c: C, side: number, hx: number, hy: number, grip: Grip | null, ha: number) {
  const j = solveArm(side, hx, hy);
  const sx = side * SHOULDER;
  const ex = j[0];
  const ey = j[1];
  const wx = j[2];
  const wy = j[3];
  union(
    c,
    [(g) => capsule(g, sx, SH_Y, 32, ex, ey, 26), (g) => capsule(g, ex, ey, 26, wx, wy, 22)],
    CLOTH,
    CLOTH_SH,
    -7,
    -5,
    INK,
    3
  );
  c.strokeStyle = CLOTH_SH;
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(ex - 12, ey - 6);
  c.quadraticCurveTo(ex, ey + 6, ex + 12, ey - 4);
  c.stroke();
  const fa = Math.atan2(wy - ey, wx - ex);
  if (grip) {
    c.save();
    c.translate(wx, wy);
    c.rotate(fa);
    inked(c, (g) => g.rect(-12, -23, 12, 46), CLOTH_HI, INK, 2.5);
    c.restore();
    hand(c, wx + Math.cos(fa) * 6, wy + Math.sin(fa) * 6, ha, grip === 'cross' ? 27 : 24, grip, side, SKIN, SKIN_SH, INK, 2.4);
  }
  return { wx, wy };
}

/** Jacket pocket lip drawn over the wrist so the hand reads as tucked inside */
function pocket(c: C, side: number, cover: boolean) {
  if (cover) {
    c.fillStyle = CLOTH;
    c.beginPath();
    c.moveTo(side * 56, 334);
    c.lineTo(side * 118, 320);
    c.lineTo(side * 116, 392);
    c.lineTo(side * 58, 396);
    c.closePath();
    c.fill();
    c.fillStyle = CLOTH_SH;
    c.beginPath();
    c.moveTo(side * 58, 336);
    c.lineTo(side * 114, 323);
    c.lineTo(side * 114, 336);
    c.lineTo(side * 60, 348);
    c.closePath();
    c.fill();
  }
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(side * 56, 334);
  c.lineTo(side * 116, 320);
  c.stroke();
}

function drawSmallEyes(c: C, s: State, t: number) {
  if (s.reveal <= 0.01) return;
  const blink = Math.abs(Math.sin(t * 0.37)) > 0.995 ? 0.2 : 1;
  for (const side of [-1, 1]) {
    const ex = side * 18;
    const ey = -80;
    const eh = 10 * blink;
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
    c.strokeStyle = '#e9eef9';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(ex - side * 12, ey - 17);
    c.quadraticCurveTo(ex, ey - 21, ex + side * 13, ey - 17);
    c.stroke();
  }
}

function drawHead(c: C, s: State, t: number) {
  for (const side of [-1, 1]) cel(c, (g) => g.ellipse(side * 44, -70, 7, 12, side * 0.2, 0, TAU), SKIN, SKIN_SH, -2, -2, INK, 2.4);
  cel(c, face, SKIN, SKIN_SH, -7, -4, INK, 3);
  within(c, face, () => {
    c.fillStyle = 'rgba(200,140,140,0.35)';
    c.beginPath();
    c.ellipse(0, -6, 40, 14, 0, 0, TAU);
    c.fill();
  });
  c.strokeStyle = '#b07a6c';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(1, -60);
  c.lineTo(4, -50);
  c.lineTo(0, -48);
  c.stroke();
  // mouth: a small smirk, flat while he concentrates, a wide grin when it is over
  const focus = s.phase === CHARGE ? seg(s.chT, 0.4, 1.2) : 0;
  const grin = s.smug;
  c.strokeStyle = INK;
  c.lineWidth = 2.3;
  c.beginPath();
  c.moveTo(-10 - grin * 4, -32 - grin * 2);
  c.quadraticCurveTo(0, -29 + focus * -2 + grin * 6, 11 + grin * 5, -35 - focus * -3 - grin * 5);
  c.stroke();
  if (grin > 0.3) {
    // a lopsided, very pleased grin
    const g = (grin - 0.3) / 0.7;
    inked(
      c,
      (m) => {
        m.moveTo(-12, -33);
        m.quadraticCurveTo(2, -30, 17, -40);
        m.quadraticCurveTo(10, -24 + g * 2, -2, -25);
        m.quadraticCurveTo(-9, -27, -12, -33);
        m.closePath();
      },
      '#ffffff',
      INK,
      2.2
    );
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(17, -40);
    c.lineTo(21, -43);
    c.stroke();
  }

  drawSmallEyes(c, s, t);

  // blindfold: pushed up onto the forehead under the hair as the Six Eyes open
  const k = easeInOutCubic(s.reveal);
  c.save();
  c.translate(0, -k * 40);
  const band = (g: C) => {
    g.moveTo(-48, -102);
    g.quadraticCurveTo(0, -96, 48, -102);
    g.lineTo(46, -68);
    g.quadraticCurveTo(0, -62, -46, -68);
    g.closePath();
  };
  inked(c, band, BAND, INK, 3);
  c.strokeStyle = 'rgba(120,130,170,0.5)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-40, -95);
  c.quadraticCurveTo(0, -90, 40, -95);
  c.stroke();
  c.restore();

  const sway = Math.sin(t * 1.4) * 2 + s.float * Math.sin(t * 0.9) * 4;
  const pts = HAIR_PTS.slice();
  for (let i = 0; i < pts.length; i += 2) if (pts[i + 1] < -150) pts[i] += sway * ((pts[i + 1] + 150) / -90);
  const hairPath = (g: C) => spiky(g, pts, -0.1);
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
  const fall = 0.35 + 0.65 * k;
  lock(-38, 26 * fall, -7, 10);
  lock(-2, 42 * fall, 3, 8);
  lock(36, 24 * fall, 7, 10);
}

/** Draw Gojo in figure units with the neck base at the origin */
function drawGojo(c: C, s: State, t: number) {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const breath = Math.sin(t * 1.8) * 2;
  drawLegs(c, s, t);
  c.save();
  c.translate(0, breath * 0.5);
  cel(c, torso, CLOTH, CLOTH_SH, -10, -6, INK, 3.4);
  c.strokeStyle = CLOTH_SH;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(0, 40);
  c.lineTo(0, 436);
  c.moveTo(-60, 150);
  c.quadraticCurveTo(-50, 220, -70, 300);
  c.moveTo(64, 140);
  c.quadraticCurveTo(54, 230, 74, 320);
  c.moveTo(-20, 400);
  c.quadraticCurveTo(-30, 420, -26, 436);
  c.stroke();
  c.strokeStyle = CLOTH_HI;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-100, 80);
  c.quadraticCurveTo(-80, 66, -50, 56);
  c.stroke();
  cel(c, collar, CLOTH, CLOTH_SH, -6, -3, INK, 3.2);
  inked(c, (g) => g.ellipse(0, -18, 37, 7, 0, Math.PI, TAU), CLOTH_SH, INK, 2.4);
  inked(c, (g) => g.arc(0, 40, 7, 0, TAU), '#c9a24a', INK, 2);
  c.strokeStyle = '#7d5f1f';
  c.lineWidth = 1.6;
  c.beginPath();
  c.arc(0, 40, 3.5, 0, Math.PI * 1.5);
  c.stroke();

  const tilt = s.smug * 0.16 - s.float * 0.03;
  c.save();
  c.translate(0, 10);
  c.rotate(tilt);
  c.translate(0, -24);
  c.scale(1.2, 1.2);
  c.translate(0, 14);
  drawHead(c, s, t);
  c.restore();

  // left hand stays in its pocket the whole time
  drawArm(c, -1, -90, 345, null, 0);
  pocket(c, -1, true);
  // right hand: pocket, then up in front of his chin for the sign
  const k = easeInOutCubic(s.lift);
  const bump = Math.sin(k * Math.PI);
  const hx = lerp(90, 30, k) + bump * 70;
  const hy = lerp(345, 0, k) + bump * 20;
  const ha = lerp(Math.PI / 2, -Math.PI / 2 - 0.15, k);
  const out = k > 0.12;
  const grip: Grip | null = !out ? null : k > 0.6 ? 'cross' : 'fist';
  pocket(c, 1, false);
  const a = drawArm(c, 1, hx, hy, grip, ha);
  if (!out) pocket(c, 1, true);
  s.hlx = a.wx + Math.cos(ha) * 40;
  s.hly = a.wy + Math.sin(ha) * 40 + breath * 0.5;
  c.restore();
}

/* ---------- the cursed spirit ---------- */

const FOE_A = [0, -430, -50, -640, -95, -770, -120, -250, -190, -40, 70, -220, 150, -8, -70, -660, -190, -590, -290, -640, -10, -650, 80, -540, 120, -440];
const FOE_B = [10, -250, -20, -430, -80, -470, -100, -200, -110, -8, 40, -24, 170, -8, -40, -440, -70, -300, -86, -170, 0, -430, 30, -290, 30, -160];
const FJ = new Array<number>(FOE_A.length).fill(0);

function drawFoe(c: C, s: State, t: number, voidMode: boolean, blank: number) {
  const k = easeInOutCubic(s.slump);
  for (let i = 0; i < FJ.length; i++) FJ[i] = lerp(FOE_A[i], FOE_B[i], k);
  const J = FJ;
  const bob = voidMode ? 0 : Math.sin(t * 2.2) * 6 * (1 - k);
  const P = (i: number) => [J[i * 2], J[i * 2 + 1] + (i === 0 || i >= 3 ? 0 : bob)] as const;
  const [hipX, hipY] = P(0);
  const [chX, chY] = P(1);
  const [hdX, hdY] = [J[4], J[5] + bob];
  const parts: Build[] = [
    // legs
    (g) => capsule(g, hipX - 20, hipY, 52, J[6], J[7], 34),
    (g) => capsule(g, J[6], J[7], 34, J[8], J[9], 20),
    (g) => capsule(g, hipX + 20, hipY, 50, J[10], J[11], 32),
    (g) => capsule(g, J[10], J[11], 32, J[12], J[13], 20),
    // clawed feet
    (g) => {
      g.moveTo(J[8] + 26, J[9] - 30);
      g.lineTo(J[8] - 70, J[9] + 6);
      g.lineTo(J[8] + 20, J[9] + 12);
      g.closePath();
    },
    (g) => {
      g.moveTo(J[12] + 20, J[13] - 26);
      g.lineTo(J[12] - 60, J[13] + 8);
      g.lineTo(J[12] + 26, J[13] + 10);
      g.closePath();
    },
    // hunched torso
    (g) => capsule(g, hipX, hipY, 70, chX, chY, 100),
    (g) => g.ellipse(chX + 30, chY + 10, 110, 80, -0.5, 0, TAU),
    // arms
    (g) => capsule(g, J[14], J[15] + bob, 40, J[16], J[17] + bob, 28),
    (g) => capsule(g, J[16], J[17] + bob, 28, J[18], J[19] + bob, 22),
    (g) => capsule(g, J[20], J[21] + bob, 38, J[22], J[23] + bob, 27),
    (g) => capsule(g, J[22], J[23] + bob, 27, J[24], J[25] + bob, 21),
    // head and jaw
    (g) => g.ellipse(hdX, hdY, 62, 56, -0.3, 0, TAU),
    (g) => {
      g.moveTo(hdX - 50, hdY + 10);
      g.quadraticCurveTo(hdX - 70, hdY + 60, hdX - 20, hdY + 64);
      g.lineTo(hdX + 30, hdY + 30);
      g.closePath();
    },
    // horns sweeping back
    (g) => {
      g.moveTo(hdX - 20, hdY - 40);
      g.quadraticCurveTo(hdX + 10, hdY - 140, hdX + 90, hdY - 150);
      g.quadraticCurveTo(hdX + 30, hdY - 110, hdX + 20, hdY - 34);
      g.closePath();
    },
    (g) => {
      g.moveTo(hdX + 20, hdY - 30);
      g.quadraticCurveTo(hdX + 70, hdY - 100, hdX + 130, hdY - 96);
      g.quadraticCurveTo(hdX + 70, hdY - 70, hdX + 46, hdY - 12);
      g.closePath();
    },
  ];
  // spines along the back
  for (let i = 0; i < 4; i++) {
    const q = 0.25 + i * 0.2;
    const bx = lerp(hipX, chX, q) + 70 + (1 - q) * 10;
    const by = lerp(hipY, chY, q) - 30 * q;
    parts.push((g) => {
      g.moveTo(bx - 26, by + 10);
      g.lineTo(bx + 60 - i * 6, by - 50 - i * 10);
      g.lineTo(bx + 8, by + 30);
      g.closePath();
    });
  }
  // claws
  for (const [hx, hy, dir] of [
    [J[18], J[19] + bob, Math.PI + 0.2],
    [J[24], J[25] + bob, Math.PI / 2 + 0.3],
  ] as const) {
    for (let i = -1; i <= 1; i++) {
      const a = dir + i * 0.35;
      parts.push((g) => {
        g.moveTo(hx + Math.cos(a + 1.4) * 12, hy + Math.sin(a + 1.4) * 12);
        g.lineTo(hx + Math.cos(a) * 64, hy + Math.sin(a) * 64);
        g.lineTo(hx + Math.cos(a - 1.4) * 12, hy + Math.sin(a - 1.4) * 12);
        g.closePath();
      });
    }
  }
  if (voidMode) union(c, parts, '#07070f', '#040409', 0, 0, 'rgba(170,215,255,0.95)', 3);
  else union(c, parts, '#2a1d33', '#150e1d', -12, -8, '#06050a', 3);
  // eyes: red slits, gone white and empty inside the void
  const ex = hdX - 34;
  const ey = hdY - 6;
  c.globalCompositeOperation = 'lighter';
  for (const [dx, sz] of [
    [0, 1],
    [26, 0.85],
  ] as const) {
    const x = ex + dx;
    const y = ey - dx * 0.25;
    const col = blank > 0.5 ? '235,245,255' : '255,60,50';
    c.fillStyle = `rgba(${col},0.95)`;
    c.beginPath();
    c.ellipse(x, y, 12 * sz, (4 + blank * 6) * sz, -0.25, 0, TAU);
    c.fill();
    const gr = c.createRadialGradient(x, y, 0, x, y, 40 * sz);
    gr.addColorStop(0, `rgba(${col},0.5)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = gr;
    c.fillRect(x - 40, y - 40, 80, 80);
  }
  c.globalCompositeOperation = 'source-over';
  return { hx: hdX, hy: hdY };
}

/* ---------- close up cut-ins ---------- */

/** Closed outline around a finger polyline with a rounded tip */
function finger(pts: number[], rads: number[]): Build {
  return (c) => {
    const n = pts.length / 2;
    const L: number[] = [];
    const R: number[] = [];
    for (let i = 0; i < n; i++) {
      const pi = Math.max(0, i - 1);
      const ni = Math.min(n - 1, i + 1);
      let dx = pts[ni * 2] - pts[pi * 2];
      let dy = pts[ni * 2 + 1] - pts[pi * 2 + 1];
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const r = rads[i];
      L.push(pts[i * 2] - dy * r, pts[i * 2 + 1] + dx * r);
      R.push(pts[i * 2] + dy * r, pts[i * 2 + 1] - dx * r);
    }
    const tx = pts[(n - 1) * 2];
    const ty = pts[(n - 1) * 2 + 1];
    let ux = tx - pts[(n - 2) * 2];
    let uy = ty - pts[(n - 2) * 2 + 1];
    const ud = Math.hypot(ux, uy) || 1;
    ux /= ud;
    uy /= ud;
    const r = rads[n - 1];
    const out = L.slice();
    for (const th of [0.5, 1.05, 1.57, 2.1, 2.65]) {
      const cx = -uy * Math.cos(th) + ux * Math.sin(th);
      const cy = ux * Math.cos(th) + uy * Math.sin(th);
      out.push(tx + cx * r * 1.05, ty + cy * r * 1.05);
    }
    for (let i = n - 1; i >= 0; i--) out.push(R[i * 2], R[i * 2 + 1]);
    let bx = pts[2] - pts[0];
    let by = pts[3] - pts[1];
    const bd = Math.hypot(bx, by) || 1;
    bx /= bd;
    by /= bd;
    out.push(pts[0] - bx * rads[0], pts[1] - by * rads[0]);
    // repeat the first point so the smoothing keeps the base corner
    out.push(L[0], L[1]);
    smooth(c, out);
  };
}

/** Cel shading with a cool rim of light on the right edge and a shadow band at the bottom left */
function rimCel(c: C, build: Build, rimW: number, ink: string, lw: number) {
  c.save();
  c.beginPath();
  build(c);
  c.fillStyle = '#9fd8ff';
  c.fill();
  c.clip();
  c.translate(-rimW, 0);
  c.beginPath();
  build(c);
  c.fillStyle = SKIN_SH;
  c.fill();
  c.translate(3, -8);
  c.beginPath();
  build(c);
  c.fillStyle = SKIN;
  c.fill();
  c.restore();
  c.beginPath();
  build(c);
  c.strokeStyle = ink;
  c.lineWidth = lw;
  c.stroke();
}

function crease(c: C, x: number, y: number, a: number, r: number, bow = 3) {
  const nx = Math.cos(a + Math.PI / 2);
  const ny = Math.sin(a + Math.PI / 2);
  c.moveTo(x - nx * r, y - ny * r);
  c.quadraticCurveTo(x + Math.cos(a) * bow, y + Math.sin(a) * bow, x + nx * r, y + ny * r);
}

/** Gojo's hand sign, right hand seen from the palm side: index crossed over the middle finger */
function drawSignHand(c: C, s: State, t: number, energy: number) {
  const lw = 3.4;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // sleeve
  cel(
    c,
    (g) => {
      g.moveTo(-72, 176);
      g.lineTo(72, 170);
      g.lineTo(104, 520);
      g.lineTo(-104, 520);
      g.closePath();
    },
    CLOTH,
    CLOTH_SH,
    -12,
    -4,
    INK,
    lw
  );
  c.strokeStyle = CLOTH_SH;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-30, 260);
  c.quadraticCurveTo(-20, 330, -40, 420);
  c.moveTo(40, 250);
  c.quadraticCurveTo(30, 320, 50, 400);
  c.stroke();

  const MID = [-2, -22, 10, -98, 28, -150, 44, -190];
  const MID_R = [18, 16, 14.5, 13];
  const IDX = [40, -30, 26, -96, 6, -140, -14, -174];
  const IDX_R = [18, 16, 14.5, 13];
  const mid = finger(MID, MID_R);
  const idx = finger(IDX, IDX_R);
  rimCel(c, mid, 7, INK, lw);
  // the index finger lying over it throws a soft shadow
  within(c, mid, () => {
    c.strokeStyle = 'rgba(150,80,80,0.35)';
    c.lineWidth = 34;
    c.beginPath();
    c.moveTo(IDX[0] + 6, IDX[1] + 4);
    c.lineTo(IDX[2] + 6, IDX[3] + 4);
    c.lineTo(IDX[4] + 6, IDX[5] + 4);
    c.lineTo(IDX[6] + 6, IDX[7] + 4);
    c.stroke();
  });
  c.strokeStyle = SKIN_DEEP;
  c.lineWidth = 2.2;
  c.beginPath();
  crease(c, MID[2], MID[3], Math.atan2(MID[5] - MID[3], MID[4] - MID[2]), 9);
  crease(c, MID[4], MID[5], Math.atan2(MID[7] - MID[5], MID[6] - MID[4]), 8);
  c.stroke();
  rimCel(c, idx, 7, INK, lw);
  c.strokeStyle = SKIN_DEEP;
  c.beginPath();
  crease(c, IDX[2], IDX[3], Math.atan2(IDX[5] - IDX[3], IDX[4] - IDX[2]), 10);
  crease(c, IDX[4], IDX[5], Math.atan2(IDX[7] - IDX[5], IDX[6] - IDX[4]), 9);
  // finger pad lines
  c.moveTo(IDX[6] + 8, IDX[7] + 14);
  c.quadraticCurveTo(IDX[6] + 2, IDX[7] + 6, IDX[6] - 4, IDX[7] + 10);
  c.stroke();

  // palm
  const palm = (g: C) => {
    g.moveTo(-44, 180);
    g.bezierCurveTo(-54, 120, -64, 60, -60, 8);
    g.quadraticCurveTo(-60, -18, -44, -22);
    g.lineTo(46, -32);
    g.quadraticCurveTo(62, -28, 62, 0);
    g.bezierCurveTo(64, 30, 84, 58, 80, 96);
    g.bezierCurveTo(76, 136, 58, 158, 46, 182);
    g.closePath();
  };
  rimCel(c, palm, 8, INK, lw);
  within(c, palm, () => {
    // thenar mound and the hollow of the palm
    const g1 = c.createRadialGradient(60, 100, 4, 60, 100, 60);
    g1.addColorStop(0, 'rgba(255,240,232,0.6)');
    g1.addColorStop(1, 'rgba(255,240,232,0)');
    c.fillStyle = g1;
    c.fillRect(0, 40, 120, 120);
    const g2 = c.createRadialGradient(-6, 70, 4, -6, 70, 60);
    g2.addColorStop(0, 'rgba(200,130,120,0.35)');
    g2.addColorStop(1, 'rgba(200,130,120,0)');
    c.fillStyle = g2;
    c.fillRect(-70, 10, 130, 120);
  });
  c.strokeStyle = SKIN_DEEP;
  c.lineWidth = 2.2;
  c.beginPath();
  // heart, head and life lines
  c.moveTo(-58, 30);
  c.quadraticCurveTo(-20, 20, 18, 4);
  c.moveTo(-56, 78);
  c.quadraticCurveTo(-10, 64, 36, 48);
  c.moveTo(40, 14);
  c.bezierCurveTo(26, 60, 24, 120, 34, 170);
  c.moveTo(-10, 160);
  c.quadraticCurveTo(-4, 120, -14, 96);
  c.stroke();
  // wrist creases
  c.beginPath();
  c.moveTo(-36, 168);
  c.quadraticCurveTo(0, 160, 34, 168);
  c.stroke();

  // ring and little finger curled down into the palm, nails toward us
  for (const [x, top, bot, wd, lean] of [
    [-14, -24, 34, 18, -0.08],
    [-42, -12, 34, 15, -0.16],
  ] as const) {
    c.save();
    c.translate(x, bot);
    c.rotate(lean);
    c.translate(-x, -bot);
    const fold = (g: C) => {
      g.moveTo(x - wd, top + wd);
      g.quadraticCurveTo(x - wd, top - 2, x, top - 2);
      g.quadraticCurveTo(x + wd, top - 2, x + wd, top + wd);
      g.lineTo(x + wd * 0.92, bot - wd * 0.5);
      g.quadraticCurveTo(x, bot + wd * 0.45, x - wd * 0.92, bot - wd * 0.5);
      g.closePath();
    };
    // the shadow of the fold where the finger tucks into the palm
    c.fillStyle = 'rgba(150,80,75,0.45)';
    c.beginPath();
    c.ellipse(x + 2, bot + 4, wd * 1.05, wd * 0.5, 0, 0, TAU);
    c.fill();
    rimCel(c, fold, 5, INK, lw * 0.9);
    within(c, fold, () => {
      // the bent knuckle is the highest, roundest point
      const kg = c.createRadialGradient(x - wd * 0.3, top + wd * 0.5, 1, x, top + wd * 0.6, wd * 1.4);
      kg.addColorStop(0, 'rgba(255,248,242,0.75)');
      kg.addColorStop(1, 'rgba(255,248,242,0)');
      c.fillStyle = kg;
      c.fillRect(x - wd * 2, top - wd, wd * 4, wd * 3);
      c.fillStyle = 'rgba(190,120,110,0.3)';
      c.fillRect(x - wd * 2, top + (bot - top) * 0.45, wd * 4, bot);
    });
    c.strokeStyle = SKIN_DEEP;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - wd * 0.7, top + (bot - top) * 0.42);
    c.quadraticCurveTo(x, top + (bot - top) * 0.5, x + wd * 0.7, top + (bot - top) * 0.42);
    c.stroke();
    inked(c, (g) => g.ellipse(x, bot - wd * 0.55, wd * 0.62, wd * 0.52, 0, 0, TAU), '#f6d2c6', SKIN_DEEP, 1.8);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath();
    c.ellipse(x - wd * 0.2, bot - wd * 0.75, wd * 0.22, wd * 0.12, -0.4, 0, TAU);
    c.fill();
    c.restore();
  }

  // thumb folded across, pinning them
  const thumb = finger([68, 104, 28, 74, -12, 58, -42, 50], [26, 21, 18, 16]);
  rimCel(c, thumb, 6, INK, lw);
  c.strokeStyle = SKIN_DEEP;
  c.lineWidth = 2.2;
  c.beginPath();
  crease(c, 8, 64, Math.atan2(-14, -40), 12);
  c.stroke();
  inked(c, (g) => g.ellipse(-35, 48, 11, 9, 0.3, 0, TAU), '#f6d2c6', SKIN_DEEP, 1.8);
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath();
  c.ellipse(-38, 44, 4, 2.4, 0.3, 0, TAU);
  c.fill();

  // cuff over the wrist
  inked(
    c,
    (g) => {
      g.moveTo(-74, 168);
      g.quadraticCurveTo(0, 156, 76, 162);
      g.lineTo(80, 206);
      g.quadraticCurveTo(0, 196, -78, 210);
      g.closePath();
    },
    CLOTH_HI,
    INK,
    lw
  );
  c.strokeStyle = 'rgba(160,190,255,0.35)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-66, 176);
  c.quadraticCurveTo(0, 166, 70, 172);
  c.stroke();

  // cursed energy gathering at the crossed fingertips
  if (energy > 0.01) {
    c.globalCompositeOperation = 'lighter';
    glow(c, s.sprites.eye, 14, -120, 130 * (0.6 + 0.4 * energy), 0.55 * energy);
    for (let i = 0; i < 10; i++) {
      const p = (t * 0.7 + i / 10) % 1;
      const a = i * 2.3;
      const r = 150 - p * 120;
      c.globalAlpha = p * energy * 0.9;
      c.fillStyle = i % 3 ? '#9fdcff' : '#ffffff';
      c.beginPath();
      c.arc(14 + Math.cos(a) * r, -120 + Math.sin(a) * r * 0.9, 2.5 + p * 2, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
}

/** One of the Six Eyes, extreme close up. E is the half width of the eye. */
function drawBigEye(c: C, s: State, ex: number, ey: number, E: number, side: number, glowK: number, t: number) {
  const ox = ex + side * E;
  const ix = ex - side * E;
  const top = ey - E * 0.6;
  const bot = ey + E * 0.42;
  const shape = (g: C) => {
    g.moveTo(ix, ey + E * 0.08);
    g.bezierCurveTo(ix + side * E * 0.3, top, ex + side * E * 0.55, top - E * 0.04, ox, ey - E * 0.16);
    g.bezierCurveTo(ex + side * E * 0.62, bot, ix + side * E * 0.42, bot + E * 0.02, ix, ey + E * 0.08);
    g.closePath();
  };
  // socket shadow
  const so = c.createRadialGradient(ex, ey - E * 0.2, E * 0.4, ex, ey - E * 0.2, E * 1.6);
  so.addColorStop(0, 'rgba(190,120,110,0.4)');
  so.addColorStop(1, 'rgba(190,120,110,0)');
  c.fillStyle = so;
  c.fillRect(ex - E * 1.8, ey - E * 1.8, E * 3.6, E * 3.6);
  // sclera with a cool shadow under the lid
  c.beginPath();
  shape(c);
  c.fillStyle = '#ffffff';
  c.fill();
  const irX = ex + side * E * 0.04;
  const irY = ey + E * 0.04;
  const irR = E * 0.5;
  within(c, shape, () => {
    const sh = c.createLinearGradient(0, top, 0, ey + E * 0.1);
    sh.addColorStop(0, 'rgba(120,150,210,0.7)');
    sh.addColorStop(1, 'rgba(120,150,210,0)');
    c.fillStyle = sh;
    c.fillRect(ex - E * 1.2, top - E * 0.1, E * 2.4, E);
    // iris
    const ir = c.createRadialGradient(irX, irY, irR * 0.05, irX, irY, irR);
    ir.addColorStop(0, '#f4feff');
    ir.addColorStop(0.2, '#aef4ff');
    ir.addColorStop(0.45, '#3fc0ff');
    ir.addColorStop(0.78, '#1670e8');
    ir.addColorStop(1, '#0a2a8c');
    c.fillStyle = ir;
    c.beginPath();
    c.arc(irX, irY, irR, 0, TAU);
    c.fill();
    // fibres radiating out of the pupil
    c.lineWidth = Math.max(1, E * 0.014);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU + Math.sin(i * 7.3) * 0.05;
      const r0 = irR * (0.22 + 0.05 * Math.sin(i * 3.1));
      const r1 = irR * (0.7 + 0.25 * Math.abs(Math.sin(i * 1.7)));
      c.strokeStyle = i % 2 ? 'rgba(225,252,255,0.45)' : 'rgba(10,70,180,0.4)';
      c.beginPath();
      c.moveTo(irX + Math.cos(a) * r0, irY + Math.sin(a) * r0);
      c.lineTo(irX + Math.cos(a + 0.05) * r1, irY + Math.sin(a + 0.05) * r1);
      c.stroke();
    }
    // limbal ring and pupil
    c.strokeStyle = '#071c5c';
    c.lineWidth = E * 0.06;
    c.beginPath();
    c.arc(irX, irY, irR * 0.97, 0, TAU);
    c.stroke();
    const pg = c.createRadialGradient(irX, irY, 0, irX, irY, irR * 0.2);
    pg.addColorStop(0, '#0d3a9a');
    pg.addColorStop(0.7, '#0a2470');
    pg.addColorStop(1, 'rgba(10,36,112,0)');
    c.fillStyle = pg;
    c.beginPath();
    c.arc(irX, irY, irR * 0.2, 0, TAU);
    c.fill();
    // a ring of light inside the iris when they blaze
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(160,240,255,${(0.6 * glowK).toFixed(3)})`;
    c.lineWidth = E * 0.03;
    c.beginPath();
    c.arc(irX, irY, irR * (0.42 + 0.03 * Math.sin(t * 6)), 0, TAU);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    // lid shadow over the top of the iris
    const ls = c.createLinearGradient(0, top, 0, top + E * 0.45);
    ls.addColorStop(0, 'rgba(6,20,70,0.75)');
    ls.addColorStop(1, 'rgba(6,20,70,0)');
    c.fillStyle = ls;
    c.fillRect(ex - E * 1.2, top - E * 0.1, E * 2.4, E * 0.6);
    // highlights
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(irX - E * 0.2, irY - E * 0.2, E * 0.14, E * 0.1, -0.5, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(irX + E * 0.2, irY + E * 0.18, E * 0.05, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(200,250,255,0.75)';
    c.lineWidth = E * 0.03;
    c.beginPath();
    c.arc(irX, irY, irR * 0.78, 0.4, 1.6);
    c.stroke();
  });
  // upper lash line, dark, thick toward the outer corner
  c.strokeStyle = INK;
  c.lineWidth = E * 0.07;
  c.beginPath();
  c.moveTo(ix, ey + E * 0.08);
  c.bezierCurveTo(ix + side * E * 0.3, top, ex + side * E * 0.55, top - E * 0.04, ox, ey - E * 0.16);
  c.stroke();
  c.lineWidth = E * 0.11;
  c.beginPath();
  c.moveTo(ex + side * E * 0.15, top + E * 0.02);
  c.quadraticCurveTo(ex + side * E * 0.7, top + E * 0.02, ox + side * E * 0.06, ey - E * 0.2);
  c.stroke();
  // lower lid, outer two thirds
  c.lineWidth = E * 0.03;
  c.beginPath();
  c.moveTo(ox, ey - E * 0.14);
  c.quadraticCurveTo(ex + side * E * 0.5, bot - E * 0.04, ex - side * E * 0.3, bot);
  c.stroke();
  // double lid crease
  c.strokeStyle = 'rgba(140,80,70,0.8)';
  c.lineWidth = E * 0.025;
  c.beginPath();
  c.moveTo(ix + side * E * 0.3, top - E * 0.08);
  c.quadraticCurveTo(ex + side * E * 0.4, top - E * 0.24, ox - side * E * 0.05, ey - E * 0.34);
  c.stroke();
  // his famous white lashes, flicking out at the corner
  const lash = (x0: number, y0: number, x1: number, y1: number, wd: number) => {
    c.strokeStyle = INK;
    c.lineWidth = wd + E * 0.03;
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - E * 0.03, x1, y1);
    c.stroke();
    c.strokeStyle = '#ffffff';
    c.lineWidth = wd;
    c.stroke();
  };
  for (let i = 0; i < 5; i++) {
    const q = 0.35 + i * 0.15;
    const x0 = lerp(ex, ox, q);
    const y0 = lerp(top + E * 0.02, ey - E * 0.18, q * q);
    lash(x0, y0, x0 + side * E * (0.18 + i * 0.05), y0 - E * (0.28 - i * 0.03), E * 0.035);
  }
  for (let i = 0; i < 3; i++) {
    const x0 = ox - side * E * (0.12 + i * 0.16);
    const y0 = ey + E * (0.0 + i * 0.12);
    lash(x0, y0, x0 + side * E * 0.12, y0 + E * 0.14, E * 0.025);
  }
  // white brow
  const by = ey - E * 1.0;
  const brow = (g: C) => {
    g.moveTo(ix - side * E * 0.1, by + E * 0.12);
    g.quadraticCurveTo(ex, by - E * 0.22, ox + side * E * 0.2, by + E * 0.12);
    g.quadraticCurveTo(ex, by - E * 0.05, ix - side * E * 0.1, by + E * 0.22);
    g.closePath();
  };
  inked(c, brow, HAIR, INK, E * 0.025);
  // the glow of the Six Eyes
  if (glowK > 0.01) {
    c.globalCompositeOperation = 'lighter';
    glow(c, s.sprites.eye, irX, irY, E * (1.2 + 0.4 * glowK), 0.7 * glowK);
    c.globalAlpha = 0.6 * glowK;
    c.fillStyle = '#d8f6ff';
    c.fillRect(irX - E * 1.4, irY - E * 0.012, E * 2.8, E * 0.024);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
}

function drawEyeStrip(c: C, s: State, w: number, cy: number, H: number, t: number, k: number, glowK: number) {
  const E = H * 0.36;
  const cx = w * 0.5;
  const d = E * 2.2;
  // skin, darker toward the brow
  const sk = c.createLinearGradient(0, cy - H / 2, 0, cy + H / 2);
  sk.addColorStop(0, '#efcdbd');
  sk.addColorStop(0.45, SKIN);
  sk.addColorStop(1, '#f6dccd');
  c.fillStyle = sk;
  c.fillRect(0, cy - H, w, H * 2);
  // the edges of his face fade into white hair
  for (const side of [-1, 1]) {
    const fx = cx + side * d * 2.15;
    c.fillStyle = HAIR;
    c.beginPath();
    c.moveTo(fx, cy - H);
    c.quadraticCurveTo(fx - side * E * 0.3, cy, fx + side * E * 0.2, cy + H);
    c.lineTo(cx + side * w, cy + H);
    c.lineTo(cx + side * w, cy - H);
    c.closePath();
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.stroke();
    c.strokeStyle = HAIR_SH;
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const x = fx + side * (20 + i * 26);
      c.moveTo(x, cy - H);
      c.quadraticCurveTo(x - side * 10, cy, x + side * 6, cy + H);
    }
    c.stroke();
  }
  // nose bridge
  const nb = c.createLinearGradient(cx - E * 0.5, 0, cx + E * 0.5, 0);
  nb.addColorStop(0, 'rgba(210,150,135,0)');
  nb.addColorStop(0.35, 'rgba(210,150,135,0.35)');
  nb.addColorStop(0.55, 'rgba(255,245,240,0.4)');
  nb.addColorStop(1, 'rgba(255,245,240,0)');
  c.fillStyle = nb;
  c.fillRect(cx - E * 0.5, cy - E * 0.2, E, H);
  for (const side of [-1, 1]) drawBigEye(c, s, cx + side * d, cy + E * 0.12, E, side, glowK, t);

  // locks of white hair falling across, longer once the band is up
  const fall = 0.5 + 0.5 * k;
  const lock = (x: number, len: number, bend: number, wd: number) => {
    const y0 = cy - H * 0.6;
    const b = (g: C) => {
      g.moveTo(x - wd, y0);
      g.quadraticCurveTo(x - wd * 0.5 + bend * 0.4, y0 + len * 0.6, x + bend, y0 + len);
      g.quadraticCurveTo(x + wd * 0.6 + bend * 0.5, y0 + len * 0.5, x + wd, y0);
      g.closePath();
    };
    cel(c, b, HAIR, HAIR_SH, -wd * 0.3, -wd * 0.2, INK, 3);
  };
  lock(cx - E * 0.15, H * 0.62 * fall, E * 0.12, E * 0.22);
  lock(cx - d * 1.55, H * 0.55 * fall, -E * 0.2, E * 0.3);
  lock(cx + d * 1.5, H * 0.5 * fall, E * 0.22, E * 0.26);
  lock(cx + d * 0.52, H * 0.34 * fall, E * 0.08, E * 0.16);

  // the blindfold sliding up and out of frame
  if (k < 1) {
    const off = -easeInOutCubic(k) * H * 1.2;
    const b0 = cy - E * 1.25 + off;
    const b1 = cy + E * 0.75 + off;
    c.save();
    c.fillStyle = 'rgba(80,40,40,0.25)';
    c.fillRect(0, b1, w, E * 0.15);
    const band = (g: C) => {
      g.moveTo(0, b0);
      g.quadraticCurveTo(cx, b0 + E * 0.15, w, b0);
      g.lineTo(w, b1);
      g.quadraticCurveTo(cx, b1 + E * 0.18, 0, b1);
      g.closePath();
    };
    inked(c, band, BAND, INK, 4);
    within(c, band, () => {
      // weave and folds catching a little light
      c.strokeStyle = 'rgba(110,125,170,0.35)';
      c.lineWidth = 3;
      c.beginPath();
      for (const q of [0.25, 0.6]) {
        const y = lerp(b0, b1, q);
        c.moveTo(0, y);
        c.quadraticCurveTo(cx, y + E * 0.12, w, y);
      }
      c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(cx - E * 0.6, b1);
      c.quadraticCurveTo(cx - E * 0.3, (b0 + b1) / 2, cx - E * 0.5, b0);
      c.moveTo(cx + d * 1.1, b1);
      c.quadraticCurveTo(cx + d * 1.2, (b0 + b1) / 2, cx + d * 1.05, b0);
      c.stroke();
    });
    c.restore();
  }
  // a cold blue wash as they light up
  if (glowK > 0.01) {
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(40,110,255,${(0.12 * glowK).toFixed(3)})`;
    c.fillRect(0, cy - H, w, H * 2);
    c.globalCompositeOperation = 'source-over';
  }
}

/** A slanted comic panel; returns a builder for its outline */
function panelPath(pts: number[]): Build {
  return (g) => {
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  };
}

function speedLines(c: C, cx: number, cy: number, r0: number, r1: number, n: number, t: number, col: string) {
  c.strokeStyle = col;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.sin(i * 12.9 + Math.floor(t * 12)) * 0.04;
    const r = r0 * (0.8 + 0.4 * Math.abs(Math.sin(i * 3.7 + Math.floor(t * 12))));
    c.lineWidth = 1 + (i % 4);
    c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  c.stroke();
}

function drawCutIns(c: C, s: State, env: SceneEnv, t: number) {
  if (s.phase !== CHARGE) return;
  const { w, h } = env;
  const rm = env.reducedMotion;
  const ch = s.chT;
  // hand sign panel
  const hIn = seg(ch, HAND_IN, HAND_IN + 0.18);
  const hOut = seg(ch, HAND_OUT - 0.12, HAND_OUT);
  const hv = hIn * (1 - hOut);
  if (hv > 0.001) {
    const slide = rm ? 0 : (1 - easeOutCubic(hIn)) * w * 0.5 - easeInOutCubic(hOut) * w * 0.4;
    const pts = s.portrait
      ? [w * 0.04, h * 0.16, w * 0.96, h * 0.12, w * 0.96, h * 0.62, w * 0.04, h * 0.66]
      : [w * 0.47, h * 0.07, w * 0.97, h * 0.1, w * 0.94, h * 0.93, w * 0.43, h * 0.9];
    for (let i = 0; i < pts.length; i += 2) pts[i] += slide;
    const pb = panelPath(pts);
    c.save();
    c.globalAlpha = rm ? hv : 1;
    c.beginPath();
    pb(c);
    c.fillStyle = '#05070f';
    c.fill();
    c.save();
    c.clip();
    const pcx = (pts[0] + pts[2] + pts[4] + pts[6]) / 4;
    const pcy = (pts[1] + pts[3] + pts[5] + pts[7]) / 4;
    const bg = c.createRadialGradient(pcx, pcy - h * 0.1, 10, pcx, pcy, h * 0.6);
    bg.addColorStop(0, '#1b2f6a');
    bg.addColorStop(0.6, '#0a1130');
    bg.addColorStop(1, '#03040b');
    c.fillStyle = bg;
    c.fillRect(0, 0, w + w, h);
    speedLines(c, pcx, pcy - h * 0.12, h * 0.3, h, 90, rm ? 0 : t, 'rgba(150,190,255,0.16)');
    const S = s.portrait ? Math.min(h * 0.5, w * 0.8) / 380 : (h * 0.86) / 420;
    c.translate(pcx, pcy + (s.portrait ? h * 0.06 : h * 0.07));
    c.scale(S, S);
    c.rotate(-0.06);
    drawSignHand(c, s, t, seg(ch, HAND_IN + 0.2, HAND_OUT));
    c.restore();
    c.beginPath();
    pb(c);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 6;
    c.stroke();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }
  // eye strip
  const eIn = seg(ch, EYE_IN, EYE_IN + 0.16);
  const eOut = seg(ch, EYE_OUT - 0.14, EYE_OUT);
  const ev = eIn * (1 - eOut);
  if (ev > 0.001) {
    const H = s.portrait ? h * 0.22 : h * 0.34;
    const cy = s.portrait ? h * 0.36 : h * 0.44;
    const open = rm ? 1 : easeOutCubic(eIn) * (1 - easeInOutCubic(eOut));
    const hh = (H / 2) * open;
    const tilt = h * 0.025;
    const pb = panelPath([-10, cy - hh + tilt, w + 10, cy - hh - tilt, w + 10, cy + hh - tilt, -10, cy + hh + tilt]);
    c.save();
    c.globalAlpha = rm ? ev : 1;
    c.beginPath();
    pb(c);
    c.fillStyle = '#000';
    c.fill();
    c.save();
    c.clip();
    const push = rm ? 1 : 1 + 0.06 * seg(ch, EYE_IN, EYE_OUT);
    c.translate(w / 2, cy);
    c.rotate(-Math.atan2(tilt * 2, w));
    c.scale(push, push);
    c.translate(-w / 2, -cy);
    drawEyeStrip(c, s, w, cy, H, t, seg(ch, BLIND_UP, BLIND_UP + 0.5), seg(ch, EYES_GLOW, EYES_GLOW + 0.35));
    c.restore();
    c.beginPath();
    pb(c);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 6;
    c.stroke();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }
}

/* ---------- the void ---------- */

function drawRing(c: C, s: State, x: number, y: number, R: number, t: number, rm: boolean) {
  c.globalCompositeOperation = 'lighter';
  glow(c, s.sprites.ring, x, y, R * 2.3, 1);
  glow(c, s.sprites.violet, x, y, R * 3.2, 0.5);
  // corona: fine rays streaming off the rim
  const spin = rm ? 0 : t * 0.04;
  c.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * TAU + spin + Math.sin(i * 9.1) * 0.02;
    const len = R * (0.06 + 0.5 * Math.pow(Math.abs(Math.sin(i * 4.7 + (rm ? 0 : t * 0.6) * (i % 3 ? 1 : -1))), 3));
    c.strokeStyle = i % 5 ? 'rgba(150,200,255,0.16)' : 'rgba(230,245,255,0.3)';
    c.lineWidth = i % 5 ? 1.2 : 2;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * R * 1.01, y + Math.sin(a) * R * 1.01);
    c.lineTo(x + Math.cos(a) * (R + len), y + Math.sin(a) * (R + len));
    c.stroke();
  }
  for (let i = 0; i < 4; i++) {
    c.strokeStyle = i === 0 ? 'rgba(255,255,255,0.95)' : `rgba(140,205,255,${0.55 - i * 0.12})`;
    c.lineWidth = i === 0 ? Math.max(2.5, R * 0.022) : 1.5;
    c.beginPath();
    c.arc(x, y, R * (1 + i * 0.035) + (rm ? 0 : Math.sin(t * 1.6 + i) * 1.5), 0, TAU);
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  const disk = c.createRadialGradient(x, y, 0, x, y, R);
  disk.addColorStop(0, '#000000');
  disk.addColorStop(0.85, '#01020a');
  disk.addColorStop(1, '#0a1840');
  c.fillStyle = disk;
  c.beginPath();
  c.arc(x, y, R * 0.988, 0, TAU);
  c.fill();
  // faint swirls deep inside the hole
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    c.strokeStyle = `rgba(110,170,255,${0.05 + i * 0.02})`;
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(x, y, R * (0.3 + i * 0.13), R * (0.1 + i * 0.04), (rm ? 0 : t * 0.2) * (i % 2 ? 1 : -1) + i, 0, TAU);
    c.stroke();
  }
  // a thin disc of light cutting across in front of the hole
  for (let i = 0; i < 6; i++) {
    const k = i / 5;
    c.strokeStyle = `rgba(${i < 2 ? '255,255,255' : '150,200,255'},${(0.5 - k * 0.4).toFixed(3)})`;
    c.lineWidth = (1 - k) * R * 0.03 + 1;
    c.beginPath();
    c.ellipse(x, y + R * 0.02, R * (1.25 + k * 0.6), R * (0.075 + k * 0.05), -0.08, 0, TAU);
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
}

function drawVoid(c: C, s: State, env: SceneEnv, t: number, blank: number) {
  const { w, h } = env;
  const rm = env.reducedMotion;
  const u = s.u;
  const D = Math.min(w, h) * 0.12;
  const cx = s.camX * D;
  const cy = s.camY * D;
  c.fillStyle = '#000';
  c.fillRect(0, 0, w, h);
  // deep layers barely move, near ones swing past
  if (s.nebula) c.drawImage(s.nebula, -w * 0.25 - cx * 0.3, -h * 0.25 - cy * 0.3, w * 1.5, h * 1.5);
  if (s.far) c.drawImage(s.far, -w * 0.15 - cx * 0.15, -h * 0.15 - cy * 0.15, w * 1.3, h * 1.3);
  const vx = s.vcx - cx * 0.5;
  const vy = s.vcy - cy * 0.5 - 40 * u;
  drawRing(c, s, vx, vy, s.ringR, t, rm);

  // zoom tunnel: stars rushing out of the hole toward the viewer
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round';
  const f = Math.min(w, h) * 0.5;
  const tx = vx - cx * 0.3;
  const ty = vy - cy * 0.3;
  const tn = s.tunnel;
  for (let i = 0; i < tn.length; i += 4) {
    const a = tn[i];
    const r = tn[i + 1];
    const z = tn[i + 2];
    const near = 1 - z;
    const d1 = (r * f) / z;
    const d0 = rm ? d1 - 1.5 : (r * f) / Math.min(1, z + 0.035 + near * 0.02);
    const x1 = tx + Math.cos(a) * d1;
    const y1 = ty + Math.sin(a) * d1;
    if (x1 < -40 || x1 > w + 40 || y1 < -40 || y1 > h + 40) continue;
    const hue = tn[i + 3];
    c.strokeStyle = hue > 0.75 ? '#ffffff' : hue > 0.4 ? '#9ccfff' : '#c7a4ff';
    c.globalAlpha = Math.min(1, near * near * 1.3);
    c.lineWidth = 0.6 + near * near * 2.6;
    c.beginPath();
    c.moveTo(tx + Math.cos(a) * d0, ty + Math.sin(a) * d0);
    c.lineTo(x1, y1);
    c.stroke();
  }
  c.globalAlpha = 1;

  // rivers of information: glyphs streaming along spiralling lanes toward the viewer
  const st = s.streams;
  const G = s.glyphs;
  const PER = 16;
  const gk = Math.min(w, h) / 720;
  for (let i = 0; i < st.length; i += 4) {
    const a0 = st[i] + (rm ? 0 : t * 0.05);
    const rad = st[i + 1];
    const sp = st[i + 2];
    const ph = st[i + 3];
    let px = 0;
    let py = 0;
    for (let k = 0; k < PER; k++) {
      const q = (((ph + k / PER - (rm ? 0 : t * sp)) % 1) + 1) % 1;
      const z = 0.05 + q * 0.95;
      const a = a0 + (1 - z) * 0.6;
      const d = (rad * f) / z;
      const x = tx + Math.cos(a) * d;
      const y = ty + Math.sin(a) * d;
      const near = 1 - z;
      let al = Math.min(1, near * 1.4) * (z < 0.12 ? z / 0.12 : 1);
      if (k > 0 && q > 1 / PER) {
        c.globalAlpha = al * 0.25;
        c.strokeStyle = '#7cc4ff';
        c.lineWidth = 0.6 + near * 1.6;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(x, y);
        c.stroke();
      }
      px = x;
      py = y;
      if (x < -60 || x > w + 60 || y < -60 || y > h + 60) continue;
      const sz = Math.min(80, (7 + 6.5 / z) * gk);
      al *= 0.95;
      c.globalAlpha = al;
      const gi = Math.floor(ph * 97 + k * 7 + (rm ? 0 : t * 3) * (k % 3 === 0 ? 1 : 0)) % GLYPHS.length;
      c.drawImage(G, gi * CELL, 0, CELL, CELL, x - sz / 2, y - sz / 2, sz, sz);
    }
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';

  // the spirit, frozen mid-step and drowning in it
  const jit = rm ? 0 : 2.2 * u * blank;
  const fx = s.fx - cx * 0.85 + (rm ? 0 : Math.sin(t * 83) * jit);
  const fy = s.ground - cy * 0.85 + (rm ? 0 : Math.cos(t * 71) * jit);
  c.save();
  c.translate(fx, fy);
  c.scale(s.fu, s.fu);
  const fh = drawFoe(c, s, t, true, blank);
  c.restore();
  const hx = fx + fh.hx * s.fu;
  const hy = fy + fh.hy * s.fu;
  c.globalCompositeOperation = 'lighter';
  const inf = s.info;
  for (let i = 0; i < inf.length; i += 3) {
    const p = (((inf[i + 1] + (rm ? 0.5 : t * (0.5 + inf[i + 2] * 0.5))) % 1) + 1) % 1;
    const a = inf[i];
    const R0 = Math.max(w, h) * 0.45;
    const r = R0 * (1 - p) * (1 - p);
    const x = hx + Math.cos(a) * r;
    const y = hy + Math.sin(a) * r * 0.8;
    const sz = (8 + 30 * (1 - p)) * gk;
    c.globalAlpha = Math.min(1, p * 3) * 0.9 * blank;
    const gi = (i * 5 + Math.floor(p * 9)) % GLYPHS.length;
    c.drawImage(G, gi * CELL, 0, CELL, CELL, x - sz / 2, y - sz / 2, sz, sz);
  }
  glow(c, s.sprites.eye, hx - 20 * s.fu, hy, 120 * s.fu, 0.55 * blank);
  // the spirit's mind ringing with more than it can take in
  c.strokeStyle = '#bfe4ff';
  c.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const p = rm ? 0.15 + i * 0.22 : (t * 0.9 + i / 4) % 1;
    c.globalAlpha = (1 - p) * 0.7 * blank;
    c.beginPath();
    c.ellipse(hx - 20 * s.fu, hy, (40 + 260 * p) * s.fu, (30 + 200 * p) * s.fu, -0.3, 0, TAU);
    c.stroke();
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

/** Bokeh drifting past the lens, in front of everything */
function drawBokeh(c: C, s: State, env: SceneEnv, t: number, alpha: number) {
  const { w, h } = env;
  const D = Math.min(w, h) * 0.12;
  const b = s.bokeh;
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < b.length; i += 4) {
    const x = (((b[i] + (env.reducedMotion ? 0 : t * 0.01 * b[i + 3])) % 1.2) + 1.2) % 1.2;
    const px = x * w - w * 0.1 - s.camX * D * 1.8;
    const py = b[i + 1] * h - s.camY * D * 1.8;
    glow(c, s.sprites.soft, px, py, b[i + 2] * Math.min(w, h) * 0.08, 0.18 * alpha);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

/* ---------- figure compositing ---------- */

function renderFigure(s: State, env: SceneEnv, t: number) {
  const fig = s.fig;
  const c = fig?.getContext('2d');
  if (!fig || !c) return;
  const u = s.u;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, fig.width, fig.height);
  c.restore();
  c.save();
  c.translate(FIG_L * u, FIG_T * u);
  c.scale(u, u);
  drawGojo(c, s, t);
  c.restore();
  void env;
}

/** Street lighting baked over the figure: the lamp is up and to the left */
function litStreet(s: State) {
  const fig = s.fig;
  const c = fig?.getContext('2d');
  if (!fig || !c) return;
  const u = s.u;
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const g = c.createLinearGradient(0, 0, FIG_W * u * 0.4, FIG_H * u);
  g.addColorStop(0, 'rgba(200,235,255,0.06)');
  g.addColorStop(0.5, 'rgba(4,6,16,0.12)');
  g.addColorStop(1, 'rgba(4,6,16,0.55)');
  c.fillStyle = g;
  c.fillRect(0, 0, FIG_W * u, FIG_H * u);
  c.restore();
}

function backlit(s: State, k: number) {
  const fig = s.fig;
  const rim = s.rim;
  const c = fig?.getContext('2d');
  const r = rim?.getContext('2d');
  if (!fig || !rim || !c || !r) return;
  r.save();
  r.setTransform(1, 0, 0, 1, 0, 0);
  r.clearRect(0, 0, rim.width, rim.height);
  r.globalCompositeOperation = 'source-over';
  r.drawImage(fig, 0, 0);
  r.globalCompositeOperation = 'source-in';
  r.fillStyle = '#cfeaff';
  r.fillRect(0, 0, rim.width, rim.height);
  r.restore();
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  const g = c.createLinearGradient(0, 0, 0, fig.height);
  g.addColorStop(0, `rgba(6,10,34,${(0.45 * k).toFixed(3)})`);
  g.addColorStop(0.6, `rgba(4,6,22,${(0.6 * k).toFixed(3)})`);
  g.addColorStop(1, `rgba(2,3,12,${(0.72 * k).toFixed(3)})`);
  c.fillStyle = g;
  c.fillRect(0, 0, fig.width, fig.height);
  c.restore();
}

function blitFigure(c: C, s: State, x: number, y: number, sc: number, rimK: number) {
  const fig = s.fig;
  if (!fig) return;
  const u = s.u;
  const W = FIG_W * u * sc;
  const H = FIG_H * u * sc;
  const x0 = x - FIG_L * u * sc;
  const y0 = y - FIG_T * u * sc;
  if (rimK > 0 && s.rim) {
    const o = Math.max(1.5, 2.6 * u * sc);
    c.globalAlpha = rimK;
    for (const [dx, dy] of [
      [-o, -o],
      [o, -o],
      [0, -o * 1.3],
      [-o * 1.2, 0],
      [o * 1.2, 0],
    ])
      c.drawImage(s.rim, x0 + dx, y0 + dy, W, H);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = rimK * 0.35;
    for (const [dx, dy] of [
      [-o * 3, -o * 2],
      [o * 3, -o * 2],
      [0, -o * 3.5],
    ])
      c.drawImage(s.rim, x0 + dx, y0 + dy, W, H);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }
  c.drawImage(fig, x0, y0, W, H);
}

/** Glowing eyes and the hand sign, drawn on top of the composited figure */
function figureFx(c: C, s: State, x: number, y: number, sc: number, t: number, strength: number) {
  const u = s.u * sc;
  if (s.reveal > 0.5) {
    const k = (s.reveal - 0.5) * 2 * strength;
    c.globalCompositeOperation = 'lighter';
    const tilt = s.smug * 0.16 - s.float * 0.03;
    for (const side of [-1, 1]) {
      // head transform: rotate about (0, 10), then scale 1.2 about (0, -24 + 14)
      const lx = side * 18 * 1.2;
      const ly = -24 + (-80 + 14) * 1.2;
      const rx = lx * Math.cos(tilt) - (ly - 10) * Math.sin(tilt);
      const ry = 10 + lx * Math.sin(tilt) + (ly - 10) * Math.cos(tilt);
      const ex = x + rx * u;
      const ey = y + ry * u;
      glow(c, s.sprites.eye, ex, ey, 26 * u * (1 + 0.15 * Math.sin(t * 5)), k * 0.9);
      c.globalAlpha = k * 0.35;
      c.fillStyle = '#dff6ff';
      c.fillRect(ex - 30 * u, ey - 0.6, 60 * u, 1.2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  if (s.lift > 0.7) {
    c.globalCompositeOperation = 'lighter';
    glow(c, s.sprites.eye, x + s.hlx * u, y + s.hly * u, 40 * u, (s.lift - 0.7) * 3.3 * strength * 0.5);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }
}

/* ---------- text ---------- */

function spaced(c: C, text: string, x: number, y: number, track: number) {
  let total = 0;
  for (const ch of text) total += c.measureText(ch).width + track;
  total -= track;
  let px = x - total / 2;
  for (const ch of text) {
    const cw = c.measureText(ch).width;
    c.fillText(ch, px + cw / 2, y);
    px += cw + track;
  }
}

function drawSubtitle(c: C, env: SceneEnv, text: string, alpha: number, y: number) {
  if (alpha <= 0.01) return;
  const { w, h } = env;
  const size = Math.max(14, Math.min(30, h * 0.042, w * 0.05));
  c.save();
  c.globalAlpha = alpha;
  c.font = `600 ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.lineWidth = size * 0.22;
  c.strokeText(text, w / 2, y);
  c.fillStyle = '#f4f8ff';
  c.fillText(text, w / 2, y);
  c.restore();
}

function drawTitle(c: C, s: State, env: SceneEnv, k: number, alpha: number) {
  if (alpha <= 0.01) return;
  const { w, h } = env;
  const rm = env.reducedMotion;
  const size = Math.max(22, Math.min(h * 0.085, w * 0.075));
  const y = s.portrait ? h * 0.8 : h * 0.82;
  const grow = rm ? 1 : 1.25 - 0.25 * easeOutCubic(k);
  c.save();
  c.globalAlpha = alpha;
  c.translate(w / 2, y);
  c.scale(grow, grow);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `500 ${size * 0.42}px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif`;
  c.fillStyle = 'rgba(200,230,255,0.85)';
  spaced(c, '無量空処', 0, -size * 0.85, size * 0.3);
  c.font = `600 ${size}px ui-serif, Georgia, "Times New Roman", serif`;
  c.shadowColor = 'rgba(90,180,255,0.95)';
  c.shadowBlur = size * 0.5;
  c.fillStyle = '#ffffff';
  spaced(c, 'UNLIMITED VOID', 0, 0, size * (0.12 + (rm ? 0 : 0.06 * (1 - easeOutCubic(k)))));
  c.shadowBlur = 0;
  c.strokeStyle = 'rgba(170,215,255,0.7)';
  c.lineWidth = 1.5;
  const half = Math.min(w * 0.42, size * 6.4);
  c.beginPath();
  c.moveTo(-half, size * 0.65);
  c.lineTo(half, size * 0.65);
  c.stroke();
  c.restore();
}

/* ---------- audio ---------- */

function sfx(s: State, env: SceneEnv): AudioBus | null {
  return s.press.touched ? env.audio() : null;
}

function startCharge(s: State, env: SceneEnv) {
  s.phase = CHARGE;
  s.pt = 0;
  s.chT = 0;
  s.prevCh = 0;
  s.commit = false;
  const bus = sfx(s, env);
  if (bus) {
    noise(bus, { duration: 0.3, freq: 900, q: 0.7, gain: 0.08 });
    tone(bus, 196, { type: 'triangle', glideTo: 294, decay: 0.3, gain: 0.04 });
  }
}

function chargeCues(s: State, env: SceneEnv) {
  const bus = sfx(s, env);
  const a = s.prevCh;
  const b = s.chT;
  const hit = (x: number) => a < x && b >= x;
  if (!bus) return;
  if (hit(HAND_IN)) {
    noise(bus, { duration: 0.25, freq: 2400, q: 0.6, gain: 0.08 });
    tone(bus, 1760, { decay: 0.6, gain: 0.04 });
    tone(bus, 2637, { decay: 0.5, gain: 0.025, delay: 0.04 });
  }
  if (hit(SUB_IN)) {
    tone(bus, 55, { attack: 0.3, decay: 1.6, gain: 0.18 });
    if (!s.hum) s.hum = startHum(bus, { type: 'sine', freq: 55, cutoff: 500, noiseAmt: 0.05 });
  }
  if (hit(EYE_IN)) noise(bus, { duration: 0.35, freq: 1400, q: 0.5, gain: 0.08 });
  if (hit(BLIND_UP)) noise(bus, { duration: 0.4, freq: 3200, q: 1.2, gain: 0.04 });
  if (hit(EYES_GLOW)) [1047, 1319, 1568, 2093].forEach((f, i) => tone(bus, f, { decay: 1.4, gain: 0.03, delay: i * 0.06 }));
}

function startExpand(s: State, env: SceneEnv) {
  s.phase = EXPAND;
  s.pt = 0;
  s.flash = env.reducedMotion ? 0.3 : 1;
  s.kick = 1;
  s.camX = s.camY = 0;
  const bus = sfx(s, env);
  if (bus) {
    tone(bus, 80, { type: 'sawtooth', glideTo: 28, decay: 2.2, gain: 0.16 });
    tone(bus, 41, { attack: 0.05, decay: 3.5, gain: 0.3 });
    noise(bus, { duration: 2.2, freq: 420, q: 0.5, gain: 0.3 });
    noise(bus, { duration: 1.2, freq: 6000, q: 0.4, gain: 0.05 });
    [523, 784, 1047, 1568, 2093, 3136].forEach((f, i) => tone(bus, f, { decay: 2, gain: 0.025, delay: 0.3 + i * 0.09 }));
    if (!s.hum) s.hum = startHum(bus, { type: 'sine', freq: 41, cutoff: 400, noiseAmt: 0.05 });
  }
}

function startCollapse(s: State, env: SceneEnv) {
  s.phase = COLLAPSE;
  s.pt = 0;
  s.popped = false;
  const bus = sfx(s, env);
  if (bus) {
    tone(bus, 50, { type: 'sine', attack: 0.85, decay: 0.15, glideTo: 520, gain: 0.12 });
    tone(bus, 2400, { type: 'sine', attack: 0.8, decay: 0.2, glideTo: 300, gain: 0.02 });
    noise(bus, { duration: 0.9, freq: 700, q: 0.6, gain: 0.1 });
  }
}

/* ---------- scene ---------- */

function reset(s: State) {
  s.phase = IDLE;
  s.pt = 0;
  s.chT = 0;
  s.lift = 0;
  s.float = 0;
  s.smug = 0;
  s.slump = 0;
  s.reveal = 0;
  s.bars = 0;
  s.camX = s.camY = s.camTX = s.camTY = 0;
}

function randomise(arr: Float32Array, stride: number, fill: (i: number, r: () => number) => void, seed: number) {
  const rnd = mulberry(seed);
  for (let i = 0; i < arr.length; i += stride) fill(i, rnd);
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    // demo: 1.2s idle, the charge, the expansion, then about four seconds inside the void
    posterTime: 1.2 + CHARGE_END + EXPAND_LEN + 3.8,
    init: () => {
      const tunnel = new Float32Array(380 * 4);
      randomise(tunnel, 4, (i, r) => {
        tunnel[i] = r() * TAU;
        tunnel[i + 1] = 0.04 + r() * 0.5;
        tunnel[i + 2] = 0.05 + r() * 0.95;
        tunnel[i + 3] = r();
      }, 13);
      const streams = new Float32Array(26 * 4);
      randomise(streams, 4, (i, r) => {
        streams[i] = (i / 4 / 26) * TAU + r() * 0.25;
        streams[i + 1] = 0.12 + r() * 0.3;
        streams[i + 2] = 0.08 + r() * 0.07;
        streams[i + 3] = r();
      }, 29);
      const info = new Float32Array(64 * 3);
      randomise(info, 3, (i, r) => {
        info[i] = r() * TAU;
        info[i + 1] = r();
        info[i + 2] = r();
      }, 31);
      const bokeh = new Float32Array(14 * 4);
      randomise(bokeh, 4, (i, r) => {
        bokeh[i] = r() * 1.2;
        bokeh[i + 1] = r();
        bokeh[i + 2] = 0.4 + r() * 1.2;
        bokeh[i + 3] = 0.5 + r();
      }, 37);
      const rain = new Float32Array(160 * 3);
      randomise(rain, 3, (i, r) => {
        rain[i] = r();
        rain[i + 1] = r();
        rain[i + 2] = 0.7 + r() * 0.6;
      }, 43);
      return {
        press: { pointer: false, key: false, touched: false },
        wasHolding: false,
        phase: IDLE,
        pt: 0,
        chT: 0,
        prevCh: 0,
        commit: false,
        popped: false,
        lift: 0,
        float: 0,
        smug: 0,
        slump: 0,
        reveal: 0,
        bars: 0,
        camX: 0,
        camY: 0,
        camTX: 0,
        camTY: 0,
        lastInput: -9,
        flash: 0,
        kick: 0,
        demo: false,
        t: 0,
        hum: null,
        nextSparkle: 0,
        nextWhoosh: 0,
        u: 1,
        ox: 0,
        oy: 0,
        ground: 0,
        fx: 0,
        fu: 1,
        vcx: 0,
        vcy: 0,
        ringR: 100,
        rMax: 100,
        portrait: false,
        hlx: 0,
        hly: 0,
        street: null,
        nebula: null,
        far: null,
        fig: null,
        rim: null,
        glyphs: glyphAtlas(),
        sprites: {
          ring: glowSprite(256, [
            [0, 'rgba(255,255,255,0)'],
            [0.38, 'rgba(255,255,255,0)'],
            [0.43, 'rgba(225,242,255,0.95)'],
            [0.5, 'rgba(120,180,255,0.35)'],
            [0.7, 'rgba(70,100,255,0.08)'],
            [1, 'rgba(40,40,200,0)'],
          ]),
          violet: glowSprite(128, [
            [0, 'rgba(120,90,255,0.25)'],
            [0.5, 'rgba(80,50,200,0.1)'],
            [1, 'rgba(40,20,120,0)'],
          ]),
          eye: glowSprite(64, [
            [0, 'rgba(235,252,255,1)'],
            [0.25, 'rgba(100,205,255,0.55)'],
            [1, 'rgba(40,120,255,0)'],
          ]),
          lamp: glowSprite(64, [
            [0, 'rgba(235,250,255,1)'],
            [0.3, 'rgba(170,220,240,0.35)'],
            [1, 'rgba(120,180,220,0)'],
          ]),
          soft: glowSprite(64, [
            [0, 'rgba(150,200,255,0.5)'],
            [0.7, 'rgba(120,170,255,0.3)'],
            [0.85, 'rgba(120,170,255,0.08)'],
            [1, 'rgba(100,150,255,0)'],
          ]),
        },
        tunnel,
        streams,
        info,
        bokeh,
        rain,
      };
    },
    resize: (s, env) => {
      const { w, h, dpr } = env;
      s.portrait = h > w * 1.1;
      s.u = Math.min((h * 0.84) / 1120, (w * (s.portrait ? 0.62 : 0.42)) / 520);
      s.ground = h * (s.portrait ? 0.9 : 0.94);
      s.ox = w * (s.portrait ? 0.4 : 0.38);
      s.oy = s.ground - 792 * s.u;
      s.fu = s.u * (s.portrait ? 0.66 : 0.92);
      s.fx = s.portrait ? w * 0.9 : w * 0.77;
      s.vcx = s.ox;
      s.vcy = s.oy + 150 * s.u;
      s.ringR = Math.min(w, h) * (s.portrait ? 0.4 : 0.44);
      let far = 0;
      for (const [x, y] of [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ])
        far = Math.max(far, Math.hypot(x - s.vcx, y - s.vcy));
      s.rMax = far + 40;
      s.fig = layer(s.fig, FIG_W * s.u, FIG_H * s.u, dpr).cv;
      s.rim = layer(s.rim, FIG_W * s.u, FIG_H * s.u, dpr).cv;
      paintStreet(s, env);
      paintSpace(s, env);
    },
    update: (s, env, dt, t) => {
      s.t = t;
      const rm = env.reducedMotion;
      const p = s.press;
      s.demo = !p.touched && (!env.interactive || rm);
      let holding = p.pointer || p.key;
      if (s.demo) holding = s.phase === CHARGE || (s.phase === IDLE && s.pt > 1.2);
      const edge = holding && !s.wasHolding;
      s.wasHolding = holding;
      s.pt += dt;

      if ((s.phase === IDLE || s.phase === SMUG) && edge) startCharge(s, env);
      if (s.phase === CHARGE) {
        if (!holding && !s.commit) {
          if (s.chT < CANCEL_BEFORE) {
            s.phase = IDLE;
            s.pt = 0;
          } else s.commit = true;
        }
        if (s.phase === CHARGE) {
          s.prevCh = s.chT;
          s.chT += dt * (s.commit ? 2.4 : 1);
          chargeCues(s, env);
          if (s.chT >= CHARGE_END) startExpand(s, env);
        }
      }
      if (s.phase === EXPAND && s.pt >= EXPAND_LEN) {
        s.phase = DOMAIN;
        s.pt = 0;
      }
      if (s.phase === DOMAIN) {
        const live = holding || t - s.lastInput < 2.6;
        if (s.demo ? s.pt > 5.5 : !live && s.pt > 3.5) startCollapse(s, env);
      }
      if (s.phase === COLLAPSE) {
        if (!s.popped && s.pt >= POP) {
          s.popped = true;
          s.flash = rm ? 0.25 : 0.85;
          s.kick = 0.6;
          const bus = sfx(s, env);
          if (bus) {
            tone(bus, 110, { type: 'sine', glideTo: 40, decay: 0.6, gain: 0.25 });
            noise(bus, { duration: 0.35, freq: 300, q: 0.7, gain: 0.18 });
          }
          stopHum(s.hum);
          s.hum = null;
        }
        if (s.pt >= COLLAPSE_LEN) {
          s.phase = SMUG;
          s.pt = 0;
        }
      }
      if (s.phase === SMUG && s.pt > (s.demo ? 3 : 6)) {
        s.phase = IDLE;
        s.pt = 0;
      }

      // pose blends
      const ph = s.phase;
      const inVoid = ph === EXPAND || ph === DOMAIN;
      const liftT = ph === CHARGE ? seg(s.chT, 0, LIFT_END) : inVoid ? 1 : ph === COLLAPSE ? 1 - seg(s.pt, 0.8, 1.4) : 0;
      s.lift = ph === CHARGE ? liftT : damp(s.lift, liftT, 6, dt);
      if (ph === CHARGE) s.reveal = easeInOutCubic(seg(s.chT, BLIND_UP, BLIND_UP + 0.5));
      else if (inVoid) s.reveal = 1;
      else if (ph === COLLAPSE) s.reveal = 1 - seg(s.pt, 0.75, 1.3);
      else s.reveal = damp(s.reveal, 0, 4, dt);
      const floatT = ph === EXPAND ? easeInOutCubic(seg(s.pt, 0.1, 1.4)) : ph === DOMAIN ? 1 : ph === COLLAPSE ? 1 - seg(s.pt, 0.5, 1.2) : 0;
      s.float = damp(s.float, floatT, 8, dt);
      s.smug = damp(s.smug, ph === SMUG ? 1 : 0, ph === SMUG ? 4 : 2, dt);
      s.slump = damp(s.slump, ph === SMUG || (ph === COLLAPSE && s.pt > POP) ? 1 : 0, ph === IDLE ? 1.2 : 3, dt);
      s.bars = damp(s.bars, ph === CHARGE || ph === EXPAND ? 1 : 0, 5, dt);
      // camera drift while inside, back to centre when it closes
      if (ph === DOMAIN) {
        if (s.demo) {
          s.camTX = Math.sin(t * 0.4) * 0.5;
          s.camTY = Math.sin(t * 0.3) * 0.25;
        }
      } else {
        s.camTX = 0;
        s.camTY = 0;
      }
      const pcx = s.camX;
      s.camX = damp(s.camX, s.camTX, rm ? 2 : 2.6, dt);
      s.camY = damp(s.camY, s.camTY, rm ? 2 : 2.6, dt);
      s.flash = Math.max(0, s.flash - dt * 5);
      s.kick = Math.max(0, s.kick - dt * 1.4);

      // tunnel stars rush toward the viewer
      if (!rm) {
        const tn = s.tunnel;
        const speed = ph === EXPAND ? 0.5 : ph === COLLAPSE ? -0.2 : 0.28;
        for (let i = 0; i < tn.length; i += 4) {
          tn[i + 2] -= dt * speed * (0.6 + tn[i + 3] * 0.6);
          if (tn[i + 2] < 0.04) {
            tn[i + 2] = 1;
            tn[i] = rand(0, TAU);
          } else if (tn[i + 2] > 1) tn[i + 2] = 0.05;
        }
      }

      // audio: domain drone, glints of shimmer, a whoosh when the camera swings
      if (s.hum) {
        if (ph === CHARGE) setHum(s.hum, 55 + s.chT * 4, 0.02 + 0.06 * seg(s.chT, SUB_IN, CHARGE_END), 300 + 300 * seg(s.chT, SUB_IN, CHARGE_END));
        else if (inVoid || ph === COLLAPSE) setHum(s.hum, 41 + Math.sin(t * 0.5) * 1.5, ph === COLLAPSE ? 0.06 * (1 - seg(s.pt, 0, POP)) : 0.11, 360 + 160 * Math.sin(t * 0.7));
        else {
          stopHum(s.hum);
          s.hum = null;
        }
      }
      if (ph === DOMAIN && p.touched && t > s.nextSparkle) {
        s.nextSparkle = t + rand(0.35, 0.9);
        const bus = env.audio();
        if (bus) {
          const notes = [1175, 1319, 1568, 1760, 2093, 2349, 2637];
          tone(bus, notes[Math.floor(rand(0, notes.length))], { decay: rand(0.8, 1.6), gain: 0.018 });
        }
      }
      if (ph === DOMAIN && p.touched && Math.abs(s.camX - pcx) / Math.max(dt, 1e-3) > 0.9 && t > s.nextWhoosh) {
        s.nextWhoosh = t + 0.5;
        const bus = env.audio();
        if (bus) noise(bus, { duration: 0.5, freq: 500, q: 0.5, gain: 0.05 });
      }

      if (rm && p.touched && (ph !== IDLE || s.lift > 0.01 || s.reveal > 0.01) && !(ph === SMUG && s.pt > 1.5)) env.wake(300);
    },
    draw: (s, env, t) => {
      const { ctx: c, w, h } = env;
      const rm = env.reducedMotion;
      const u = s.u;
      const ph = s.phase;
      const amp = rm ? 0 : s.kick * 12 * u + (ph === CHARGE ? seg(s.chT, 2.4, CHARGE_END) * 2 * u : 0);
      c.save();
      c.translate(shakeX(amp, t), shakeY(amp, t));

      renderFigure(s, env, t);
      litStreet(s);

      // how much of the world the void has swallowed
      let R = 0;
      let va = 1;
      if (ph === EXPAND) {
        if (rm) {
          R = s.rMax;
          va = seg(s.pt, 0, 1);
        } else R = s.rMax * easeOutCubic(seg(s.pt, 0, 1.1));
      } else if (ph === DOMAIN) R = s.rMax;
      else if (ph === COLLAPSE) {
        if (rm) {
          R = s.rMax;
          va = 1 - seg(s.pt, 0.3, POP);
        } else R = s.rMax * (1 - easeInCubic(seg(s.pt, 0, POP)));
      }
      const full = R >= s.rMax && va >= 1;

      if (!full) {
        // reality: the street, the spirit and Gojo, with a slow push in while he charges
        const push = rm ? 1 : 1 + 0.1 * easeInOutCubic(seg(s.chT, 0, CHARGE_END)) * (ph === CHARGE ? 1 : 0);
        c.save();
        c.translate(s.ox, s.oy);
        c.scale(push, push);
        c.translate(-s.ox, -s.oy);
        if (s.street) c.drawImage(s.street, 0, 0, w, h);
        // the lamp's cone, flickering now and then
        const fl = rm ? 1 : 0.85 + 0.15 * Math.sin(t * 3.1) * Math.sin(t * 7.7) - (Math.sin(t * 0.9) > 0.97 ? 0.5 : 0);
        const lbx = s.ox - 250 * u + 116 * u;
        const lby = s.oy - 330 * u - 24 * u;
        c.globalCompositeOperation = 'lighter';
        const cone = c.createLinearGradient(0, lby, 0, s.ground);
        cone.addColorStop(0, `rgba(190,230,245,${(0.16 * fl).toFixed(3)})`);
        cone.addColorStop(1, 'rgba(190,230,245,0)');
        c.fillStyle = cone;
        c.beginPath();
        c.moveTo(lbx - 40 * u, lby);
        c.lineTo(lbx + 40 * u, lby);
        c.lineTo(lbx + 300 * u, s.ground);
        c.lineTo(lbx - 330 * u, s.ground);
        c.closePath();
        c.fill();
        glow(c, s.sprites.lamp, lbx, lby, 60 * u, fl);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        c.save();
        c.translate(s.fx, s.ground);
        c.scale(s.fu, s.fu);
        drawFoe(c, s, t, false, 0);
        c.restore();
        blitFigure(c, s, s.ox, s.oy, 1, 0);
        figureFx(c, s, s.ox, s.oy, 1, t, 1);
        // drizzle
        c.strokeStyle = 'rgba(170,200,255,0.16)';
        c.lineWidth = 1;
        c.beginPath();
        const rn = s.rain;
        for (let i = 0; i < rn.length; i += 3) {
          const y = ((rn[i + 1] + (rm ? 0 : t * 0.9 * rn[i + 2])) % 1) * h;
          const x = rn[i] * w - y * 0.08;
          c.moveTo(x, y);
          c.lineTo(x - 2, y + 14 * rn[i + 2]);
        }
        c.stroke();
        // the street darkens while he charges
        const dim = ph === CHARGE ? 0.45 * seg(s.chT, 0.3, CHARGE_END) : ph === EXPAND ? 0.45 : 0;
        if (dim > 0) {
          c.fillStyle = `rgba(0,0,8,${dim.toFixed(3)})`;
          c.fillRect(0, 0, w, h);
          figureFx(c, s, s.ox, s.oy, 1, t, dim * 2);
        }
        c.restore();
      }

      if (R > 1 && va > 0.001) {
        const blank = ph === DOMAIN ? 0.3 + 0.7 * seg(s.pt, 0, 1.5) : ph === EXPAND ? seg(s.pt, 0.6, 1.5) * 0.3 : ph === COLLAPSE ? 1 : 0;
        const vs = lerp(1, s.portrait ? 0.74 : 0.86, s.float);
        const D = Math.min(w, h) * 0.12;
        const gx = s.vcx - s.camX * D * 0.75;
        const gy = s.vcy - 150 * u * vs - s.float * 80 * u + Math.sin(t * 1.2) * 6 * u * s.float - s.camY * D * 0.75;
        c.save();
        c.globalAlpha = va;
        if (!full) {
          c.beginPath();
          c.arc(s.vcx, s.vcy, R, 0, TAU);
          c.clip();
        }
        drawVoid(c, s, env, t, blank);
        // first a black nothing swallows everything, then the endless space opens up in it
        const black = ph === EXPAND ? 1 - seg(s.pt, 0.5, 1.35) : ph === COLLAPSE ? seg(s.pt, 0, 0.55) : 0;
        if (black > 0.001) {
          c.fillStyle = `rgba(0,0,0,${black.toFixed(3)})`;
          c.fillRect(0, 0, w, h);
        }
        backlit(s, 1);
        blitFigure(c, s, gx, gy, vs, 0.95);
        figureFx(c, s, gx, gy, vs, t, 1.4);
        drawBokeh(c, s, env, t, 1 - black);
        c.restore();
        c.globalAlpha = 1;

        // the edge of the domain: a shockwave going out, a seam of light coming back in
        if (!full && !rm) {
          c.globalCompositeOperation = 'lighter';
          const strong = ph === EXPAND ? 1 - seg(s.pt, 0.6, 1.1) * 0.6 : 1;
          for (const [lw, col] of [
            [28, 'rgba(90,150,255,0.22)'],
            [10, 'rgba(160,215,255,0.6)'],
            [3, 'rgba(255,255,255,0.95)'],
          ] as const) {
            c.globalAlpha = strong;
            c.strokeStyle = col;
            c.lineWidth = lw * u;
            c.beginPath();
            c.arc(s.vcx, s.vcy, R, 0, TAU);
            c.stroke();
          }
          if (ph === EXPAND) {
            const R2 = R * 1.12 + 40 * u;
            c.globalAlpha = 0.35 * (1 - seg(s.pt, 0, 1.1));
            c.strokeStyle = 'rgba(200,230,255,1)';
            c.lineWidth = 2;
            c.beginPath();
            c.arc(s.vcx, s.vcy, R2, 0, TAU);
            c.stroke();
          }
          // streaks along the edge: thrown outward, or sucked back in
          const dir = ph === COLLAPSE ? -1 : 1;
          c.strokeStyle = 'rgba(200,230,255,0.5)';
          c.lineWidth = 1.5;
          c.globalAlpha = strong;
          c.beginPath();
          for (let i = 0; i < 56; i++) {
            const a = i * 2.39996 + Math.sin(i * 7.7) * 0.2;
            const len = (12 + 150 * Math.pow(Math.abs(Math.sin(i * 5.1 + Math.floor(t * 20) * 0.7)), 4)) * u;
            const r0 = R + dir * (4 + 30 * Math.abs(Math.sin(i * 3.3))) * u;
            c.moveTo(s.vcx + Math.cos(a) * r0, s.vcy + Math.sin(a) * r0);
            c.lineTo(s.vcx + Math.cos(a) * (r0 + dir * len), s.vcy + Math.sin(a) * (r0 + dir * len));
          }
          c.stroke();
          c.globalAlpha = 1;
          c.globalCompositeOperation = 'source-over';
        }
      }
      // the pop as it all collapses back into him
      if (ph === COLLAPSE && s.pt > POP && !rm) {
        const k = seg(s.pt, POP, COLLAPSE_LEN);
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = `rgba(190,225,255,${(0.8 * (1 - k)).toFixed(3)})`;
        c.lineWidth = 6 * u * (1 - k) + 1;
        c.beginPath();
        c.arc(s.vcx, s.vcy, (40 + 600 * easeOutCubic(k)) * u, 0, TAU);
        c.stroke();
        c.globalCompositeOperation = 'source-over';
      }
      c.restore();

      drawCutIns(c, s, env, t);

      // letterbox bars
      if (s.bars > 0.01) {
        const bh = h * 0.085 * easeInOutCubic(s.bars);
        c.fillStyle = '#000';
        c.fillRect(0, 0, w, bh);
        c.fillRect(0, h - bh, w, bh);
      }
      // subtitles and the title card
      const barY = h - h * 0.0425;
      if (ph === CHARGE) drawSubtitle(c, env, 'Domain Expansion', seg(s.chT, SUB_IN, SUB_IN + 0.25), barY);
      if (ph === EXPAND) drawSubtitle(c, env, 'Domain Expansion', 1 - seg(s.pt, 0, 0.3), barY);
      if (ph === EXPAND || ph === DOMAIN) {
        const tk = ph === EXPAND ? seg(s.pt, 0.2, 1.0) : 1;
        const ta = ph === EXPAND ? seg(s.pt, 0.2, 0.6) : 1 - seg(s.pt, 2.4, 3.4);
        drawTitle(c, s, env, tk, ta);
      }

      if (s.flash > 0) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(215,235,255,${(s.flash * s.flash * 0.9).toFixed(3)})`;
        c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
      }
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,10,0.55)');
      c.fillStyle = v;
      c.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env, x, y) => {
      const p = s.press;
      if (!p.touched && env.reducedMotion) reset(s);
      p.touched = true;
      p.pointer = true;
      s.lastInput = s.t;
      s.camTX = clamp((x / Math.max(1, env.w) - 0.5) * 2, -1, 1);
      s.camTY = clamp((y / Math.max(1, env.h) - 0.5) * 2, -1, 1);
    },
    onPointerMove: (s, env, x, y) => {
      if (!s.press.touched) return;
      s.lastInput = s.t;
      if (s.phase === DOMAIN) {
        s.camTX = clamp((x / Math.max(1, env.w) - 0.5) * 2, -1, 1);
        s.camTY = clamp((y / Math.max(1, env.h) - 0.5) * 2, -1, 1);
        env.wake(400);
      }
    },
    onPointerUp: (s) => {
      s.press.pointer = false;
      s.lastInput = s.t;
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (e.repeat && down) return true;
      if (down && !s.press.touched && env.reducedMotion) reset(s);
      s.press.key = down;
      s.lastInput = s.t;
      if (down) s.press.touched = true;
      return true;
    },
    dispose: (s) => {
      stopHum(s.hum);
      s.hum = null;
      freeCanvas(s.street, s.nebula, s.far, s.fig, s.rim, s.glyphs, ...Object.values(s.sprites));
    },
  });
