import type { Hum } from './heroes-kit';
import {
  freeCanvas,
  glow,
  glowSprite,
  layer,
  mulberry,
  setHum,
  startHum,
  stopHum,
} from './heroes-kit';
import type { Docks } from './nolan-docks';
import {
  drawDocks,
  enterDocks,
  freeDocks,
  makeDocks,
  resizeDocks,
  stepDocks,
  strikeDocks,
} from './nolan-docks';
import { dampPose, drawGrain, grad, grainTile, keepAwake, limb, mixPose, poly } from './nolan-kit';
import type { AudioBus, SceneEnv } from './runtime';
import { clamp, createCanvasScene, damp, lerp, noise, rand, TAU, tone } from './runtime';
import type { MountScene } from './types';

/**
 * Batman Begins: Bruce Wayne training with Ducard on a frozen lake under the Himalayas, the
 * League monastery on its crag behind them and blue poppies shivering in the snow. Ducard
 * winds up and a ring closes on the spot where his blade will land; tapping as it closes makes
 * Bruce parry with a ring of steel and a spray of sparks. Three clean parries and Ducard
 * overreaches: tap while the amber ring closes on him to strike back, and the clash splits
 * the ice between them. Mistime it and Bruce is knocked back across the lake while Ducard
 * taps the ice and the cracks run under his feet. Tapping during a lull makes Bruce attack.
 * Sky, peaks, monastery and lake are baked once per resize; the fighters are posed live from
 * key poses that ease toward a target, and mirrored on the ice as a faint reflection.
 */

type C = CanvasRenderingContext2D;
type Phase = 'ready' | 'windup' | 'parried' | 'hit' | 'open' | 'counter' | 'attack' | 'reset';

/*
 * Pose layout (figure units, facing right, feet on y = 0, up is negative):
 * 0 hip, 2 neck, 4 head, 6 near knee, 8 near foot, 10 far knee, 12 far foot,
 * 14 near elbow, 16 near hand, 18 far elbow, 20 far hand, 22 blade angle
 */
const GUARD = [
  0, -92, 6, -148, 10, -166, 24, -50, 38, 0, -20, -48, -38, 0, 22, -110, 36, -116, 10, -114, 30,
  -120, -0.78,
];
const WINDUP = [
  -4, -94, -4, -150, -2, -168, 24, -52, 40, 0, -22, -50, -42, 0, 18, -160, 8, -186, 4, -158, 2,
  -184, -2.35,
];
const SLASH = [
  10, -84, 28, -136, 38, -152, 42, -48, 56, 0, -16, -40, -44, 0, 46, -110, 64, -98, 36, -112, 58,
  -102, 0.42,
];
/** Bruce's high block: hilt up in front of his brow, the blade slanting up across the cut */
const PARRY = [
  -4, -92, 0, -146, 2, -164, 22, -50, 34, 0, -24, -46, -40, 0, 22, -150, 26, -178, 8, -156, 22,
  -174, -0.41,
];
/** Ducard's overhead cut at the moment it lands: a lunging step, blade coming down steeply */
const STRIKE = [
  32, -84, 52, -134, 60, -150, 64, -48, 84, 0, 6, -42, -22, 0, 82, -196, 102, -238, 76, -200, 98,
  -234, 0.9,
];
/** Ducard's blade knocked back up off the parry */
const RECOIL = [
  6, -90, 14, -144, 18, -160, 34, -50, 50, 0, -18, -44, -40, 0, 30, -170, 40, -206, 20, -172, 36,
  -202, -0.6,
];
const LUNGE = [
  18, -78, 42, -128, 54, -142, 62, -46, 84, 0, -10, -36, -46, 0, 70, -116, 94, -116, 58, -118, 88,
  -118, -0.06,
];
const STAGGER = [
  -16, -84, -26, -138, -32, -154, 8, -46, 22, 0, -38, -42, -56, 0, -6, -112, 12, -96, -16, -116, 4,
  -98, 0.95,
];
const OPEN = [
  -12, -90, -22, -144, -26, -162, 22, -50, 36, 0, -26, -46, -46, 0, 8, -110, 26, -78, -8, -112, 18,
  -80, 0.9,
];
const BLOCK = [
  -6, -92, -2, -146, 0, -164, 22, -50, 34, 0, -24, -46, -42, 0, 30, -116, 40, -140, -6, -116, 10,
  -96, 1.2,
];
const TAP = [
  4, -88, 14, -142, 20, -160, 30, -50, 44, 0, -20, -46, -40, 0, 34, -112, 52, -92, 26, -114, 48,
  -94, 1.12,
];
const POSE_N = GUARD.length;

const HEAD = 1.12;
const BLADE = 94;
const HILT = 16;
const FIGHT_GAP = 106;

interface Fighter {
  P: number[];
  T: readonly number[];
  rate: number;
  /** slide offset from home in figure units */
  x: number;
  vx: number;
  breath: number;
  nod: number;
}

interface Crack {
  segs: number[];
  ox: number;
  oy: number;
  grow: number;
  speed: number;
  max: number;
  age: number;
  life: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  /** 0 spark, 1 snow spray, 2 breath, 3 petal */
  kind: number;
  rot: number;
}

interface Flake {
  x: number;
  y: number;
  z: number;
  ph: number;
}

interface Flower {
  x: number;
  y: number;
  h: number;
  s: number;
  ph: number;
  lean: number;
}

interface State {
  bruce: Fighter;
  ducard: Fighter;
  phase: Phase;
  pt: number;
  wait: number;
  windT: number;
  /** time from the start of the windup to the moment of contact */
  impact: number;
  tapAt: number;
  locked: boolean;
  autoMiss: boolean;
  rounds: number;
  combo: number;
  pips: number[];
  ring: number;
  ringMiss: number;
  slow: number;
  /** the white star where the blades met */
  clash: number;
  clashX: number;
  clashY: number;
  flash: number;
  shake: number;
  cracks: Crack[];
  bits: Bit[];
  bitNext: number;
  flakes: Flake[];
  flowers: Flower[];
  gust: number;
  gustT: number;
  drift: number;
  touched: boolean;
  idle: number;
  wind: Hum | null;
  /** which beat is showing: the training on the lake, or the docks in Gotham */
  beat: 'lake' | 'docks';
  fade: number;
  fadeTo: 'lake' | 'docks';
  won: boolean;
  docks: Docks;
  // layout
  u: number;
  F: number;
  gy: number;
  bx: number;
  dx: number;
  sky: HTMLCanvasElement | null;
  fore: HTMLCanvasElement | null;
  white: HTMLCanvasElement;
  amber: HTMLCanvasElement;
  mist: HTMLCanvasElement;
  grain: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const W0 = 900;
const H0 = 560;
const FLAKES = 260;
const BITS = 260;

const INK = '#0d1015';
const COAT = '#14181f';
const RIM = 'rgba(236,244,255,0.95)';
const CHILL = 'rgba(90,112,140,0.6)';

/* ---------- baked layers ---------- */

/** Jagged edge from (x0,y0) to (x1,y1) with n kinks pushed sideways by up to amp */
function jag(
  rnd: () => number,
  out: number[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n: number,
  amp: number
) {
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const j = i === n ? 0 : (rnd() - 0.5) * amp;
    out.push(lerp(x0, x1, k) + j, lerp(y0, y1, k) + Math.abs(j) * 0.3 * (rnd() - 0.3));
  }
}

/**
 * A row of sharp Himalayan peaks. Light comes from the right, so each peak has a lit face,
 * a shadowed face split by a jagged spine, and snow couloirs streaking down the light side.
 */
function paintRange(
  c: C,
  w: number,
  base: number,
  height: number,
  seed: number,
  count: number,
  lit: string[],
  shade: string,
  streak: string
) {
  const rnd = mulberry(seed);
  const peaks: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const px = ((i + 0.2 + rnd() * 0.6) / count) * (w + 120) - 60;
    const ph = height * (0.45 + rnd() * 0.55);
    peaks.push([px, ph, ph * (0.9 + rnd() * 0.8)]);
  }
  peaks.sort((a, b) => a[1] - b[1]);
  for (const [px, ph, pw] of peaks) {
    const sy = base - ph;
    const left: number[] = [px, sy];
    jag(rnd, left, px, sy, px - pw, base, 7, pw * 0.12);
    const right: number[] = [px, sy];
    jag(rnd, right, px, sy, px + pw * (0.8 + rnd() * 0.4), base, 7, pw * 0.12);
    c.fillStyle = grad(c, 0, sy, 0, base, lit);
    c.beginPath();
    c.moveTo(left[left.length - 2], left[left.length - 1]);
    for (let i = left.length - 2; i >= 0; i -= 2) c.lineTo(left[i], left[i + 1]);
    for (let i = 2; i < right.length; i += 2) c.lineTo(right[i], right[i + 1]);
    c.closePath();
    c.fill();
    // the shaded face: from the left ridge across to a crooked spine dropping off the summit
    const spine: number[] = [px, sy];
    jag(rnd, spine, px, sy, px - pw * (0.05 + rnd() * 0.25), base, 6, pw * 0.1);
    c.fillStyle = shade;
    c.beginPath();
    c.moveTo(px, sy);
    for (let i = 2; i < left.length; i += 2) c.lineTo(left[i], left[i + 1]);
    for (let i = spine.length - 2; i >= 2; i -= 2) c.lineTo(spine[i], spine[i + 1]);
    c.closePath();
    c.fill();
    // a lit ridge running down the sunny face
    c.fillStyle = streak;
    const k = 0.3 + rnd() * 0.3;
    const rx = lerp(px, right[right.length - 2], k);
    c.beginPath();
    c.moveTo(px, sy);
    c.lineTo(rx, lerp(sy, base, 0.75));
    c.lineTo(rx + pw * 0.05, lerp(sy, base, 0.8));
    c.closePath();
    c.fill();
  }
}

