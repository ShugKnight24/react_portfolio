import { createCanvasScene, clamp, damp, easeOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  J,
  burst,
  drawFigure,
  emit,
  freeCanvas,
  glow,
  glowSprite,
  ik,
  layer,
  makePool,
  mulberry,
  newPose,
  setJ,
  shakeX,
  shakeY,
  stepPool,
} from './theater-kit';
import type { FigureStyle, Pool, Pose } from './theater-kit';

/**
 * Jack Reacher, in three short chapters the viewer can cut between (number keys, the chapter
 * strip in the corner, or automatically once a chapter lands its last beat). A fan tribute in
 * spirit: original characters, original lines, no likenesses or title art.
 *
 * I. The Diner: a slow Georgia morning. A very large drifter eats pie at the counter while
 *    patrol cars slide up outside and deputies come through the door with pistols raised.
 *    Holding the pointer or Space makes him take one more unhurried sip while the guns edge
 *    closer and a heartbeat quickens; letting go sets the cup down and raises his hands.
 * II. County Lockup: a tiled washroom under a buzzing tube. Four inmates close from both doors
 *    and he takes them apart: hit stop, shake, slow motion on the finisher, and men thrown
 *    into the side walls hard enough to crack the tile before sliding down them.
 * III. The Lot: night rain outside a roadside diner under a red DINER sign; endless waves,
 *    lightning on finishers, red and blue lights when the lot is clear.
 *
 * Every fighter is one jointed rig solved with two bone IK from a handful of numbers, drawn
 * into one offscreen layer that each chapter lights as a group. Letterbox bars close in for
 * the cut ins, title cards and slow motion, and sparse subtitles carry the dry lines.
 */

/* ---------- rig ---------- */

// pose parameters: hip x, hip y, lean, near hand x, y, far hand x, y, near foot x, y, far foot x, y, head forward
const HX = 0;
const HY = 1;
const LEAN = 2;
const NX = 3;
const NY = 4;
const FX = 5;
const FY = 6;
const LX = 7;
const LY = 8;
const RX = 9;
const RY = 10;
const HEADF = 11;
const NP = 12;

const TORSO = 56;
const UPPER = 32;
const FORE = 30;
const THIGH = 47;
const SHIN = 48;

const GUARD = [-2, -90, 0.1, 15, -148, 27, -140, 14, 0, -18, 0, 0];
const RELAX = [-2, -94, 0.02, -4, -96, 8, -94, 8, 0, -12, 0, 0];

type Move = 'jab' | 'cross' | 'elbow' | 'upper' | 'headbutt' | 'kick';

interface MoveDef {
  /** absolute targets at full extension; NaN keeps the guard value */
  peak: number[];
  dur: number;
  reach: number;
  power: number;
  /** elbow fold for the near and far arms (+1 down, -1 up) */
  bendN: number;
  bendF: number;
  lunge: number;
}

// Reacher is drawn larger than everyone else, so his strikes aim low in his own units to
// land on the head and ribs of a shorter man
const N = NaN;
const MOVES: Record<Move, MoveDef> = {
  jab: { peak: [6, -91, 0.2, 18, -146, 72, -128, N, N, N, N, 3], dur: 0.3, reach: 126, power: 1, bendN: 1, bendF: 1, lunge: 6 },
  cross: { peak: [10, -88, 0.28, 76, -124, 22, -146, N, N, -13, 0, 6], dur: 0.36, reach: 130, power: 1.3, bendN: 1, bendF: 1, lunge: 10 },
  elbow: { peak: [14, -88, 0.3, 22, -134, 16, -146, N, N, N, N, 6], dur: 0.36, reach: 122, power: 1.4, bendN: -1, bendF: 1, lunge: 26 },
  upper: { peak: [8, -84, 0.08, 50, -150, 20, -146, N, N, N, N, 2], dur: 0.38, reach: 124, power: 1.6, bendN: 1, bendF: 1, lunge: 16 },
  headbutt: { peak: [16, -86, 0.72, 40, -128, 44, -132, N, N, N, N, 8], dur: 0.46, reach: 126, power: 3, bendN: 1, bendF: 1, lunge: 30 },
  kick: { peak: [-8, -93, -0.2, 6, -146, 18, -140, 84, -80, -20, 0, -2], dur: 0.5, reach: 142, power: 3, bendN: 1, bendF: 1, lunge: 4 },
};

/** Strike curve: a small wind up, a fast snap out, a short hold and a slower return */
function strikeCurve(k: number) {
  if (k < 0.18) return -0.12 * Math.sin((k / 0.18) * Math.PI);
  if (k < 0.36) return easeOutCubic((k - 0.18) / 0.18);
  if (k < 0.5) return 1;
  return 1 - easeOutCubic((k - 0.5) / 0.5);
}

function solve(out: Pose, P: number[], bendN: number, bendF: number) {
  const hx = P[HX];
  const hy = P[HY];
  const a = P[LEAN];
  setJ(out, J.HIP, hx, hy);
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const sx = hx + ux * TORSO;
  const sy = hy + uy * TORSO;
  setJ(out, J.SHO, sx, sy);
  setJ(out, J.NECK, sx + ux * 7 + 2, sy + uy * 7);
  setJ(out, J.HEAD, sx + ux * 7 + 4 + Math.sin(a * 0.5) * 13 + P[HEADF], sy + uy * 7 - Math.cos(a * 0.5) * 14);
  ik(out, J.HIP, J.KNEE_N, J.FOOT_N, P[LX], P[LY], THIGH, SHIN, -1);
  setJ(out, J.HIP, hx, hy);
  ik(out, J.HIP, J.KNEE_F, J.FOOT_F, P[RX], P[RY], THIGH, SHIN, -1);
  setJ(out, J.HIP, hx, hy);
  ik(out, J.SHO, J.ELB_N, J.HAND_N, P[NX], P[NY], UPPER, FORE, bendN);
  setJ(out, J.SHO, sx, sy);
  ik(out, J.SHO, J.ELB_F, J.HAND_F, P[FX], P[FY], UPPER, FORE, bendF);
  setJ(out, J.SHO, sx, sy);
}


// seated at the counter: hips on the stool, knees under the counter, forearms on the top
const SEAT = [0, -100, 0.08, 50, -127, 44, -123, 44, -56, 40, -54, 0];
// a deputy with his pistol up in both hands
const AIM = [-2, -92, 0.05, 60, -158, 56, -156, 16, 0, -16, 0, 1];
// an inmate slumped against the tiles, legs out in front of him
const SLUMP = [-6, -34, -0.28, 22, -30, 30, -24, 66, 0, 58, 0, -5];

/* ---------- characters ---------- */

const REACHER: FigureStyle = {
  skin: '#d09c78',
  skinDark: '#87573b',
  hair: '#5e4930',
  shirt: '#6e6142',
  shirtDark: '#3b3322',
  pants: '#33405a',
  pantsDark: '#1c2334',
  shoes: '#33220f',
  rim: 'rgba(255,190,120,0.75)',
  bulk: 1.24,
  sleeve: 'long',
  hairCut: 'short',
  under: '#8c8f93',
};

const REACHER_JAIL: FigureStyle = {
  ...REACHER,
  shirt: '#d8d4ca',
  shirtDark: '#8d8a82',
  pants: '#b45f2c',
  pantsDark: '#6a3214',
  shoes: '#d8d4ca',
  rim: 'rgba(220,255,235,0.6)',
  under: undefined,
  sleeve: 'tee',
};

const THUG_STYLES: FigureStyle[] = [
  {
    skin: '#c48d6a',
    skinDark: '#7d523a',
    hair: '#1c140e',
    shirt: '#7c2620',
    shirtDark: '#3f1310',
    pants: '#2e3b52',
    pantsDark: '#1a2232',
    shoes: '#1a1410',
    rim: 'rgba(255,120,130,0.5)',
    bulk: 1.04,
    sleeve: 'long',
    hairCut: 'short',
  },
  {
    skin: '#b97a55',
    skinDark: '#6e4229',
    hair: '#120c08',
    shirt: '#bdb6a6',
    shirtDark: '#68645c',
    pants: '#3b3530',
    pantsDark: '#221e1a',
    shoes: '#141210',
    rim: 'rgba(255,120,130,0.5)',
    bulk: 1.1,
    sleeve: 'none',
    hairCut: 'bald',
  },
  {
    skin: '#d6a585',
    skinDark: '#8a6047',
    hair: '#3a2a1c',
    shirt: '#3d5577',
    shirtDark: '#1f2c40',
    pants: '#25262a',
    pantsDark: '#141518',
    shoes: '#191512',
    rim: 'rgba(255,120,130,0.5)',
    bulk: 1.0,
    sleeve: 'long',
    hairCut: 'buzz',
  },
];

const jumpsuit = (skin: string, skinDark: string, hair: string, hairCut: FigureStyle['hairCut'], bulk: number, sleeve: FigureStyle['sleeve']): FigureStyle => ({
  skin,
  skinDark,
  hair,
  shirt: '#e0742f',
  shirtDark: '#8a3f16',
  pants: '#d66c2b',
  pantsDark: '#7c3812',
  shoes: '#e6e2d8',
  rim: 'rgba(220,255,235,0.45)',
  bulk,
  sleeve,
  hairCut,
});

const INMATE_STYLES: FigureStyle[] = [
  jumpsuit('#8f5a3c', '#55321f', '#120c08', 'bald', 1.12, 'none'),
  jumpsuit('#d6a585', '#8a6047', '#3a2a1c', 'buzz', 1.0, 'tee'),
  jumpsuit('#b97a55', '#6e4229', '#1c140e', 'short', 1.06, 'tee'),
  jumpsuit('#c9987a', '#7d523a', '#5a4026', 'buzz', 1.16, 'none'),
];

const DEPUTY: FigureStyle = {
  skin: '#d2a07e',
  skinDark: '#8a5c40',
  hair: '#3a2a1c',
  shirt: '#b49a68',
  shirtDark: '#6c5a38',
  pants: '#3e3b2c',
  pantsDark: '#24221a',
  shoes: '#141210',
  rim: 'rgba(255,236,200,0.6)',
  bulk: 1.02,
  sleeve: 'tee',
  hairCut: 'short',
  belt: '#1a1612',
};

type ThugState = 'off' | 'walk' | 'ready' | 'windup' | 'punch' | 'stagger' | 'fly' | 'down' | 'slump';

interface Thug {
  st: ThugState;
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  side: number;
  hp: number;
  style: number;
  phase: number;
  wait: number;
  fade: number;
  P: number[];
  pose: Pose;
  slot: number;
}

interface Drop {
  x: number;
  y: number;
  v: number;
  l: number;
}

interface Splash {
  x: number;
  y: number;
  age: number;
  size: number;
}

/** Screen layout of the rain lot shared by the baked backdrop and the live layers */
interface Layout {
  hor: number;
  db: number;
  dx: number;
  dw: number;
  dh: number;
  sx: number;
  sTop: number;
  sW: number;
  sH: number;
  ax: number;
  ay: number;
  aw: number;
  ah: number;
  lx: number;
  ly: number;
}

interface Deputy {
  x0: number;
  tx: number;
  sc: number;
  yo: number;
  delay: number;
  x: number;
  y: number;
  cs: number;
  P: number[];
  pose: Pose;
  phase: number;
  racked: boolean;
}

interface Car {
  x0: number;
  tx: number;
  delay: number;
  x: number;
  tilt: number;
}

/** Morning diner: everything the arrest needs, in screen pixels */
interface Diner {
  beat: number;
  bt: number;
  bites: number;
  biteK: number;
  hold: boolean;
  held: number;
  tension: number;
  lines: number;
  sip: number;
  hands: number;
  door: number;
  step: number;
  beatT: number;
  heart: number;
  autoHold: boolean;
  deps: Deputy[];
  cars: Car[];
  motes: { x: number; y: number; v: number; p: number }[];
  // layout
  kd: number;
  rxS: number;
  ctop: number;
  cx0: number;
  wx0: number;
  wx1: number;
  wy0: number;
  wy1: number;
  road: number;
  dx0: number;
  dx1: number;
  dy0: number;
}

interface Crack {
  x: number;
  y: number;
  side: number;
  seed: number;
}

interface Sub {
  text: string;
  who: number;
  age: number;
  dur: number;
}

interface State {
  ch: number;
  cht: number;
  go: number;
  goT: number;
  card: number;
  script: number;
  endT: number;
  sub: Sub | null;
  bars: number;
  camX: number;
  camY: number;
  camZ: number;
  // reacher
  rx: number;
  face: number;
  move: Move | null;
  mt: number;
  mside: number;
  landed: boolean;
  combo: number;
  comboT: number;
  block: number;
  P: number[];
  pose: Pose;
  breathe: number;
  // fight world
  thugs: Thug[];
  wave: number;
  clear: number;
  spawnT: number;
  queued: number;
  touched: boolean;
  idle: number;
  autoT: number;
  wallX: number;
  cracks: Crack[];
  tube: number;
  // feel
  stop: number;
  freeze: boolean;
  slow: number;
  shake: number;
  kick: number;
  zoom: number;
  zx: number;
  zy: number;
  flash: number;
  fx: number;
  fy: number;
  fdir: number;
  ring: number;
  cops: number;
  bus: number;
  // weather and neon
  flick: number[];
  neonHit: number;
  light: number;
  bolt: number[];
  thunder: number;
  thunderBig: boolean;
  storm: number;
  rain: Drop[];
  near: Drop[];
  splashes: Splash[];
  parts: Pool;
  D: Diner;
  // layout
  k: number;
  ground: number;
  L: Layout;
  bg: HTMLCanvasElement | null;
  bg2: HTMLCanvasElement | null;
  bg3: HTMLCanvasElement | null;
  fig: HTMLCanvasElement | null;
  cone: HTMLCanvasElement | null;
  hot: HTMLCanvasElement;
  amber: HTMLCanvasElement;
  red: HTMLCanvasElement;
  blue: HTMLCanvasElement;
  drop: HTMLCanvasElement;
  dust: HTMLCanvasElement;
  mist: HTMLCanvasElement;
  cold: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const ENGAGE = 114;
const SCALE_R = 1.3;
const MAX_THUGS = 4;
const FADE = 0.45;
const CARD_HOLD = 0.8;
const CARD_END = 1.8;

/* ---------- chapters and lines (original, dry, sparse) ---------- */

const CHAPTERS = [
  { n: 'I', title: 'The Diner', sub: 'A small Georgia town, a slow morning' },
  { n: 'II', title: 'County Lockup', sub: 'Booked, processed, and not alone' },
  { n: 'III', title: 'The Lot', sub: 'Night, rain, one lamp' },
];

/** who: 0 someone else, 1 Reacher */
const SCRIPTS: { at: number; text: string; who: number }[][] = [
  [],
  [
    { at: 0.6, text: 'New guy is a big one.', who: 0 },
    { at: 2.0, text: 'Only four of you?', who: 1 },
  ],
  [
    { at: 1.2, text: "You don't belong here.", who: 0 },
    { at: 2.6, text: "I don't belong anywhere.", who: 1 },
  ],
];

const LOT_CLEAR = ['Anyone else?', 'I was just leaving.', 'Should have stayed in the truck.', 'Somebody call it in.'];

function say(s: State, text: string, who: number, dur = 2.4) {
  s.sub = { text, who, age: 0, dur };
}

/* ---------- sound (runtime voices only, and only once the viewer unmutes) ---------- */

function sfxSwing(bus: AudioBus, heavy: boolean) {
  noise(bus, { duration: heavy ? 0.2 : 0.12, gain: heavy ? 0.12 : 0.08, freq: heavy ? 900 : 1500, q: 0.7, type: 'bandpass' });
}

function sfxHit(bus: AudioBus, finisher: boolean) {
  tone(bus, finisher ? 96 : 150, { type: 'sine', attack: 0.002, decay: finisher ? 0.42 : 0.16, gain: finisher ? 0.7 : 0.5, glideTo: finisher ? 34 : 60 });
  noise(bus, { duration: finisher ? 0.22 : 0.1, gain: finisher ? 0.55 : 0.4, freq: finisher ? 420 : 700, q: 0.9, type: 'lowpass' });
  noise(bus, { duration: 0.05, gain: 0.16, freq: 3200, q: 0.6, type: 'highpass' });
  if (finisher) tone(bus, 52, { type: 'triangle', attack: 0.004, decay: 0.6, gain: 0.35, glideTo: 30 });
}

function sfxBlock(bus: AudioBus) {
  tone(bus, 210, { type: 'triangle', attack: 0.002, decay: 0.09, gain: 0.22, glideTo: 120 });
  noise(bus, { duration: 0.07, gain: 0.22, freq: 900, q: 0.8, type: 'lowpass' });
}

function sfxBodyFall(bus: AudioBus, wet: boolean) {
  tone(bus, 70, { type: 'sine', attack: 0.004, decay: 0.3, gain: 0.45, glideTo: 38 });
  noise(bus, { duration: 0.32, gain: 0.3, freq: 260, q: 0.7, type: 'lowpass' });
  if (wet) noise(bus, { duration: 0.4, gain: 0.14, freq: 2600, q: 0.5, type: 'highpass' });
}

function sfxSlam(bus: AudioBus) {
  tone(bus, 58, { type: 'sine', attack: 0.002, decay: 0.38, gain: 0.65, glideTo: 34 });
  noise(bus, { duration: 0.3, gain: 0.5, freq: 340, q: 0.7, type: 'lowpass' });
  noise(bus, { duration: 0.16, gain: 0.14, freq: 3600, q: 0.5, type: 'highpass' });
}

function sfxThunder(bus: AudioBus, big: boolean) {
  noise(bus, { duration: big ? 2.2 : 1.6, gain: big ? 0.6 : 0.32, freq: 160, q: 0.5, type: 'lowpass' });
  noise(bus, { duration: big ? 0.6 : 0.4, gain: big ? 0.3 : 0.14, freq: 520, q: 0.5, type: 'lowpass' });
}

function sfxSiren(bus: AudioBus, delay = 0, n = 3) {
  for (let i = 0; i < n; i++) {
    tone(bus, 640, { type: 'sawtooth', attack: 0.04, decay: 0.36, gain: 0.025, glideTo: 980, delay: delay + i * 0.62 });
    tone(bus, 980, { type: 'sawtooth', attack: 0.02, decay: 0.24, gain: 0.02, glideTo: 640, delay: delay + i * 0.62 + 0.34 });
  }
}

/* ---------- fight engine (cellblock and lot) ---------- */

function newThug(): Thug {
  return {
    st: 'off',
    t: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rot: 0,
    vr: 0,
    side: 1,
    hp: 2,
    style: 0,
    phase: 0,
    wait: 0,
    fade: 1,
    P: GUARD.slice(),
    pose: newPose(),
    slot: 0,
  };
}

const isDown = (th: Thug) => th.st === 'down' || th.st === 'slump';

function spawn(s: State, env: SceneEnv, side: number, slot: number, delay: number) {
  const th = s.thugs.find((t) => t.st === 'off');
  if (!th) return;
  const half = env.w / 2 / s.k;
  th.st = 'walk';
  th.t = -delay;
  th.side = side;
  th.x = side * (half + 50 + slot * 30);
  // the opening wave of the lot starts close so the first exchange happens right away
  if (s.ch === 2 && s.wave === 1 && slot === 0 && delay === 0) th.x = side * (ENGAGE + 46);
  th.y = 0;
  th.vx = 0;
  th.vy = 0;
  th.rot = 0;
  th.vr = 0;
  th.hp = 2;
  const n = s.ch === 1 ? INMATE_STYLES.length : THUG_STYLES.length;
  th.style = s.ch === 1 ? s.thugs.indexOf(th) % n : (s.wave + slot + (side > 0 ? 1 : 0)) % n;
  th.phase = rand(0, TAU);
  th.wait = rand(0.8, 1.6);
  th.fade = 1;
  th.slot = slot;
  th.P = GUARD.slice();
}

function startWave(s: State, env: SceneEnv) {
  s.wave++;
  if (s.ch === 1) {
    // the cellblock: four of them, closing from both doors
    spawn(s, env, 1, 0, 0);
    spawn(s, env, -1, 0, 0.5);
    spawn(s, env, 1, 1, 1.4);
    spawn(s, env, -1, 1, 2.2);
    return;
  }
  const pattern = s.wave % 3;
  if (pattern === 1) {
    spawn(s, env, 1, 0, 0);
    spawn(s, env, -1, 0, 0.9);
    spawn(s, env, 1, 1, 2.2);
  } else if (pattern === 2) {
    spawn(s, env, -1, 0, 0);
    spawn(s, env, 1, 0, 0.3);
    spawn(s, env, -1, 1, 1.8);
  } else {
    spawn(s, env, 1, 0, 0);
    spawn(s, env, 1, 1, 0.6);
    spawn(s, env, -1, 0, 1.2);
  }
}

/** The standing man closest to Reacher on a side (0 for either), or null */
function nearest(s: State, side: number) {
  let best: Thug | null = null;
  let bd = Infinity;
  for (const th of s.thugs) {
    if (th.st === 'off' || th.st === 'fly' || isDown(th)) continue;
    const d = th.x - s.rx;
    if (side !== 0 && Math.sign(d) !== side) continue;
    if (Math.abs(d) < bd) {
      bd = Math.abs(d);
      best = th;
    }
  }
  return best;
}

function pickMove(s: State, target: Thug | null): Move {
  const d = target ? Math.abs(target.x - s.rx) : 999;
  if (s.combo >= 2) return s.ch === 1 || d < 118 ? 'headbutt' : 'kick';
  const seq: Move[] = s.combo === 0 ? ['cross', 'jab', 'upper'] : ['elbow', 'upper', 'cross'];
  const m = seq[(s.wave + Math.floor(Math.abs(s.rx) * 7) + (target ? target.style : 0)) % 3];
  if (m === 'elbow' && d > 120) return 'cross';
  return m;
}

function strike(s: State, env: SceneEnv, side: number, user: boolean) {
  if (user) {
    s.touched = true;
    s.idle = 0;
  }
  if (s.move && s.mt < MOVES[s.move].dur * 0.55) {
    s.queued = side || s.face;
    return;
  }
  const target = nearest(s, side);
  const dir = side !== 0 ? side : target ? Math.sign(target.x - s.rx) || s.face : s.face;
  s.face = dir;
  if (s.comboT <= 0) s.combo = 0;
  s.move = pickMove(s, target && Math.sign(target.x - s.rx) === dir ? target : null);
  s.mt = 0;
  s.mside = dir;
  s.landed = false;
  s.queued = 0;
  const bus = env.audio();
  if (bus) sfxSwing(bus, s.move === 'headbutt' || s.move === 'kick');
  if (user) env.wake(1600);
}

function lightning(s: State, big: boolean) {
  s.light = big ? 1 : 0.7;
  s.thunder = big ? 0.55 : rand(0.9, 1.6);
  s.thunderBig = big;
  // a jagged bolt over the empty highway, in fractions of the screen
  const pts: number[] = [];
  let x = rand(0.06, 0.34);
  let y = 0;
  pts.push(x, y);
  while (y < 0.5) {
    y += rand(0.035, 0.07);
    x += rand(-0.03, 0.03);
    pts.push(x, Math.min(y, 0.52));
  }
  s.bolt = pts;
}

function land(s: State, env: SceneEnv, th: Thug, def: MoveDef, move: Move) {
  const dir = s.mside;
  const finisher = move === 'headbutt' || move === 'kick';
  const rm = env.reducedMotion;
  th.hp -= finisher ? 9 : 1;
  s.combo++;
  s.comboT = 1.1;
  s.stop = finisher ? 0.17 : 0.075;
  s.freeze = finisher;
  s.shake = rm ? 0 : finisher ? 1 : 0.55;
  s.kick = rm ? 0 : dir * (finisher ? 16 : 8);
  // finishers drop into slow motion behind the letterbox
  if (finisher && !rm) s.slow = 0.8;
  // the contact point: the striking fist, elbow, head or boot
  const j = move === 'kick' ? J.FOOT_N : move === 'headbutt' ? J.HEAD : move === 'elbow' ? J.ELB_N : move === 'jab' ? J.HAND_F : J.HAND_N;
  s.fx = s.rx + s.pose[j * 2] * dir * SCALE_R;
  s.fy = s.pose[j * 2 + 1] * SCALE_R;
  s.fdir = dir;
  s.flash = finisher ? 1 : 0.75;
  s.ring = 1;
  s.zoom = rm ? 0 : finisher ? 1 : 0.45;
  s.zx = env.w / 2 + s.fx * s.k;
  s.zy = s.ground + s.fy * s.k;
  // still frames keep the sign whole; only live play makes it stutter
  s.neonHit = rm ? 0 : finisher ? 1 : 0.5;
  const wet = s.ch === 2;
  burst(s.parts, finisher ? 34 : 18, s.fx, s.fy, dir > 0 ? 0 : Math.PI, 0.95, finisher ? 360 : 280, 0.55, 2.4, wet ? 0 : 3, 1.4, 480);
  // water (or sweat) flung off the man's head and shoulders
  const hx = th.x + th.pose[J.HEAD * 2] * -th.side;
  const hy = th.pose[J.HEAD * 2 + 1];
  burst(s.parts, finisher ? 16 : 8, hx, hy, dir > 0 ? -0.5 : Math.PI + 0.5, 0.8, 200, 0.7, 1.8, wet ? 0 : 3, 0.8, 700);
  if (finisher && s.ch === 2) lightning(s, true);
  // in the cellblock everything goes harder into the walls
  const throwK = s.ch === 1 ? 1.5 : 1;
  if (th.hp <= 0) {
    th.st = 'fly';
    th.t = 0;
    th.vx = dir * (190 + def.power * 75) * throwK;
    th.vy = -(70 + def.power * 45) * (s.ch === 1 ? 1.1 : 1);
    th.vr = dir * (3 + def.power);
  } else {
    th.st = 'stagger';
    th.t = 0;
    th.vx = dir * 130;
  }
  const bus = env.audio();
  if (bus) sfxHit(bus, finisher);
}

/** One step of the brawl: waves, every man's state machine and Reacher himself */
function fightUpdate(s: State, env: SceneEnv, dt: number) {
  stepPool(s.parts, dt);
  s.comboT -= dt;
  s.idle += dt;
  s.cops = Math.max(0, s.cops - dt * 0.22);
  const auto = !env.interactive || !s.touched || s.idle > 6;

  // lines for this chapter
  const script = SCRIPTS[s.ch];
  while (s.script < script.length && s.cht >= script[s.script].at) {
    const l = script[s.script++];
    say(s, l.text, l.who);
  }

  // waves
  const alive = s.thugs.filter((t) => t.st !== 'off' && t.st !== 'fly' && !isDown(t)).length;
  const any = s.thugs.some((t) => t.st !== 'off');
  if (!any && (s.ch === 2 || s.wave === 0)) {
    s.spawnT -= dt;
    if (s.spawnT <= 0) startWave(s, env);
  } else if (alive === 0 && s.clear === 0 && s.wave > 0 && !s.thugs.some((t) => t.st === 'fly')) {
    s.clear = 1;
    if (s.ch === 2) {
      s.cops = 1;
      s.spawnT = 2.6;
      say(s, LOT_CLEAR[s.wave % LOT_CLEAR.length], 1, 2.2);
      const bus = env.audio();
      if (bus) sfxSiren(bus, 0.4, 2);
    } else {
      s.endT = 0;
    }
  }
  if (alive > 0) s.clear = 0;
  if (s.ch === 1 && s.endT >= 0) {
    const was = s.endT;
    s.endT += dt;
    if (was < 0.7 && s.endT >= 0.7) say(s, 'Somebody mop that up.', 1, 2.2);
    if (was < 3.4 && s.endT >= 3.4) go(s, env, 2);
  }

  // the men
  for (const th of s.thugs) {
    if (th.st === 'off') continue;
    th.t += dt;
    const side = th.side;
    const g = th.P;
    let bend = 1;
    if (th.st === 'walk') {
      if (th.t < 0) continue;
      const stop = side * (ENGAGE + th.slot * 56);
      const dist = th.x - (s.rx + stop);
      th.x -= Math.sign(dist) * Math.min(Math.abs(dist), 95 * dt);
      th.phase += dt * 7.5;
      const sw = Math.sin(th.phase);
      for (let i = 0; i < NP; i++) g[i] = GUARD[i];
      g[NX] = 8;
      g[NY] = -124;
      g[FX] = 18;
      g[FY] = -128;
      g[LX] = sw * 16;
      g[LY] = -Math.max(0, Math.cos(th.phase)) * 9;
      g[RX] = -sw * 16;
      g[RY] = -Math.max(0, -Math.cos(th.phase)) * 9;
      g[HY] = -94 + Math.abs(Math.cos(th.phase)) * 3;
      if (Math.abs(dist) < 1) {
        th.st = 'ready';
        th.t = 0;
      }
    } else if (th.st === 'ready') {
      const stop = side * (ENGAGE + th.slot * 56);
      th.x = damp(th.x, s.rx + stop, 4, dt);
      const bob = Math.sin(th.t * 5 + th.phase);
      for (let i = 0; i < NP; i++) g[i] = GUARD[i];
      g[HY] += bob * 1.5;
      g[FX] += bob * 2;
      // only the front man swings; the one behind waits his turn
      const front = nearest(s, side) === th;
      if (front && th.slot > 0) th.slot = 0;
      if (front && th.t > th.wait && !s.move) {
        th.st = 'windup';
        th.t = 0;
      }
    } else if (th.st === 'windup') {
      const k = clamp(th.t / 0.5, 0, 1);
      for (let i = 0; i < NP; i++) g[i] = GUARD[i];
      g[NX] = lerp(15, -18, k);
      g[NY] = lerp(-148, -146, k);
      g[LEAN] = lerp(0.1, -0.1, k);
      g[HX] = lerp(-2, -8, k);
      if (th.t >= 0.5) {
        th.st = 'punch';
        th.t = 0;
      }
    } else if (th.st === 'punch') {
      const k = th.t / 0.32;
      const c = k < 0.4 ? easeOutCubic(k / 0.4) : 1 - easeOutCubic((k - 0.4) / 0.6);
      for (let i = 0; i < NP; i++) g[i] = GUARD[i];
      g[NX] = lerp(-18, ENGAGE - 10, c);
      g[NY] = lerp(-146, -160, c);
      g[LEAN] = lerp(-0.1, 0.32, c);
      g[HX] = lerp(-8, 10, c);
      g[RX] = lerp(-18, -12, c);
      if (k >= 0.4 && th.t - dt < 0.4 * 0.32) {
        // lands on Reacher's forearms; he barely moves
        s.block = 1;
        if (!env.reducedMotion) {
          s.shake = Math.max(s.shake, 0.22);
          s.kick = -side * 3;
        }
        s.rx -= side * 3;
        const bus = env.audio();
        if (bus) sfxBlock(bus);
      }
      if (k >= 1) {
        th.st = 'ready';
        th.t = 0;
        th.wait = rand(1.2, 2.2);
      }
    } else if (th.st === 'stagger') {
      th.x += th.vx * dt;
      th.vx = damp(th.vx, 0, 7, dt);
      const k = clamp(th.t / 0.5, 0, 1);
      const hurt = Math.sin(k * Math.PI);
      for (let i = 0; i < NP; i++) g[i] = GUARD[i];
      g[LEAN] = 0.1 - hurt * 0.55;
      g[HX] -= hurt * 10;
      g[HEADF] = -hurt * 9;
      g[NY] += hurt * 32;
      g[FY] += hurt * 28;
      g[RX] -= hurt * 10;
      if (th.t > 0.5) {
        th.st = 'ready';
        th.t = 0;
        th.wait = rand(0.6, 1.4);
      }
    } else if (th.st === 'fly') {
      th.x += th.vx * dt;
      th.vy += 900 * dt;
      th.y += th.vy * dt;
      th.rot += th.vr * dt;
      const target = (Math.PI / 2) * Math.sign(th.vr);
      if (Math.abs(th.rot) > Math.PI / 2) th.rot = target;
      for (let i = 0; i < NP; i++) g[i] = GUARD[i];
      g[LEAN] = -0.3;
      g[NX] = -10 + Math.sin(th.t * 13) * 8;
      g[NY] = -170;
      g[FX] = 10;
      g[FY] = -176 + Math.cos(th.t * 11) * 8;
      g[LX] = 18;
      g[LY] = -24;
      g[HEADF] = -6;
      bend = -1;
      if (Math.abs(th.x) > s.wallX) {
        // straight into the tiles: crack, dust, a hard stop, and he slides down the wall
        const sd = Math.sign(th.x);
        th.x = sd * s.wallX;
        th.st = 'slump';
        th.t = 0;
        th.vx = 0;
        th.rot = sd * 0.18;
        const wy = th.y - 120;
        s.cracks.push({ x: sd, y: wy, side: sd, seed: Math.random() * 1000 });
        for (let i = 0; i < 26; i++) emit(s.parts, sd * (s.wallX + 30), wy + rand(-40, 40), -sd * rand(40, 220), rand(-120, 60), rand(0.5, 1.1), rand(2, 4), 2, 1.5, 300);
        s.stop = Math.max(s.stop, 0.09);
        if (!env.reducedMotion) {
          s.shake = Math.max(s.shake, 0.85);
          s.kick = sd * 10;
        }
        s.neonHit = env.reducedMotion ? 0 : 1;
        const bus = env.audio();
        if (bus) sfxSlam(bus);
      } else if (th.y >= 0 && th.t > 0.1) {
        th.y = 0;
        th.st = 'down';
        th.t = 0;
        th.rot = target;
        th.vx *= 0.5;
        const gx = th.x;
        for (let i = 0; i < 34; i++) emit(s.parts, gx + rand(-70, 70) * Math.sign(th.vr), -rand(0, 4), rand(-80, 80), -rand(90, 300), rand(0.4, 0.85), rand(1.5, 3.2), s.ch === 2 ? 1 : 3, 0.5, 900);
        if (!env.reducedMotion) s.shake = Math.max(s.shake, 0.5);
        const bus = env.audio();
        if (bus) sfxBodyFall(bus, s.ch === 2);
      }
    } else if (th.st === 'slump') {
      const k = clamp(th.t / 0.55, 0, 1);
      th.y = lerp(th.y, 0, 1 - Math.exp(-9 * dt));
      th.rot = damp(th.rot, 0, 6, dt);
      for (let i = 0; i < NP; i++) g[i] = lerp(GUARD[i], SLUMP[i], easeOutCubic(k));
    } else if (th.st === 'down') {
      th.x += th.vx * dt;
      th.vx = damp(th.vx, 0, 5, dt);
      for (let i = 0; i < NP; i++) g[i] = GUARD[i];
      g[LEAN] = -0.1;
      g[NX] = -20;
      g[NY] = -120;
      g[FX] = 26;
      g[FY] = -160;
      g[LX] = 10;
      g[RX] = -14;
      g[HEADF] = -4;
      // the lot clears its bodies for the next wave; the cellblock keeps them
      if (s.ch === 2 && th.t > 2.2) th.fade = Math.max(0, th.fade - dt * 1.5);
      if (th.fade <= 0) th.st = 'off';
    }
    solve(th.pose, g, 1, bend);
  }

  // Reacher
  const P = s.P;
  const ready = alive > 0 || s.clear === 0;
  const base = ready && s.cops < 0.6 && s.endT < 0 ? GUARD : RELAX;
  s.breathe += dt;
  if (s.move) {
    const def = MOVES[s.move];
    s.mt += dt;
    const k = clamp(s.mt / def.dur, 0, 1);
    const cv = strikeCurve(k);
    for (let i = 0; i < NP; i++) {
      const pk = def.peak[i];
      const target = Number.isNaN(pk) ? GUARD[i] : pk;
      P[i] = GUARD[i] + (target - GUARD[i]) * cv;
    }
    s.rx += s.mside * def.lunge * (k > 0.18 && k < 0.36 ? dt / (def.dur * 0.18) : 0);
    if (!s.landed && k >= 0.3) {
      s.landed = true;
      const th = nearest(s, s.mside);
      if (th && Math.abs(th.x - s.rx) <= def.reach) land(s, env, th, def, s.move);
      else if (s.combo > 0) s.combo = 0;
    }
    if (k >= 1) {
      s.move = null;
      if (s.queued) strike(s, env, s.queued, false);
    }
  } else {
    for (let i = 0; i < NP; i++) P[i] = damp(P[i], base[i], 9, dt);
    P[HY] += Math.sin(s.breathe * 2.2) * 0.05;
    if (s.block > 0) {
      P[FX] = lerp(P[FX], 24, s.block);
      P[FY] = lerp(P[FY], -152, s.block);
      P[NX] = lerp(P[NX], 22, s.block * 0.6);
      P[LEAN] = lerp(P[LEAN], 0.02, s.block);
    }
    s.rx = damp(s.rx, 0, 1.4, dt);
    const th = nearest(s, 0);
    if (th) s.face = Math.sign(th.x - s.rx) || s.face;
    if (auto && th) {
      s.autoT -= dt;
      const d = Math.abs(th.x - s.rx);
      const threat = th.st === 'windup' || (th.st === 'ready' && d < ENGAGE + 6);
      if (s.autoT <= 0 && threat && d < 134) {
        strike(s, env, Math.sign(th.x - s.rx), false);
        s.autoT = s.combo >= 1 ? rand(0.05, 0.2) : rand(0.45, 0.9);
      }
    }
  }
  s.block = Math.max(0, s.block - dt * 4);
  const moveDef = s.move ? MOVES[s.move] : null;
  solve(s.pose, P, moveDef ? moveDef.bendN : 1, moveDef ? moveDef.bendF : 1);

  // the camera leans toward the man he is dealing with
  const foe = nearest(s, s.face);
  const mid = foe ? (s.rx + foe.x) / 2 : s.rx;
  s.camX = damp(s.camX, env.w / 2 + mid * s.k, 3, dt);
  s.camY = damp(s.camY, s.ground - 130 * s.k, 3, dt);
  s.camZ = damp(s.camZ, 1.05 + (s.slow > 0 ? 0.05 : 0), s.slow > 0 ? 6 : 2, dt);
}

/* ---------- neon lettering (stroked polylines, never canvas text) ---------- */

const GLYPHS: Record<string, number[][]> = {
  D: [[0, 0, 0.55, 0, 0.88, 0.14, 1, 0.5, 0.88, 0.86, 0.55, 1, 0, 1, 0, 0]],
  I: [[0.5, 0, 0.5, 1], [0.2, 0, 0.8, 0], [0.2, 1, 0.8, 1]],
  N: [[0, 1, 0, 0, 1, 1, 1, 0]],
  E: [[1, 0, 0, 0, 0, 1, 1, 1], [0, 0.5, 0.72, 0.5]],
  R: [[0, 1, 0, 0, 0.68, 0, 0.96, 0.12, 0.96, 0.38, 0.68, 0.5, 0, 0.5], [0.46, 0.5, 1, 1]],
  A: [[0, 1, 0.5, 0, 1, 1], [0.22, 0.62, 0.78, 0.62]],
  T: [[0, 0, 1, 0], [0.5, 0, 0.5, 1]],
};

function glyphPath(c: CanvasRenderingContext2D, ch: string, x: number, y: number, gw: number, gh: number) {
  for (const stroke of GLYPHS[ch]) {
    c.moveTo(x + stroke[0] * gw, y + stroke[1] * gh);
    for (let i = 2; i < stroke.length; i += 2) c.lineTo(x + stroke[i] * gw, y + stroke[i + 1] * gh);
  }
}

/* ---------- backdrop ---------- */

function computeLayout(s: State, env: SceneEnv): Layout {
  const { w, h } = env;
  const hor = h * 0.56;
  const db = hor + h * 0.05;
  const dw = Math.min(w * 0.52, 700 * s.k);
  const dx = w * 0.97 - dw;
  const dh = Math.min(h * 0.17, 92 * s.k);
  const sW = Math.max(14, Math.min(w * 0.05, h * 0.075));
  const sH = sW * 5.6;
  const sx = Math.min(w - sW * 0.9, dx + dw * 0.86);
  const sTop = Math.max(h * 0.06, db - dh - sH - h * 0.1);
  return {
    hor,
    db,
    dx,
    dw,
    dh,
    sx,
    sTop,
    sW,
    sH,
    ax: sx - sW * 0.5,
    ay: sTop + sH + sW * 0.45,
    aw: sW * 2.4,
    ah: sW * 0.72,
    lx: w * 0.5 - Math.min(w * 0.13, 150 * s.k),
    ly: h * 0.07,
  };
}

function paintBackdrop(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const R = mulberry(37);
  const rr = (lo: number, hi: number) => lo + R() * (hi - lo);
  const L = s.L;
  const { hor, db, dx, dw, dh } = L;
  const gy = s.ground;
  const { cv, c } = layer(s.bg, w, h, dpr);
  s.bg = cv;

  // sky: rain clouds lit from below by the far town
  const sky = c.createLinearGradient(0, 0, 0, hor);
  sky.addColorStop(0, '#03050a');
  sky.addColorStop(0.55, '#0a0e1b');
  sky.addColorStop(0.9, '#1f1824');
  sky.addColorStop(1, '#33212a');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, hor + 2);
  for (let i = 0; i < 14; i++) {
    const gx = rr(-0.1, 1.1) * w;
    const gyy = rr(0.05, 0.85) * hor;
    const r = rr(0.12, 0.3) * w;
    const g = c.createRadialGradient(gx, gyy, 0, gx, gyy, r);
    const warm = gyy / hor;
    g.addColorStop(0, `rgba(${Math.round(60 + warm * 50)},${Math.round(50 + warm * 20)},${Math.round(70 - warm * 10)},${(0.08 + warm * 0.08).toFixed(3)})`);
    g.addColorStop(1, 'rgba(30,30,50,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(gx, gyy, r, r * 0.35, 0, 0, TAU);
    c.fill();
  }
  // the far town: a low warm smear and a few pin lights on the horizon at left
  const town = c.createLinearGradient(0, hor - h * 0.08, 0, hor);
  town.addColorStop(0, 'rgba(255,140,80,0)');
  town.addColorStop(1, 'rgba(255,140,80,0.12)');
  c.fillStyle = town;
  c.fillRect(0, hor - h * 0.08, w * 0.5, h * 0.08);

  // pine line, darker toward the right where it sits behind the diner
  c.fillStyle = '#06080c';
  c.beginPath();
  c.moveTo(0, hor + 1);
  for (let x = 0; x <= w + 8; x += 5) {
    const tall = x % 29 < 4 ? h * 0.03 : 0;
    const y = hor - h * 0.035 - Math.abs(Math.sin(x * 0.05)) * h * 0.02 - Math.abs(Math.sin(x * 0.011 + 1)) * h * 0.04 - tall;
    c.lineTo(x, y);
  }
  c.lineTo(w, hor + 1);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(255,200,140,0.8)';
  for (let i = 0; i < 6; i++) c.fillRect(rr(0.02, 0.36) * w, hor - rr(2, 8), 1.5, 1.5);

  // the highway: one dark ribbon along the horizon with a broken yellow centre line
  const roadTop = hor;
  const roadBot = hor + h * 0.03;
  c.fillStyle = '#0d0e14';
  c.fillRect(0, roadTop, w, roadBot - roadTop);
  c.fillStyle = 'rgba(230,190,90,0.35)';
  for (let x = 6; x < w; x += 34) c.fillRect(x, (roadTop + roadBot) / 2 - 0.6, 16, 1.2);
  c.fillStyle = 'rgba(200,200,210,0.12)';
  c.fillRect(0, roadBot - 1.5, w, 1);
  // shoulder down to the lot
  const sh = c.createLinearGradient(0, roadBot, 0, db);
  sh.addColorStop(0, '#101016');
  sh.addColorStop(1, '#14141b');
  c.fillStyle = sh;
  c.fillRect(0, roadBot, w, db - roadBot + 2);

  // telephone poles running off down the empty road, wires sagging between them
  const poles: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const px = w * (0.04 + i * 0.085);
    const ph = h * (0.1 + i * 0.012);
    poles.push([px, ph]);
    c.fillStyle = '#07080b';
    c.fillRect(px - 1.2, roadTop - ph, 2.4, ph);
    c.fillRect(px - ph * 0.12, roadTop - ph + 3, ph * 0.24, 2);
  }
  c.strokeStyle = 'rgba(8,9,12,0.9)';
  c.lineWidth = 0.8;
  for (let i = 0; i < poles.length - 1; i++) {
    const [ax, ah] = poles[i];
    const [bx, bh] = poles[i + 1];
    for (const off of [-0.1, 0.1]) {
      c.beginPath();
      c.moveTo(ax + ah * off, roadTop - ah + 4);
      c.quadraticCurveTo((ax + bx) / 2, roadTop - (ah + bh) / 2 + 12, bx + bh * off, roadTop - bh + 4);
      c.stroke();
    }
  }