function paintMonastery(c: C, x: number, y: number, u: number) {
  // the crag the monastery sits on
  c.fillStyle = grad(c, 0, y - 40 * u, 0, y + 90 * u, ['#5c6878', '#3e4856', '#6c7a8a']);
  c.beginPath();
  c.moveTo(x - 120 * u, y + 90 * u);
  c.lineTo(x - 70 * u, y + 30 * u);
  c.lineTo(x - 48 * u, y + 4 * u);
  c.lineTo(x - 30 * u, y - 4 * u);
  c.lineTo(x + 38 * u, y - 6 * u);
  c.lineTo(x + 56 * u, y + 10 * u);
  c.lineTo(x + 70 * u, y + 40 * u);
  c.lineTo(x + 110 * u, y + 90 * u);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(240,246,252,0.75)';
  c.beginPath();
  c.moveTo(x - 48 * u, y + 4 * u);
  c.lineTo(x - 30 * u, y - 4 * u);
  c.lineTo(x + 38 * u, y - 6 * u);
  c.lineTo(x + 52 * u, y + 6 * u);
  c.lineTo(x + 20 * u, y + 2 * u);
  c.lineTo(x - 10 * u, y + 6 * u);
  c.closePath();
  c.fill();
  // tiered halls with battered walls and flat roofs
  const tiers = [
    [-34, 0, 70, 20],
    [-22, -20, 46, 20],
    [-12, -36, 26, 16],
  ];
  for (const [ox, oy, tw, th] of tiers) {
    const x0 = x + ox * u;
    const y0 = y + oy * u;
    c.fillStyle = '#2b2a2c';
    c.beginPath();
    c.moveTo(x0 - 2 * u, y0);
    c.lineTo(x0 + 1 * u, y0 - th * u);
    c.lineTo(x0 + (tw - 1) * u, y0 - th * u);
    c.lineTo(x0 + (tw + 2) * u, y0);
    c.closePath();
    c.fill();
    // red-brown parapet band and a snowy roof
    c.fillStyle = '#4a2a24';
    c.fillRect(x0 + 1 * u, y0 - th * u, (tw - 2) * u, 3 * u);
    c.fillStyle = 'rgba(236,242,250,0.9)';
    c.fillRect(x0, y0 - th * u - 1.4 * u, tw * u, 1.6 * u);
    // windows lit by the hearth fires
    for (let wx = x0 + 5 * u; wx < x0 + (tw - 4) * u; wx += 7 * u) {
      c.fillStyle = 'rgba(255,176,90,0.85)';
      c.fillRect(wx, y0 - th * u * 0.55, 2 * u, 3 * u);
    }
  }
  // the golden finial
  c.fillStyle = '#8a6a3a';
  c.fillRect(x - 1 * u, y - 60 * u, 2 * u, 8 * u);
  c.beginPath();
  c.arc(x, y - 61 * u, 2 * u, 0, TAU);
  c.fill();
  // prayer flag lines strung down the crag
  c.strokeStyle = 'rgba(60,60,70,0.6)';
  c.lineWidth = 0.6 * u;
  const cols = ['#c0463c', '#3d6db0', '#d8c060', '#3e8a5a', '#e6e6e6'];
  for (const side of [-1, 1]) {
    const ax = x + side * 8 * u;
    const ay = y - 50 * u;
    const ex = x + side * 64 * u;
    const ey = y + 8 * u;
    c.beginPath();
    c.moveTo(ax, ay);
    c.quadraticCurveTo((ax + ex) / 2, (ay + ey) / 2 + 10 * u, ex, ey);
    c.stroke();
    for (let i = 1; i < 9; i++) {
      const k = i / 9;
      const fx = lerp(lerp(ax, (ax + ex) / 2, k), lerp((ax + ex) / 2, ex, k), k);
      const fy = lerp(lerp(ay, (ay + ey) / 2 + 10 * u, k), lerp((ay + ey) / 2 + 10 * u, ey, k), k);
      c.fillStyle = cols[i % cols.length];
      c.globalAlpha = 0.75;
      c.fillRect(fx, fy, 2.4 * u, 3 * u);
    }
    c.globalAlpha = 1;
  }
}

function paintSky(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.sky, w, h, dpr);
  s.sky = cv;
  if (!c) return;
  const u = s.u;
  const hz = s.gy - 120 * s.F;
  // overcast, cold and bright toward the horizon
  c.fillStyle = grad(c, 0, 0, 0, hz, ['#4c5a6b', '#7a8898', '#aab6c2', '#d3dbe2']);
  c.fillRect(0, 0, w, h);
  const sx = w * 0.74;
  const sy = h * 0.16;
  const sg = c.createRadialGradient(sx, sy, 0, sx, sy, 260 * u);
  sg.addColorStop(0, 'rgba(255,252,240,0.85)');
  sg.addColorStop(0.08, 'rgba(250,246,232,0.5)');
  sg.addColorStop(0.4, 'rgba(220,226,232,0.16)');
  sg.addColorStop(1, 'rgba(200,210,220,0)');
  c.fillStyle = sg;
  c.fillRect(0, 0, w, h);
  // torn cloud banks
  const rnd = mulberry(5);
  for (let i = 0; i < 22; i++) {
    const cy = hz * (0.05 + rnd() * 0.6);
    const cx = rnd() * w;
    const rx = (120 + rnd() * 300) * u;
    const ry = (6 + rnd() * 18) * u;
    c.globalAlpha = 0.12 + rnd() * 0.2;
    c.fillStyle = rnd() < 0.5 ? '#f0f3f6' : '#56657a';
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
  // three ranges of peaks, the far ones lost in the haze
  paintRange(
    c,
    w,
    hz,
    hz * 0.86,
    11,
    5,
    ['#f6f9fc', '#d2dce6', '#a8b8c8'],
    'rgba(104,126,154,0.55)',
    'rgba(255,255,255,0.35)'
  );
  c.fillStyle = grad(c, 0, hz * 0.3, 0, hz, ['rgba(214,222,230,0)', 'rgba(214,222,230,0.55)']);
  c.fillRect(0, 0, w, hz);
  paintRange(
    c,
    w,
    hz,
    hz * 0.52,
    23,
    8,
    ['#f0f5f9', '#c0cdda', '#8d9eb2'],
    'rgba(80,100,128,0.6)',
    'rgba(255,255,255,0.3)'
  );
  paintMonastery(c, w * 0.17, hz - 64 * u, u);
  c.fillStyle = grad(c, 0, hz * 0.6, 0, hz, ['rgba(220,228,236,0)', 'rgba(220,228,236,0.6)']);
  c.fillRect(0, hz * 0.6, w, hz * 0.4);
  paintRange(
    c,
    w,
    hz + 2 * u,
    hz * 0.18,
    41,
    14,
    ['#f8fafc', '#d3dde6', '#aebccb'],
    'rgba(96,116,142,0.45)',
    'rgba(255,255,255,0.25)'
  );

  // the frozen lake
  c.fillStyle = grad(c, 0, hz, 0, h, ['#c4d2dd', '#9fb4c5', '#7f97ab', '#5d7486']);
  c.fillRect(0, hz, w, h - hz);
  // peaks mirrored faintly in the ice
  c.save();
  c.beginPath();
  c.rect(0, hz, w, h - hz);
  c.clip();
  c.globalAlpha = 0.18;
  c.translate(0, hz * 2);
  c.scale(1, -1);
  c.drawImage(cv, 0, 0, cv.width, hz * dpr, 0, 0, w, hz);
  c.restore();
  // sun streak on the ice
  const lg = c.createRadialGradient(sx, hz + 40 * u, 0, sx, hz + 40 * u, 320 * u);
  lg.addColorStop(0, 'rgba(255,255,250,0.45)');
  lg.addColorStop(1, 'rgba(255,255,250,0)');
  c.save();
  c.translate(sx, hz + 40 * u);
  c.scale(1, 0.22);
  c.translate(-sx, -(hz + 40 * u));
  c.fillStyle = lg;
  c.fillRect(0, hz - 400 * u, w, 900 * u);
  c.restore();
  // far shore snowline
  c.fillStyle = 'rgba(244,248,252,0.85)';
  c.beginPath();
  c.moveTo(0, hz);
  for (let x = 0; x <= w + 20; x += 20 * u) c.lineTo(x, hz - rnd() * 3 * u);
  c.lineTo(w, hz + 3 * u);
  c.lineTo(0, hz + 3 * u);
  c.closePath();
  c.fill();
  // scratches, old cracks and drifted snow on the ice
  c.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const y = lerp(hz + 6 * u, h, Math.pow(rnd(), 0.8));
    const depth = (y - hz) / (h - hz);
    const x = rnd() * w;
    const len = (20 + rnd() * 120) * u * (0.4 + depth);
    c.strokeStyle =
      rnd() < 0.5 ? 'rgba(240,248,255,0.28)' : `rgba(50,72,92,${(0.12 + depth * 0.15).toFixed(2)})`;
    c.lineWidth = (0.5 + depth) * u;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len, y + (rnd() - 0.5) * 6 * u * depth);
    c.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const y = lerp(hz + 10 * u, h, rnd());
    const depth = (y - hz) / (h - hz);
    const rx = (40 + rnd() * 140) * u * (0.4 + depth);
    c.globalAlpha = 0.25 + rnd() * 0.3;
    c.drawImage(s.mist, rnd() * w - rx, y - rx * 0.08, rx * 2, rx * 0.16);
  }
  c.globalAlpha = 1;
}

function paintFore(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.fore, w, h, dpr);
  s.fore = cv;
  if (!c) return;
  const u = s.u;
  // snow banks in the near corners
  const banks: [number, number, number, number][] = [
    [-0.04, 1.02, 0.3, 0.13],
    [0.12, 1.04, 0.2, 0.09],
    [1.04, 1.02, 0.24, 0.11],
  ];
  for (const [bx, by, rx, ry] of banks) {
    const x = bx * w;
    const y = by * h;
    c.fillStyle = grad(c, 0, y - ry * h, 0, y, ['#f4f7fb', '#d3dee8', '#a9bccc']);
    c.beginPath();
    c.ellipse(x, y, rx * w, ry * h, 0, Math.PI, TAU);
    c.fill();
    c.fillStyle = 'rgba(120,146,170,0.25)';
    c.beginPath();
    c.ellipse(x + rx * w * 0.2, y, rx * w * 0.8, ry * h * 0.55, 0, Math.PI, TAU);
    c.fill();
  }
  void u;
}

/* ---------- figures ---------- */

function traceBruceHead(c: C) {
  // facing right, centred on the head; short hair and a beard grown out in the mountains
  c.moveTo(-11, 12);
  c.bezierCurveTo(-15, 4, -15, -6, -11, -11);
  c.bezierCurveTo(-8, -15, -2, -16.5, 4, -15);
  c.lineTo(8, -14.5);
  c.lineTo(6.5, -12.5);
  c.bezierCurveTo(10, -10, 12, -6, 12.4, -3);
  c.lineTo(15.2, 1.2);
  c.lineTo(12.6, 2.6);
  c.lineTo(13.4, 6);
  c.lineTo(12.2, 9.6);
  c.bezierCurveTo(10, 13, 6, 14.5, 1, 14);
  c.lineTo(-4, 16);
  c.closePath();
}

function traceDucardHead(c: C) {
  // swept back hair, the clipped moustache and the long goatee
  c.moveTo(-11, 12);
  c.bezierCurveTo(-16, 3, -16, -8, -10, -13);
  c.bezierCurveTo(-5, -16, 1, -16, 5, -14);
  c.bezierCurveTo(10, -11, 12, -7, 12.4, -3);
  c.lineTo(15.4, 1.6);
  c.lineTo(12.8, 3);
  c.lineTo(14, 6.6);
  c.lineTo(12.6, 9);
  c.lineTo(13.4, 16);
  c.lineTo(9.6, 19);
  c.lineTo(7.4, 13.4);
  c.bezierCurveTo(4, 14.4, 0, 14.6, -4, 16);
  c.closePath();
}

const BLADE_PT = [0, 0, 0, 0];

function bladeLine(P: readonly number[], out: number[]) {
  const hx = (P[16] + P[20]) / 2;
  const hy = (P[17] + P[21]) / 2;
  const a = P[22];
  out[0] = hx - Math.cos(a) * HILT;
  out[1] = hy - Math.sin(a) * HILT;
  out[2] = hx + Math.cos(a) * BLADE;
  out[3] = hy + Math.sin(a) * BLADE;
}

/** Every solid part of one fighter in a single colour, in figure units */
function fillFighter(
  c: C,
  P: readonly number[],
  ducard: boolean,
  col: string,
  coat: string,
  t: number,
  gust: number
) {
  c.fillStyle = col;
  // far arm
  limb(c, P[2] - 2, P[3] + 6, P[18], P[19], 8.5, 7);
  limb(c, P[18], P[19], P[20], P[21], 7, 6);
  // far leg and boot
  limb(c, P[0] - 3, P[1], P[10], P[11], 11, 9);
  limb(c, P[10], P[11], P[12], P[13] - 6, 9, 7.5);
  poly(c, [P[12] - 8, P[13], P[12] - 8, P[13] - 12, P[12] + 8, P[13] - 11, P[12] + 14, P[13]]);
  c.fill();
  // the long coat skirt, flared and catching the wind
  const hem = ducard ? 0.72 : 0.5;
  const fl = Math.sin(t * 3.1 + (ducard ? 1 : 0)) * 3 + gust * 6;
  const fx = lerp(P[6], P[8], hem) + 10;
  const fy = lerp(P[7], P[9], hem);
  const bxk = lerp(P[10], P[12], hem) - 12 - fl;
  const byk = lerp(P[11], P[13], hem) - fl * 0.4;
  c.fillStyle = coat;
  c.beginPath();
  c.moveTo(P[0] - 14, P[1] - 12);
  c.lineTo(P[0] + 14, P[1] - 12);
  c.quadraticCurveTo((P[0] + fx) / 2 + 12, (P[1] + fy) / 2, fx, fy);
  c.quadraticCurveTo((fx + bxk) / 2, Math.max(fy, byk) + 5 + Math.sin(t * 4.3) * 1.5, bxk, byk);
  c.quadraticCurveTo((P[0] + bxk) / 2 - 12, (P[1] + byk) / 2, P[0] - 14, P[1] - 12);
  c.fill();
  c.fillStyle = col;
  // torso: broad chest tapering to the sash
  const ax = P[2] - P[0];
  const ay = P[3] - P[1];
  const al = Math.hypot(ax, ay) || 1;
  const nx = -ay / al;
  const ny = ax / al;
  const chest = ducard ? 21 : 19;
  c.beginPath();
  c.moveTo(P[2] + nx * chest, P[3] + ny * chest + 4);
  c.quadraticCurveTo(
    lerp(P[2], P[0], 0.5) + nx * (chest + 2),
    lerp(P[3], P[1], 0.5) + ny * (chest + 2),
    P[0] + nx * 14,
    P[1] + ny * 14
  );
  c.lineTo(P[0] - nx * 14, P[1] - ny * 14);
  c.quadraticCurveTo(
    lerp(P[2], P[0], 0.5) - nx * (chest - 2),
    lerp(P[3], P[1], 0.5) - ny * (chest - 2),
    P[2] - nx * chest,
    P[3] - ny * chest + 4
  );
  c.closePath();
  c.fill();
  // shoulders, and Ducard's heavy fur collar
  c.beginPath();
  c.ellipse(
    P[2],
    P[3] + 6,
    ducard ? 22 : 18,
    ducard ? 13 : 10,
    Math.atan2(ay, ax) + Math.PI / 2,
    0,
    TAU
  );
  c.fill();
  if (ducard) {
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 1.05 + (i / 8) * Math.PI * 0.95;
      const r = 17 + (i % 2) * 4;
      c.moveTo(P[2] + Math.cos(a) * 6, P[3] + 4);
      c.arc(P[2] + Math.cos(a) * r * 0.9, P[3] + 4 + Math.sin(a) * r * 0.5, 5.5, 0, TAU);
    }
    c.fill();
  }
  // near leg and boot
  limb(c, P[0] + 3, P[1], P[6], P[7], 12, 9.5);
  limb(c, P[6], P[7], P[8], P[9] - 6, 9.5, 8);
  poly(c, [P[8] - 9, P[9], P[8] - 9, P[9] - 13, P[8] + 8, P[9] - 12, P[8] + 15, P[9]]);
  c.fill();
  // neck and head
  limb(c, P[2], P[3] + 2, P[4] - 2, P[5] + 10, 7, 6.5);
  c.save();
  c.translate(P[4], P[5]);
  c.rotate((P[4] - P[2]) * 0.01);
  c.scale(HEAD, HEAD);
  c.beginPath();
  if (ducard) traceDucardHead(c);
  else traceBruceHead(c);
  c.fill();
  c.restore();
  // near arm and the leather vambrace
  limb(c, P[2] + 2, P[3] + 6, P[14], P[15], 9, 7.5);
  limb(c, P[14], P[15], P[16], P[17], 8, 7);
  c.beginPath();
  c.arc(P[16], P[17], 5.5, 0, TAU);
  c.arc(P[20], P[21], 5.2, 0, TAU);
  c.fill();
}