  // the diner: a long streamline car with a glowing window band
  const dt = db - dh;
  c.fillStyle = '#16191f';
  c.beginPath();
  c.roundRect(dx - 6, dt - dh * 0.12, dw + 12, dh * 0.18, 6);
  c.fill();
  const body = c.createLinearGradient(0, dt, 0, db);
  body.addColorStop(0, '#4c525d');
  body.addColorStop(0.18, '#8a919c');
  body.addColorStop(0.24, '#3a3f48');
  body.addColorStop(0.7, '#2f343c');
  body.addColorStop(1, '#1b1e24');
  c.fillStyle = body;
  c.beginPath();
  c.roundRect(dx, dt, dw, dh, [dh * 0.2, dh * 0.2, 3, 3]);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  c.lineWidth = 1;
  for (let y = dt + dh * 0.74; y < db - 1; y += 3) {
    c.beginPath();
    c.moveTo(dx, y);
    c.lineTo(dx + dw, y);
    c.stroke();
  }
  const wy = dt + dh * 0.26;
  const wh = dh * 0.42;
  const win = c.createLinearGradient(0, wy, 0, wy + wh);
  win.addColorStop(0, '#ffe2b0');
  win.addColorStop(0.6, '#f3b066');
  win.addColorStop(1, '#c7743a');
  c.fillStyle = win;
  c.fillRect(dx + dw * 0.03, wy, dw * 0.94, wh);
  // counter, pie case, stools and the few people still up at this hour
  c.fillStyle = 'rgba(120,60,26,0.55)';
  c.fillRect(dx + dw * 0.03, wy + wh * 0.62, dw * 0.94, wh * 0.08);
  const door = dx + dw * 0.22;
  c.fillStyle = 'rgba(50,24,10,0.9)';
  for (let i = 0; i < 11; i++) {
    const bx = dx + dw * (0.05 + i * 0.085);
    if (Math.abs(bx - door) < dw * 0.06) continue;
    c.fillRect(bx, wy + wh * 0.72, dw * 0.012, wh * 0.28);
    if (R() < 0.45) {
      c.beginPath();
      c.arc(bx + dw * 0.006, wy + wh * 0.32, wh * 0.12, 0, TAU);
      c.fill();
      c.beginPath();
      c.roundRect(bx - dw * 0.012, wy + wh * 0.42, dw * 0.036, wh * 0.3, 3);
      c.fill();
    }
  }
  c.fillStyle = 'rgba(35,35,42,0.95)';
  for (let i = 0; i <= 14; i++) c.fillRect(dx + dw * 0.03 + (dw * 0.94 * i) / 14 - 1.2, wy, 2.4, wh);
  // the door, lit from inside, with a little awning
  c.fillStyle = '#ffe9c2';
  c.fillRect(door, wy - dh * 0.06, dw * 0.05, db - wy + dh * 0.06 - 1);
  c.fillStyle = 'rgba(40,30,20,0.7)';
  c.fillRect(door + dw * 0.024, wy - dh * 0.06, 1.5, db - wy + dh * 0.06 - 1);
  c.fillStyle = '#5a1018';
  c.beginPath();
  c.moveTo(door - dw * 0.015, wy - dh * 0.08);
  c.lineTo(door + dw * 0.065, wy - dh * 0.08);
  c.lineTo(door + dw * 0.075, wy + dh * 0.02);
  c.lineTo(door - dw * 0.025, wy + dh * 0.02);
  c.closePath();
  c.fill();
  // one pickup parked nose in at the far end
  const tx = dx - dw * 0.2;
  const tb = db + h * 0.012;
  const tl = dw * 0.2;
  c.fillStyle = '#090a0e';
  c.beginPath();
  c.moveTo(tx, tb);
  c.lineTo(tx, tb - dh * 0.32);
  c.lineTo(tx + tl * 0.4, tb - dh * 0.34);
  c.lineTo(tx + tl * 0.48, tb - dh * 0.6);
  c.lineTo(tx + tl * 0.78, tb - dh * 0.6);
  c.lineTo(tx + tl * 0.86, tb - dh * 0.32);
  c.lineTo(tx + tl, tb - dh * 0.3);
  c.lineTo(tx + tl, tb);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(255,190,120,0.18)';
  c.fillRect(tx + tl * 0.5, tb - dh * 0.56, tl * 0.26, dh * 0.2);
  c.fillStyle = '#030305';
  for (const f of [0.18, 0.8]) {
    c.beginPath();
    c.arc(tx + tl * f, tb, dh * 0.12, 0, TAU);
    c.fill();
  }

  // sign pole and the sign boxes (the neon itself is drawn live)
  const { sx, sTop, sW, sH, ax, ay, aw, ah } = L;
  c.fillStyle = '#0c0d11';
  c.fillRect(sx - 3, sTop + sH, 6, db - sTop - sH);
  c.fillStyle = '#111219';
  c.beginPath();
  c.roundRect(sx - sW / 2, sTop, sW, sH, 4);
  c.fill();
  c.strokeStyle = 'rgba(160,170,190,0.25)';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = '#111219';
  c.beginPath();
  c.moveTo(ax + aw / 2, ay - ah / 2);
  c.lineTo(ax - aw / 2 + ah * 0.6, ay - ah / 2);
  c.lineTo(ax - aw / 2, ay);
  c.lineTo(ax - aw / 2 + ah * 0.6, ay + ah / 2);
  c.lineTo(ax + aw / 2, ay + ah / 2);
  c.closePath();
  c.fill();
  c.stroke();