function drawSword(c: C, P: readonly number[], glint: number, alpha: number) {
  bladeLine(P, BLADE_PT);
  const [x0, y0, x1, y1] = BLADE_PT;
  const hx = (P[16] + P[20]) / 2;
  const hy = (P[17] + P[21]) / 2;
  c.globalAlpha = alpha;
  c.lineCap = 'round';
  // grip and guard
  c.strokeStyle = '#1a1612';
  c.lineWidth = 3.4;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(hx, hy);
  c.stroke();
  const a = P[22];
  const gx = hx + Math.cos(a) * 4;
  const gy = hy + Math.sin(a) * 4;
  c.strokeStyle = '#4a4036';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(gx - Math.sin(a) * 6, gy + Math.cos(a) * 6);
  c.lineTo(gx + Math.sin(a) * 6, gy - Math.cos(a) * 6);
  c.stroke();
  // the blade: dark spine, bright edge
  c.strokeStyle = '#55606c';
  c.lineWidth = 3.4;
  c.beginPath();
  c.moveTo(gx, gy);
  c.lineTo(x1, y1);
  c.stroke();
  c.strokeStyle = 'rgba(248,252,255,1)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(gx - Math.sin(a) * 0.8, gy + Math.cos(a) * 0.8);
  c.lineTo(x1, y1);
  c.stroke();
  if (glint > 0.01) {
    const q = 0.25 + 0.7 * ((glint * 2.2) % 1);
    const px = lerp(gx, x1, q);
    const py = lerp(gy, y1, q);
    c.fillStyle = `rgba(255,255,255,${(0.9 * Math.min(1, glint * 3)).toFixed(3)})`;
    c.beginPath();
    c.moveTo(px - 7, py);
    c.lineTo(px, py - 1.2);
    c.lineTo(px + 7, py);
    c.lineTo(px, py + 1.2);
    c.moveTo(px, py - 7);
    c.lineTo(px + 1.2, py);
    c.lineTo(px, py + 7);
    c.lineTo(px - 1.2, py);
    c.fill();
  }
  c.globalAlpha = 1;
}

/** Leather, sash, beard and steel picked out over the silhouette */
function detailFighter(c: C, P: readonly number[], ducard: boolean) {
  // sash knotted at the waist
  const ax = P[2] - P[0];
  const ay = P[3] - P[1];
  const ang = Math.atan2(ay, ax) + Math.PI / 2;
  c.save();
  c.translate(lerp(P[0], P[2], 0.1), lerp(P[1], P[3], 0.1));
  c.rotate(ang);
  c.fillStyle = ducard ? '#3a2e26' : '#2c3036';
  c.fillRect(-15, -4, 30, 8);
  c.fillStyle = 'rgba(200,210,224,0.35)';
  c.fillRect(-15, -4, 30, 1.2);
  c.fillStyle = ducard ? '#3a2e26' : '#2c3036';
  poly(c, [-10, 3, -6, 3, -12, 22, -16, 20]);
  c.fill();
  c.restore();
  // coat lapel line
  c.strokeStyle = 'rgba(150,170,196,0.28)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(P[2] + 8, P[3] + 4);
  c.quadraticCurveTo(lerp(P[2], P[0], 0.5) + 10, lerp(P[3], P[1], 0.5), P[0] + 8, P[1] - 4);
  c.stroke();
  // forearm guards: Bruce wears the finned gauntlets that become Batman's
  const fa = Math.atan2(P[17] - P[15], P[16] - P[14]);
  c.save();
  c.translate(lerp(P[14], P[16], 0.55), lerp(P[15], P[17], 0.55));
  c.rotate(fa);
  c.fillStyle = '#2a2622';
  c.fillRect(-9, -6.5, 18, 13);
  c.fillStyle = 'rgba(210,220,236,0.35)';
  c.fillRect(-9, -6.5, 18, 1.2);
  if (!ducard) {
    c.fillStyle = '#1b1916';
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const x = -6 + i * 5;
      c.moveTo(x - 2, -6);
      c.lineTo(x + 3, -12);
      c.lineTo(x + 3, -6);
    }
    c.fill();
  }
  c.restore();
  // the face in profile, lit cold from the sky
  c.save();
  c.translate(P[4], P[5]);
  c.rotate((P[4] - P[2]) * 0.01);
  c.scale(HEAD, HEAD);
  c.fillStyle = grad(c, 0, -12, 14, 8, ['#8f7b70', '#c2a796', '#d9c2b2']);
  c.beginPath();
  c.moveTo(ducard ? 4 : 5, -12.5);
  c.bezierCurveTo(9, -11, 11.6, -7, 12.4, -3);
  c.lineTo(15.2, 1.4);
  c.lineTo(12.6, 2.8);
  c.lineTo(13.4, 6);
  c.lineTo(12.2, 9.4);
  c.bezierCurveTo(9, 12.6, 4, 13, 1, 11);
  c.bezierCurveTo(-1, 6, -1, -2, 1, -6);
  c.closePath();
  c.fill();
  // ear, brow shadow and eye
  c.fillStyle = '#7a675c';
  c.beginPath();
  c.ellipse(-1.5, 1, 2.2, 3.4, 0.2, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(30,24,22,0.85)';
  poly(c, [6, -6.2, 12.4, -4.8, 12, -3.2, 7, -3.6]);
  c.fill();
  c.fillStyle = '#1c1714';
  c.fillRect(8.6, -3.2, 2.4, 1.2);
  // beard: Bruce's grown out in the mountains, Ducard's clipped moustache and long goatee
  c.fillStyle = ducard ? '#5e5a58' : '#231c18';
  c.beginPath();
  if (ducard) {
    c.moveTo(13, 4.4);
    c.lineTo(9, 5.2);
    c.lineTo(8.4, 6.6);
    c.lineTo(12.8, 6.4);
    c.closePath();
    c.moveTo(12.4, 8);
    c.lineTo(13.4, 16);
    c.lineTo(9.6, 19);
    c.lineTo(8.4, 12);
    c.closePath();
  } else {
    c.moveTo(13.2, 4.6);
    c.lineTo(13.4, 6.4);
    c.lineTo(12.2, 9.8);
    c.bezierCurveTo(9, 13.4, 4, 13.6, 0.4, 11.2);
    c.lineTo(0.4, 5);
    c.lineTo(4, 7.4);
    c.lineTo(9, 6.2);
    c.closePath();
  }
  c.fill();
  c.restore();
}

function drawFighter(c: C, s: State, f: Fighter, ducard: boolean, t: number, glint: number) {
  const F = s.F;
  const homeX = ducard ? s.dx : s.bx;
  c.save();
  c.translate(homeX + (ducard ? -f.x : f.x) * F, s.gy);
  c.scale(ducard ? -F : F, F);
  const P = f.P;
  // rim from the white sky behind, then the cool fill, then the body
  c.save();
  c.translate(ducard ? -1.4 : 1.4, -1.2);
  fillFighter(c, P, ducard, RIM, RIM, t, s.gust);
  c.restore();
  c.save();
  c.translate(ducard ? 1.2 : -1.2, 0.8);
  fillFighter(c, P, ducard, CHILL, CHILL, t, s.gust);
  c.restore();
  fillFighter(c, P, ducard, INK, COAT, t, s.gust);
  detailFighter(c, P, ducard);
  drawSword(c, P, glint, 1);
  c.restore();
}

function drawReflection(c: C, s: State, f: Fighter, ducard: boolean, t: number) {
  const F = s.F;
  const homeX = ducard ? s.dx : s.bx;
  c.save();
  c.translate(homeX + (ducard ? -f.x : f.x) * F, s.gy + 2 * s.u);
  c.scale(ducard ? -F : F, -F * 0.42);
  c.globalAlpha = 0.16;
  fillFighter(c, f.P, ducard, '#24303e', '#24303e', t, s.gust);
  c.globalAlpha = 1;
  c.restore();
}

/** One blade in screen space (hilt end, tip) for a fighter in pose P */
function bladeScreen(s: State, P: readonly number[], fx: number, ducard: boolean, out: number[]) {
  bladeLine(P, out);
  const F = s.F;
  const home = (ducard ? s.dx : s.bx) + (ducard ? -fx : fx) * F;
  const d = ducard ? -1 : 1;
  out[0] = home + d * out[0] * F;
  out[1] = s.gy + out[1] * F;
  out[2] = home + d * out[2] * F;
  out[3] = s.gy + out[3] * F;
}

const BA = [0, 0, 0, 0];
const BB = [0, 0, 0, 0];

/**
 * Where Ducard's descending blade crosses Bruce's block. live uses the poses as they are now;
 * otherwise the two key poses predict it, which is where the timing ring closes.
 */
function clashPoint(s: State, out: number[], live = false) {
  bladeScreen(s, live ? s.bruce.P : PARRY, s.bruce.x, false, BA);
  bladeScreen(s, live ? s.ducard.P : STRIKE, s.ducard.x, true, BB);
  const rx = BA[2] - BA[0];
  const ry = BA[3] - BA[1];
  const sx = BB[2] - BB[0];
  const sy = BB[3] - BB[1];
  const den = rx * sy - ry * sx;
  let k = 0.7;
  if (Math.abs(den) > 1e-6) {
    const a = ((BB[0] - BA[0]) * sy - (BB[1] - BA[1]) * sx) / den;
    k = clamp(a, 0.25, 1);
  }
  out[0] = BA[0] + rx * k;
  out[1] = BA[1] + ry * k;
}

function chestPoint(s: State, out: number[]) {
  const F = s.F;
  const P = s.ducard.P;
  out[0] = s.dx - s.ducard.x * F - lerp(P[0], P[2], 0.55) * F;
  out[1] = s.gy + lerp(P[1], P[3], 0.55) * F;
}

/* ---------- effects ---------- */

function spawnBit(
  s: State,
  kind: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  max: number,
  size: number
) {
  const b = s.bits[s.bitNext];
  s.bitNext = (s.bitNext + 1) % s.bits.length;
  b.kind = kind;
  b.x = x;
  b.y = y;
  b.vx = vx;
  b.vy = vy;
  b.life = 0;
  b.max = max;
  b.size = size;
  b.rot = rand(0, TAU);
}

function sparks(s: State, x: number, y: number, n: number, power: number) {
  const u = s.u;
  for (let i = 0; i < n; i++) {
    // most of them shear off along the blades, up and away from Bruce
    const a = i % 3 === 0 ? rand(0, TAU) : rand(-2.6, -0.5);
    const v = rand(120, 520) * u * power;
    spawnBit(
      s,
      0,
      x,
      y,
      Math.cos(a) * v,
      Math.sin(a) * v - 60 * u,
      rand(0.25, 0.6),
      rand(0.8, 1.6)
    );
  }
}

function spray(s: State, x: number, n: number, dir: number, power: number) {
  const u = s.u;
  for (let i = 0; i < n; i++) {
    spawnBit(
      s,
      1,
      x + rand(-20, 20) * u,
      s.gy - rand(0, 6) * u,
      (dir * rand(40, 260) + rand(-60, 60)) * u * power,
      -rand(40, 220) * u * power,
      rand(0.6, 1.4),
      rand(1.2, 3.2)
    );
  }
}

function breathe(s: State, f: Fighter, ducard: boolean, big: boolean) {
  const F = s.F;
  const P = f.P;
  const dir = ducard ? -1 : 1;
  const homeX = ducard ? s.dx : s.bx;
  const mx = homeX + dir * (f.x + P[4] + 15) * F;
  const my = s.gy + (P[5] + 6) * F;
  const n = big ? 7 : 4;
  for (let i = 0; i < n; i++)
    spawnBit(
      s,
      2,
      mx,
      my,
      (dir * rand(16, 46) + s.gust * 30) * s.u,
      -rand(4, 16) * s.u,
      rand(1.2, 2.2),
      rand(6, 11) * (big ? 1.3 : 1)
    );
}

function makeCrack(s: State, x: number, y: number, reach: number, branches: number, bias: number) {
  const segs: number[] = [];
  const u = s.u;
  const walk = (px: number, py: number, a: number, len: number, d: number, depth: number) => {
    let x0 = px;
    let y0 = py;
    let dist = d;
    let left = len;
    while (left > 0) {
      const step = rand(6, 14) * u;
      a += rand(-0.5, 0.5);
      const x1 = x0 + Math.cos(a) * step;
      // the lake recedes, so cracks are squashed vertically
      const y1 = y0 + Math.sin(a) * step * 0.32;
      segs.push(x0, y0, x1, y1, dist, depth);
      dist += step;
      x0 = x1;
      y0 = y1;
      left -= step;
      if (depth < 2 && Math.random() < 0.16)
        walk(
          x0,
          y0,
          a + rand(0.5, 1.2) * (Math.random() < 0.5 ? -1 : 1),
          left * 0.55,
          dist,
          depth + 1
        );
    }
  };
  for (let i = 0; i < branches; i++) {
    const a = bias + (i / branches) * TAU + rand(-0.3, 0.3);
    walk(x, y, a, reach * rand(0.6, 1.1), 0, 0);
  }
  let max = 0;
  for (let i = 4; i < segs.length; i += 6) max = Math.max(max, segs[i]);
  if (s.cracks.length > 7) s.cracks.shift();
  s.cracks.push({ segs, ox: x, oy: y, grow: 0, speed: reach * 2.2, max, age: 0, life: 9 });
}

/** A thin line of cracks running from one point toward another */
function crackToward(s: State, x0: number, x1: number) {
  const segs: number[] = [];
  const u = s.u;
  let x = x0;
  let y = s.gy + 2 * u;
  let d = 0;
  const dir = Math.sign(x1 - x0) || 1;
  while ((x1 - x) * dir > 0) {
    const step = rand(8, 16) * u;
    const nx = x + dir * step;
    const ny = s.gy + 2 * u + rand(-4, 4) * u;
    segs.push(x, y, nx, ny, d, 0);
    if (Math.random() < 0.3) {
      const a = (dir > 0 ? 0 : Math.PI) + rand(-1.4, 1.4);
      segs.push(nx, ny, nx + Math.cos(a) * step * 0.8, ny + Math.sin(a) * step * 0.3, d + step, 1);
    }
    d += step;
    x = nx;
    y = ny;
  }
  if (s.cracks.length > 7) s.cracks.shift();
  s.cracks.push({
    segs,
    ox: x0,
    oy: s.gy,
    grow: 0,
    speed: 420 * u,
    max: d + 20 * u,
    age: 0,
    life: 8,
  });
}

/* ---------- sound ---------- */