  // wet asphalt lot
  const lot = c.createLinearGradient(0, db, 0, h);
  lot.addColorStop(0, '#16161d');
  lot.addColorStop(0.4, '#0e0e14');
  lot.addColorStop(1, '#060609');
  c.fillStyle = lot;
  c.fillRect(0, db, w, h - db);
  // window light thrown across the wet lot
  c.save();
  c.globalCompositeOperation = 'lighter';
  const spill = c.createLinearGradient(0, db, 0, h);
  spill.addColorStop(0, 'rgba(255,170,90,0.2)');
  spill.addColorStop(0.5, 'rgba(255,150,70,0.05)');
  spill.addColorStop(1, 'rgba(255,140,60,0)');
  c.fillStyle = spill;
  c.beginPath();
  c.moveTo(dx + dw * 0.03, db);
  c.lineTo(dx + dw * 0.97, db);
  c.lineTo(dx + dw * 1.2, h);
  c.lineTo(dx - dw * 0.1, h);
  c.closePath();
  c.fill();
  // streaked reflections of the window band and the door
  const refl = c.createLinearGradient(0, db, 0, h);
  refl.addColorStop(0, 'rgba(255,200,120,0.42)');
  refl.addColorStop(0.45, 'rgba(255,160,80,0.08)');
  refl.addColorStop(1, 'rgba(255,140,60,0)');
  c.fillStyle = refl;
  for (let i = 0; i < 46; i++) {
    const x = dx + dw * 0.03 + R() * dw * 0.94;
    c.fillRect(x, db + 1, rr(1, 3.5), (h - db) * rr(0.25, 0.8));
  }
  c.fillRect(door, db + 1, dw * 0.05, (h - db) * 0.6);
  c.restore();
  // parking lines in perspective
  c.strokeStyle = 'rgba(220,210,180,0.1)';
  c.lineWidth = 2;
  for (let i = -7; i <= 7; i++) {
    c.beginPath();
    c.moveTo(w / 2 + i * w * 0.075, db + (h - db) * 0.12);
    c.lineTo(w / 2 + i * w * 0.2, h);
    c.stroke();
  }
  // puddles: glassy patches that pick up the sky
  for (let i = 0; i < 9; i++) {
    const px = rr(0, 1) * w;
    const py = lerp(db + (h - db) * 0.2, h, R());
    const pg = c.createRadialGradient(px, py, 0, px, py, rr(50, 140));
    pg.addColorStop(0, 'rgba(40,48,70,0.4)');
    pg.addColorStop(1, 'rgba(40,48,70,0)');
    c.fillStyle = pg;
    c.beginPath();
    c.ellipse(px, py, rr(60, 150), rr(6, 14), 0, 0, TAU);
    c.fill();
  }

  // the sodium lamp, its pole set back in the lot
  const { lx, ly } = L;
  const pb = lerp(db, gy, 0.4);
  const px = lx - Math.min(w * 0.07, 80 * s.k);
  c.fillStyle = '#0c0d10';
  c.fillRect(px - 3, ly + 2, 6, pb - ly - 2);
  c.beginPath();
  c.moveTo(px, ly + 6);
  c.quadraticCurveTo(px + 4, ly - 2, lx - 10, ly);
  c.lineTo(lx - 10, ly + 4);
  c.quadraticCurveTo(px + 6, ly + 3, px + 3, ly + 12);
  c.closePath();
  c.fill();
  c.fillStyle = '#23252b';
  c.beginPath();
  c.moveTo(lx - 22, ly - 2);
  c.lineTo(lx + 22, ly - 2);
  c.lineTo(lx + 16, ly + 9);
  c.lineTo(lx - 16, ly + 9);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath();
  c.ellipse(px, pb, 12, 3, 0, 0, TAU);
  c.fill();
}

/** Lamp cone as a path, used for the volumetric light and the rain caught in it */
function conePath(c: CanvasRenderingContext2D, L: Layout, gy: number, w: number) {
  const spread = Math.min(w * 0.3, (gy - L.ly) * 0.62);
  c.beginPath();
  c.moveTo(L.lx - 14, L.ly + 8);
  c.lineTo(L.lx + 14, L.ly + 8);
  c.lineTo(L.lx + spread * 1.15, gy + 14);
  c.lineTo(L.lx - spread * 0.85, gy + 14);
  c.closePath();
}


/* ---------- chapters ---------- */

function newDiner(prev?: Diner): Diner {
  return {
    beat: 0,
    bt: 0,
    bites: 0,
    biteK: 0.1,
    hold: false,
    held: 0,
    tension: 0,
    lines: 0,
    sip: 0,
    hands: 0,
    door: 0,
    step: 0,
    beatT: 0,
    heart: 0,
    autoHold: false,
    deps: prev?.deps ?? [],
    cars: prev?.cars ?? [],
    motes: Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), v: rand(0.2, 1), p: rand(0, TAU) })),
    kd: prev?.kd ?? 1,
    rxS: prev?.rxS ?? 0,
    ctop: prev?.ctop ?? 0,
    cx0: prev?.cx0 ?? 0,
    wx0: prev?.wx0 ?? 0,
    wx1: prev?.wx1 ?? 0,
    wy0: prev?.wy0 ?? 0,
    wy1: prev?.wy1 ?? 0,
    road: prev?.road ?? 0,
    dx0: prev?.dx0 ?? 0,
    dx1: prev?.dx1 ?? 0,
    dy0: prev?.dy0 ?? 0,
  };
}

function resetChapter(s: State, env: SceneEnv, n: number, poster: boolean) {
  s.ch = n;
  s.cht = 0;
  s.script = 0;
  s.endT = -1;
  s.sub = null;
  for (const th of s.thugs) th.st = 'off';
  s.wave = 0;
  s.clear = 0;
  s.spawnT = n === 2 ? (poster ? 0 : 1.6) : 2.8;
  s.rx = 0;
  s.face = 1;
  s.move = null;
  s.mt = 0;
  s.combo = 0;
  s.comboT = 0;
  s.queued = 0;
  s.block = 0;
  s.cops = 0;
  s.cracks = [];
  s.slow = 0;
  s.stop = 0;
  s.flash = 0;
  s.ring = 0;
  s.zoom = 0;
  s.light = 0;
  s.thunder = -1;
  s.autoT = 0.3;
  s.idle = 0;
  for (const p of s.parts.items) p.life = 0;
  s.P = (n === 0 ? SEAT : GUARD).slice();
  s.D = newDiner(s.D);
  s.D.deps = [];
  s.D.cars = [];
  s.camX = env.w / 2;
  s.camY = env.h / 2;
  s.camZ = 1.05;
}

function paintChapter(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  s.wallX = Infinity;
  if (s.ch === 0) {
    paintDiner(s, env);
    return;
  }
  if (s.ch === 1) {
    paintJail(s, env);
    return;
  }
  s.ground = h * 0.83;
  s.L = computeLayout(s, env);
  paintBackdrop(s, env);
  // the lamp's light volume, baked soft once (blur where the browser supports it)
  const cl = layer(s.cone, w, h, Math.min(dpr, 1));
  s.cone = cl.cv;
  cl.c.filter = `blur(${Math.round(Math.max(6, w * 0.012))}px)`;
  conePath(cl.c, s.L, s.ground, w);
  const cg = cl.c.createRadialGradient(s.L.lx, s.L.ly, 0, s.L.lx, s.L.ly, s.ground - s.L.ly + 40);
  cg.addColorStop(0, 'rgba(255,185,95,0.3)');
  cg.addColorStop(0.55, 'rgba(255,160,70,0.07)');
  cg.addColorStop(1, 'rgba(255,150,60,0.01)');
  cl.c.fillStyle = cg;
  cl.c.fill();
  cl.c.filter = 'none';
}

function enterChapter(s: State, env: SceneEnv, n: number) {
  resetChapter(s, env, n, false);
  paintChapter(s, env);
  s.go = -1;
  s.card = 0;
}

/** Cut to a chapter: fade to black, a title card, then fade up (instant under reduced motion) */
function go(s: State, env: SceneEnv, n: number) {
  if (s.go >= 0) return;
  if (env.reducedMotion) {
    enterChapter(s, env, n);
    s.card = 99;
    env.wake(2500);
    return;
  }
  s.go = n;
  s.goT = 0;
  const bus = env.audio();
  if (bus) tone(bus, 110, { type: 'sine', attack: 0.3, decay: 1.4, gain: 0.12, glideTo: 82 });
}

/* ---------- chapter one: the diner ---------- */

const DINER_BEATS = [3.6, 2.8, 1.8, Infinity, 3.6];