function crackle(bus: AudioBus, dur: number, gain: number) {
  const { ctx, out } = bus;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let pop = 0;
  for (let i = 0; i < len; i++) {
    if (Math.random() < 0.0016 * (1 - i / len)) pop = 1;
    pop *= 0.992;
    d[i] = (Math.random() * 2 - 1) * pop;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(out);
  src.start();
}

function clang(bus: AudioBus, big: boolean) {
  const base = big ? 820 : 1180;
  const parts = [1, 1.58, 2.24, 2.91, 3.7];
  parts.forEach((p, i) =>
    tone(bus, base * p * rand(0.99, 1.01), {
      type: i === 0 ? 'triangle' : 'sine',
      attack: 0.002,
      decay: (big ? 1.3 : 0.8) / (1 + i * 0.4),
      gain: (big ? 0.07 : 0.05) / (1 + i * 0.6),
    })
  );
  noise(bus, { duration: 0.08, gain: big ? 0.2 : 0.12, freq: 5200, q: 0.7, type: 'highpass' });
  if (big) tone(bus, 70, { type: 'sine', attack: 0.004, decay: 0.6, gain: 0.2, glideTo: 40 });
}

function swish(bus: AudioBus) {
  noise(bus, { duration: 0.22, gain: 0.09, freq: 900, q: 1.4, type: 'bandpass' });
}

/* ---------- the duel ---------- */

function setPhase(s: State, p: Phase) {
  s.phase = p;
  s.pt = 0;
}

function startWindup(s: State, env: SceneEnv, quick: boolean) {
  setPhase(s, 'windup');
  const w = quick ? 0.62 : Math.max(0.66, 0.98 - s.combo * 0.1) + rand(-0.04, 0.08);
  s.windT = w;
  s.impact = w + 0.1;
  s.tapAt = -1;
  s.locked = false;
  s.autoMiss = s.rounds++ > 0 && Math.random() < 0.2;
  s.ring = 1;
  s.ducard.T = WINDUP;
  s.ducard.rate = 7;
  breathe(s, s.ducard, true, false);
  void env;
}

function resolveParry(s: State, env: SceneEnv) {
  setPhase(s, 'parried');
  s.combo = Math.min(3, s.combo + 1);
  s.pips[s.combo - 1] = 1;
  s.bruce.T = PARRY;
  s.bruce.rate = 40;
  // snap both into the bind so the blades visibly cross, then Ducard is thrown back off it
  mixPose(s.bruce.P, s.bruce.P, PARRY, 0.85);
  mixPose(s.ducard.P, s.ducard.P, STRIKE, 0.85);
  clashPoint(s, CP, true);
  s.clashX = CP[0];
  s.clashY = CP[1];
  s.clash = 1;
  s.ducard.T = STRIKE;
  s.ducard.rate = 30;
  s.ducard.vx = -90;
  s.bruce.vx = -40;
  sparks(s, CP[0], CP[1], 46, 1.1);
  s.flash = Math.max(s.flash, 0.5);
  s.shake = Math.max(s.shake, 0.3);
  s.slow = 0.16;
  const bus = env.audio();
  if (bus) clang(bus, false);
}

function resolveHit(s: State, env: SceneEnv) {
  setPhase(s, 'hit');
  s.combo = 0;
  s.pips.fill(0);
  s.bruce.T = STAGGER;
  s.bruce.rate = 16;
  s.bruce.vx = -440;
  s.ducard.T = SLASH;
  s.ducard.rate = 24;
  s.shake = Math.max(s.shake, 0.6);
  s.flash = Math.max(s.flash, 0.2);
  const fx = s.bx + s.bruce.x * s.F;
  spray(s, fx, 26, -1, 1);
  breathe(s, s.bruce, false, true);
  const bus = env.audio();
  if (bus) {
    tone(bus, 120, { type: 'sine', attack: 0.004, decay: 0.3, gain: 0.22, glideTo: 50 });
    noise(bus, { duration: 0.5, gain: 0.08, freq: 1400, q: 0.6, type: 'bandpass' });
  }
}

function tryCounter(s: State, env: SceneEnv) {
  setPhase(s, 'counter');
  s.bruce.T = LUNGE;
  s.bruce.rate = 26;
  s.bruce.vx = 340;
  breathe(s, s.bruce, false, true);
  const bus = env.audio();
  if (bus) swish(bus);
}

function bruceAttack(s: State, env: SceneEnv) {
  setPhase(s, 'attack');
  s.bruce.T = LUNGE;
  s.bruce.rate = 20;
  s.bruce.vx = 200;
  const bus = env.audio();
  if (bus) swish(bus);
}

const CP = [0, 0];

/** One tap from the viewer, or the autopilot */
function act(s: State, env: SceneEnv) {
  switch (s.phase) {
    case 'ready':
      if (s.pt > 0.25) bruceAttack(s, env);
      break;
    case 'windup': {
      if (s.locked || s.tapAt >= 0) break;
      const early = s.impact - s.pt;
      if (early > 0.24) {
        // too soon: Bruce commits to the wrong guard and the blow will land
        s.locked = true;
        s.ringMiss = 1;
        s.bruce.T = BLOCK;
        s.bruce.rate = 14;
      } else if (s.pt >= s.impact) resolveParry(s, env);
      else {
        s.tapAt = s.pt;
        s.bruce.T = PARRY;
        s.bruce.rate = 30;
      }
      break;
    }
    case 'open':
      tryCounter(s, env);
      break;
    default:
      break;
  }
}

function startFade(s: State, to: 'lake' | 'docks') {
  if (s.fade > 0 || s.beat === to) return;
  s.fade = 0.0001;
  s.fadeTo = to;
}

function press(s: State, env: SceneEnv) {
  s.touched = true;
  s.idle = 0;
  if (s.beat === 'docks' || s.fade > 0) {
    if (s.beat === 'docks' && s.fade === 0) strikeDocks(s.docks, env);
    env.wake(1800);
    return;
  }
  const bus = env.audio();
  if (bus && !s.wind) s.wind = startHum(bus, { type: 'sine', freq: 46, cutoff: 520, noiseAmt: 1 });
  act(s, env);
  env.wake(1800);
}

function stepDuel(s: State, env: SceneEnv, dt: number, auto: boolean) {
  s.pt += dt;
  const B = s.bruce;
  const D = s.ducard;
  switch (s.phase) {
    case 'ready': {
      B.T = GUARD;
      D.T = GUARD;
      B.rate = 5;
      D.rate = 5;
      if (s.pt > s.wait) startWindup(s, env, false);
      break;
    }
    case 'windup': {
      if (s.pt >= s.windT && D.T !== STRIKE) {
        D.T = STRIKE;
        D.rate = 34;
        const bus = env.audio();
        if (bus) swish(bus);
      }
      // the autopilot is good, not perfect
      if (auto && !s.autoMiss && !s.locked && s.tapAt < 0 && s.pt >= s.impact - 0.08) act(s, env);
      if (s.pt >= s.impact) {
        if (s.tapAt >= 0 && !s.locked) resolveParry(s, env);
        else if (s.pt >= s.impact + 0.09 || s.locked) resolveHit(s, env);
      }
      break;
    }
    case 'parried': {
      // hold the bind through the hit stop, then Ducard is thrown back off it
      if (s.pt > 0.05 && s.pt < 0.22 && D.T === STRIKE) {
        D.T = RECOIL;
        D.rate = 14;
      }
      if (s.pt > 0.24 && D.T === RECOIL) {
        D.T = GUARD;
        D.rate = 7;
      }
      if (s.pt > 0.3 && B.T === PARRY) {
        B.T = GUARD;
        B.rate = 7;
      }
      if (s.pt > 0.55) {
        if (s.combo >= 3) {
          setPhase(s, 'open');
          D.T = OPEN;
          D.rate = 9;
          D.vx = -40;
          s.ring = 1;
        } else {
          setPhase(s, 'ready');
          s.wait = rand(0.35, 0.8);
        }
      }
      break;
    }
    case 'hit': {
      if (s.pt > 0.55 && D.T === SLASH) {
        // Ducard taps the ice, and the cracks run under Bruce's feet
        D.T = TAP;
        D.rate = 10;
      }
      if (s.pt > 0.8 && s.pt - dt <= 0.8) {
        const tipX = s.dx - D.x * s.F - 92 * s.F;
        crackToward(s, tipX, s.bx + B.x * s.F + 20 * s.F);
        const bus = env.audio();
        if (bus) crackle(bus, 0.8, 0.5);
      }
      if (s.pt > 1.3) {
        B.T = GUARD;
        B.rate = 5;
      }
      if (s.pt > 2.1) {
        setPhase(s, 'ready');
        s.wait = rand(0.6, 1.1);
      }
      break;
    }
    case 'open': {
      s.ring = Math.max(0, 1 - s.pt / 0.95);
      if (auto && s.pt > 0.55) act(s, env);
      else if (s.pt > 1.05) {
        s.combo = 0;
        s.pips.fill(0);
        setPhase(s, 'ready');
        s.wait = rand(0.5, 0.9);
      }
      break;
    }
    case 'counter': {
      if (s.pt > 0.13 && s.pt - dt <= 0.13) {
        // Ducard catches the stroke on his vambrace and the lake gives way between them
        D.T = BLOCK;
        D.rate = 40;
        const mx = (s.bx + B.x * s.F + s.dx - D.x * s.F) / 2;
        chestPoint(s, CP);
        sparks(s, CP[0] - 20 * s.u, CP[1] - 10 * s.u, 70, 1.5);
        makeCrack(s, mx, s.gy + 6 * s.u, 230 * s.u, 7, rand(0, TAU));
        spray(s, mx, 70, 1, 1.4);
        spray(s, mx, 40, -1, 1.2);
        s.flash = 1;
        s.shake = 1;
        s.slow = 0.35;
        B.vx = -80;
        D.vx = -140;
        const bus = env.audio();
        if (bus) {
          clang(bus, true);
          crackle(bus, 1.2, 0.8);
        }
      }
      if (s.pt > 1.3) {
        setPhase(s, 'reset');
        s.won = true;
        s.combo = 0;
        s.pips.fill(0);
        B.T = GUARD;
        D.T = GUARD;
        B.rate = 3;
        D.rate = 3;
        D.nod = 1;
      }
      break;
    }
    case 'attack': {
      if (s.pt > 0.16 && s.pt - dt <= 0.16) {
        D.T = PARRY;
        D.rate = 32;
        B.vx = -120;
        clashPoint(s, CP);
        sparks(s, CP[0] + 30 * s.F, CP[1] + 40 * s.F, 18, 0.8);
        s.flash = Math.max(s.flash, 0.3);
        const bus = env.audio();
        if (bus) clang(bus, false);
      }
      if (s.pt > 0.45) {
        B.T = GUARD;
        B.rate = 8;
        startWindup(s, env, true);
      }
      break;
    }
    case 'reset': {
      if (s.pt > 1.6) {
        setPhase(s, 'ready');
        s.wait = rand(0.8, 1.3);
        // the training is won: on to Gotham
        if (s.won) {
          s.won = false;
          startFade(s, 'docks');
        }
      }
      break;
    }
  }
  if (s.phase !== 'windup' && s.phase !== 'open') s.ring = damp(s.ring, 0, 8, dt);
  else if (s.phase === 'windup') s.ring = Math.max(0, 1 - s.pt / s.impact);
}

function stepFighter(f: Fighter, dt: number, t: number, ph: number) {
  dampPose(f.P, f.T, f.rate, dt);
  // breathing and a slow shift of weight
  const br = Math.sin(t * 1.7 + ph) * 1.2;
  f.P[3] += br * dt * 4;
  f.P[5] += br * dt * 4;
  f.x += f.vx * dt;
  f.vx *= Math.exp(-dt * 5);
  f.x = damp(f.x, 0, 0.9, dt);
  f.nod = Math.max(0, f.nod - dt * 0.8);
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 1.95,
    init: () => {
      const mk = (): Fighter => ({
        P: GUARD.slice(),
        T: GUARD,
        rate: 5,
        x: 0,
        vx: 0,
        breath: rand(0, 2),
        nod: 0,
      });
      return {
        bruce: mk(),
        ducard: mk(),
        phase: 'ready',
        pt: 0,
        wait: 0.75,
        windT: 1,
        impact: 1.1,
        tapAt: -1,
        locked: false,
        autoMiss: false,
        rounds: 0,
        combo: 0,
        pips: [0, 0, 0],
        ring: 0,
        ringMiss: 0,
        slow: 0,
        clash: 0,
        clashX: 0,
        clashY: 0,
        flash: 0,
        shake: 0,
        cracks: [],
        bits: Array.from({ length: BITS }, () => ({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          life: 1,
          max: 0,
          size: 1,
          kind: 0,
          rot: 0,
        })),
        bitNext: 0,
        flakes: Array.from({ length: FLAKES }, () => ({
          x: Math.random(),
          y: Math.random(),
          z: Math.pow(Math.random(), 1.6) * 1.6 + 0.3,
          ph: rand(0, TAU),
        })),
        flowers: [],
        gust: 0,
        gustT: 0,
        drift: 0,
        touched: false,
        idle: 0,
        wind: null,
        beat: 'lake',
        fade: 0,
        fadeTo: 'docks',
        won: false,
        docks: makeDocks(),
        u: 1,
        F: 1,
        gy: 0,
        bx: 0,
        dx: 0,
        sky: null,
        fore: null,
        white: glowSprite(64, [
          [0, 'rgba(255,255,255,1)'],
          [0.3, 'rgba(230,242,255,0.55)'],
          [1, 'rgba(200,220,255,0)'],
        ]),
        amber: glowSprite(64, [
          [0, 'rgba(255,236,200,1)'],
          [0.3, 'rgba(255,190,120,0.5)'],
          [1, 'rgba(255,150,80,0)'],
        ]),
        mist: glowSprite(64, [
          [0, 'rgba(248,251,255,0.95)'],
          [0.55, 'rgba(236,244,252,0.4)'],
          [1, 'rgba(230,240,250,0)'],
        ]),
        grain: grainTile(128, 41),
        vignette: null,
      };
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.u = Math.min(w / W0, h / H0);
      s.F = Math.min(w / 560, h / 470);
      s.gy = h * 0.82;
      s.bx = w / 2 - FIGHT_GAP * s.F;
      s.dx = w / 2 + FIGHT_GAP * s.F;
      paintSky(s, env);
      paintFore(s, env);
      resizeDocks(s.docks, env);
      // blue poppies pushing through the snow banks
      const rnd = mulberry(77);
      s.flowers = [];
      const clumps: [number, number, number][] = [
        [0.05, 0.95, 7],
        [0.17, 0.985, 4],
        [0.95, 0.96, 6],
      ];
      for (const [cx, cy, n] of clumps)
        for (let i = 0; i < n; i++)
          s.flowers.push({
            x: (cx + (rnd() - 0.5) * 0.08) * w,
            y: (cy + rnd() * 0.04) * h,
            h: (34 + rnd() * 44) * s.u,
            s: (8 + rnd() * 5) * s.u,
            ph: rnd() * TAU,
            lean: (rnd() - 0.5) * 0.3,
          });
      const v = ctx.createRadialGradient(
        w / 2,
        h * 0.5,
        Math.min(w, h) * 0.35,
        w / 2,
        h * 0.5,
        Math.max(w, h) * 0.78
      );
      v.addColorStop(0, 'rgba(20,30,44,0)');
      v.addColorStop(1, 'rgba(20,30,44,0.5)');
      s.vignette = v;
    },
    update: (s, env, rdt, t) => {
      const u = s.u;
      const { w, h } = env;
      s.idle += rdt;
      const auto = !env.interactive || !s.touched || s.idle > 8;
      // the cut between the lake and the docks: to black and back
      if (s.fade > 0) {
        const before = s.fade;
        s.fade += rdt / 1.1;
        if (before < 0.5 && s.fade >= 0.5) {
          s.beat = s.fadeTo;
          if (s.beat === 'docks') enterDocks(s.docks, env);
          else {
            setPhase(s, 'ready');
            s.wait = 0.9;
            s.combo = 0;
            s.pips.fill(0);
          }
          const bus = env.audio();
          if (bus) noise(bus, { duration: 0.7, gain: 0.1, freq: 600, q: 0.7, type: 'bandpass' });
        }
        if (s.fade >= 1) s.fade = 0;
        keepAwake(env);
      }
      if (s.beat === 'docks') {
        const busy = stepDocks(s.docks, env, rdt, t, auto);
        if (busy || !auto) keepAwake(env);
        // left alone, the yard clears and the night goes back to the training
        if (auto && s.docks.phase === 'clear' && s.docks.pt > 2.6) startFade(s, 'lake');
        return;
      }
      // hit stop on the big moments
      s.slow = Math.max(0, s.slow - rdt);
      const dt = s.slow > 0 ? rdt * 0.18 : rdt;
      stepDuel(s, env, dt, auto);
      stepFighter(s.bruce, dt, t, 0);
      stepFighter(s.ducard, dt, t, 1.3);
      for (const [f, d] of [
        [s.bruce, false],
        [s.ducard, true],
      ] as const) {
        f.breath -= dt;
        if (f.breath <= 0) {
          f.breath = rand(1.8, 2.6);
          breathe(s, f, d, false);
        }
      }
      if (s.phase !== 'ready' && !auto) keepAwake(env);
      s.flash = Math.max(0, s.flash - rdt * 2.4);
      s.clash = Math.max(0, s.clash - rdt * 3.2);
      s.shake = Math.max(0, s.shake - rdt * 2.2);
      s.ringMiss = Math.max(0, s.ringMiss - rdt * 1.5);
      // wind comes in gusts off the peaks
      s.gustT -= rdt;
      if (s.gustT <= 0) s.gustT = rand(2, 5);
      const target = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.45) * Math.sin(t * 0.17 + 1));
      s.gust = damp(s.gust, target, 1.5, rdt);
      s.drift = (s.drift + rdt * (40 + s.gust * 160) * u) % (w + 400 * u);
      if (s.wind) setHum(s.wind, 40 + s.gust * 20, 0.02 + s.gust * 0.05, 300 + s.gust * 700);
      // snow
      for (const f of s.flakes) {
        f.x += (rdt * (0.02 + s.gust * 0.12) * f.z * h) / w;
        f.y += rdt * (0.03 + 0.02 * f.z) + Math.sin(t * 1.3 + f.ph) * 0.0006;
        if (f.x > 1.05) f.x -= 1.1;
        if (f.y > 1.02) {
          f.y -= 1.04;
          f.x = Math.random() * 1.1 - 0.05;
        }
      }
      // petals torn off the poppies by the gusts
      if (s.flowers.length && Math.random() < rdt * s.gust * 1.6) {
        const fl = s.flowers[Math.floor(Math.random() * s.flowers.length)];
        spawnBit(
          s,
          3,
          fl.x,
          fl.y - fl.h,
          rand(60, 160) * u,
          -rand(10, 50) * u,
          rand(3, 5),
          rand(2.5, 4) * u
        );
      }
      for (const b of s.bits) {
        if (b.life >= b.max) continue;
        b.life += dt;
        if (b.kind === 0) {
          b.vy += 900 * u * dt;
          b.vx *= Math.exp(-dt * 2);
        } else if (b.kind === 1) {
          b.vy += 520 * u * dt;
          b.vx *= Math.exp(-dt * 1.5);
          if (b.y > s.gy + 10 * u && b.vy > 0) b.vy *= -0.15;
        } else if (b.kind === 2) {
          b.vx *= Math.exp(-dt * 1.2);
          b.vy -= 4 * u * dt;
        } else {
          b.vx = damp(b.vx, (60 + s.gust * 160) * u, 1, dt);
          b.vy = damp(b.vy, 26 * u, 1, dt) + Math.sin(b.life * 5 + b.rot) * 30 * u * dt;
          b.rot += dt * 4;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      for (const c of s.cracks) {
        c.grow = Math.min(c.max, c.grow + c.speed * dt);
        c.age += rdt;
      }
      s.cracks = s.cracks.filter((c) => c.age < c.life);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.u;
      const F = s.F;
      const fadeOver = () => {
        if (s.fade <= 0) return;
        const a = 1 - Math.abs(s.fade - 0.5) * 2;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(3,2,2,${Math.min(1, a * 1.3).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      };
      if (s.beat === 'docks') {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        drawDocks(s.docks, env, t);
        fadeOver();
        drawGrain(ctx, s.grain, w, h, 0.06);
        return;
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      if (s.shake > 0.01) {
        const a = s.shake * s.shake * 7 * u;
        ctx.translate(Math.sin(t * 71) * a, Math.cos(t * 53) * a * 0.6);
      }
      if (s.sky) ctx.drawImage(s.sky, -8 * u, -8 * u, w + 16 * u, h + 16 * u);

      // snow snaking across the ice in the wind
      ctx.globalAlpha = 0.35 + s.gust * 0.3;
      for (let i = 0; i < 7; i++) {
        const y = lerp(s.gy - 80 * F, h, (i + 0.5) / 7);
        const depth = (y - (s.gy - 120 * F)) / (h - s.gy + 120 * F);
        const len = (160 + i * 37) * u * (0.5 + depth);
        const x = ((s.drift * (0.6 + depth) + i * 211 * u) % (w + len * 2)) - len;
        ctx.drawImage(s.mist, x, y - 3 * u * depth, len, (4 + 6 * depth) * u);
      }
      ctx.globalAlpha = 1;

      // cracks under everything standing on the ice
      ctx.lineCap = 'round';
      for (const c of s.cracks) {
        const fade = Math.min(1, (c.life - c.age) / 2.5);
        const sg = c.segs;
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle =
            pass === 0
              ? `rgba(26,48,70,${(0.75 * fade).toFixed(3)})`
              : `rgba(238,250,255,${(0.85 * fade).toFixed(3)})`;
          for (let depth = 0; depth < 3; depth++) {
            ctx.lineWidth = (pass === 0 ? 2.4 - depth * 0.7 : 0.9 - depth * 0.2) * u;
            ctx.beginPath();
            for (let i = 0; i < sg.length; i += 6) {
              if (sg[i + 5] !== depth || sg[i + 4] > c.grow) continue;
              const oy = pass === 0 ? 0 : 1.2 * u;
              ctx.moveTo(sg[i], sg[i + 1] + oy);
              ctx.lineTo(sg[i + 2], sg[i + 3] + oy);
            }
            ctx.stroke();
          }
        }
        // a pale bloom where the ice gave way
        if (c.age < 1.5) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.save();
          ctx.translate(c.ox, c.oy);
          ctx.scale(1, 0.3);
          glow(ctx, s.white, 0, 0, c.grow * 0.6, (1.5 - c.age) * 0.25);
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      }

      // reflections, shadows, fighters
      drawReflection(ctx, s, s.bruce, false, t);
      drawReflection(ctx, s, s.ducard, true, t);
      ctx.fillStyle = 'rgba(40,58,78,0.25)';
      for (const [f, d] of [
        [s.bruce, false],
        [s.ducard, true],
      ] as const) {
        const x = (d ? s.dx - f.x * F : s.bx + f.x * F) + (d ? -1 : 1) * f.P[0] * F;
        ctx.beginPath();
        ctx.ellipse(x - 20 * F, s.gy + 2 * u, 60 * F, 6 * F, 0, 0, TAU);
        ctx.fill();
      }
      const glintD = s.phase === 'windup' ? 0.5 + s.pt : 0;
      drawFighter(ctx, s, s.ducard, true, t, glintD);
      drawFighter(ctx, s, s.bruce, false, t, s.phase === 'counter' ? s.pt * 2 : 0);

      // the timing ring closing on the clash point
      ctx.globalCompositeOperation = 'lighter';
      if (s.ring > 0.01 && s.phase === 'windup') {
        clashPoint(s, CP);
        const k = s.ring;
        const inWin = s.impact - s.pt <= 0.24 && !s.locked;
        const col = s.locked ? '255,120,100' : inWin ? '255,255,255' : '200,226,255';
        const a = (1 - k) * 0.9 + 0.1;
        ctx.strokeStyle = `rgba(${col},${a.toFixed(3)})`;
        ctx.lineWidth = (inWin ? 3 : 2) * u;
        ctx.beginPath();
        ctx.arc(CP[0], CP[1], (12 + k * 90) * u, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${col},0.5)`;
        ctx.lineWidth = 1.2 * u;
        ctx.beginPath();
        ctx.arc(CP[0], CP[1], 12 * u, 0, TAU);
        ctx.stroke();
        glow(ctx, s.white, CP[0], CP[1], (16 + (1 - k) * 18) * u, inWin ? 0.7 : 0.25);
      }
      if (s.phase === 'open' && s.ring > 0.01) {
        chestPoint(s, CP);
        const k = s.ring;
        ctx.strokeStyle = `rgba(255,196,120,${(0.3 + (1 - k) * 0.6).toFixed(3)})`;
        ctx.lineWidth = 2.4 * u;
        ctx.beginPath();
        ctx.arc(CP[0], CP[1], (14 + k * 80) * u, 0, TAU);
        ctx.stroke();
        glow(ctx, s.amber, CP[0], CP[1], 30 * u, 0.4 + (1 - k) * 0.4);
      }
      ctx.globalAlpha = 1;

      // the bind: a hard white star where the edges met
      if (s.clash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        const k = s.clash;
        glow(ctx, s.white, s.clashX, s.clashY, (14 + (1 - k) * 40) * u, k);
        ctx.fillStyle = `rgba(255,255,255,${k.toFixed(3)})`;
        const r = (10 + (1 - k) * 34) * u;
        ctx.beginPath();
        ctx.moveTo(s.clashX - r, s.clashY);
        ctx.lineTo(s.clashX, s.clashY - 1.6 * u);
        ctx.lineTo(s.clashX + r, s.clashY);
        ctx.lineTo(s.clashX, s.clashY + 1.6 * u);
        ctx.moveTo(s.clashX, s.clashY - r * 0.7);
        ctx.lineTo(s.clashX + 1.6 * u, s.clashY);
        ctx.lineTo(s.clashX, s.clashY + r * 0.7);
        ctx.lineTo(s.clashX - 1.6 * u, s.clashY);
        ctx.fill();
        ctx.strokeStyle = `rgba(230,244,255,${(0.6 * k).toFixed(3)})`;
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        ctx.arc(s.clashX, s.clashY, (8 + (1 - k) * 60) * u, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // sparks, spray, breath and petals
      ctx.lineCap = 'round';
      for (const b of s.bits) {
        if (b.life >= b.max) continue;
        const q = b.life / b.max;
        if (b.kind === 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(255,${Math.round(240 - q * 90)},${Math.round(200 - q * 140)},${(1 - q).toFixed(3)})`;
          ctx.lineWidth = b.size * u;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
          ctx.stroke();
        } else if (b.kind === 2) {
          ctx.globalCompositeOperation = 'source-over';
          const r = b.size * u * (1 + q * 2.2);
          ctx.globalAlpha = 0.5 * (1 - q) * Math.min(1, q * 6);
          ctx.drawImage(s.mist, b.x - r, b.y - r, r * 2, r * 2);
          ctx.globalAlpha = 1;
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(246,250,255,0.9)';
      ctx.beginPath();
      for (const b of s.bits) {
        if (b.kind !== 1 || b.life >= b.max) continue;
        const r = b.size * u * (1 - (b.life / b.max) * 0.6);
        ctx.moveTo(b.x + r, b.y);
        ctx.arc(b.x, b.y, r, 0, TAU);
      }
      ctx.fill();

      // pips for the parry streak, etched on the ice between them
      for (let i = 0; i < 3; i++) {
        s.pips[i] = s.pips[i] > 0 ? Math.min(1, s.pips[i] + 0.1) : 0;
        const x = w / 2 + (i - 1) * 16 * u;
        const y = s.gy + 34 * u;
        const on = s.combo > i;
        ctx.fillStyle = on ? 'rgba(255,255,255,0.95)' : 'rgba(30,50,70,0.35)';
        ctx.strokeStyle = 'rgba(240,248,255,0.6)';
        ctx.lineWidth = 1 * u;
        poly(ctx, [x, y - 5 * u, x + 5 * u, y, x, y + 5 * u, x - 5 * u, y]);
        ctx.fill();
        ctx.stroke();
        if (on) {
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, s.white, x, y, 12 * u, 0.5);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      }

      if (s.fore) ctx.drawImage(s.fore, 0, 0, w, h);
      // blue poppies
      for (const fl of s.flowers) {
        const sway = Math.sin(t * 2.2 + fl.ph) * 0.06 + s.gust * 0.22 + fl.lean;
        const tx = fl.x + Math.sin(sway) * fl.h;
        const ty = fl.y - Math.cos(sway) * fl.h;
        ctx.strokeStyle = '#3d4c48';
        ctx.lineWidth = 1.4 * u;
        ctx.beginPath();
        ctx.moveTo(fl.x, fl.y);
        ctx.quadraticCurveTo(fl.x + Math.sin(sway) * fl.h * 0.2, fl.y - fl.h * 0.6, tx, ty);
        ctx.stroke();
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(sway * 1.4);
        for (let i = 0; i < 4; i++) {
          ctx.rotate(TAU / 4);
          ctx.fillStyle = i % 2 ? '#5f97dc' : '#7eb2ec';
          ctx.beginPath();
          ctx.ellipse(fl.s * 0.55, 0, fl.s * 0.7, fl.s * 0.5, 0, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#e8c45a';
        ctx.beginPath();
        ctx.arc(0, 0, fl.s * 0.28, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#6fa6e6';
      for (const b of s.bits) {
        if (b.kind !== 3 || b.life >= b.max) continue;
        ctx.globalAlpha = Math.min(1, (b.max - b.life) * 2);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.scale(1, Math.abs(Math.sin(b.rot)) * 0.8 + 0.2);
        ctx.beginPath();
        ctx.ellipse(0, 0, b.size, b.size * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // falling snow, nearest flakes biggest and softest
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      for (const f of s.flakes) {
        if (f.z > 1.2) continue;
        const r = 0.9 * u * f.z;
        const x = f.x * w;
        const y = f.y * h;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.fill();
      ctx.globalAlpha = 0.6;
      for (const f of s.flakes) {
        if (f.z <= 1.2) continue;
        const r = 2.4 * u * f.z;
        ctx.drawImage(s.mist, f.x * w - r, f.y * h - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (s.flash > 0.01) {
        ctx.fillStyle = `rgba(240,248,255,${(s.flash * 0.45).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
      fadeOver();
      drawGrain(ctx, s.grain, w, h, 0.05);
    },
    onPointerDown: (s, env) => press(s, env),
    onKey: (s, env, e, down) => {
      if (e.key === 'n' || e.key === 'N') {
        if (down && !e.repeat) {
          s.touched = true;
          s.idle = 0;
          startFade(s, s.beat === 'lake' ? 'docks' : 'lake');
        }
        return true;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) press(s, env);
      return true;
    },
    dispose: (s) => {
      freeDocks(s.docks);
      stopHum(s.wind);
      s.wind = null;
      freeCanvas(s.sky, s.fore, s.white, s.amber, s.mist, s.grain);
      s.sky = s.fore = null;
    },
  });