function paintDiner(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const R0 = mulberry(11);
  const rr = (lo: number, hi: number) => lo + R0() * (hi - lo);
  const D = s.D;
  const gy = h * 0.9;
  s.ground = gy;
  D.kd = s.k * 1.16;
  const R = D.kd * SCALE_R;
  D.rxS = w * 0.42;
  D.ctop = gy - 120 * R;
  D.cx0 = D.rxS + 30 * R;
  D.wy0 = h * 0.13;
  D.wy1 = Math.max(D.wy0 + h * 0.14, D.ctop - h * 0.04);
  D.wx0 = w * 0.2;
  D.wx1 = w * 0.98;
  D.road = D.wy1 - (D.wy1 - D.wy0) * 0.14;
  D.dx0 = w * 0.035;
  D.dx1 = w * 0.14;
  D.dy0 = h * 0.12;
  const yb = gy - h * 0.07;
  const WH = D.road - D.wy0;

  // outside: a pale morning over the little main street across the road
  const o = layer(s.bg, w, h, dpr);
  s.bg = o.cv;
  const c = o.c;
  const sky = c.createLinearGradient(0, D.wy0, 0, D.road);
  sky.addColorStop(0, '#a6c0d2');
  sky.addColorStop(0.65, '#efd7b0');
  sky.addColorStop(1, '#f6c99c');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const sun = c.createRadialGradient(w * 0.88, D.wy0 + WH * 0.4, 0, w * 0.88, D.wy0 + WH * 0.4, w * 0.35);
  sun.addColorStop(0, 'rgba(255,248,225,0.95)');
  sun.addColorStop(0.2, 'rgba(255,230,180,0.45)');
  sun.addColorStop(1, 'rgba(255,220,170,0)');
  c.fillStyle = sun;
  c.fillRect(0, 0, w, h);
  // trees and a water tower past the rooftops
  c.fillStyle = 'rgba(96,112,98,0.75)';
  for (let x = -20; x < w + 20; x += rr(18, 34)) {
    c.beginPath();
    c.arc(x, D.road - WH * rr(0.42, 0.55), rr(12, 26), 0, TAU);
    c.fill();
  }
  const tw = w * 0.62;
  const tt = D.road - WH * 0.92;
  c.strokeStyle = 'rgba(90,100,104,0.9)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(tw - 16, D.road - WH * 0.4);
  c.lineTo(tw - 10, tt + 18);
  c.moveTo(tw + 16, D.road - WH * 0.4);
  c.lineTo(tw + 10, tt + 18);
  c.stroke();
  c.fillStyle = '#8b9aa0';
  c.beginPath();
  c.roundRect(tw - 22, tt, 44, 20, [10, 10, 3, 3]);
  c.fill();
  // storefronts with awnings
  const shopTop = D.road - WH * 0.1;
  const tints = ['#cdb999', '#b9a596', '#9fb2b6', '#d2c3a6', '#a9a08f'];
  for (let x = -10; x < w + 10; ) {
    const sw = rr(w * 0.08, w * 0.16);
    const sh = WH * rr(0.28, 0.48);
    c.fillStyle = tints[Math.floor(R0() * tints.length)];
    c.fillRect(x, shopTop - sh, sw - 3, sh);
    c.fillStyle = 'rgba(40,46,52,0.55)';
    c.fillRect(x + sw * 0.12, shopTop - sh * 0.55, sw * 0.5, sh * 0.42);
    c.fillStyle = R0() < 0.5 ? '#9a3b33' : '#2f5d61';
    c.fillRect(x + 2, shopTop - sh * 0.66, sw - 7, sh * 0.08);
    x += sw;
  }
  c.fillStyle = '#cbbfa8';
  c.fillRect(0, shopTop, w, D.road - shopTop - WH * 0.03);
  c.fillStyle = '#5c5956';
  c.fillRect(0, D.road - WH * 0.03, w, h);
  c.fillStyle = 'rgba(240,220,140,0.6)';
  for (let x = 0; x < w; x += 40) c.fillRect(x, D.road + WH * 0.06, 20, 2);

  // the room: menu boards, cream tile, a teal wainscot, black and white floor
  const r = layer(s.bg2, w, h, dpr);
  s.bg2 = r.cv;
  const g = r.c;
  g.fillStyle = '#2a2420';
  g.fillRect(0, 0, w, h * 0.07);
  const wall = g.createLinearGradient(0, h * 0.07, 0, yb);
  wall.addColorStop(0, '#d8c8a8');
  wall.addColorStop(0.5, '#ecdfc4');
  wall.addColorStop(1, '#d9c7a3');
  g.fillStyle = wall;
  g.fillRect(0, h * 0.07, w, yb - h * 0.07);
  g.fillStyle = '#1f1c19';
  g.fillRect(D.wx0, h * 0.075, D.wx1 - D.wx0, D.wy0 - h * 0.085);
  g.fillStyle = 'rgba(255,240,210,0.5)';
  for (let i = 0; i < 18; i++) {
    const mx = D.wx0 + 10 + (i % 6) * ((D.wx1 - D.wx0) / 6);
    const my = h * 0.085 + Math.floor(i / 6) * ((D.wy0 - h * 0.1) / 3);
    g.fillRect(mx, my, rr(20, (D.wx1 - D.wx0) / 9), 2);
  }
  const wain = D.wy1 + h * 0.02;
  g.fillStyle = '#2d6964';
  g.fillRect(0, wain, w, yb - wain);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < w; x += 14) g.fillRect(x, wain, 1, yb - wain);
  g.fillStyle = '#cdd4d8';
  g.fillRect(0, wain - 3, w, 4);
  // checkerboard floor in perspective
  const vpx = w * 0.5;
  const vpy = yb - h * 0.9;
  const X = (u: number, y: number) => vpx + (u - vpx) * ((y - vpy) / (yb - vpy));
  g.fillStyle = '#e6decd';
  g.fillRect(0, yb, w, h - yb);
  const tile = w * 0.07;
  let y0 = yb;
  let rh = (h - yb) * 0.12;
  for (let row = 0; y0 < h; row++) {
    const y1 = y0 + rh;
    for (let col = -30; col < 30; col++) {
      if ((row + col) % 2 === 0) continue;
      const u0 = vpx + col * tile;
      g.fillStyle = '#1c1b1e';
      g.beginPath();
      g.moveTo(X(u0, y0), y0);
      g.lineTo(X(u0 + tile, y0), y0);
      g.lineTo(X(u0 + tile, y1), y1);
      g.lineTo(X(u0, y1), y1);
      g.closePath();
      g.fill();
    }
    y0 = y1;
    rh *= 1.28;
  }
  const fl = g.createLinearGradient(0, yb, 0, h);
  fl.addColorStop(0, 'rgba(40,30,20,0.45)');
  fl.addColorStop(1, 'rgba(40,30,20,0.05)');
  g.fillStyle = fl;
  g.fillRect(0, yb, w, h - yb);
  // the window band and the door are cut out so the street shows through
  g.clearRect(D.wx0, D.wy0, D.wx1 - D.wx0, D.wy1 - D.wy0);
  g.clearRect(D.dx0, D.dy0, D.dx1 - D.dx0, yb - D.dy0);
  g.fillStyle = 'rgba(210,230,240,0.08)';
  g.fillRect(D.wx0, D.wy0, D.wx1 - D.wx0, D.wy1 - D.wy0);
  // blinds half pulled
  g.fillStyle = 'rgba(232,220,192,0.92)';
  for (let y = D.wy0; y < D.wy0 + (D.wy1 - D.wy0) * 0.2; y += 5) g.fillRect(D.wx0, y, D.wx1 - D.wx0, 3);
  g.fillStyle = '#b9c1c6';
  const panes = 5;
  for (let i = 0; i <= panes; i++) g.fillRect(D.wx0 + ((D.wx1 - D.wx0) * i) / panes - 3, D.wy0, 6, D.wy1 - D.wy0);
  g.fillRect(D.wx0, D.wy0 - 4, D.wx1 - D.wx0, 6);
  g.fillRect(D.wx0, D.wy1 - 2, D.wx1 - D.wx0, 7);
  g.strokeStyle = '#b9c1c6';
  g.lineWidth = 6;
  g.strokeRect(D.dx0 - 3, D.dy0 - 3, D.dx1 - D.dx0 + 6, yb - D.dy0 + 3);
  // the clock says it is still early
  const ckx = (D.dx1 + D.wx0) / 2;
  const cky = D.wy0 + (D.wy1 - D.wy0) * 0.3;
  const ckr = Math.min((D.wx0 - D.dx1) * 0.36, h * 0.04);
  g.fillStyle = '#f6f1e6';
  g.strokeStyle = '#7a1c1c';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(ckx, cky, ckr, 0, TAU);
  g.fill();
  g.stroke();
  g.strokeStyle = '#222';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(ckx, cky);
  g.lineTo(ckx + Math.cos(-Math.PI / 2 + TAU * (7.65 / 12)) * ckr * 0.5, cky + Math.sin(-Math.PI / 2 + TAU * (7.65 / 12)) * ckr * 0.5);
  g.moveTo(ckx, cky);
  g.lineTo(ckx + Math.cos(-Math.PI / 2 + TAU * (40 / 60)) * ckr * 0.8, cky + Math.sin(-Math.PI / 2 + TAU * (40 / 60)) * ckr * 0.8);
  g.stroke();
  // pendant lamps
  for (const px of [0.32, 0.58, 0.84]) {
    g.strokeStyle = '#1a1714';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(w * px, h * 0.07);
    g.lineTo(w * px, h * 0.1);
    g.stroke();
    g.fillStyle = '#7a1c1c';
    g.beginPath();
    g.ellipse(w * px, h * 0.11, w * 0.025, h * 0.016, 0, Math.PI, TAU);
    g.fill();
  }
  // his stool: chrome post and red vinyl
  g.fillStyle = '#9aa2a8';
  g.fillRect(D.rxS - 3 * R, gy - 92 * R, 6 * R, 92 * R);
  g.fillStyle = '#6f777d';
  g.beginPath();
  g.ellipse(D.rxS, gy, 18 * R, 3 * R, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#9b2228';
  g.beginPath();
  g.ellipse(D.rxS, gy - 94 * R, 17 * R, 5 * R, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#c9d0d4';
  g.fillRect(D.rxS - 17 * R, gy - 94 * R, 34 * R, 2);

  // in front of him: the counter, its chrome lip and what sits on it
  const f = layer(s.bg3, w, h, dpr);
  s.bg3 = f.cv;
  const q = f.c;
  q.clearRect(0, 0, w, h);
  const panel = q.createLinearGradient(0, D.ctop, 0, gy);
  panel.addColorStop(0, '#2f6a65');
  panel.addColorStop(1, '#1f4a46');
  q.fillStyle = panel;
  q.beginPath();
  q.roundRect(D.cx0, D.ctop + 4 * R, w - D.cx0 + 20, gy - D.ctop - 4 * R, [8, 0, 0, 0]);
  q.fill();
  q.fillStyle = 'rgba(0,0,0,0.16)';
  for (let x = D.cx0 + 8; x < w; x += 9) q.fillRect(x, D.ctop + 7 * R, 2, gy - D.ctop - 20 * R);
  q.fillStyle = '#aab2b8';
  q.fillRect(D.cx0, gy - 12 * R, w - D.cx0 + 20, 12 * R);
  q.fillStyle = '#ddd5c4';
  q.beginPath();
  q.roundRect(D.cx0 - 6, D.ctop - 2, w - D.cx0 + 26, 6 * R, [6, 0, 0, 6]);
  q.fill();
  q.fillStyle = '#c4ccd1';
  q.fillRect(D.cx0 - 6, D.ctop + 4 * R - 3, w - D.cx0 + 26, 3);
  // napkins, sugar and a cake stand under glass at the far end
  const napX = D.rxS + 92 * R;
  if (napX < w - 20) {
    q.fillStyle = '#b9c1c6';
    q.fillRect(napX, D.ctop - 14 * R, 12 * R, 14 * R);
    q.fillStyle = '#f2efe8';
    q.fillRect(napX + 2 * R, D.ctop - 18 * R, 8 * R, 5 * R);
    q.fillStyle = 'rgba(240,240,240,0.8)';
    q.fillRect(napX + 18 * R, D.ctop - 13 * R, 7 * R, 13 * R);
    q.fillStyle = '#c4ccd1';
    q.fillRect(napX + 18 * R, D.ctop - 16 * R, 7 * R, 3 * R);
  }
  const caseX = Math.max(napX + 50 * R, w * 0.86);
  if (caseX < w + 10) {
    q.fillStyle = '#c4ccd1';
    q.fillRect(caseX - 16 * R, D.ctop - 4 * R, 32 * R, 4 * R);
    q.fillStyle = '#d79a4c';
    q.fillRect(caseX - 12 * R, D.ctop - 12 * R, 24 * R, 8 * R);
    q.fillStyle = 'rgba(210,230,240,0.25)';
    q.strokeStyle = 'rgba(255,255,255,0.55)';
    q.lineWidth = 1.5;
    q.beginPath();
    q.ellipse(caseX, D.ctop - 4 * R, 17 * R, 22 * R, 0, Math.PI, TAU);
    q.fill();
    q.stroke();
  }
}

function dinerPose(s: State, env: SceneEnv, dt: number) {
  const D = s.D;
  const T = SEAT.slice();
  if (D.beat <= 1) {
    // fork from the plate to his mouth and back, unhurried
    const k = D.biteK;
    const ease = (u: number) => u * u * (3 - 2 * u);
    const lift = k < 0.25 ? 0 : k < 0.5 ? ease((k - 0.25) / 0.25) : k < 0.65 ? 1 : k < 0.9 ? 1 - ease((k - 0.65) / 0.25) : 0;
    T[NX] = lerp(54, 17, lift);
    T[NY] = lerp(-127, -170, lift);
    T[HEADF] = lift * 2 - 1;
    T[LEAN] = 0.08 + lift * 0.05;
  } else if (D.beat === 2) {
    T[NX] = 54;
    T[NY] = -126;
  } else if (D.beat === 3) {
    T[NX] = lerp(36, 17, D.sip);
    T[NY] = lerp(-127, -168, D.sip);
    T[LEAN] = 0.08 - D.sip * 0.03;
    T[HEADF] = -D.sip * 1.5;
  } else {
    const hh = D.hands;
    T[NX] = lerp(36, 46, hh);
    T[NY] = lerp(-127, -194, hh);
    T[FX] = lerp(44, 40, hh);
    T[FY] = lerp(-123, -198, hh);
    T[LEAN] = lerp(0.08, -0.02, hh);
  }
  for (let i = 0; i < NP; i++) s.P[i] = damp(s.P[i], T[i], 10, dt);
  solve(s.pose, s.P, 1, 1);
  void env;
}

function dinerUpdate(s: State, env: SceneEnv, dt: number) {
  const D = s.D;
  const { w, h } = env;
  const R = D.kd * SCALE_R;
  const gy = s.ground;
  const yb = gy - h * 0.07;
  const auto = !env.interactive || !s.touched || s.idle > 6;
  s.idle += dt;
  const prev = D.bt;
  D.bt += dt;
  const at = (x: number) => prev < x && D.bt >= x;
  const bus = env.audio();

  if (D.beat <= 1) {
    D.biteK += dt / (D.beat === 0 ? 1.9 : 2.8);
    if (D.biteK >= 1) {
      D.biteK -= 1;
      D.bites = Math.min(5, D.bites + 1);
    }
    if (bus && D.biteK > 0.24 && D.biteK - dt / 1.9 <= 0.24) tone(bus, 2600, { type: 'triangle', decay: 0.07, gain: 0.03 });
  }
  if (D.beat === 0) {
    if (at(0.9)) say(s, 'More coffee, hon?', 0, 1.8);
    if (at(2.3)) say(s, 'Please.', 1, 1.4);
  } else if (D.beat === 1) {
    if (at(0.05) && bus) sfxSiren(bus, 0, 4);
    if (at(0.85) && bus) noise(bus, { duration: 0.6, gain: 0.14, freq: 1500, q: 0.6, type: 'bandpass' });
    if (at(1.6)) say(s, "That'll be for me.", 1, 1.8);
  } else if (D.beat === 2) {
    const was = D.beatT;
    D.beatT += dt;
    D.door = clamp(D.beatT / 0.14, 0, 1);
    if (was === 0) {
      if (!env.reducedMotion) s.shake = 0.6;
      if (bus) {
        noise(bus, { duration: 0.25, gain: 0.45, freq: 500, q: 0.7, type: 'lowpass' });
        tone(bus, 90, { type: 'sine', decay: 0.3, gain: 0.4, glideTo: 50 });
        tone(bus, 1760, { decay: 0.9, gain: 0.07 });
        tone(bus, 2637, { decay: 0.6, gain: 0.035, delay: 0.02 });
      }
    }
    if (at(0.3)) say(s, 'Freeze! Hands where we can see them!', 0, 2.2);
  } else if (D.beat === 3) {
    D.beatT += dt;
    if (auto && !D.hold && !D.autoHold && D.bt > 1.0) {
      D.hold = true;
      D.autoHold = true;
    }
    if (D.hold) {
      D.held += dt;
      D.tension = Math.min(3, D.tension + dt);
      if (D.autoHold && D.held > 2.6) dinerRelease(s, env);
    }
    D.sip = damp(D.sip, D.hold ? 1 : 0, D.hold ? 2.4 : 5, dt);
    if (D.tension > 0.35 && D.lines < 1) {
      D.lines = 1;
      say(s, 'Put the cup down. Now!', 0, 1.8);
    } else if (D.tension > 1.3 && D.lines < 2) {
      D.lines = 2;
      say(s, 'Good coffee.', 1, 1.6);
    } else if (D.tension > 2.3 && D.lines < 3) {
      D.lines = 3;
      say(s, 'I will not tell you again!', 0, 1.8);
    }
    // a heartbeat that quickens the longer he makes them wait
    D.heart -= dt;
    if (D.heart <= 0) {
      D.heart = 0.95 - D.tension * 0.15;
      if (bus) {
        tone(bus, 52, { decay: 0.12, gain: 0.32 });
        tone(bus, 48, { decay: 0.14, gain: 0.22, delay: 0.17 });
      }
    }
  } else if (D.beat === 4) {
    D.beatT += dt;
    D.sip = damp(D.sip, 0, 6, dt);
    if (at(0.35) && bus) tone(bus, 1300, { type: 'triangle', decay: 0.12, gain: 0.07 });
    if (at(0.2)) say(s, D.tension > 1.8 ? "Now I'm done." : "Okay. I'm done.", 1, 1.8);
    D.hands = easeOutCubic(clamp((D.bt - 0.55) / 1.0, 0, 1));
    D.step = easeOutCubic(clamp((D.bt - 1.4) / 0.6, 0, 1));
    if (at(2.1)) say(s, 'Easy. Nice and easy.', 0, 1.6);
    if (at(2.7) && bus) {
      tone(bus, 3200, { type: 'square', decay: 0.02, gain: 0.03 });
      tone(bus, 3000, { type: 'square', decay: 0.02, gain: 0.03, delay: 0.09 });
    }
  }
  if (D.bt >= DINER_BEATS[D.beat]) {
    if (D.beat === 4) {
      go(s, env, 1);
    } else {
      D.beat++;
      D.bt = 0;
      if (D.beat === 1) {
        D.cars = [0, 1].map((i) => ({
          x0: D.wx1 + w * (0.25 + i * 0.2),
          tx: D.wx0 + (D.wx1 - D.wx0) * (0.45 + i * 0.32),
          delay: i * 0.35,
          x: w * 2,
          tilt: 0,
        }));
      }
      if (D.beat === 2) {
        const doorX = (D.dx0 + D.dx1) / 2;
        D.deps = [
          { a: 215, sc: 0.82, yo: -h * 0.035, delay: 0.5 },
          { a: 165, sc: 0.94, yo: -h * 0.012, delay: 0.25 },
          { a: 112, sc: 1.06, yo: h * 0.012, delay: 0 },
        ].map((d) => ({
          x0: doorX,
          tx: Math.max(w * 0.04, D.rxS - d.a * D.kd),
          sc: d.sc,
          yo: d.yo,
          delay: d.delay,
          x: -999,
          y: yb,
          cs: 0,
          P: AIM.slice(),
          pose: newPose(),
          phase: rand(0, TAU),
          racked: false,
        }));
      }
    }
  }

  // patrol cars sliding in outside
  for (const car of D.cars) {
    const u = clamp((D.bt + (D.beat > 1 ? 99 : 0) - car.delay) / 1.15, 0, 1);
    car.x = lerp(car.x0, car.tx, easeOutCubic(u));
    car.tilt = Math.sin(u * Math.PI) * 0.035 * (u > 0.5 ? 1 : 0.4);
  }
  // deputies pour in and spread out, guns up, edging closer while he stalls
  for (const dp of D.deps) {
    const u = D.beatT - dp.delay;
    if (u < 0) continue;
    const k = clamp(u / 0.7, 0, 1);
    const e = easeOutCubic(k);
    const inch = D.tension * 10 * dp.sc + D.step * 24 * dp.sc;
    dp.x = lerp(dp.x0, dp.tx + inch, e);
    dp.y = lerp(yb, gy + dp.yo, e);
    dp.cs = lerp(dp.sc * 0.7, dp.sc, e);
    const g = dp.P;
    if (k < 1) {
      dp.phase += dt * 11;
      const sw = Math.sin(dp.phase);
      for (let i = 0; i < NP; i++) g[i] = AIM[i];
      g[NX] = 40;
      g[NY] = -138;
      g[FX] = 36;
      g[FY] = -136;
      g[LEAN] = 0.2;
      g[LX] = sw * 20;
      g[LY] = -Math.max(0, Math.cos(dp.phase)) * 12;
      g[RX] = -sw * 20;
      g[RY] = -Math.max(0, -Math.cos(dp.phase)) * 12;
    } else {
      if (!dp.racked) {
        dp.racked = true;
        if (bus) noise(bus, { duration: 0.04, gain: 0.16, freq: 2800, q: 0.6, type: 'highpass' });
      }
      const tr = (0.4 + D.tension * 0.6) * (D.beat === 3 ? 1 : 0.3);
      for (let i = 0; i < NP; i++) g[i] = AIM[i];
      g[NY] += Math.sin(s.cht * 23 + dp.phase) * tr;
      g[FY] = g[NY] + 2;
      g[HY] += Math.sin(s.cht * 2 + dp.phase) * 0.6;
      g[LEAN] = 0.05 + D.tension * 0.02;
    }
    solve(dp.pose, g, 1, 1);
  }
  dinerPose(s, env, dt);

  // camera: still at first, then pushing in on him while the standoff stretches
  const z = 1.03 + (D.beat >= 2 ? 0.012 : 0) + (D.beat >= 3 ? D.tension * 0.02 : 0) + D.hands * 0.015;
  s.camZ = damp(s.camZ, z, 2, dt);
  s.camX = damp(s.camX, D.rxS - 20 * R, 2, dt);
  s.camY = damp(s.camY, gy - 170 * R, 2, dt);
}

function dinerRelease(s: State, env: SceneEnv) {
  const D = s.D;
  if (D.beat !== 3 || !D.hold) return;
  D.hold = false;
  if (D.held < 0.2) return;
  D.beat = 4;
  D.bt = 0;
  env.wake(4000);
}

function dinerDown(s: State, env: SceneEnv) {
  const D = s.D;
  s.touched = true;
  s.idle = 0;
  if (D.beat === 3) {
    D.hold = true;
    env.wake(6000);
  } else if (D.beat === 4) {
    if (D.bt > 1.2) go(s, env, 1);
  } else {
    // a click moves the morning along to its next beat
    D.bt = Math.max(D.bt, DINER_BEATS[D.beat] - 0.01);
    env.wake(2600);
  }
}

function drawCar(c: CanvasRenderingContext2D, car: Car, base: number, len: number, t: number, lit: number) {
  const ch = len * 0.26;
  c.save();
  c.translate(car.x, base);
  c.rotate(car.tilt);
  // body: black and white with a light bar
  c.fillStyle = '#16171b';
  c.beginPath();
  c.moveTo(-len / 2, -ch * 0.15);
  c.lineTo(-len / 2, -ch * 0.55);
  c.lineTo(-len * 0.3, -ch * 0.6);
  c.lineTo(-len * 0.18, -ch);
  c.lineTo(len * 0.2, -ch);
  c.lineTo(len * 0.32, -ch * 0.6);
  c.lineTo(len / 2, -ch * 0.52);
  c.lineTo(len / 2, -ch * 0.15);
  c.closePath();
  c.fill();
  c.fillStyle = '#e9e7e2';
  c.fillRect(-len * 0.22, -ch * 0.58, len * 0.44, ch * 0.36);
  c.fillStyle = 'rgba(150,180,200,0.7)';
  c.fillRect(-len * 0.15, -ch * 0.92, len * 0.14, ch * 0.3);
  c.fillRect(len * 0.02, -ch * 0.92, len * 0.15, ch * 0.3);
  c.fillStyle = '#0b0b0d';
  for (const wx of [-0.32, 0.32]) {
    c.beginPath();
    c.arc(len * wx, -ch * 0.12, ch * 0.2, 0, TAU);
    c.fill();
  }
  const on = Math.sin(t * 13) > 0;
  c.fillStyle = on ? '#ff3040' : '#3a1a1e';
  c.fillRect(-len * 0.08, -ch * 1.1, len * 0.08, ch * 0.1);
  c.fillStyle = on ? '#1c2440' : '#3a6cff';
  c.fillRect(0, -ch * 1.1, len * 0.08, ch * 0.1);
  c.restore();
  void lit;
}

function drawDeputyExtras(c: CanvasRenderingContext2D, p: Pose) {
  // campaign hat and a pistol in the near hand
  const hx = p[J.HEAD * 2];
  const hy = p[J.HEAD * 2 + 1];
  c.fillStyle = '#6b5532';
  c.beginPath();
  c.ellipse(hx, hy - 8, 16, 3.2, 0, 0, TAU);
  c.fill();
  c.beginPath();
  c.moveTo(hx - 8, hy - 8);
  c.lineTo(hx - 6, hy - 18);
  c.lineTo(hx, hy - 15);
  c.lineTo(hx + 6, hy - 18);
  c.lineTo(hx + 8, hy - 8);
  c.closePath();
  c.fill();
  c.fillStyle = '#2a2014';
  c.fillRect(hx - 8, hy - 10, 16, 2);
  const nx = p[J.HAND_N * 2];
  const ny = p[J.HAND_N * 2 + 1];
  c.fillStyle = '#121216';
  c.fillRect(nx - 2, ny - 7, 17, 5);
  c.fillRect(nx - 2, ny - 4, 6, 10);
}

function drawDiner(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h, dpr } = env;
  const D = s.D;
  const R = D.kd * SCALE_R;
  const gy = s.ground;
  if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
  const carLen = Math.min(w * 0.2, (D.wx1 - D.wx0) * 0.3);
  for (const car of D.cars) drawCar(ctx, car, D.road + carLen * 0.05, carLen, t, 1);
  const copA = D.beat === 0 ? 0 : D.beat === 1 ? clamp((D.bt - 0.9) / 0.6, 0, 1) : 1;
  const on = Math.sin(t * 13) > 0;
  ctx.globalCompositeOperation = 'lighter';
  for (const car of D.cars) glow(ctx, on ? s.red : s.blue, car.x + (on ? -carLen * 0.04 : carLen * 0.04), D.road - carLen * 0.3, carLen * 0.7, 0.8 * copA);
  ctx.globalCompositeOperation = 'source-over';
  if (s.bg2) ctx.drawImage(s.bg2, 0, 0, w, h);

  // the glass door, flung open by the first deputy through it
  const yb = gy - h * 0.07;
  const dw = D.dx1 - D.dx0;
  const open = D.door;
  const pw = dw * (1 - open * 0.82);
  ctx.fillStyle = 'rgba(200,220,230,0.22)';
  ctx.fillRect(D.dx0, D.dy0, pw, yb - D.dy0);
  ctx.strokeStyle = '#9ea7ad';
  ctx.lineWidth = 5;
  ctx.strokeRect(D.dx0 + 2, D.dy0 + 2, pw - 4, yb - D.dy0 - 4);
  ctx.fillStyle = '#9ea7ad';
  ctx.fillRect(D.dx0 + pw * 0.75, D.dy0 + (yb - D.dy0) * 0.5, Math.max(2, pw * 0.08), 4);

  // pendant glow, sun through the glass and the patrol lights sweeping the room
  ctx.globalCompositeOperation = 'lighter';
  for (const px of [0.32, 0.58, 0.84]) glow(ctx, s.amber, w * px, h * 0.12, w * 0.09, 0.55);
  const panes = 5;
  const pwid = (D.wx1 - D.wx0) / panes;
  const fall = (gy - D.wy1) * 0.6;
  for (let i = 1; i < panes; i++) {
    const a0 = D.wx0 + i * pwid + pwid * 0.12;
    const a1 = a0 + pwid * 0.62;
    const sh = ctx.createLinearGradient(0, D.wy1, 0, gy);
    sh.addColorStop(0, 'rgba(255,226,170,0.13)');
    sh.addColorStop(1, 'rgba(255,226,170,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.moveTo(a0, D.wy0 + (D.wy1 - D.wy0) * 0.22);
    ctx.lineTo(a1, D.wy0 + (D.wy1 - D.wy0) * 0.22);
    ctx.lineTo(a1 - fall, gy);
    ctx.lineTo(a0 - fall, gy);
    ctx.closePath();
    ctx.fill();
  }
  if (copA > 0) {
    for (const car of D.cars) glow(ctx, on ? s.red : s.blue, car.x, D.wy1, w * 0.36, 0.18 * copA);
    glow(ctx, on ? s.blue : s.red, D.dx1, yb - h * 0.2, w * 0.25, 0.22 * copA * open);
  }
  ctx.globalCompositeOperation = 'source-over';

  // figures in one lit layer: deputies behind and beside him, Reacher on his stool
  const fig = s.fig;
  const fc = fig ? (fig.getContext('2d') as CanvasRenderingContext2D) : null;
  const mugHeld = D.beat === 3 || (D.beat === 4 && D.bt < 0.45);
  if (fig && fc) {
    fc.setTransform(dpr, 0, 0, dpr, 0, 0);
    fc.globalCompositeOperation = 'source-over';
    fc.globalAlpha = 1;
    fc.clearRect(0, 0, w, h);
    const drawDep = (dp: Deputy) => {
      if (dp.x < -500) return;
      fc.save();
      fc.translate(dp.x, dp.y);
      fc.scale(D.kd * dp.cs, D.kd * dp.cs);
      drawFigure(fc, dp.pose, DEPUTY, 1, (c, stage) => {
        if (stage === 'top') drawDeputyExtras(c, dp.pose);
      });
      fc.restore();
    };
    if (D.deps[0]) drawDep(D.deps[0]);
    if (D.deps[1]) drawDep(D.deps[1]);
    fc.save();
    fc.translate(D.rxS, gy);
    fc.scale(R, R);
    drawFigure(fc, s.pose, REACHER, 1, (c, stage) => {
      if (stage !== 'top') return;
      const nx = s.pose[J.HAND_N * 2];
      const ny = s.pose[J.HAND_N * 2 + 1];
      if (mugHeld) {
        c.fillStyle = '#ece6da';
        c.beginPath();
        c.roundRect(nx - 1, ny - 12, 10, 12, [1, 1, 3, 3]);
        c.fill();
        c.strokeStyle = '#ece6da';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(nx - 2, ny - 6, 3.2, Math.PI * 0.5, Math.PI * 1.5);
        c.stroke();
      } else if (D.beat <= 1) {
        c.strokeStyle = '#c9d0d4';
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(nx + 2, ny - 2);
        c.lineTo(nx + 13, ny - 6);
        c.stroke();
      }
    });
    fc.restore();
    if (D.deps[2]) drawDep(D.deps[2]);
    fc.globalCompositeOperation = 'source-atop';
    const vg = fc.createLinearGradient(0, h * 0.1, 0, gy);
    vg.addColorStop(0, 'rgba(255,240,215,0.1)');
    vg.addColorStop(0.5, 'rgba(255,240,215,0)');
    vg.addColorStop(1, 'rgba(24,14,8,0.4)');
    fc.fillStyle = vg;
    fc.fillRect(0, 0, w, h);
    const bl = fc.createLinearGradient(w, 0, w * 0.3, 0);
    bl.addColorStop(0, 'rgba(255,214,160,0.16)');
    bl.addColorStop(1, 'rgba(255,214,160,0)');
    fc.fillStyle = bl;
    fc.fillRect(0, 0, w, h);
    if (copA > 0) {
      fc.fillStyle = on ? `rgba(255,40,60,${(0.1 * copA).toFixed(3)})` : `rgba(60,110,255,${(0.1 * copA).toFixed(3)})`;
      fc.fillRect(0, 0, w, h);
    }
    fc.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const dp of D.deps) {
      if (dp.x < -500) continue;
      ctx.beginPath();
      ctx.ellipse(dp.x, dp.y + 2, 30 * D.kd * dp.cs, 5 * D.kd * dp.cs, 0, 0, TAU);
      ctx.fill();
    }
    ctx.drawImage(fig, 0, 0, w, h);
  }
  if (s.bg3) ctx.drawImage(s.bg3, 0, 0, w, h);

  // plate and the slice that is left, and the mug when it is down on the counter
  const px = D.rxS + 56 * R;
  ctx.fillStyle = '#f4f1ea';
  ctx.beginPath();
  ctx.ellipse(px, D.ctop - 1, 15 * R, 2.6 * R, 0, 0, TAU);
  ctx.fill();
  const left = 1 - D.bites * 0.15;
  if (left > 0.05) {
    const pl = 20 * R * left;
    ctx.fillStyle = '#d99a4e';
    ctx.beginPath();
    ctx.moveTo(px - pl * 0.5, D.ctop - 2);
    ctx.lineTo(px + pl * 0.5, D.ctop - 2);
    ctx.lineTo(px + pl * 0.5, D.ctop - 9 * R);
    ctx.lineTo(px - pl * 0.5, D.ctop - 5 * R);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8c2a3a';
    ctx.fillRect(px - pl * 0.5, D.ctop - 5 * R, pl, 2.2 * R);
  }
  if (!mugHeld) {
    const mx = D.rxS + 36 * R;
    ctx.fillStyle = '#ece6da';
    ctx.beginPath();
    ctx.roundRect(mx - R, D.ctop - 12 * R, 10 * R, 12 * R, [R, R, 3 * R, 3 * R]);
    ctx.fill();
    ctx.strokeStyle = '#ece6da';
    ctx.lineWidth = 2 * R;
    ctx.beginPath();
    ctx.arc(mx - 2 * R, D.ctop - 6 * R, 3.2 * R, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    if (D.beat <= 2) {
      // a thread of steam
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx + 4 * R, D.ctop - 13 * R);
      ctx.bezierCurveTo(mx + 1 * R, D.ctop - 18 * R, mx + 8 * R, D.ctop - 22 * R, mx + 4 * R + Math.sin(t * 2) * 2 * R, D.ctop - 28 * R);
      ctx.stroke();
    }
  }

  // dust turning in the sunlight
  ctx.globalCompositeOperation = 'lighter';
  for (const m of D.motes) {
    const mx = (m.x * w + Math.sin(t * 0.3 * m.v + m.p) * 20) % w;
    const my = h * 0.2 + ((m.y + t * 0.01 * m.v) % 1) * h * 0.6;
    glow(ctx, s.dust, mx, my, 2.2 + m.v * 1.6, 0.35);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- chapter two: the cellblock washroom ---------- */

function paintJail(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const R0 = mulberry(23);
  const rr = (lo: number, hi: number) => lo + R0() * (hi - lo);
  const gy = h * 0.84;
  s.ground = gy;
  const yb = gy - h * 0.1;
  const side = Math.max(16, w * 0.06);
  s.wallX = (w / 2 - side) / s.k - 22;
  const { cv, c } = layer(s.bg, w, h, dpr);
  s.bg = cv;
  // back wall: institutional green tile, grime gathering low
  c.fillStyle = '#9fb09c';
  c.fillRect(0, 0, w, yb);
  const ts = Math.max(14, Math.round(w * 0.028));
  for (let y = 0; y < yb; y += ts) {
    for (let x = 0; x < w; x += ts) {
      const v = rr(-10, 10);
      c.fillStyle = `rgb(${Math.round(160 + v)},${Math.round(178 + v)},${Math.round(156 + v)})`;
      c.fillRect(x + 1, y + 1, ts - 2, ts - 2);
    }
  }
  const lowT = yb - h * 0.2;
  c.fillStyle = 'rgba(40,70,52,0.75)';
  c.fillRect(0, lowT, w, yb - lowT);
  c.fillStyle = 'rgba(20,30,24,0.5)';
  c.fillRect(0, lowT - 3, w, 3);
  const grime = c.createLinearGradient(0, 0, 0, yb);
  grime.addColorStop(0, 'rgba(20,24,18,0.55)');
  grime.addColorStop(0.4, 'rgba(20,24,18,0.1)');
  grime.addColorStop(1, 'rgba(30,26,16,0.45)');
  c.fillStyle = grime;
  c.fillRect(0, 0, w, yb);
  // a high barred window with flat daylight
  const wx = w * 0.16;
  const wy = h * 0.07;
  const ww = w * 0.12;
  const wh = h * 0.12;
  c.fillStyle = '#e9f0e4';
  c.fillRect(wx, wy, ww, wh);
  c.fillStyle = '#2a302c';
  for (let i = 0; i <= 5; i++) c.fillRect(wx + (ww * i) / 5 - 2, wy, 4, wh);
  c.fillRect(wx - 4, wy - 4, ww + 8, 5);
  c.fillRect(wx - 4, wy + wh - 1, ww + 8, 5);
  // mirrors and steel sinks
  for (const mx of [0.36, 0.54, 0.72]) {
    const x = w * mx;
    const mw = w * 0.1;
    const my = h * 0.2;
    const mh = h * 0.17;
    c.fillStyle = '#7d8783';
    c.fillRect(x - mw / 2 - 3, my - 3, mw + 6, mh + 6);
    const mg = c.createLinearGradient(x - mw / 2, my, x + mw / 2, my + mh);
    mg.addColorStop(0, '#3c4643');
    mg.addColorStop(0.5, '#5d6864');
    mg.addColorStop(1, '#2b3330');
    c.fillStyle = mg;
    c.fillRect(x - mw / 2, my, mw, mh);
    c.strokeStyle = 'rgba(230,240,235,0.25)';
    c.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      const sx = x + rr(-mw / 2, mw / 2);
      const sy = my + rr(0, mh);
      c.moveTo(sx, sy);
      c.lineTo(sx + rr(-14, 14), sy + rr(-10, 10));
      c.stroke();
    }
    const sy = h * 0.43;
    c.fillStyle = '#b6bcbd';
    c.beginPath();
    c.moveTo(x - mw * 0.48, sy);
    c.lineTo(x + mw * 0.48, sy);
    c.lineTo(x + mw * 0.38, sy + h * 0.05);
    c.lineTo(x - mw * 0.38, sy + h * 0.05);
    c.closePath();
    c.fill();
    c.fillStyle = '#4b5252';
    c.fillRect(x - mw * 0.4, sy, mw * 0.8, 3);
    c.fillStyle = '#8f9696';
    c.fillRect(x - 2, sy - h * 0.025, 4, h * 0.025);
    c.fillRect(x - 2, sy - h * 0.025, 12, 3);
    c.fillStyle = '#6f7676';
    c.fillRect(x - 3, sy + h * 0.05, 6, yb - sy - h * 0.05);
    c.fillStyle = 'rgba(60,46,24,0.35)';
    c.fillRect(x - 6, sy + h * 0.05, 12, (yb - sy) * 0.5);
  }
  // floor: sealed concrete, a drain, a wet patch
  const fl = c.createLinearGradient(0, yb, 0, h);
  fl.addColorStop(0, '#4a4d48');
  fl.addColorStop(1, '#1f201e');
  c.fillStyle = fl;
  c.fillRect(0, yb, w, h - yb);
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 1.5;
  for (let i = -8; i <= 8; i++) {
    c.beginPath();
    c.moveTo(w / 2 + i * w * 0.07, yb);
    c.lineTo(w / 2 + i * w * 0.2, h);
    c.stroke();
  }
  for (let y = yb + 12; y < h; y += (y - yb) * 0.45 + 10) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  c.fillStyle = 'rgba(160,190,180,0.07)';
  c.beginPath();
  c.ellipse(w * 0.66, gy + h * 0.07, w * 0.16, h * 0.025, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#121312';
  c.beginPath();
  c.ellipse(w * 0.66, gy + h * 0.07, w * 0.018, h * 0.007, 0, 0, TAU);
  c.fill();
  // the side walls he puts them into
  for (const sd of [-1, 1]) {
    const x0 = sd < 0 ? 0 : w;
    const x1 = sd < 0 ? side : w - side;
    const sg = c.createLinearGradient(x0, 0, x1, 0);
    sg.addColorStop(0, '#5f6e5e');
    sg.addColorStop(1, '#8a9a88');
    c.fillStyle = sg;
    c.fillRect(Math.min(x0, x1), 0, side, h);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < h; y += ts) c.fillRect(Math.min(x0, x1), y, side, 1);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(x1 - (sd < 0 ? 2 : 0), 0, 2, h);
  }
  // fixture housing
  c.fillStyle = '#2a2d2a';
  c.fillRect(w * 0.39, h * 0.025, w * 0.22, h * 0.014);
  c.strokeStyle = '#2a2d2a';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(w * 0.41, 0);
  c.lineTo(w * 0.41, h * 0.025);
  c.moveTo(w * 0.59, 0);
  c.lineTo(w * 0.59, h * 0.025);
  c.stroke();
}

function drawJail(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const k = s.k;
  const cx = w / 2;
  const gy = s.ground;
  if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
  const tube = s.tube;
  // cracked tiles where men went into the walls
  const side = Math.max(16, w * 0.06);
  ctx.strokeStyle = 'rgba(28,34,28,0.85)';
  ctx.lineWidth = 1.4;
  for (const cr of s.cracks) {
    const x = cr.side > 0 ? w - side : side;
    const y = gy + cr.y * k;
    const R = mulberry(Math.floor(cr.seed));
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = -cr.side * (Math.PI / 2) + (R() - 0.5) * Math.PI * 1.4;
      const l = (14 + R() * 34) * k;
      ctx.moveTo(x - cr.side * 2, y);
      const mx = x + Math.cos(a) * l * 0.5 * 0.4;
      const my = y + Math.sin(a) * l * 0.5;
      ctx.lineTo(mx, my);
      ctx.lineTo(x + Math.cos(a) * l * 0.4, y + Math.sin(a) * l);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,24,20,0.5)';
    ctx.beginPath();
    ctx.ellipse(x, y, 6 * k * 0.4, 12 * k, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, s.cold, cx, h * 0.04, w * 0.55, 0.45 * tube);
  ctx.strokeStyle = `rgba(235,255,245,${(0.9 * tube).toFixed(3)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.4, h * 0.043);
  ctx.lineTo(w * 0.6, h * 0.043);
  ctx.stroke();
  // daylight slanting down from the high window
  const sh = ctx.createLinearGradient(0, h * 0.07, 0, gy);
  sh.addColorStop(0, 'rgba(240,250,230,0.12)');
  sh.addColorStop(1, 'rgba(240,250,230,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.moveTo(w * 0.16, h * 0.19);
  ctx.lineTo(w * 0.28, h * 0.19);
  ctx.lineTo(w * 0.52, gy);
  ctx.lineTo(w * 0.3, gy);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const fig = paintFighters(s, env, t, REACHER_JAIL, (fc) => {
    const vg = fc.createLinearGradient(0, gy - 240 * k * SCALE_R, 0, gy);
    vg.addColorStop(0, `rgba(220,255,235,${(0.14 * tube).toFixed(3)})`);
    vg.addColorStop(0.45, 'rgba(220,255,235,0)');
    vg.addColorStop(1, 'rgba(4,10,8,0.55)');
    fc.fillStyle = vg;
    fc.fillRect(0, 0, w, h);
    fc.fillStyle = `rgba(0,10,6,${(0.35 * (1 - tube)).toFixed(3)})`;
    fc.fillRect(0, 0, w, h);
  });
  if (fig) {
    reflect(ctx, env, fig, gy, 0.12, t);
    drawShadows(ctx, s, cx, gy);
    ctx.drawImage(fig, 0, 0, w, h);
  }
  drawImpact(ctx, s, env);
}

/* ---------- shared rendering ---------- */

function drawThug(c: CanvasRenderingContext2D, s: State, th: Thug, cx: number, gy: number) {
  const k = s.k;
  c.save();
  c.translate(cx + th.x * k, gy + th.y * k);
  c.rotate(th.rot);
  c.scale(k, k);
  c.globalAlpha = th.fade;
  const list = s.ch === 1 ? INMATE_STYLES : THUG_STYLES;
  drawFigure(c, th.pose, list[th.style % list.length], -th.side);
  c.restore();
}

/** Every fighter in one offscreen layer, then the chapter's light laid over them as a group */
function paintFighters(s: State, env: SceneEnv, t: number, style: FigureStyle, light: (fc: CanvasRenderingContext2D) => void) {
  const { w, h, dpr } = env;
  const fig = s.fig;
  const fc = fig ? (fig.getContext('2d') as CanvasRenderingContext2D) : null;
  if (!fig || !fc) return null;
  const k = s.k;
  const cx = w / 2;
  const gy = s.ground;
  fc.setTransform(dpr, 0, 0, dpr, 0, 0);
  fc.globalCompositeOperation = 'source-over';
  fc.globalAlpha = 1;
  fc.clearRect(0, 0, w, h);
  for (const th of s.thugs) if (isDown(th)) drawThug(fc, s, th, cx, gy);
  for (const th of s.thugs) if (th.st !== 'off' && !isDown(th)) drawThug(fc, s, th, cx, gy);
  fc.save();
  fc.translate(cx + s.rx * k, gy);
  fc.scale(k * SCALE_R, k * SCALE_R);
  drawFigure(fc, s.pose, style, s.face);
  fc.restore();
  fc.globalCompositeOperation = 'source-atop';
  light(fc);
  if (s.flash > 0) {
    const fx = cx + s.fx * k;
    const fy = gy + s.fy * k;
    const fg = fc.createRadialGradient(fx, fy, 0, fx, fy, 160 * k);
    fg.addColorStop(0, `rgba(255,245,225,${(0.6 * s.flash).toFixed(3)})`);
    fg.addColorStop(1, 'rgba(255,245,225,0)');
    fc.fillStyle = fg;
    fc.fillRect(0, 0, w, h);
  }
  if (s.cops > 0) {
    const on = Math.sin(t * 14) > 0;
    const cg = fc.createLinearGradient(0, 0, w, 0);
    const a = Math.min(1, s.cops * 2) * 0.35;
    cg.addColorStop(0, on ? `rgba(255,40,60,${a.toFixed(3)})` : 'rgba(0,0,0,0)');
    cg.addColorStop(1, on ? 'rgba(0,0,0,0)' : `rgba(60,110,255,${a.toFixed(3)})`);
    fc.fillStyle = cg;
    fc.fillRect(0, 0, w, h);
  }
  fc.globalCompositeOperation = 'source-over';
  return fig;
}

/** The figure layer mirrored under the ground line in rippling strips */
function reflect(ctx: CanvasRenderingContext2D, env: SceneEnv, fig: HTMLCanvasElement, gy: number, alpha: number, t: number) {
  const { w, h, dpr } = env;
  const depth = h - gy + 30;
  const strip = 5;
  ctx.save();
  ctx.translate(0, 2 * gy);
  ctx.scale(1, -1);
  for (let d = 0; d < depth; d += strip) {
    const wob = Math.sin(t * 3 + d * 0.21) * (1 + d * 0.04);
    ctx.globalAlpha = alpha * (1 - d / depth);
    ctx.drawImage(fig, 0, (gy - d - strip) * dpr, w * dpr, strip * dpr, wob, gy - d - strip, w, strip);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawShadows(ctx: CanvasRenderingContext2D, s: State, cx: number, gy: number) {
  const k = s.k;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (const th of s.thugs) {
    if (th.st === 'off') continue;
    ctx.globalAlpha = th.fade * clamp(1 + th.y / 120, 0.2, 1);
    ctx.beginPath();
    ctx.ellipse(cx + th.x * k, gy + 3, (th.st === 'down' ? 90 : th.st === 'slump' ? 60 : 34) * k, 6 * k, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.ellipse(cx + s.rx * k, gy + 3, 46 * k, 8 * k, 0, 0, TAU);
  ctx.fill();
}

/** A white hot bloom, streaks thrown along the blow, a ring of spray and the particles */
function drawImpact(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv) {
  const { w } = env;
  const k = s.k;
  const cx = w / 2;
  const gy = s.ground;
  ctx.globalCompositeOperation = 'lighter';
  if (s.flash > 0) {
    const fx = cx + s.fx * k;
    const fy = gy + s.fy * k;
    glow(ctx, s.hot, fx, fy, 70 * k * (1.5 - s.flash * 0.5), s.flash);
    ctx.strokeStyle = `rgba(255,244,228,${(s.flash * 0.85).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.2;
      const along = Math.max(0, Math.cos(a) * s.fdir);
      const r0 = 12 * k;
      const r1 = (24 + (i % 2) * 16 + along * 40) * k * (1.7 - s.flash * 0.7);
      ctx.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0);
      ctx.lineTo(fx + Math.cos(a) * r1, fy + Math.sin(a) * r1);
    }
    ctx.stroke();
  }
  if (s.ring > 0) {
    const fx = cx + s.fx * k;
    const fy = gy + s.fy * k;
    const rr = (1 - s.ring) * 90 * k;
    ctx.strokeStyle = `rgba(210,225,255,${(s.ring * 0.55).toFixed(3)})`;
    ctx.lineWidth = 1 + s.ring * 3;
    ctx.beginPath();
    ctx.ellipse(fx, fy, rr, rr * 0.8, 0, 0, TAU);
    ctx.stroke();
  }
  for (const p of s.parts.items) {
    if (p.life <= 0) continue;
    const f = p.life / p.max;
    if (p.kind === 2) glow(ctx, s.dust, cx + p.x * k, gy + p.y * k, p.size * k * 2.4, 0.5 * f);
    else glow(ctx, s.drop, cx + p.x * k, gy + p.y * k, p.size * k * 1.3, (p.kind === 3 ? 0.55 : 0.8) * f);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawLot(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const k = s.k;
  const cx = w / 2;
  const gy = s.ground;
  const L = s.L;
  // rain streak length follows the frame so small tiles do not look like a downpour of sticks
  const rs = clamp(h / 720, 0.45, 1.3);
  if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);

  // lightning: the whole sky flares, a bolt over the empty road
  ctx.globalCompositeOperation = 'lighter';
  if (s.light > 0) {
    const fl = s.light * (0.6 + 0.4 * Math.abs(Math.sin(t * 40)));
    const lg = ctx.createLinearGradient(0, 0, 0, L.db);
    lg.addColorStop(0, `rgba(150,170,230,${(fl * 0.4).toFixed(3)})`);
    lg.addColorStop(1, `rgba(120,130,200,${(fl * 0.08).toFixed(3)})`);
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, L.db);
    if (s.light > 0.45 && s.bolt.length) {
      const ba = Math.min(1, (s.light - 0.45) * 2.4);
      ctx.beginPath();
      for (let i = 0; i < s.bolt.length; i += 2) {
        const x = s.bolt[i] * w;
        const y = s.bolt[i + 1] * L.hor;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(140,160,255,${(ba * 0.3).toFixed(3)})`;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = `rgba(230,236,255,${ba.toFixed(3)})`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
  }

  // the diner sign: tall red DINER, an amber EAT arrow with chasing bulbs
  const { sx, sTop, sW, sH, ax, ay, aw, ah } = L;
  const avg = s.flick.reduce((a, b) => a + b, 0) / s.flick.length;
  glow(ctx, s.red, sx, sTop + sH * 0.5, sH * 0.75, 0.5 * avg);
  glow(ctx, s.red, L.dx + L.dw * 0.5, L.db - L.dh * 0.9, L.dw * 0.5, 0.12 * avg);
  const gh = sH / 5 - sW * 0.26;
  const gw = sW * 0.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const letters = 'DINER';
  for (let i = 0; i < 5; i++) {
    const f = s.flick[i];
    const lx0 = sx - gw / 2;
    const ly0 = sTop + sW * 0.2 + (i * (sH - sW * 0.4)) / 5 + sW * 0.06;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(70,22,30,0.9)';
    ctx.lineWidth = Math.max(2, sW * 0.09);
    ctx.beginPath();
    glyphPath(ctx, letters[i], lx0, ly0, gw, gh);
    ctx.stroke();
    if (f < 0.05) continue;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, s.red, sx, ly0 + gh / 2, sW * 0.9, 0.45 * f);
    ctx.strokeStyle = `rgba(255,40,80,${(0.45 * f).toFixed(3)})`;
    ctx.lineWidth = Math.max(4, sW * 0.2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,214,222,${(0.95 * f).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.4, sW * 0.06);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  const eat = s.flick[0] * 0.3 + 0.7;
  glow(ctx, s.amber, ax, ay, aw * 0.75, 0.35 * eat);
  const ew = ah * 0.42;
  const eh = ah * 0.52;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) glyphPath(ctx, 'EAT'[i], ax - aw * 0.12 + i * ew * 1.5, ay - eh / 2, ew, eh);
  ctx.strokeStyle = `rgba(255,170,60,${(0.5 * eat).toFixed(3)})`;
  ctx.lineWidth = Math.max(3, ah * 0.14);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,236,190,${(0.95 * eat).toFixed(3)})`;
  ctx.lineWidth = Math.max(1.2, ah * 0.05);
  ctx.stroke();
  // bulbs chasing round the arrow toward the door
  const bulbs = 14;
  const chase = Math.floor(t * 9);
  for (let i = 0; i < bulbs; i++) {
    const u = i / bulbs;
    if ((i + chase) % 3 !== 0) continue;
    const bx = u < 0.5 ? ax + aw / 2 - u * 2 * (aw - ah * 0.6) : ax - aw / 2 + ah * 0.6 + (u - 0.5) * 2 * (aw - ah * 0.6);
    const by = u < 0.5 ? ay - ah / 2 + 2 : ay + ah / 2 - 2;
    glow(ctx, s.amber, bx, by, ah * 0.32, 0.9);
  }

  // a bus rolls past on the highway now and then, behind the diner
  const bp = (s.bus % 17) / 17;
  if (bp < 0.38) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(L.dx - 8, L.db - L.dh * 1.2, L.dw + 16, L.dh * 1.3);
    ctx.rect(sx - sW / 2 - 2, sTop - 2, sW + 4, L.db - sTop);
    ctx.clip('evenodd');
    const bl = Math.min(200, w * 0.2);
    const bhh = bl * 0.2;
    const bx = lerp(w + bl, -bl * 1.3, bp / 0.38);
    const byy = L.hor + h * 0.018;
    ctx.fillStyle = '#171c27';
    ctx.beginPath();
    ctx.roundRect(bx, byy - bhh, bl, bhh, [bhh * 0.3, bhh * 0.2, 2, 2]);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,160,175,0.3)';
    ctx.fillRect(bx, byy - bhh * 0.32, bl, bhh * 0.08);
    ctx.fillStyle = 'rgba(255,214,150,0.5)';
    for (let i = 0; i < 9; i++) ctx.fillRect(bx + bl * 0.08 + i * bl * 0.1, byy - bhh * 0.78, bl * 0.07, bhh * 0.32);
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(bx, 0, bx - bl * 1.6, 0);
    beam.addColorStop(0, 'rgba(255,230,180,0.14)');
    beam.addColorStop(1, 'rgba(255,230,180,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(bx, byy - bhh * 0.36);
    ctx.lineTo(bx - bl * 1.1, byy - bhh * 1.1);
    ctx.lineTo(bx - bl * 1.1, byy + bhh * 0.3);
    ctx.lineTo(bx, byy - bhh * 0.2);
    ctx.closePath();
    ctx.fill();
    glow(ctx, s.amber, bx + 2, byy - bhh * 0.3, bhh * 1.3, 0.9);
    glow(ctx, s.red, bx + bl, byy - bhh * 0.3, bhh * 0.6, 0.6);
    ctx.restore();
  }

  // neon and lamp light lying on the wet lot
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,40,80,${(0.16 * avg).toFixed(3)})`;
  for (let i = 0; i < 7; i++) {
    const wob = Math.sin(t * 2.3 + i * 1.7) * 2;
    ctx.fillRect(sx - sW * 0.35 + (i * sW * 0.7) / 6 + wob, L.db + 2, 2, (h - L.db) * (0.5 + 0.06 * Math.sin(i * 2.1)));
  }
  glow(ctx, s.red, sx, lerp(L.db, h, 0.35), sW * 3.2, 0.14 * avg);
  glow(ctx, s.amber, L.lx, gy, Math.min(w * 0.42, 380 * k), 0.5);
  glow(ctx, s.amber, L.lx, L.ly + 6, 70, 1);
  glow(ctx, s.hot, L.lx, L.ly + 7, 18, 0.9);

  // ripples spreading in the puddles
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(200,215,240,0.22)';
  ctx.lineWidth = 1;
  for (const sp of s.splashes) {
    const x = sp.x * w;
    const y = lerp(L.db + 6, h, sp.y);
    const r = sp.age * 10 * sp.size * (0.5 + sp.y);
    ctx.globalAlpha = 1 - sp.age;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.3, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // mist drifting over the lot behind the fighters
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const mx = ((i * 0.23 + t * 0.012 * (1 + i * 0.2)) % 1.3) * w - w * 0.15;
    glow(ctx, s.mist, mx, gy - h * 0.06 + (i % 2) * h * 0.04, w * 0.22, 0.55);
  }
  ctx.globalCompositeOperation = 'source-over';

  const fig = paintFighters(s, env, t, REACHER, (fc) => {
    // warm from the lamp overhead, legs falling into shadow, the red neon from the right
    const top = gy - 240 * k * SCALE_R;
    const vg = fc.createLinearGradient(0, top, 0, gy);
    vg.addColorStop(0, 'rgba(255,190,120,0.1)');
    vg.addColorStop(0.45, 'rgba(255,170,100,0)');
    vg.addColorStop(1, 'rgba(4,6,16,0.6)');
    fc.fillStyle = vg;
    fc.fillRect(0, 0, w, h);
    const ng = fc.createLinearGradient(w, 0, w * 0.35, 0);
    ng.addColorStop(0, `rgba(255,40,80,${(0.3 * avg).toFixed(3)})`);
    ng.addColorStop(1, 'rgba(255,40,80,0)');
    fc.fillStyle = ng;
    fc.fillRect(0, 0, w, h);
    const sg = fc.createLinearGradient(L.lx - w * 0.3, 0, L.lx + w * 0.3, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0.3)');
    sg.addColorStop(0.5, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(0,0,0,0.2)');
    fc.fillStyle = sg;
    fc.fillRect(0, 0, w, h);
    if (s.light > 0) {
      fc.fillStyle = `rgba(170,190,255,${(0.35 * s.light).toFixed(3)})`;
      fc.fillRect(0, 0, w, h);
    }
  });
  if (fig) {
    reflect(ctx, env, fig, gy, 0.42, t);
    drawShadows(ctx, s, cx, gy);
    ctx.drawImage(fig, 0, 0, w, h);
  }

  // the lamp's cone in the rain: soft volume, with the drops inside it lit gold
  ctx.globalCompositeOperation = 'lighter';
  ctx.save();
  if (s.cone) ctx.drawImage(s.cone, 0, 0, w, h);
  conePath(ctx, L, gy, w);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,200,130,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const r of s.rain) {
    const x = r.x * w;
    const y = r.y * h * 1.1 - h * 0.05;
    const l = 18 * r.l * rs;
    ctx.moveTo(x, y);
    ctx.lineTo(x - l * 0.1, y + l);
  }
  ctx.stroke();
  ctx.restore();

  drawImpact(ctx, s, env);

  // rain everywhere else, then a few heavy drops close to the lens
  ctx.strokeStyle = 'rgba(180,200,235,0.26)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const r of s.rain) {
    const x = r.x * w;
    const y = r.y * h * 1.1 - h * 0.05;
    const l = 18 * r.l * rs;
    ctx.moveTo(x, y);
    ctx.lineTo(x - l * 0.1, y + l);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,215,240,0.14)';
  ctx.lineWidth = Math.max(1, 2.4 * rs);
  ctx.beginPath();
  for (const r of s.near) {
    const x = r.x * w;
    const y = r.y * h * 1.2 - h * 0.1;
    const l = 46 * r.l * rs;
    ctx.moveTo(x, y);
    ctx.lineTo(x - l * 0.14, y + l);
  }
  ctx.stroke();

  // a thin band of mist hugging the puddles in front of everyone
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const mx = ((i * 0.31 + t * 0.016 * (1 + i * 0.25)) % 1.3) * w - w * 0.15;
    glow(ctx, s.mist, mx, h * 0.97, w * 0.2, 0.35);
  }
  // police lights sweep in after the lot is clear
  if (s.cops > 0) {
    const on = Math.sin(t * 14) > 0;
    const a = Math.min(1, s.cops * 2) * 0.55;
    glow(ctx, on ? s.red : s.blue, on ? -w * 0.05 : w * 1.05, h * 0.55, Math.max(w, h) * 0.7, a);
    glow(ctx, on ? s.blue : s.red, on ? w * 1.05 : -w * 0.05, h * 0.75, Math.max(w, h) * 0.5, a * 0.6);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- cinema: letterbox, subtitles, the chapter strip, title cards ---------- */

const SANS = 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

function stripRects(env: SceneEnv) {
  const fs = clamp(Math.min(env.w, env.h) * 0.026, 10, 14);
  const ph = Math.round(fs * 1.8);
  const pw = Math.round(fs * 2.8);
  const x0 = 12;
  const y0 = 10;
  return CHAPTERS.map((_, i) => ({ x: x0 + i * (pw + 6), y: y0, w: pw, h: ph, fs }));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const wd of words) {
    const next = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(next).width > max && cur) {
      lines.push(cur);
      cur = wd;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawCinema(s: State, env: SceneEnv) {
  const { ctx, w, h } = env;
  // letterbox
  const bh = s.bars * h * 0.1;
  if (bh > 0.5) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, bh);
    ctx.fillRect(0, h - bh, w, bh);
  }
  // fade to black between chapters
  let black = 0;
  if (s.go >= 0) black = clamp(s.goT / FADE, 0, 1);
  else if (s.card < CARD_END) black = s.card < CARD_HOLD ? 1 : clamp(1 - (s.card - CARD_HOLD) / 0.6, 0, 1);
  if (black > 0) {
    ctx.fillStyle = `rgba(0,0,0,${black.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  const fs = clamp(Math.min(w, h) * 0.036, 12, 22);
  // the title card
  if (s.go < 0 && s.card < CARD_END) {
    const a = s.card < 0.1 ? 0 : s.card < 0.45 ? (s.card - 0.1) / 0.35 : s.card < 1.3 ? 1 : clamp(1 - (s.card - 1.3) / 0.45, 0, 1);
    if (a > 0) {
      const C = CHAPTERS[s.ch];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(255,190,110,${(0.9 * a).toFixed(3)})`;
      ctx.font = `600 ${Math.round(fs * 0.8)}px ${SANS}`;
      ctx.fillText(`CHAPTER ${C.n}`.split('').join(' '), w / 2, h * 0.43);
      ctx.fillStyle = `rgba(245,240,230,${a.toFixed(3)})`;
      ctx.font = `${Math.round(fs * 2)}px ${SERIF}`;
      ctx.fillText(C.title.toUpperCase().split('').join(' '), w / 2, h * 0.5);
      ctx.fillStyle = `rgba(220,215,205,${(0.75 * a).toFixed(3)})`;
      ctx.font = `italic ${Math.round(fs * 0.85)}px ${SERIF}`;
      ctx.fillText(C.sub, w / 2, h * 0.57);
    }
  }
  // subtitles
  if (s.sub && s.go < 0 && s.card >= CARD_HOLD) {
    const sub = s.sub;
    const a = Math.min(1, sub.age / 0.15, Math.max(0, (sub.dur - sub.age) / 0.3));
    if (a > 0) {
      ctx.font = `${sub.who === 1 ? '' : 'italic '}500 ${Math.round(fs)}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrap(ctx, sub.text, w * 0.84);
      const lh = fs * 1.3;
      const yb = h - Math.max(h * 0.05, bh * 0.5) - (lines.length - 1) * lh * 0.5;
      lines.forEach((ln, i) => {
        const y = yb + (i - (lines.length - 1)) * lh + (lines.length - 1) * lh * 0.5;
        ctx.fillStyle = `rgba(0,0,0,${(0.7 * a).toFixed(3)})`;
        ctx.fillText(ln, w / 2 + 1, y + 1.5);
        ctx.fillStyle = sub.who === 1 ? `rgba(250,248,240,${a.toFixed(3)})` : `rgba(255,226,150,${a.toFixed(3)})`;
        ctx.fillText(ln, w / 2, y);
      });
    }
  }
  // chapter strip
  if (env.interactive) {
    const rects = stripRects(env);
    rects.forEach((r, i) => {
      const active = i === (s.go >= 0 ? s.go : s.ch);
      ctx.fillStyle = active ? 'rgba(255,190,110,0.92)' : 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
      ctx.fill();
      ctx.strokeStyle = active ? 'rgba(255,190,110,1)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = active ? '#1a120a' : 'rgba(255,255,255,0.85)';
      ctx.font = `600 ${Math.round(r.fs)}px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CHAPTERS[i].n, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
    });
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/* ---------- scene ---------- */

function primary(s: State, env: SceneEnv, side: number) {
  if (s.go >= 0 || s.card < CARD_HOLD) return;
  if (s.ch === 0) dinerDown(s, env);
  else strike(s, env, side, true);
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 0.75,
    init: (env) => {
      const s: State = {
        ch: 0,
        cht: 0,
        go: -1,
        goT: 0,
        card: 99,
        script: 0,
        endT: -1,
        sub: null,
        bars: 0,
        camX: env.w / 2,
        camY: env.h / 2,
        camZ: 1.05,
        rx: 0,
        face: 1,
        move: null,
        mt: 0,
        mside: 1,
        landed: false,
        combo: 0,
        comboT: 0,
        block: 0,
        P: GUARD.slice(),
        pose: newPose(),
        breathe: 0,
        thugs: Array.from({ length: MAX_THUGS }, newThug),
        wave: 0,
        clear: 0,
        spawnT: 0,
        queued: 0,
        touched: false,
        idle: 0,
        autoT: 0.3,
        wallX: Infinity,
        cracks: [],
        tube: 1,
        stop: 0,
        freeze: false,
        slow: 0,
        shake: 0,
        kick: 0,
        zoom: 0,
        zx: 0,
        zy: 0,
        flash: 0,
        fx: 0,
        fy: 0,
        fdir: 1,
        ring: 0,
        cops: 0,
        bus: 4,
        flick: [1, 1, 1, 1, 1],
        neonHit: 0,
        light: 0,
        bolt: [],
        thunder: -1,
        thunderBig: false,
        storm: rand(7, 12),
        rain: Array.from({ length: 260 }, () => ({ x: Math.random() * 1.1, y: Math.random(), v: rand(0.8, 1.2), l: rand(0.6, 1.2) })),
        near: Array.from({ length: 26 }, () => ({ x: Math.random() * 1.1, y: Math.random(), v: rand(1.6, 2.2), l: rand(1, 1.6) })),
        splashes: Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), age: Math.random(), size: rand(0.6, 1.4) })),
        parts: makePool(320),
        D: newDiner(),
        k: 1,
        ground: 0,
        L: { hor: 0, db: 0, dx: 0, dw: 0, dh: 0, sx: 0, sTop: 0, sW: 0, sH: 0, ax: 0, ay: 0, aw: 0, ah: 0, lx: 0, ly: 0 },
        bg: null,
        bg2: null,
        bg3: null,
        fig: null,
        cone: null,
        hot: glowSprite(128, [
          [0, 'rgba(255,255,248,1)'],
          [0.18, 'rgba(255,238,205,0.8)'],
          [0.5, 'rgba(255,190,120,0.2)'],
          [1, 'rgba(255,160,80,0)'],
        ]),
        amber: glowSprite(128, [
          [0, 'rgba(255,190,110,0.75)'],
          [0.35, 'rgba(255,150,70,0.22)'],
          [1, 'rgba(255,120,40,0)'],
        ]),
        red: glowSprite(128, [
          [0, 'rgba(255,50,80,0.9)'],
          [0.4, 'rgba(255,30,60,0.3)'],
          [1, 'rgba(255,0,40,0)'],
        ]),
        blue: glowSprite(96, [
          [0, 'rgba(90,140,255,0.9)'],
          [0.4, 'rgba(50,100,255,0.3)'],
          [1, 'rgba(30,60,255,0)'],
        ]),
        drop: glowSprite(24, [
          [0, 'rgba(225,238,255,0.95)'],
          [1, 'rgba(200,220,255,0)'],
        ]),
        dust: glowSprite(24, [
          [0, 'rgba(255,240,215,0.8)'],
          [1, 'rgba(255,240,215,0)'],
        ]),
        mist: glowSprite(96, [
          [0, 'rgba(120,130,150,0.22)'],
          [1, 'rgba(120,130,150,0)'],
        ]),
        cold: glowSprite(128, [
          [0, 'rgba(225,255,240,0.7)'],
          [0.3, 'rgba(190,240,215,0.25)'],
          [1, 'rgba(160,220,190,0)'],
        ]),
        vignette: null,
      };
      // the player opens on the first chapter with its title card; tiles and still frames go
      // straight to the rain lot, whose first punch makes the poster
      const story = env.interactive && !env.reducedMotion;
      resetChapter(s, env, story ? 0 : 2, !story);
      s.card = story ? 0 : 99;
      return s;
    },
    resize: (s, env) => {
      const { ctx, w, h, dpr } = env;
      s.k = Math.min((h * 0.56) / 230, (w * 0.9) / 460);
      s.fig = layer(s.fig, w, h, dpr).cv;
      paintChapter(s, env);
      s.camX = w / 2;
      s.camY = h / 2;
      const v = ctx.createRadialGradient(w * 0.48, h * 0.5, Math.min(w, h) * 0.32, w / 2, h * 0.5, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.7)');
      s.vignette = v;
    },
    update: (s, env, rawDt) => {
      const rm = env.reducedMotion;
      // feel and camera decays run on real time, through hit stop
      s.shake = Math.max(0, s.shake - rawDt * 3.2);
      s.kick = damp(s.kick, 0, 14, rawDt);
      s.zoom = Math.max(0, s.zoom - rawDt * 2.6);
      s.flash = Math.max(0, s.flash - rawDt * 5);
      s.ring = Math.max(0, s.ring - rawDt * 3.2);
      s.light = Math.max(0, s.light - rawDt * 2.4);
      s.neonHit = Math.max(0, s.neonHit - rawDt * 2.2);
      if (s.sub) {
        s.sub.age += rawDt;
        if (s.sub.age > s.sub.dur) s.sub = null;
      }
      if (s.go >= 0) {
        s.goT += rawDt;
        if (s.goT >= FADE) enterChapter(s, env, s.go);
      } else s.card += rawDt;

      // ambience per chapter
      if (s.ch === 2) {
        // the rain hangs in the air while a finisher lands; otherwise it never stops
        if (!(s.stop > 0 && s.freeze)) {
          const rf = s.slow > 0 ? 0.3 : 1;
          for (const r of s.rain) {
            r.y += rawDt * 1.5 * r.v * rf;
            r.x -= rawDt * 0.1 * r.v * rf;
            if (r.y > 1) {
              r.y -= 1;
              r.x = Math.random() * 1.1;
            }
          }
          for (const r of s.near) {
            r.y += rawDt * 1.5 * r.v * rf;
            r.x -= rawDt * 0.14 * r.v * rf;
            if (r.y > 1) {
              r.y -= 1;
              r.x = Math.random() * 1.15;
            }
          }
          for (const sp of s.splashes) {
            sp.age += rawDt * 2.4 * rf;
            if (sp.age > 1) {
              sp.age = 0;
              sp.x = Math.random();
              sp.y = Math.random();
            }
          }
        }
        // neon: one tired letter sputters on its own, a hard hit shakes them all
        for (let i = 0; i < s.flick.length; i++) {
          const chance = (i === 2 ? 0.035 : 0.004) + s.neonHit * 0.35;
          s.flick[i] = Math.random() < chance ? rand(0, 0.3) : damp(s.flick[i], 1, 14, rawDt);
        }
        s.bus += rawDt;
        if (s.thunder >= 0) {
          s.thunder -= rawDt;
          if (s.thunder < 0) {
            const bus = env.audio();
            if (bus) sfxThunder(bus, s.thunderBig);
            if (!rm) s.shake = Math.max(s.shake, s.thunderBig ? 0.3 : 0.15);
          }
        }
        if (!rm) {
          s.storm -= rawDt;
          if (s.storm <= 0) {
            lightning(s, false);
            s.storm = rand(10, 18);
          }
        }
      } else if (s.ch === 1) {
        // the tube buzzes and stutters, and a hard hit knocks it out for a beat
        const chance = 0.02 + s.neonHit * 0.4;
        s.tube = Math.random() < chance ? rand(0.25, 0.6) : damp(s.tube, 1, 12, rawDt);
      }

      // letterbox: on for the diner, the title cards, slow motion and a chapter's last beat
      let bars = 0;
      if (s.go >= 0 || s.card < CARD_END) bars = 1;
      else if (s.ch === 0) bars = s.D.beat >= 2 ? 1 : 0.55;
      else if (s.slow > 0 || s.endT >= 0) bars = 1;
      s.bars = damp(s.bars, bars, 5, rawDt);
      if (rm) s.bars = bars;

      if (s.go >= 0 || s.card < CARD_HOLD) return;
      if (s.stop > 0) {
        s.stop -= rawDt;
        return;
      }
      s.slow = Math.max(0, s.slow - rawDt);
      const dt = rawDt * (s.slow > 0 ? 0.28 : 1);
      s.cht += dt;
      if (s.ch === 0) dinerUpdate(s, env, dt);
      else fightUpdate(s, env, dt);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const rm = env.reducedMotion;
      ctx.fillStyle = '#05060a';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      // camera: shake and kick, a zoom about the focus, then a punch in toward the contact
      const amp = rm ? 0 : s.shake * s.shake;
      ctx.translate(shakeX(amp * 11, t) + s.kick, shakeY(amp * 7, t));
      const z = rm ? 1.04 : s.camZ;
      const fx = rm ? w / 2 : s.camX;
      const fy = rm ? h / 2 : s.camY;
      ctx.translate(fx, fy);
      ctx.scale(z, z);
      ctx.translate(-fx, -fy);
      if (s.zoom > 0) {
        const zz = 1 + easeOutCubic(s.zoom) * 0.06;
        ctx.translate(s.zx, s.zy);
        ctx.scale(zz, zz);
        ctx.translate(-s.zx, -s.zy);
      }
      if (s.ch === 0) drawDiner(s, env, t);
      else if (s.ch === 1) drawJail(s, env, t);
      else drawLot(s, env, t);
      ctx.restore();
      ctx.fillStyle = s.vignette ?? 'transparent';
      ctx.fillRect(0, 0, w, h);
      if (s.ch === 2 && s.light > 0.5) {
        ctx.fillStyle = `rgba(200,210,255,${((s.light - 0.5) * 0.18).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
      drawCinema(s, env);
    },
    onPointerDown: (s, env, x, y) => {
      const hitStrip = stripRects(env).findIndex((r) => x >= r.x - 3 && x <= r.x + r.w + 3 && y >= r.y - 3 && y <= r.y + r.h + 3);
      if (hitStrip >= 0) {
        s.touched = true;
        go(s, env, hitStrip);
        return;
      }
      const side = x < env.w / 2 + s.rx * s.k ? -1 : 1;
      primary(s, env, side);
    },
    onPointerUp: (s, env) => {
      if (s.ch === 0) dinerRelease(s, env);
    },
    onKey: (s, env, e, down) => {
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        if (down && !e.repeat) {
          s.touched = true;
          go(s, env, Number(e.key) - 1);
        }
        return true;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) primary(s, env, 0);
      if (!down && s.ch === 0) dinerRelease(s, env);
      return true;
    },
    dispose: (s) => {
      freeCanvas(s.bg, s.bg2, s.bg3, s.fig, s.cone, s.hot, s.amber, s.red, s.blue, s.drop, s.dust, s.mist, s.cold);
    },
  });
