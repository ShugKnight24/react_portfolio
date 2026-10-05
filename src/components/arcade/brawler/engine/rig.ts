// Procedural cartoon rig. A Look (palette + costume) and a Pose (hand/foot
// targets solved with 2-bone IK) are painted as tapered, cel-shaded parts with
// big Simpsons-style eyes and chunky arcade proportions. Frames are rendered
// once into offscreen canvases by spriteBank.ts — nothing here runs per game
// frame.
import { createSurface, Surface } from './canvas';
import { OUTLINE } from './constants';
import { clamp, mix, shade } from './math';

const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = parseInt(f, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luma = (hex: string): number => {
  const [r, g, b] = hexRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export type HairStyle =
  | 'bald'
  | 'short'
  | 'slick'
  | 'messy'
  | 'spiky'
  | 'flame'
  | 'spikyWhite'
  | 'mohawk'
  | 'long'
  | 'cap'
  | 'beanie'
  | 'helmet'
  | 'hardhat'
  | 'clown'
  | 'crown'
  | 'none';

export type TopStyle =
  | 'shirt'
  | 'tank'
  | 'hoodie'
  | 'suit'
  | 'gi'
  | 'bodysuit'
  | 'armor'
  | 'bare'
  | 'overalls'
  | 'striped';
export type EyeStyle = 'cartoon' | 'mask' | 'blindfold' | 'visor' | 'shades' | 'cowl';
export type PropKind = 'none' | 'shield' | 'chainsaw' | 'wrench';
/** skull + jaw silhouette (see HEADS) */
export type HeadShape = 'hero' | 'square' | 'brute' | 'lean' | 'egg' | 'round';
/** round = western cartoon, sharp = anime lids, dot = tiny pupils, narrow = squint */
export type EyeKind = 'round' | 'sharp' | 'dot' | 'narrow';
export type BeardStyle = 'full' | 'stubble' | 'goatee' | 'mustache';
/** resting expression when the pose does not ask for one */
export type Mood = 'calm' | 'mean' | 'cocky' | 'deadpan';

export interface Look {
  key: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  trim: string;
  topStyle: TopStyle;
  pants: string;
  shoes: string;
  gloves?: string;
  eyeStyle: EyeStyle;
  mask?: string;
  cape?: string;
  belt?: string;
  beard?: string;
  prop?: PropKind;
  shorts?: boolean;
  brow?: boolean;
  noseColor?: string;
  build: number;
  scale: number;
  headScale?: number;
  /** chest emblem for bodysuits / armor (visual only) */
  emblem?: 'spider' | 'bat' | 'none';
  /** colour of the energy aura on special-move frames */
  aura?: string;
  // face (visual only); defaults derive from build / brow / beard
  head?: HeadShape;
  eyeKind?: EyeKind;
  beardStyle?: BeardStyle;
  mood?: Mood;
  /** coloured iris instead of a plain black pupil */
  iris?: string;
  eyeWhite?: string;
  /** jagged shark teeth (Denji) */
  fangs?: boolean;
}

export type V2 = [number, number];

export interface Pose {
  hip: V2;
  lean: number;
  torso?: number;
  head?: V2;
  hF: V2; // front hand target, relative to front shoulder (y up)
  hB: V2;
  fF: V2; // front foot target, relative to front hip
  fB: V2;
  rot?: number; // whole-body rotation around hip, CCW positive
  eyes?: 'normal' | 'shut' | 'x';
  mouth?: 'line' | 'open' | 'grin';
  /** explicit facial expression; otherwise derived from eyes/mouth/aura */
  face?: Expr;
  fist?: boolean; // oversized front fist on impact frames
  fistB?: boolean;
  prop?: number; // 0 = off / resting, 1..n = active variants
  cape?: number; // cape flutter amount
  aura?: boolean;
  /** limb that gets a motion smear (fists default to their hand) */
  smear?: 'hF' | 'hB' | 'fF' | 'fB';
}

// ---------------------------------------------------------------------------
// Pose library
// ---------------------------------------------------------------------------

const base = (o: Partial<Pose>): Pose => ({
  hip: [0, 15],
  lean: 0,
  hF: [7, 1],
  hB: [6, 2],
  fF: [3, -15],
  fB: [-4, -15],
  ...o,
});

export type AnimId =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jumpUp'
  | 'jumpDown'
  | 'jumpKick'
  | 'jab'
  | 'cross'
  | 'finisher'
  | 'runAttack'
  | 'knee'
  | 'grab'
  | 'throw'
  | 'hurt'
  | 'fall'
  | 'down'
  | 'dead'
  | 'getup'
  | 'victory'
  | 'block'
  | 'windup'
  | 'toss'
  | 'smash'
  | 'held'
  | 'spSpin'
  | 'spDash'
  | 'spShoot'
  | 'spBeam'
  | 'spSaw'
  | 'spSlam'
  | 'charge';

export interface AnimDef {
  poses: Pose[];
  /** ticks per frame for self-advancing (looping) anims */
  rate: number;
  loop: boolean;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const walkPose = (i: number, n: number, stride: number, lean: number, pump: number): Pose => {
  const ph = (i / n) * Math.PI * 2;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  return base({
    hip: [0, 15 - Math.abs(Math.cos(ph)) * 0.8 + 0.4],
    lean,
    fF: [stride * s, -15 + Math.max(0, c) * 3],
    fB: [-stride * s, -15 + Math.max(0, -c) * 3],
    hF: [4 - pump * s, -5 + Math.abs(s) * 2],
    hB: [2 + pump * s, -5 + Math.abs(s) * 2],
    cape: 2 + Math.abs(s) * 2 + lean,
  });
};

export const ANIMS: Record<AnimId, AnimDef> = {
  idle: {
    rate: 11,
    loop: true,
    // fighting stance: knees bent, lead fist up at chin height, breathing bob
    poses: [0, 0.5, 1, 0.5].map((b) =>
      base({
        hip: [0, 14.4 - b * 0.6],
        lean: 0.6,
        torso: 1 - b * 0.012,
        hF: [10.2, 2.4 - b * 0.5],
        hB: [6.6, 3.6 - b * 0.5],
        fF: [5.4, -14.4 + b * 0.6],
        fB: [-5.2, -14.4 + b * 0.6],
        cape: 1 + b,
      })
    ),
  },
  walk: { rate: 6, loop: true, poses: range(6).map((i) => walkPose(i, 6, 5, 1, 3)) },
  run: { rate: 4, loop: true, poses: range(6).map((i) => walkPose(i, 6, 8, 3.5, 6)) },
  jumpUp: {
    rate: 6,
    loop: false,
    poses: [
      base({ hip: [0, 16], lean: 1, hF: [7, 7], hB: [-3, 6], fF: [6, -8], fB: [-3, -11], cape: 5 }),
    ],
  },
  jumpDown: {
    rate: 6,
    loop: false,
    poses: [base({ hip: [0, 16], hF: [8, -1], hB: [-5, 1], fF: [3, -15], fB: [-5, -13], cape: 7 })],
  },
  jumpKick: {
    rate: 6,
    loop: false,
    poses: [
      base({
        hip: [0, 16],
        lean: -2,
        hF: [-2, -3],
        hB: [-6, -1],
        fF: [15, -7],
        fB: [-4, -9],
        cape: 7,
        mouth: 'open',
        smear: 'fF',
      }),
    ],
  },
  jab: {
    rate: 4,
    loop: false,
    poses: [
      base({ lean: -1, hF: [3, 0], hB: [5, 1], fF: [5, -15], fB: [-5, -15] }),
      base({
        lean: 2.5,
        hF: [14, 1.5],
        hB: [3, 0],
        fF: [6, -15],
        fB: [-5, -15],
        fist: true,
        mouth: 'open',
      }),
      base({ lean: 1, hF: [9, 1], hB: [5, 1], fF: [5, -15], fB: [-5, -15] }),
    ],
  },
  cross: {
    rate: 4,
    loop: false,
    poses: [
      base({ lean: -2, hF: [6, 1], hB: [-3, -1], fF: [5, -15], fB: [-6, -15] }),
      base({
        lean: 4,
        hF: [2, -3],
        hB: [16, 2],
        fF: [7, -15],
        fB: [-6, -15],
        fistB: true,
        mouth: 'open',
      }),
      base({ lean: 2, hF: [5, -1], hB: [9, 1], fF: [6, -15], fB: [-6, -15] }),
    ],
  },
  finisher: {
    rate: 5,
    loop: false,
    poses: [
      base({ lean: -2, hF: [6, 2], hB: [4, 1], fF: [5, -9], fB: [-3, -15] }),
      base({
        lean: -4,
        hF: [-4, -3],
        hB: [-7, 0],
        fF: [16, -3],
        fB: [-2, -15],
        mouth: 'open',
        cape: 5,
        smear: 'fF',
      }),
      base({ lean: -1, hF: [6, 1], hB: [4, 1], fF: [8, -11], fB: [-3, -15] }),
    ],
  },
  runAttack: {
    rate: 6,
    loop: false,
    poses: [
      base({
        hip: [0, 16],
        lean: 5,
        hF: [12, -1],
        hB: [10, -3],
        fF: [3, -13],
        fB: [-9, -11],
        mouth: 'open',
        fist: true,
        cape: 8,
      }),
      base({ lean: 2, hF: [8, 0], hB: [6, 0], fF: [5, -15], fB: [-6, -15] }),
    ],
  },
  knee: {
    rate: 5,
    loop: false,
    poses: [
      base({ lean: 1, hF: [10, -1], hB: [9, 0], fF: [4, -15], fB: [-4, -15] }),
      base({
        lean: 2,
        hF: [10, -3],
        hB: [9, -2],
        fF: [9, -6],
        fB: [-3, -15],
        mouth: 'open',
        smear: 'fF',
      }),
    ],
  },
  grab: {
    rate: 8,
    loop: false,
    poses: [base({ lean: 2, hF: [10, -1], hB: [9, 0], fF: [4, -15], fB: [-5, -15] })],
  },
  throw: {
    rate: 6,
    loop: false,
    poses: [
      base({ lean: -4, hF: [-3, 7], hB: [-4, 6], fF: [5, -15], fB: [-6, -15], mouth: 'open' }),
      base({
        lean: 5,
        hF: [12, 4],
        hB: [11, 3],
        fF: [6, -15],
        fB: [-7, -15],
        mouth: 'open',
        cape: 6,
      }),
    ],
  },
  hurt: {
    rate: 6,
    loop: false,
    poses: [
      base({
        lean: -4,
        head: [-1.5, -0.5],
        hF: [-1, -7],
        hB: [-5, -5],
        eyes: 'shut',
        mouth: 'open',
      }),
      base({
        lean: -2.5,
        rot: 0.08,
        head: [-1, 0],
        hF: [1, -8],
        hB: [-3, -7],
        eyes: 'shut',
        mouth: 'open',
      }),
    ],
  },
  fall: {
    rate: 6,
    loop: false,
    poses: [
      base({
        hip: [0, 12],
        rot: 0.95,
        hF: [-5, 4],
        hB: [-8, 2],
        fF: [6, -12],
        fB: [3, -14],
        eyes: 'shut',
        mouth: 'open',
        cape: 3,
      }),
    ],
  },
  down: {
    rate: 6,
    loop: false,
    poses: [
      base({
        hip: [0, 3],
        rot: Math.PI / 2 - 0.05,
        hF: [2, -12],
        hB: [-1, -12],
        fF: [2, -15],
        fB: [0, -15],
        eyes: 'shut',
        cape: 0,
      }),
    ],
  },
  dead: {
    rate: 6,
    loop: false,
    poses: [
      base({
        hip: [0, 3],
        rot: Math.PI / 2 - 0.05,
        hF: [4, -11],
        hB: [-1, -12],
        fF: [3, -15],
        fB: [0, -15],
        eyes: 'x',
        mouth: 'open',
        cape: 0,
      }),
    ],
  },
  getup: {
    rate: 8,
    loop: false,
    poses: [
      base({ hip: [0, 8], lean: 3, hF: [7, -6], hB: [3, -8], fF: [7, -8], fB: [-6, -7.5] }),
      base({ hip: [0, 13], lean: 1.5, hF: [7, -2], hB: [5, -3], fF: [5, -13], fB: [-5, -13] }),
    ],
  },
  victory: {
    rate: 14,
    loop: true,
    poses: [
      base({ hip: [0, 15], hF: [2, 14], hB: [-3, -10], mouth: 'grin', fist: true }),
      base({
        hip: [0, 16],
        hF: [2, 15],
        hB: [-3, -9],
        mouth: 'grin',
        fist: true,
        fF: [3, -16],
        fB: [-4, -16],
      }),
    ],
  },
  block: {
    rate: 8,
    loop: false,
    poses: [base({ lean: -1, hF: [8, 1], hB: [6, 2], prop: 1, fF: [5, -15], fB: [-5, -15] })],
  },
  windup: {
    rate: 8,
    loop: false,
    poses: [
      base({ lean: -3, hF: [-5, 3], hB: [4, 1], fF: [6, -15], fB: [-5, -15], mouth: 'grin' }),
    ],
  },
  toss: {
    rate: 6,
    loop: false,
    poses: [
      base({ lean: -3, hF: [-6, 8], hB: [4, 0], fF: [5, -15], fB: [-5, -15] }),
      base({ lean: 3, hF: [12, 6], hB: [2, -3], fF: [6, -15], fB: [-6, -15], mouth: 'open' }),
    ],
  },
  smash: {
    rate: 6,
    loop: false,
    poses: [
      base({ lean: -2, hF: [2, 11], hB: [0, 11], fF: [5, -15], fB: [-5, -15], mouth: 'grin' }),
      base({
        hip: [0, 13],
        lean: 5,
        hF: [12, -8],
        hB: [11, -9],
        fF: [7, -13],
        fB: [-6, -13],
        mouth: 'open',
        fist: true,
        fistB: true,
      }),
      base({ hip: [0, 14], lean: 3, hF: [10, -9], hB: [9, -10], fF: [6, -14], fB: [-6, -14] }),
    ],
  },
  held: {
    rate: 6,
    loop: false,
    poses: [
      base({
        hip: [0, 16],
        lean: -2,
        hF: [3, -8],
        hB: [-3, -8],
        fF: [2, -14],
        fB: [-2, -14],
        eyes: 'shut',
        mouth: 'open',
      }),
    ],
  },
  spSpin: {
    rate: 3,
    loop: true,
    poses: [
      base({
        hF: [13, 1],
        hB: [-12, 1],
        fF: [4, -15],
        fB: [-4, -15],
        mouth: 'open',
        aura: true,
        cape: 6,
      }),
      base({
        hF: [5, 0],
        hB: [4, 1],
        fF: [3, -15],
        fB: [-3, -15],
        mouth: 'open',
        aura: true,
        cape: 2,
      }),
      base({
        hF: [-11, 1],
        hB: [13, 1],
        fF: [4, -15],
        fB: [-4, -15],
        mouth: 'open',
        aura: true,
        cape: 6,
      }),
      base({
        hF: [2, 0],
        hB: [6, 1],
        fF: [3, -15],
        fB: [-3, -15],
        mouth: 'open',
        aura: true,
        cape: 2,
      }),
    ],
  },
  spDash: {
    rate: 6,
    loop: false,
    poses: [
      base({
        hip: [0, 12],
        lean: -1,
        hF: [-3, -2],
        hB: [5, 1],
        fF: [7, -12],
        fB: [-7, -12],
        aura: true,
      }),
      base({
        hip: [0, 15],
        lean: 6,
        hF: [16, 1],
        hB: [2, -4],
        fF: [5, -15],
        fB: [-10, -14],
        fist: true,
        mouth: 'open',
        aura: true,
        cape: 9,
      }),
      base({
        hip: [0, 15],
        lean: 4,
        hF: [14, 1],
        hB: [3, -3],
        fF: [5, -15],
        fB: [-8, -15],
        fist: true,
        mouth: 'open',
        cape: 6,
      }),
    ],
  },
  spShoot: {
    rate: 6,
    loop: false,
    poses: [
      base({ lean: -1, hF: [1, 3], hB: [4, 0], aura: true }),
      base({
        lean: 3,
        hF: [14, 3],
        hB: [2, -2],
        fF: [6, -15],
        fB: [-6, -15],
        mouth: 'open',
        aura: true,
      }),
    ],
  },
  spBeam: {
    rate: 6,
    loop: false,
    poses: [
      base({
        hip: [0, 13],
        lean: -2,
        hF: [-5, -9],
        hB: [-6, -8],
        fF: [6, -13],
        fB: [-6, -13],
        aura: true,
      }),
      base({
        hip: [0, 14],
        lean: 2.5,
        hF: [14, -1],
        hB: [14, 0],
        fF: [7, -14],
        fB: [-7, -14],
        mouth: 'open',
        aura: true,
        cape: 7,
      }),
    ],
  },
  spSaw: {
    rate: 2,
    loop: true,
    poses: [
      base({
        lean: 3,
        hF: [10, -1],
        hB: [7, -2],
        prop: 1,
        fF: [6, -15],
        fB: [-6, -15],
        mouth: 'grin',
        aura: true,
      }),
      base({
        lean: 3.5,
        hF: [10.5, -0.5],
        hB: [7, -2],
        prop: 2,
        fF: [6, -15],
        fB: [-6, -15],
        mouth: 'grin',
        aura: true,
      }),
    ],
  },
  spSlam: {
    rate: 6,
    loop: false,
    poses: [
      base({
        hip: [0, 16],
        hF: [3, 13],
        hB: [1, 13],
        fF: [4, -13],
        fB: [-4, -13],
        mouth: 'open',
        aura: true,
      }),
      base({
        hip: [0, 10],
        lean: 5,
        hF: [10, -11],
        hB: [9, -11],
        fF: [8, -10],
        fB: [-7, -10],
        mouth: 'open',
        fist: true,
        fistB: true,
        aura: true,
      }),
    ],
  },
  charge: {
    rate: 4,
    loop: true,
    poses: range(4).map((i) => ({
      ...walkPose(i, 4, 9, 5, 2),
      hF: [9, -2] as V2,
      hB: [8, -3] as V2,
      mouth: 'grin' as const,
    })),
  },
};

// ---------------------------------------------------------------------------
// Drawing
//
// Every figure is painted twice in one pass: flat colours into the sprite
// surface and a "part id" per body part (in paint order) into a twin buffer.
// A per-pixel pass then derives everything a pixel artist would add by hand,
// at a constant 1px weight regardless of character size:
//   - cel shading from a fixed key light (upper front): form shadow on each
//     part's far edge, cast shadow under any part painted in front of it,
//     a highlight on light-facing edges and a cool rim light on the back;
//   - 1px internal lines wherever a part overlaps another;
//   - a 1px dark silhouette outline, and optional energy aura around it.
// All of this runs once per frame at bake time (spriteBank.ts), never per tick.
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;
const ID_STEP = 9;
const FX_ID = 255;
const DETAIL_ID = 254; // painted on top of a part, never shaded (eyes, teeth)
const idHash = (id: number) => (id * 37 + 11) & 255;

/** Paint state for the figure currently being drawn. */
let C: Ctx;
let I: Ctx | null = null;
let px1 = 0.8; // one sprite pixel in local units
let partN = 0;
/** parts that never receive cast shadows (faces stay clean and readable) */
const noCast = new Uint8Array(32);

let idInk = false; // when set, ink*/inkDot/inkPoly also stamp the id buffer
const setPart = (id: number) => {
  if (!I) return;
  const r = id === FX_ID || id === DETAIL_ID ? id : id * ID_STEP;
  I.fillStyle = `rgb(${r},${idHash(r)},0)`;
  I.strokeStyle = I.fillStyle;
};
/** Start a new body part: later parts are "in front" of earlier ones. */
const part = () => {
  partN = Math.min(partN + 1, 27);
  setPart(partN);
};
const fxPart = () => setPart(FX_ID);
/** Run `fn` with ink calls stamped as unshaded detail, then restore the part. */
const asDetail = (fn: () => void) => {
  setPart(DETAIL_ID);
  idInk = true;
  fn();
  idInk = false;
  setPart(partN);
};

/** Fill the current path in colour (and as the current part id). */
const fill = (color: string) => {
  C.fillStyle = color;
  C.fill();
  if (I) I.fill(currentPath);
};
// Path2D mirror so the id buffer receives the exact same geometry.
// created lazily: jsdom (tests) has no Path2D and never paints
let currentPath = null as unknown as Path2D;
const begin = () => {
  C.beginPath();
  currentPath = new Path2D();
};
const moveTo = (x: number, y: number) => {
  C.moveTo(x, y);
  currentPath.moveTo(x, y);
};
const lineTo = (x: number, y: number) => {
  C.lineTo(x, y);
  currentPath.lineTo(x, y);
};
const arc = (x: number, y: number, r: number, a0: number, a1: number, ccw = false) => {
  C.arc(x, y, r, a0, a1, ccw);
  currentPath.arc(x, y, r, a0, a1, ccw);
};
const ellipse = (x: number, y: number, rx: number, ry: number, rot: number) => {
  C.ellipse(x, y, rx, ry, rot, 0, TAU);
  currentPath.ellipse(x, y, rx, ry, rot, 0, TAU);
};
const quadTo = (cx: number, cy: number, x: number, y: number) => {
  C.quadraticCurveTo(cx, cy, x, y);
  currentPath.quadraticCurveTo(cx, cy, x, y);
};
const close = () => {
  C.closePath();
  currentPath.closePath();
};

const disc = (x: number, y: number, r: number, color: string) => {
  begin();
  arc(x, y, r, 0, TAU);
  fill(color);
};

const oval = (x: number, y: number, rx: number, ry: number, rot: number, color: string) => {
  begin();
  ellipse(x, y, rx, ry, rot);
  fill(color);
};

const polyFill = (pts: number[], color: string) => {
  begin();
  moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) lineTo(pts[i], pts[i + 1]);
  close();
  fill(color);
};

/** Closed shape through `pts` with rounded corners (midpoint quadratics). */
const smoothFill = (pts: number[], color: string) => {
  const n = pts.length / 2;
  const mx = (i: number) => (pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2;
  const my = (i: number) => (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2;
  begin();
  moveTo(mx(n - 1), my(n - 1));
  for (let i = 0; i < n; i++) quadTo(pts[i * 2], pts[i * 2 + 1], mx(i), my(i));
  close();
  fill(color);
};

/** Tapered capsule from (x0,y0,r0) to (x1,y1,r1). */
const capsule = (
  x0: number,
  y0: number,
  r0: number,
  x1: number,
  y1: number,
  r1: number,
  color: string
) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len <= Math.abs(r0 - r1) + 0.01) {
    disc(len < 0.01 ? x0 : x1, len < 0.01 ? y0 : y1, Math.max(r0, r1), color);
    return;
  }
  const a = Math.atan2(dy, dx);
  const phi = Math.acos(clamp((r0 - r1) / len, -1, 1));
  begin();
  arc(x0, y0, r0, a + phi, a + TAU - phi);
  arc(x1, y1, r1, a - phi, a + phi);
  close();
  fill(color);
};

/** Colour-only line (details: seams, mouths, emblems). Not part of the id map. */
const ink = (pts: number[], w: number, color: string, cap: CanvasLineCap = 'round') => {
  C.lineCap = cap;
  C.lineJoin = 'round';
  C.beginPath();
  C.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) C.lineTo(pts[i], pts[i + 1]);
  C.strokeStyle = color;
  C.lineWidth = w;
  C.stroke();
  if (idInk && I) {
    const path = new Path2D();
    path.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
    I.lineCap = cap;
    I.lineJoin = 'round';
    I.lineWidth = w;
    I.stroke(path);
  }
};
const inkDot = (x: number, y: number, r: number, color: string) => {
  C.beginPath();
  C.arc(x, y, r, 0, TAU);
  C.fillStyle = color;
  C.fill();
  if (idInk && I) {
    I.beginPath();
    I.arc(x, y, r, 0, TAU);
    I.fill();
  }
};
const inkPoly = (pts: number[], color: string) => {
  C.beginPath();
  C.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) C.lineTo(pts[i], pts[i + 1]);
  C.closePath();
  C.fillStyle = color;
  C.fill();
  if (idInk && I) {
    I.beginPath();
    I.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) I.lineTo(pts[i], pts[i + 1]);
    I.closePath();
    I.fill();
  }
};

const ik = (
  tx: number,
  ty: number,
  l1: number,
  l2: number,
  bend: number
): [number, number, number, number] => {
  let d = Math.hypot(tx, ty);
  const max = l1 + l2 - 0.01;
  let ex = tx;
  let ey = ty;
  if (d > max) {
    ex = (tx / d) * max;
    ey = (ty / d) * max;
    d = max;
  }
  if (d < 0.01) d = 0.01;
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ang = Math.atan2(ey, ex) + bend * a;
  return [Math.cos(ang) * l1, Math.sin(ang) * l1, ex, ey];
};

type SleeveKind = 'none' | 'short' | 'long';
const sleeveFor = (t: TopStyle): SleeveKind =>
  t === 'tank' || t === 'bare'
    ? 'none'
    : t === 'shirt' || t === 'gi' || t === 'overalls' || t === 'striped'
      ? 'short'
      : 'long';

interface Joints {
  sh: V2;
  shF: V2;
  shB: V2;
  hipF: V2;
  hipB: V2;
  armF: [number, number, number, number];
  armB: [number, number, number, number];
  legF: [number, number, number, number];
  legB: [number, number, number, number];
  head: V2;
  R: number;
}

const solve = (look: Look, p: Pose): Joints => {
  const hs = look.headScale ?? 1;
  const torsoLen = 14 * (p.torso ?? 1);
  const sh: V2 = [p.hip[0] + p.lean, p.hip[1] + torsoLen];
  const shF: V2 = [sh[0] + 1.6, sh[1] - 1.2];
  const shB: V2 = [sh[0] - 1.6, sh[1] - 1.2];
  const hipF: V2 = [p.hip[0] + 1.6, p.hip[1]];
  const hipB: V2 = [p.hip[0] - 1.6, p.hip[1]];
  const R = 7.2 * hs;
  const head: V2 = [
    sh[0] + 1 + p.lean * 0.25 + (p.head?.[0] ?? 0),
    sh[1] + R + 0.6 + (p.head?.[1] ?? 0),
  ];
  return {
    sh,
    shF,
    shB,
    hipF,
    hipB,
    armF: ik(p.hF[0], p.hF[1], 6.5, 6.8, -1),
    armB: ik(p.hB[0], p.hB[1], 6.5, 6.8, -1),
    legF: ik(p.fF[0], p.fF[1], 8, 8, 1),
    legB: ik(p.fB[0], p.fB[1], 8, 8, 1),
    head,
    R,
  };
};

/** Back limbs sit in the shade: darker and a touch cooler. */
const back = (c: string, k = 0.2) => mix(shade(c, -k), '#2a2350', 0.12);

const drawArm = (
  look: Look,
  s: V2,
  a: [number, number, number, number],
  isBack: boolean,
  bigFist: boolean
) => {
  const b = Math.sqrt(look.build);
  const ex = s[0] + a[0];
  const ey = s[1] + a[1];
  const hx = s[0] + a[2];
  const hy = s[1] + a[3];
  const sleeve = sleeveFor(look.topStyle);
  const top = isBack ? back(look.top) : look.top;
  const skin = isBack ? back(look.skin, 0.14) : look.skin;
  const rS = 2.35 * b;
  const rE = 1.95 * b;
  const rW = 1.6 * b;
  part();
  const fore = sleeve === 'long' ? top : skin;
  capsule(ex, ey, rE, hx, hy, rW, fore);
  if (sleeve === 'short') {
    capsule(s[0], s[1], rS, ex, ey, rE, skin);
    // short sleeve: covers the shoulder and half the upper arm
    const mx = s[0] + a[0] * 0.55;
    const my = s[1] + a[1] * 0.55;
    capsule(s[0], s[1], rS + 0.45, mx, my, rS + 0.15, top);
  } else {
    capsule(s[0], s[1], rS, ex, ey, rE, sleeve === 'none' ? skin : top);
  }
  if (look.build >= 1.25) {
    // bicep / deltoid bulge on big builds
    const mx = s[0] + a[0] * 0.45;
    const my = s[1] + a[1] * 0.45;
    disc(mx, my, rS * 1.12, sleeve === 'none' ? skin : top);
  }
  if (sleeve === 'long' && !look.gloves) {
    // cuff
    const k = 0.82;
    ink(
      [ex + (hx - ex) * k - 0.01, ey + (hy - ey) * k, ex + (hx - ex) * k, ey + (hy - ey) * k],
      rW * 2.1,
      shade(top, -0.18)
    );
  }
  // fist
  part();
  const gl = look.gloves ? (isBack ? back(look.gloves) : look.gloves) : skin;
  const r = (bigFist ? 2.75 : 2.05) * b;
  const dx = hx - ex;
  const dy = hy - ey;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  if (look.gloves) capsule(hx - ux * 2.2, hy - uy * 2.2, rW + 0.55, hx, hy, rW + 0.4, gl);
  const fx = hx + ux * r * 0.35;
  const fy = hy + uy * r * 0.35;
  oval(fx, fy, r * 1.08, r * 0.92, Math.atan2(uy, ux), gl);
  // thumb + knuckle crease
  disc(fx - ux * r * 0.2 - uy * r * 0.55, fy - uy * r * 0.2 + ux * r * 0.55, r * 0.45, gl);
  ink(
    [
      fx + ux * r * 0.55 + uy * r * 0.5,
      fy + uy * r * 0.55 - ux * r * 0.5,
      fx + ux * r * 0.55 - uy * r * 0.4,
      fy + uy * r * 0.55 + ux * r * 0.4,
    ],
    px1 * 0.9,
    shade(gl, -0.35)
  );
};

const drawLeg = (look: Look, h: V2, l: [number, number, number, number], isBack: boolean) => {
  const b = Math.sqrt(look.build);
  const kx = h[0] + l[0];
  const ky = h[1] + l[1];
  const fx = h[0] + l[2];
  const fy = h[1] + l[3];
  const pants = isBack ? back(look.pants) : look.pants;
  const skin = isBack ? back(look.skin, 0.14) : look.skin;
  part();
  capsule(kx, ky, 2.35 * b, fx, fy + 1, 1.85 * b, look.shorts ? skin : pants);
  capsule(h[0], h[1], 2.95 * b, kx, ky, 2.4 * b, pants);
  if (look.shorts) {
    const mx = (h[0] + kx) / 2 + (kx - h[0]) * 0.25;
    const my = (h[1] + ky) / 2 + (ky - h[1]) * 0.25;
    ink([mx - 2.3 * b, my + 0.4, mx + 2.3 * b, my - 0.4], px1, shade(pants, -0.35));
  }
  // boot / shoe
  part();
  const shoe = isBack ? back(look.shoes) : look.shoes;
  const sb = Math.max(1, b * 0.94);
  const heelX = fx - 0.3;
  const heelY = fy + 1.1;
  begin();
  moveTo(heelX - 1.8 * sb, heelY + 0.8);
  quadTo(heelX - 1.9 * sb, fy - 0.8, heelX - 0.5, fy - 0.9);
  lineTo(fx + 3.6 * sb, fy - 0.9);
  quadTo(fx + 4.6 * sb, fy - 0.6, fx + 4.1 * sb, fy + 0.9);
  quadTo(fx + 2.6 * sb, fy + 2.5, heelX + 0.6, heelY + 1.4);
  close();
  fill(shoe);
  // sole
  const sole = luma(shoe) > 0.6 ? shade(shoe, -0.28) : mix(shoe, '#f2ecdf', 0.45);
  ink([heelX - 1.6 * sb, fy - 0.45, fx + 3.9 * sb, fy - 0.45], px1 * 1.1, sole, 'butt');
};

const drawCape = (look: Look, j: Joints, p: Pose) => {
  if (!look.cape) return;
  const fl = p.cape ?? 2;
  const hipY = p.hip[1];
  part();
  const pts = [
    j.sh[0] + 2.5,
    j.sh[1] + 0.8,
    j.sh[0] - 3.5,
    j.sh[1] + 0.6,
    j.sh[0] - 6 - fl * 1.1,
    hipY - 2 + fl * 0.9,
    j.sh[0] - 8 - fl * 1.5,
    hipY - 10 + fl * 1.1,
    j.sh[0] - 4 - fl * 0.8,
    hipY - 12 + fl * 0.5,
    p.hip[0] - 1,
    hipY - 10,
    p.hip[0] + 1,
    hipY - 3,
  ];
  smoothFill(pts, look.cape);
  // folds
  const fc = shade(look.cape, -0.28);
  ink([j.sh[0] - 2.5, j.sh[1] - 1, j.sh[0] - 5 - fl * 0.9, hipY - 8 + fl * 0.8], px1, fc);
  ink([j.sh[0] - 0.5, j.sh[1] - 2, p.hip[0] - 1.5, hipY - 7], px1, fc);
};

const drawTorso = (look: Look, j: Joints, p: Pose) => {
  const b = look.build;
  const hip = p.hip;
  const sh = j.sh;
  const dx = sh[0] - hip[0];
  const dy = sh[1] - hip[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux; // normal toward the back when upright; negative offsets = chest side
  const at = (t: number, off = 0): V2 => [
    hip[0] + ux * len * t + nx * off,
    hip[1] + uy * len * t + ny * off,
  ];
  const hipW = 4.5 * Math.pow(b, 0.85);
  const waist = 4.2 * b;
  const chest = 5.5 * b;
  const shW = 5.1 * b;
  const topCol = look.topStyle === 'bare' ? look.skin : look.top;

  if (look.topStyle === 'hoodie') {
    part();
    const h0 = at(1.02, 3.2);
    oval(h0[0], h0[1], 3.6, 2.8, 0.4, shade(look.top, -0.08));
  }

  part();
  const pts: number[] = [];
  const push = (v: V2) => pts.push(v[0], v[1]);
  push(at(-0.14, hipW + 0.4));
  push(at(0.4, waist + 0.4));
  push(at(0.8, chest * 0.98));
  push(at(1.03, shW * 0.8));
  push(at(1.1, 1.5));
  push(at(1.1, -2.2));
  push(at(1.0, -shW * 0.9));
  push(at(0.72, -chest * 1.04));
  push(at(0.36, -waist));
  push(at(-0.14, -hipW - 0.6));
  smoothFill(pts, topCol);
  const torsoPath = currentPath;

  // pants / pelvis (same part as the torso, so no seam line)
  const pc = look.pants;
  const beltT = look.topStyle === 'overalls' ? 0.16 : 0.24;
  polyFill(
    [
      ...at(beltT, waist + 0.6),
      ...at(beltT, -waist - 0.5),
      ...at(-0.16, -hipW - 0.8),
      ...at(-0.16, hipW + 0.6),
    ],
    pc
  );
  const sc = (c: string) => shade(c, -0.32);

  switch (look.topStyle) {
    case 'tank': {
      // scooped neckline + arm holes show skin, straps
      const n0 = at(1.08, -0.5);
      oval(n0[0] + 0.4, n0[1] - 0.6, 2.6, 2.2, 0, look.skin);
      const s1 = at(1.0, 2.6);
      const s2 = at(0.78, 2.6);
      ink([s1[0], s1[1], s2[0], s2[1]], px1, sc(look.top));
      const hem = at(0.3, -waist);
      const hem2 = at(0.3, waist);
      ink([hem[0], hem[1], hem2[0], hem2[1]], px1, look.trim);
      break;
    }
    case 'bare': {
      const line = shade(look.skin, -0.32);
      const p1 = at(0.8, -0.6);
      const p2 = at(0.66, -chest * 0.82);
      ink([p1[0], p1[1], (p1[0] + p2[0]) / 2, p2[1] - 0.3, p2[0], p2[1] + 0.4], px1, line);
      for (const t of [0.5, 0.38]) {
        const a1 = at(t, -waist * 0.25);
        const a2 = at(t, -waist * 0.8);
        ink([a1[0], a1[1], a2[0], a2[1]], px1 * 0.9, line);
      }
      const c1 = at(0.58, -waist * 0.5);
      const c2 = at(0.3, -waist * 0.5);
      ink([c1[0], c1[1], c2[0], c2[1]], px1 * 0.9, line);
      break;
    }
    case 'suit': {
      const c1 = at(1.06, -1.2);
      const c2 = at(0.52, -chest * 0.62);
      const c3 = at(1.0, -shW * 0.75);
      inkPoly([c1[0], c1[1], c3[0], c3[1], c2[0], c2[1]], look.trim);
      // tie
      const t1 = at(1.0, -chest * 0.45);
      const t2 = at(0.6, -chest * 0.6);
      ink([t1[0], t1[1], t2[0], t2[1]], px1 * 1.6, shade(look.trim, -0.45));
      // lapel
      const l1 = at(1.05, -0.4);
      const l2 = at(0.5, -chest * 0.7);
      ink([l1[0], l1[1], l2[0], l2[1]], px1, sc(look.top));
      const bt = at(0.42, -chest * 0.7);
      inkDot(bt[0], bt[1], px1 * 0.7, shade(look.top, 0.3));
      break;
    }
    case 'shirt': {
      const t1 = at(1.0, -chest * 0.35);
      const t2 = at(0.32, -chest * 0.45);
      ink([t1[0], t1[1], t2[0], t2[1]], px1 * 1.7, look.trim);
      const c1 = at(1.08, -0.2);
      const c2 = at(0.88, -chest * 0.65);
      inkPoly([c1[0], c1[1], c2[0], c2[1], ...at(1.05, -chest * 0.9)], look.skin);
      break;
    }
    case 'gi': {
      // undershirt V + wrap edge
      const v0 = at(1.08, -0.4);
      const v1 = at(0.66, -chest * 0.6);
      const v2 = at(1.02, -shW * 0.9);
      inkPoly([v0[0], v0[1], v1[0], v1[1], v2[0], v2[1]], look.trim);
      const w1 = at(1.1, 1.8);
      ink([w1[0], w1[1], v1[0], v1[1]], px1, sc(look.top));
      break;
    }
    case 'bodysuit': {
      if (look.emblem === 'spider') {
        const w = shade(look.top, -0.45);
        const c = at(0.72, -chest * 0.35);
        inkDot(c[0], c[1], px1 * 0.9, OUTLINE);
        ink([c[0] - 1.6, c[1] + 1.2, c[0], c[1], c[0] + 1.6, c[1] + 1.2], px1 * 0.8, OUTLINE);
        ink([c[0] - 1.6, c[1] - 1.4, c[0], c[1], c[0] + 1.6, c[1] - 1.4], px1 * 0.8, OUTLINE);
        for (const t of [0.5, 0.92]) {
          const a = at(t, chest);
          const z = at(t, -chest);
          ink([a[0], a[1], z[0], z[1]], px1 * 0.6, w);
        }
        // blue side panels
        const s0 = at(0.3, waist + 0.2);
        const s1 = at(0.92, chest * 0.9);
        const s2 = at(0.92, chest * 0.2);
        const s3 = at(0.3, waist * 0.35);
        inkPoly([s0[0], s0[1], s1[0], s1[1], s2[0], s2[1], s3[0], s3[1]], look.pants);
      } else if (look.emblem === 'bat') {
        const c = at(0.74, -chest * 0.25);
        C.save();
        C.translate(c[0], c[1]);
        C.beginPath();
        C.ellipse(0, 0, 3.3, 1.9, 0, 0, TAU);
        C.fillStyle = look.trim;
        C.fill();
        C.lineWidth = px1;
        C.strokeStyle = OUTLINE;
        C.stroke();
        inkPoly(
          [-2.6, 0.2, -1.2, -0.9, -0.5, 0.1, 0, -0.4, 0.5, 0.1, 1.2, -0.9, 2.6, 0.2, 0, 1.0],
          OUTLINE
        );
        C.restore();
      } else {
        const e = at(0.72, -chest * 0.3);
        inkDot(e[0], e[1], 2.0, OUTLINE);
        inkDot(e[0], e[1], 2.0 - px1, look.trim);
        // suit seams
        const z1 = at(1.02, -0.4);
        const z2 = at(0.3, -0.4);
        ink([z1[0], z1[1], z2[0], z2[1]], px1 * 0.8, shade(look.top, -0.18));
      }
      break;
    }
    case 'armor': {
      // chest plate over bodysuit belly
      const pl: number[] = [];
      for (const v of [
        at(1.04, shW * 0.85),
        at(1.04, -shW * 0.95),
        at(0.6, -chest * 1.0),
        at(0.48, -waist * 0.6),
        at(0.48, waist * 0.7),
        at(0.62, chest),
      ])
        pl.push(v[0], v[1]);
      C.lineWidth = px1;
      C.strokeStyle = OUTLINE;
      inkPoly(pl, look.trim);
      C.stroke();
      const g = at(0.8, -chest * 0.25);
      ink([g[0] - 1.5, g[1] - 1.5, g[0] + 1.5, g[1] + 1.5], px1, shade(look.trim, -0.25));
      if (look.emblem !== 'none') {
        const c = at(0.82, -chest * 0.5);
        inkDot(c[0], c[1], 1.3, look.skin === look.top ? '#ff2d95' : shade(look.trim, -0.2));
      }
      // shoulder pad (own part so it overlaps the chest with a line)
      part();
      const s1 = at(1.0, 1.2);
      oval(s1[0], s1[1] + 0.3, 3.6 * b, 2.4 * b, 0.2, look.trim);
      break;
    }
    case 'overalls': {
      const b1 = at(0.72, -waist * 0.15);
      const bib = [
        ...at(0.18, waist * 0.95),
        ...at(0.72, waist * 0.6),
        ...at(0.72, -chest * 0.9),
        ...at(0.18, -waist * 1.05),
      ];
      inkPoly(bib, look.pants);
      ink([...at(0.72, waist * 0.6), ...at(0.72, -chest * 0.9)], px1, shade(look.pants, -0.35));
      const st = at(1.05, 0.6);
      ink([b1[0], b1[1], st[0], st[1]], px1 * 1.5, look.pants);
      const st2 = at(1.05, 3.4);
      ink([...at(0.72, waist * 0.5), st2[0], st2[1]], px1 * 1.5, look.pants);
      inkDot(b1[0], b1[1], px1 * 0.9, look.trim);
      const pk = at(0.45, -waist * 0.2);
      ink([pk[0] - 1.5, pk[1], pk[0] + 1.5, pk[1]], px1 * 0.8, shade(look.pants, -0.35));
      break;
    }
    case 'striped': {
      C.save();
      C.clip(torsoPath);
      for (const t of [0.3, 0.5, 0.7, 0.9]) {
        const a = at(t, chest * 1.4);
        const z = at(t, -chest * 1.4);
        ink([a[0], a[1], z[0], z[1]], 1.9, look.trim, 'butt');
      }
      C.restore();
      // ruffle collar
      const c = at(1.04, -0.6);
      for (let k = -2; k <= 2; k++)
        inkDot(c[0] + k * 1.5, c[1] + Math.abs(k) * -0.3, 1.1, '#ffffff');
      break;
    }
    case 'hoodie': {
      // drawstrings + pocket + zip
      const d0 = at(1.02, -chest * 0.45);
      ink([d0[0], d0[1], d0[0] + 0.3, d0[1] - 3.2], px1, look.trim);
      const z1 = at(1.0, -chest * 0.15);
      const z2 = at(0.28, -chest * 0.2);
      ink([z1[0], z1[1], z2[0], z2[1]], px1, shade(look.top, -0.3));
      const k1 = at(0.5, -waist * 0.95);
      const k2 = at(0.5, waist * 0.1);
      ink([k1[0], k1[1], k2[0], k2[1]], px1, shade(look.top, -0.3));
      const hem1 = at(0.27, -waist - 0.2);
      const hem2 = at(0.27, waist + 0.2);
      ink([hem1[0], hem1[1], hem2[0], hem2[1]], px1 * 1.6, look.trim);
      break;
    }
    default:
      break;
  }
  const beltCol = look.belt ?? shade(pc, -0.35);
  const b1 = at(beltT, waist + 0.6);
  const b2 = at(beltT, -waist - 0.5);
  ink([b1[0], b1[1], b2[0], b2[1]], look.belt ? 1.7 : px1, beltCol, 'butt');
  if (look.belt) {
    const bk = at(beltT, -waist * 0.55);
    inkDot(bk[0], bk[1], 0.9, shade(look.belt, 0.35));
  }
};

// ---------------------------------------------------------------------------
// Heads & faces
//
// Heads are painted in a local frame (origin = head centre, 7.2 units = one
// head radius, y up, facing right) in a 3/4 view: both eyes sit on the front
// half of the face, the nose breaks the front contour and the ear sits just
// behind the middle. Each character picks a skull/jaw silhouette, an eye
// kind, a resting mood and facial hair; the pose picks the expression.
// ---------------------------------------------------------------------------

type NoseKind = 'button' | 'straight' | 'broad' | 'small' | 'hook';

interface HeadGeo {
  /** silhouette control points (rounded by smoothFill), facing right */
  pts: number[];
  /** mouth centre */
  mx: number;
  my: number;
  ear: V2;
  nose: NoseKind;
  /** cheekbone accent under the near eye */
  cheek: boolean;
}

const HEADS: Record<HeadShape, HeadGeo> = {
  // balanced hero: rounded cranium, defined chin
  hero: {
    pts: [-7, 0.8, -5.7, 5.6, -1, 7.7, 4.4, 6.8, 7.1, 3.4, 7.2, 0.2, 7.0, -2.8, 7.2, -5.6, 5.2, -7.6, 0.8, -7.0, -3.2, -4.8, -6.4, -2.0],
    mx: 4.9,
    my: -4.5,
    ear: [-2.3, -0.5],
    nose: 'straight',
    cheek: false,
  },
  // square jaw, flat chin (Reacher, Batman, Tony)
  square: {
    pts: [-7, 0.8, -5.7, 5.6, -1, 7.7, 4.4, 6.8, 7.2, 3.4, 7.3, 0.2, 7.2, -2.8, 7.6, -6.6, 7.0, -8.2, -0.2, -8.2, -4.0, -6.6, -6.6, -2.2],
    mx: 5.0,
    my: -4.7,
    ear: [-2.4, -0.6],
    nose: 'straight',
    cheek: true,
  },
  // small cranium, jutting brow ridge, huge jaw (Hulk, bruisers)
  brute: {
    pts: [-6.8, 0.4, -5.6, 5.0, -1.4, 6.9, 3.8, 6.4, 8.2, 3.3, 7.0, 1.4, 7.8, -2.4, 8.4, -6.0, 7.8, -8.8, -0.2, -9.0, -4.6, -7.2, -6.9, -2.6],
    mx: 5.2,
    my: -5.0,
    ear: [-2.6, -1.0],
    nose: 'broad',
    cheek: true,
  },
  // anime: tall cranium, tapering to a neat pointed chin
  lean: {
    pts: [-6.8, 1.0, -5.6, 5.8, -1, 7.8, 4.4, 6.8, 6.9, 3.2, 7.1, 0.2, 6.7, -2.8, 6.0, -5.9, 4.4, -7.9, 1.2, -6.8, -2.8, -4.4, -6.2, -1.8],
    mx: 4.6,
    my: -4.5,
    ear: [-2.2, -0.4],
    nose: 'small',
    cheek: false,
  },
  // egg (Saitama): tall smooth dome, soft jaw
  egg: {
    pts: [-6.9, 1.4, -5.8, 6.6, -0.6, 8.8, 4.8, 7.4, 7.1, 3.6, 7.2, 0.0, 6.9, -3.2, 6.4, -6.0, 4.2, -7.7, 0.0, -7.0, -3.6, -5.0, -6.5, -2.0],
    mx: 4.7,
    my: -4.6,
    ear: [-2.4, -0.6],
    nose: 'button',
    cheek: false,
  },
  // round, fleshy (clowns, chubby thugs, drones)
  round: {
    pts: [-7.2, 0.8, -5.9, 5.8, -1, 7.8, 4.6, 6.9, 7.4, 3.4, 7.6, 0.0, 7.6, -3.2, 7.2, -6.2, 4.6, -8.0, 0.0, -7.6, -4.0, -5.6, -6.8, -2.4],
    mx: 5.0,
    my: -4.6,
    ear: [-2.4, -0.6],
    nose: 'button',
    cheek: false,
  },
};

type Expr =
  | 'calm'
  | 'mean'
  | 'cocky'
  | 'deadpan'
  | 'shout'
  | 'intense'
  | 'pain'
  | 'dazed'
  | 'ko'
  | 'grin'
  | 'snarl';

const exprOf = (look: Look, p: Pose): Expr => {
  if (p.face) return p.face;
  if (p.eyes === 'x') return 'ko';
  if (p.eyes === 'shut') return p.mouth === 'open' ? 'pain' : 'dazed';
  if (p.mouth === 'open') return p.aura ? 'intense' : 'shout';
  if (p.mouth === 'grin') return 'grin';
  if (p.aura) return 'intense';
  return look.mood ?? (look.brow ? 'mean' : 'calm');
};

const headShapeOf = (look: Look): HeadShape =>
  look.head ?? (look.build >= 1.4 ? 'brute' : look.brow ? 'square' : 'hero');

const browCol = (look: Look) =>
  look.hairStyle === 'bald' ||
  look.hairStyle === 'clown' ||
  look.hair === look.skin ||
  luma(look.hair) > 0.75
    ? shade(look.skin, -0.55)
    : shade(look.hair, -0.25);

const spike = (cx: number, cy: number, angDeg: number, len: number, half: number) => {
  const a = (angDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  moveTo(cx - dy * half, cy + dx * half);
  quadTo(
    cx + dx * len * 0.55 - dy * half * 0.6,
    cy + dy * len * 0.55 + dx * half * 0.6,
    cx + dx * len,
    cy + dy * len
  );
  quadTo(
    cx + dx * len * 0.55 + dy * half * 0.6,
    cy + dy * len * 0.55 - dx * half * 0.6,
    cx + dy * half,
    cy - dx * half
  );
  close();
};

const spikes = (
  cx: number,
  cy: number,
  angs: number[],
  len: number,
  half: number,
  color: string
) => {
  begin();
  for (const a of angs) spike(cx, cy, a, len, half);
  fill(color);
};

/** Trace a smooth closed outline into a fresh Path2D (also the current path). */
const smoothPath = (pts: number[]): Path2D => {
  const n = pts.length / 2;
  const mx = (i: number) => (pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2;
  const my = (i: number) => (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2;
  begin();
  moveTo(mx(n - 1), my(n - 1));
  for (let i = 0; i < n; i++) quadTo(pts[i * 2], pts[i * 2 + 1], mx(i), my(i));
  close();
  return currentPath;
};

const scalePts = (pts: number[], k: number, ox: number, oy: number) =>
  pts.map((v, i) => (i % 2 ? oy + (v - oy) * k : ox + (v - ox) * k));

/** Run `fn` with both the colour and id buffers clipped to `path`. */
const clipped = (path: Path2D, fn: () => void) => {
  C.save();
  C.clip(path);
  I?.save();
  I?.clip(path);
  fn();
  C.restore();
  I?.restore();
};

/** Hair mass behind the skull (spikes, ponytails, cowl ears). Local frame. */
const hairBack = (look: Look) => {
  const c = look.hair;
  part();
  switch (look.hairStyle) {
    case 'slick':
      // combed straight back into a ducktail
      spikes(-4.6, 2.6, [196, 214, 232], 5.0, 2.2, c);
      break;
    case 'messy':
      spikes(-1, 2.0, [62, 92, 122, 150, 178, 204], 9.8, 2.3, c);
      break;
    case 'spiky':
      // Goku: big swept spikes fanning up and back
      spikes(-1.4, 2.0, [40, 66, 92, 118, 144, 168, 192, 214], 12.6, 2.9, c);
      break;
    case 'flame':
      // Vegeta: one tall flame standing straight up
      spikes(-0.8, 3.0, [68, 78, 88, 98, 108, 120, 134, 150], 17, 3.0, c);
      break;
    case 'spikyWhite':
      // Gojo: tousled upward spikes
      spikes(-0.6, 2.6, [54, 74, 94, 114, 136, 160, 184], 11.4, 2.7, c);
      break;
    case 'mohawk':
      spikes(-1.2, 3.4, [72, 92, 112, 134, 156], 10.6, 1.7, c);
      break;
    case 'long':
      capsule(-3.6, 1.6, 4.0, -5.2, -9, 3.0, c);
      break;
    case 'clown':
      // fluffy tufts on the sides of a bald dome
      disc(-5.6, 2.2, 3.6, c);
      disc(-3.8, 5.6, 3.0, c);
      disc(-7.4, -1.2, 2.8, c);
      disc(-2.4, 7.2, 2.2, c);
      break;
    default:
      break;
  }
  if (look.eyeStyle === 'cowl') {
    const col = look.mask ?? '#333';
    polyFill([-3.6, 5.4, -2.6, 11.6, -0.8, 6.8], col);
    polyFill([0.8, 7.0, 2.6, 11.6, 3.8, 6.2], col);
  }
};

/**
 * Hair that hugs the skull: everything above the hairline, clipped to a
 * slightly grown head silhouette so the hair has a little volume.
 */
const hairCap = (look: Look, geo: HeadGeo) => {
  const st = look.hairStyle;
  const f =
    st === 'slick'
      ? 5.4
      : st === 'short'
        ? 5.2
        : st === 'mohawk'
          ? 5.0
          : st === 'cap' || st === 'beanie' || st === 'helmet' || st === 'hardhat'
            ? 3.4
            : 4.8;
  const known =
    st === 'short' ||
    st === 'slick' ||
    st === 'messy' ||
    st === 'spiky' ||
    st === 'flame' ||
    st === 'spikyWhite' ||
    st === 'long' ||
    st === 'mohawk';
  // hats use look.hair as the hat colour, so they get no hair cap
  if (!known) return;
  // widow's peak dips the hairline above the brow (Vegeta)
  const peak = st === 'flame' ? 2.2 : 0;
  const line = [
    11, 14,
    11, f + 0.8,
    6.4, f + 0.1,
    4.4, f - peak,
    2.8, f - 0.2,
    0.9, f - 0.4,
    0.0, f - 1.6,
    -0.3, -1.4, // sideburn in front of the ear
    -1.6, -1.6,
    -2.0, 1.4,
    -4.0, 1.2,
    -5.0, -2.6, // nape
    -12, -2.6,
    -12, 14,
  ];
  const grown = smoothPath(scalePts(geo.pts, 1.08, 0, 0.6));
  const col = st === 'mohawk' ? mix(look.skin, look.hair, 0.38) : look.hair;
  if (st === 'mohawk') {
    // shaved sides: colour only, the skull stays one part
    C.save();
    C.clip(grown);
    begin();
    moveTo(line[0], line[1]);
    for (let i = 2; i < line.length; i += 2) lineTo(line[i], line[i + 1]);
    close();
    C.fillStyle = col;
    C.fill();
    C.restore();
    return;
  }
  part();
  clipped(grown, () => polyFill(line, col));
  // strand accents
  const sc = shade(col, luma(col) > 0.6 ? -0.18 : 0.22);
  if (st === 'slick') {
    ink([5.6, f + 0.9, 1.0, f + 2.2, -3.6, f + 0.6], px1 * 0.9, sc);
    ink([4.8, f + 2.6, 0.0, f + 3.2, -4.0, f + 2.0], px1 * 0.9, sc);
  } else if (st === 'short') {
    ink([5.2, f + 0.6, 2.8, f + 1.4], px1 * 0.9, sc);
  }
};

/** Bangs and headgear painted over the face. Local frame. */
const hairFront = (look: Look) => {
  const c = look.hair;
  const R = 7.2;
  part();
  switch (look.hairStyle) {
    case 'messy':
      // Denji: ragged fringe falling over the forehead
      polyFill([0.6, 7.6, 7.8, 5.6, 5.4, 4.6, 5.2, 2.6, 3.6, 4.2, 2.8, 2.4, 1.6, 4.4, -0.4, 4.0], c);
      break;
    case 'spiky':
      // Goku: three bangs hanging forward over the brow
      polyFill([0.2, 7.6, 8.6, 5.4, 6.0, 4.8, 7.4, 2.0, 4.4, 4.4, 4.2, 2.4, 2.6, 4.6, 0.8, 3.6], c);
      break;
    case 'flame':
      // swept-up front, no fringe: the widow's peak carries it
      polyFill([1.2, 7.4, 6.6, 6.0, 4.6, 8.8], c);
      break;
    case 'spikyWhite':
      polyFill([0.6, 7.4, 7.6, 6.2, 5.6, 4.8, 6.6, 9.2, 3.4, 8.4], c);
      break;
    case 'short':
      // short crop: a neat brushed-up front
      polyFill([1.6, 7.6, 6.8, 6.2, 5.6, 5.0, 3.6, 5.6], c);
      break;
    case 'slick':
      polyFill([2.4, 7.6, 6.8, 6.0, 6.0, 5.2], c);
      break;
    case 'cap': {
      begin();
      arc(0, 1.6, R + 0.5, 0.1, Math.PI - 0.05);
      close();
      fill(c);
      capsule(2.0, 2.6, 1.2, R + 4.2, 1.9, 0.9, shade(c, -0.12));
      inkDot(-0.3, R + 1.9, 0.8, look.trim);
      ink([-R * 0.6, 3.1, -0.5, R + 1.6], px1, shade(c, -0.3));
      break;
    }
    case 'beanie': {
      begin();
      arc(0, 1.6, R + 0.6, 0.08, Math.PI - 0.08);
      close();
      fill(c);
      capsule(-R - 0.4, 3.0, 1.5, R + 0.6, 3.0, 1.5, look.trim);
      disc(-1, R + 3.0, 1.7, look.trim);
      for (let k = -2; k <= 2; k++)
        ink([k * 2.2, 4.7, k * 2.2 - 0.2, R], px1 * 0.7, shade(c, -0.22));
      break;
    }
    case 'helmet': {
      begin();
      arc(0, 0.9, R + 1.0, -0.15, Math.PI + 0.25);
      close();
      fill(c);
      capsule(1.8, 1.0, 1.0, R + 2.4, 0.5, 0.8, look.trim);
      ink([-1, R + 1.7, -1, 1.5], px1 * 1.4, shade(c, 0.25));
      break;
    }
    case 'hardhat': {
      begin();
      arc(0, 1.8, R + 0.8, 0.05, Math.PI - 0.05);
      close();
      fill(c);
      capsule(-R - 1.6, 3.0, 0.95, R + 2.8, 3.0, 0.95, shade(c, -0.1));
      ink([0, 3.4, 0, R + 2.2], px1 * 1.6, shade(c, 0.3));
      break;
    }
    case 'crown': {
      polyFill(
        [-5.5, R - 1.2, -5.8, R + 4.7, -2.8, R + 2.1, 0, R + 5.9, 2.8, R + 2.1, 5.8, R + 4.7, 5.5, R - 1.2],
        '#f7c948'
      );
      inkDot(0, R + 1.1, 1.15, '#e0306a');
      inkDot(-3.6, R + 0.7, 0.8, '#34e7ff');
      inkDot(3.6, R + 0.7, 0.8, '#34e7ff');
      break;
    }
    case 'bald':
      // scalp shine
      ink([-2.6, 6.2, -0.4, 6.9, 1.4, 6.8], px1 * 1.2, mix(look.skin, '#ffffff', 0.55));
      break;
    default:
      break;
  }
};

/** Facial hair on the jaw. `stubble` is colour only; the rest are parts. */
const drawBeard = (look: Look, geo: HeadGeo, head: Path2D) => {
  const col = look.beard ?? look.hair;
  const style = look.beardStyle ?? (look.beard ? 'full' : undefined);
  if (!style) return;
  const { mx, my } = geo;
  // jaw region: sideburn -> cheek line under the cheekbone -> under the nose
  const jaw = [
    -0.6, 1.2,
    -0.4, -1.0,
    1.6, -2.2,
    3.6, -2.9,
    mx + 0.6, my + 1.4,
    mx + 2.8, my + 1.7,
    12, my + 1.5,
    12, -14,
    -4.6, -14,
    -3.8, -4.4,
    -1.8, -1.4,
    -1.7, 1.2,
  ];
  if (style === 'stubble') {
    C.save();
    C.clip(head);
    C.fillStyle = mix(look.skin, col, 0.32);
    begin();
    moveTo(jaw[0], jaw[1]);
    for (let i = 2; i < jaw.length; i += 2) lineTo(jaw[i], jaw[i + 1]);
    close();
    C.fill();
    C.restore();
    return;
  }
  part();
  noCast[partN] = 1;
  const grown = smoothPath(scalePts(geo.pts, 1.1, 0.5, -1));
  if (style === 'full') clipped(grown, () => polyFill(jaw, col));
  else if (style === 'goatee')
    clipped(grown, () =>
      polyFill([mx - 1.6, my - 0.6, mx + 2.6, my - 0.6, mx + 3.4, -14, mx - 1.8, -14], col)
    );
};

/** Mustache over the upper lip (full beards, goatees, mustaches). */
const drawMustache = (look: Look, geo: HeadGeo, open: boolean) => {
  const style = look.beardStyle ?? (look.beard ? 'full' : undefined);
  if (style !== 'full' && style !== 'goatee' && style !== 'mustache') return;
  const col = look.beard ?? look.hair;
  const { mx, my } = geo;
  const lift = open ? 0.9 : 0.4;
  ink(
    [mx - 2.4, my + lift - 0.4, mx - 0.6, my + lift + 0.6, mx + 1.6, my + lift + 0.7, mx + 2.8, my + lift - 0.1],
    1.15,
    col
  );
};

/** Below this many device px per head unit, eyes are stamped as hard pixels. */
const PIXEL_FACE = 2.5;

interface EyeLook {
  lid: [number, number];
  lower: number;
  pdy: number;
  pupil: number;
  open: boolean;
  ex: Expr;
  brow: [number, number];
}

/**
 * Hand-pixelled eyes for sprite-sized heads: anti-aliased 3px ellipses turn
 * to grey mush, so whites, pupils, lids and brows are stamped on the device
 * pixel grid (both colour and id buffers, as unshaded detail).
 */
const pixelEyes = (
  look: Look,
  kind: EyeKind,
  eyes: Array<{ x: number; rx: number; inner: number }>,
  y: number,
  e: EyeLook,
  headCol: string,
  browC: string,
  /** mask lenses: bigger whites, no pupil or brow ('big' = Spider-Man) */
  lens?: 'big' | 'slit'
) => {
  const m = C.getTransform();
  const u = Math.hypot(m.a, m.b);
  const big = u >= 1.45;
  // device direction of the face's front (+x local)
  const front = m.a >= 0 ? 1 : -1;
  const L = OUTLINE;
  const white = look.eyeWhite ?? '#fbf8f2';
  const pupilCol = look.iris ?? L;
  C.save();
  C.setTransform(1, 0, 0, 1, 0, 0);
  if (I) {
    I.save();
    I.setTransform(1, 0, 0, 1, 0, 0);
    setPart(DETAIL_ID);
  }
  const px = (x: number, yy: number, w: number, h: number, col: string) => {
    if (w <= 0 || h <= 0) return;
    C.fillStyle = col;
    C.fillRect(x, yy, w, h);
    I?.fillRect(x, yy, w, h);
  };
  /** 1px (or thicker) line between device points */
  const pline = (x0: number, y0: number, x1: number, y1: number, th: number, col: string) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      px(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, th, col);
    }
  };
  for (const eye of eyes) {
    const near = eye.inner > 0;
    const c = m.transformPoint(new DOMPoint(eye.x + (lens ? 0 : near ? -0.25 : 0.4), y));
    let w = (near ? 3 : 2) + (big ? 1 : 0);
    if (kind === 'dot' && near) w -= 1;
    let h = big ? 5 : 4;
    if (kind === 'narrow') h -= 1;
    if (lens === 'big') {
      w += 1;
      h += 1;
    } else if (lens === 'slit') h = big ? 3 : 2;
    const left = Math.round(c.x - w / 2);
    const top = Math.round(c.y - h / 2);
    // inner corner side in device space
    const innerDir = near ? front : -front;
    const colT = (i: number) => {
      // 1 at the inner corner, 0 at the outer
      const t = w > 1 ? i / (w - 1) : 0.5;
      return innerDir > 0 ? t : 1 - t;
    };
    if (e.ex === 'dazed' && Math.abs(m.b) > Math.abs(m.a) && !lens) {
      // lying down: a shut-eye line along the (rotated) face
      const a = m.transformPoint(new DOMPoint(eye.x - 1.1, y - 0.2));
      const b = m.transformPoint(new DOMPoint(eye.x + 1.1, y - 0.2));
      pline(a.x, a.y, b.x, b.y, 1, L);
      continue;
    }
    if (!e.open) {
      const pat =
        e.ex === 'pain'
          ? ['XX.', '..X', 'XX.']
          : ['X.X', '.X.', 'X.X'];
      const pw = 3;
      const pl = Math.round(c.x - pw / 2);
      const pt = Math.round(c.y - 1.5);
      pat.forEach((row, r) => {
        for (let i = 0; i < pw; i++) {
          // chevrons point at the inner corner
          const ch = innerDir > 0 ? row[i] : row[pw - 1 - i];
          if (ch === 'X') px(pl + i, pt + r, 1, 1, L);
        }
      });
      // brow over the closed eye
      const by = pt - 2;
      const bi = Math.round(e.brow[0] * u * 0.8);
      const bo = Math.round(e.brow[1] * u * 0.8);
      const xi = innerDir > 0 ? pl + pw : pl - 1;
      const xo = innerDir > 0 ? pl - 1 : pl + pw;
      pline(xo, by - bo, xi, by - bi, look.brow ? 2 : 1, browC);
      continue;
    }
    // ink rim on top and sides, a soft skin-shade line underneath (a full
    // dark ring reads as spectacles at this size)
    px(left - 1, top, w + 2, lens ? h : h - 1, L);
    px(left, top - 1, w, 1, L);
    px(left, top + h, w, 1, lens ? L : shade(headCol, -0.32));
    px(left, top, w, h, white);
    if (lens === 'big') {
      // teardrop: knock the outer-bottom corner back into the rim
      const ox = innerDir > 0 ? left : left + w - 1;
      px(ox, top + h - 1, 1, 1, L);
      px(innerDir > 0 ? left - 1 : left + w, top + h - 1, 1, 2, headCol);
    }
    const pw = kind === 'dot' ? 1 : big && w >= 3 ? 2 : 1;
    let ph = kind === 'dot' ? (big ? 2 : 1) : big ? 3 : 2;
    if (e.pupil < 0.5 && ph > 1) ph -= 1; // shrunken pupils when wide-eyed
    const inset = w >= 3 && pw === 1 ? 1 : 0;
    const pl = front > 0 ? left + w - pw - inset : left + inset;
    const pt =
      kind === 'sharp'
        ? top + h - ph
        : Math.min(top + h - ph, top + Math.round((h - ph) / 2) + (e.pdy < 0 ? 1 : 0));
    if (!lens) px(pl, pt, pw, ph, pupilCol);
    // eyelids: skin from the top down to the lid line, per column
    for (let i = 0; i < w; i++) {
      const t = colT(i);
      const f = e.lid[1] + (e.lid[0] - e.lid[1]) * t;
      const n = Math.min(h - 1, Math.round(f * h));
      if (n > 0) {
        px(left + i, top - 1, 1, n, headCol);
        px(left + i, top - 1 + n, 1, 1, L);
        // the side rim above the lid line goes too
        if (i === 0) px(left - 1, top, 1, n - 1, headCol);
        if (i === w - 1) px(left + w, top, 1, n - 1, headCol);
      }
      if (e.lower > 0) {
        const nb = Math.min(h - 1 - n, Math.max(1, Math.round(e.lower * h)));
        if (nb > 0) {
          px(left + i, top + h - nb + 1, 1, nb, headCol);
          px(left + i, top + h - nb, 1, 1, L);
        }
      }
    }
    if (lens) continue;
    if (kind === 'sharp') {
      // anime lash flick at the outer corner
      const nOut = Math.min(h - 1, Math.round(e.lid[1] * h));
      px(innerDir > 0 ? left - 2 : left + w + 1, top - 1 + nOut, 1, 1, L);
    }
    // brow: rests one pixel above the rim, inner end carries the mood
    const by = top - 3;
    const bi = Math.round(e.brow[0] * u * 0.8);
    const bo = Math.round(e.brow[1] * u * 0.8);
    const xi = innerDir > 0 ? left + w : left - 1;
    const xo = innerDir > 0 ? left - 1 : left + w;
    const th = look.brow ? 2 : 1;
    const xm = Math.round((xi + xo) / 2);
    const arch = e.ex === 'grin' || e.ex === 'calm' ? 1 : 0;
    pline(xo, by - bo + (th > 1 ? -1 : 0), xm, by - Math.round((bi + bo) / 2) - arch + (th > 1 ? -1 : 0), th, browC);
    pline(xm, by - Math.round((bi + bo) / 2) - arch + (th > 1 ? -1 : 0), xi, by - bi + (th > 1 ? -1 : 0), th, browC);
  }
  C.restore();
  if (I) {
    I.restore();
    setPart(partN);
  }
};

/** Eye whites, pupils, lids and brows for the expression. Local frame. */
const drawEyes = (look: Look, ex: Expr, headCol: string, lw: number) => {
  const L = OUTLINE;
  const kind = look.eyeKind ?? 'round';
  const y = 0.9;
  const ry0 = kind === 'narrow' ? 1.2 : kind === 'dot' ? 1.35 : kind === 'sharp' ? 1.45 : 1.7;
  const eyes = [
    { x: 2.3, rx: kind === 'dot' ? 1.1 : 1.3, inner: 1 }, // near eye: inner corner faces front
    { x: 5.5, rx: kind === 'dot' ? 0.9 : 1.02, inner: -1 }, // far eye, foreshortened
  ];
  // [lid at inner corner, lid at outer corner] as fraction of the eye height
  let lid: [number, number] = [0.08, 0.04];
  // brow offsets [inner, outer] from rest height
  let brow: [number, number] = [0.1, 0.25];
  let pupil = kind === 'dot' ? 0.5 : 0.78;
  let pdy = 0;
  let lower = 0;
  let open = true;
  switch (ex) {
    case 'mean':
      lid = [0.5, 0.2];
      brow = [-0.75, 0.3];
      break;
    case 'cocky':
      lid = [0.38, 0.3];
      brow = [-0.3, 0.2];
      break;
    case 'deadpan':
      lid = [0.5, 0.5];
      brow = [0.2, 0.2];
      pupil *= 0.7;
      break;
    case 'shout':
      lid = [0.3, 0];
      brow = [-0.9, 0.45];
      pupil *= 0.85;
      break;
    case 'intense':
      lid = [0.28, 0];
      brow = [-1.0, 0.55];
      pupil *= 0.6;
      break;
    case 'snarl':
      lid = [0.55, 0.25];
      brow = [-1.0, 0.25];
      lower = 0.22;
      break;
    case 'grin':
      lid = [0.1, 0.1];
      brow = [0.5, 0.45];
      lower = 0.3;
      break;
    case 'dazed':
      lid = [0.58, 0.62];
      brow = [0.5, 0];
      pdy = -0.45;
      break;
    case 'pain':
    case 'ko':
      open = false;
      brow = ex === 'pain' ? [0.85, -0.3] : [0.4, 0.4];
      break;
    default:
      break;
  }
  if (kind === 'sharp') lid = [Math.max(lid[0], 0.22), Math.max(lid[1], 0.12)];
  const bc = browCol(look);
  const bw = look.brow ? 1.55 : kind === 'sharp' ? 1.25 : 1.0;
  if (1 / lw < PIXEL_FACE) {
    pixelEyes(look, kind, eyes, y, { lid, lower, pdy, pupil, open, ex, brow }, headCol, bc);
    return;
  }
  asDetail(() => {
    for (const e of eyes) {
      const ry = ry0 * (e.inner < 0 ? 0.96 : 1);
      if (!open) {
        if (ex === 'pain') {
          // squeezed shut: chevrons pointing at the nose
          const d = e.inner;
          ink([e.x - d * 1.2, y + 1.1, e.x + d * 0.9, y + 0.1, e.x - d * 1.2, y - 0.8], lw * 1.25, L);
        } else {
          ink([e.x - 1.0, y + 1.0, e.x + 1.0, y - 1.0], lw * 1.15, L);
          ink([e.x - 1.0, y - 1.0, e.x + 1.0, y + 1.0], lw * 1.15, L);
        }
        continue;
      }
      // dark rim, then the white
      C.beginPath();
      C.ellipse(e.x, y, e.rx + lw, ry + lw, 0, 0, TAU);
      C.fillStyle = L;
      C.fill();
      if (I) {
        I.beginPath();
        I.ellipse(e.x, y, e.rx + lw, ry + lw, 0, 0, TAU);
        I.fill();
      }
      const white = look.eyeWhite ?? '#fbf8f2';
      C.beginPath();
      C.ellipse(e.x, y, e.rx, ry, 0, 0, TAU);
      C.fillStyle = white;
      C.fill();
      // pupil looks forward
      const pr = pupil * (e.inner < 0 ? 0.92 : 1);
      C.beginPath();
      C.ellipse(e.x + e.rx * 0.38, y + pdy, pr * 0.85, pr * 1.2, 0, 0, TAU);
      C.fillStyle = look.iris ?? L;
      C.fill();
      if (look.iris) inkDot(e.x + e.rx * 0.38, y + pdy, pr * 0.45, L);
      // lids cut the top (and bottom when smiling), clipped to the eye
      C.save();
      C.beginPath();
      C.ellipse(e.x, y, e.rx + lw, ry + lw, 0, 0, TAU);
      C.clip();
      const top = ry + lw;
      const li = y + top - 2 * top * lid[0];
      const lo = y + top - 2 * top * lid[1];
      const xin = e.x + e.inner * (e.rx + lw);
      const xout = e.x - e.inner * (e.rx + lw);
      C.beginPath();
      C.moveTo(xin, li);
      C.lineTo(xout, lo);
      C.lineTo(xout, y + top + 1);
      C.lineTo(xin, y + top + 1);
      C.closePath();
      C.fillStyle = headCol;
      C.fill();
      if (lower > 0) {
        const lb = y - top + 2 * top * lower;
        C.beginPath();
        C.moveTo(xin, lb - 0.3);
        C.quadraticCurveTo(e.x, lb + 0.5, xout, lb - 0.3);
        C.lineTo(xout, y - top - 1);
        C.lineTo(xin, y - top - 1);
        C.closePath();
        C.fill();
      }
      C.restore();
      // lid line (heavier for anime eyes: reads as lashes)
      ink([xin, li, xout, lo], lw * (kind === 'sharp' ? 1.6 : 1.1), L);
      if (lower > 0) {
        const lb = y - top + 2 * top * lower;
        ink([xin, lb - 0.3, e.x, lb + 0.15, xout, lb - 0.3], lw, L);
      }
    }
  });
  // brows follow the lid slope; inner ends drive the mood
  for (const e of eyes) {
    const by = y + ry0 + 1.0;
    const half = e.inner > 0 ? 1.6 : 1.25;
    const xin = e.x + e.inner * half * 0.8;
    const xout = e.x - e.inner * half;
    const yin = by + brow[0];
    const yout = by + brow[1];
    const ym = (yin + yout) / 2 + (ex === 'grin' || ex === 'calm' ? 0.25 : 0.05);
    ink([xout, yout, e.x, ym, xin, yin], bw * (e.inner < 0 ? 0.9 : 1), bc);
  }
};

/** Mouth for the expression, centred on (mx, my). Local frame. */
const drawMouth = (look: Look, geo: HeadGeo, ex: Expr, lip: string, lw: number) => {
  const { mx, my } = geo;
  const L = OUTLINE;
  const teeth = '#fbf8f2';
  const clown = look.hairStyle === 'clown';
  const lipCol = clown ? (look.noseColor ?? '#e63946') : null;
  asDetail(() => {
    switch (ex) {
      case 'shout':
      case 'intense': {
        // open yell: dark mouth, top teeth, tongue
        const w = ex === 'intense' ? 2.1 : 1.8;
        const o = [mx - w, my + 1.0, mx + w + 0.3, my + 1.2, mx + w - 0.2, my - 1.6, mx + 0.2, my - 2.5, mx - w + 0.5, my - 1.4];
        if (lipCol) {
          C.lineWidth = lw * 2.2;
          C.strokeStyle = lipCol;
          inkPoly(o, L);
          C.stroke();
        } else inkPoly(o, L);
        inkPoly([mx - w + 0.5, my + 0.8, mx + w - 0.1, my + 0.95, mx + w - 0.3, my + 0.15, mx - w + 0.7, my + 0.05], teeth);
        inkPoly([mx - 0.8, my - 1.4, mx + 1.4, my - 1.3, mx + 0.6, my - 2.1], '#c2304a');
        break;
      }
      case 'pain':
      case 'snarl': {
        // gritted teeth, corners pulled down (pain) or back (snarl)
        const dn = ex === 'pain' ? 0.6 : 0.1;
        const o = [mx - 2.1, my + 0.2 - dn, mx - 1.2, my + 0.9, mx + 1.6, my + 1.0, mx + 2.3, my + 0.3 - dn, mx + 1.6, my - 1.0, mx - 1.2, my - 1.0];
        inkPoly(o, L);
        inkPoly([mx - 1.3, my + 0.5, mx + 1.6, my + 0.6, mx + 1.4, my - 0.6, mx - 1.1, my - 0.6], teeth);
        ink([mx - 1.3, my, mx + 1.6, my + 0.05], lw * 0.8, L, 'butt');
        if (look.fangs) {
          inkPoly([mx - 0.6, my + 0.55, mx - 0.2, my - 0.2, mx + 0.2, my + 0.55], teeth);
          inkPoly([mx + 0.6, my - 0.55, mx + 1.0, my + 0.2, mx + 1.4, my - 0.55], teeth);
        }
        break;
      }
      case 'grin': {
        // big toothy D-shaped grin, corners up
        const o = [mx - 2.4, my + 1.3, mx + 2.6, my + 1.4, mx + 2.0, my - 0.6, mx + 0.4, my - 1.7, mx - 1.4, my - 0.6];
        if (lipCol) {
          C.lineWidth = lw * 2.2;
          C.strokeStyle = lipCol;
          inkPoly(o, L);
          C.stroke();
        } else inkPoly(o, L);
        inkPoly([mx - 1.6, my + 1.0, mx + 2.0, my + 1.1, mx + 1.6, my + 0.0, mx - 1.0, my + 0.0], teeth);
        if (look.fangs)
          for (let k = 0; k < 4; k++)
            ink([mx - 1.2 + k * 0.9, my + 0.05, mx - 0.85 + k * 0.9, my + 0.75], lw * 0.7, L);
        inkPoly([mx - 0.4, my - 0.5, mx + 1.2, my - 0.4, mx + 0.4, my - 1.2], '#c2304a');
        break;
      }
      case 'ko':
      case 'dazed': {
        // slack mouth (tongue out when KO'd)
        inkPoly([mx - 1.2, my + 0.5, mx + 1.4, my + 0.6, mx + 0.9, my - 1.0, mx - 0.8, my - 0.9], L);
        if (ex === 'ko') inkPoly([mx + 0.1, my - 0.6, mx + 1.5, my - 0.6, mx + 1.4, my - 2.2, mx + 0.4, my - 2.0], '#d8506a');
        break;
      }
      default: {
        if (lipCol) {
          // painted clown smile
          ink([mx - 2.6, my + 1.2, mx - 1.2, my - 0.3, mx + 1.4, my - 0.3, mx + 2.8, my + 1.4], lw * 2.6, lipCol);
          ink([mx - 2.2, my + 0.8, mx - 1.0, my - 0.1, mx + 1.4, my - 0.1, mx + 2.5, my + 1.0], lw, L);
        } else if (ex === 'mean') {
          ink([mx - 1.8, my - 0.4, mx - 0.4, my + 0.15, mx + 1.6, my - 0.25], lw * 1.2, lip);
        } else if (ex === 'cocky') {
          // smirk: one corner up
          ink([mx - 1.7, my - 0.2, mx + 0.6, my - 0.15, mx + 2.0, my + 0.8], lw * 1.2, lip);
        } else if (ex === 'deadpan') {
          ink([mx - 0.6, my, mx + 1.0, my], lw * 1.1, lip);
        } else {
          ink([mx - 1.8, my + 0.35, mx, my - 0.2, mx + 1.7, my + 0.45], lw * 1.15, lip);
        }
        break;
      }
    }
  });
};

const drawNose = (look: Look, geo: HeadGeo, col: string) => {
  part();
  if (look.hairStyle === 'clown') {
    disc(8.0, -1.2, 2.3, look.noseColor ?? '#e63946');
    return;
  }
  switch (geo.nose) {
    case 'straight':
      smoothFill([6.4, 1.2, 8.8, -1.6, 8.2, -2.6, 6.2, -2.6, 6.0, -0.4], col);
      break;
    case 'broad':
      smoothFill([6.6, 1.0, 9.3, -1.4, 9.0, -2.9, 6.4, -3.0, 6.0, -0.6], col);
      break;
    case 'small':
      polyFill([6.4, 0.2, 8.0, -1.9, 6.6, -2.2], col);
      break;
    case 'hook':
      smoothFill([6.4, 1.4, 9.2, -0.6, 8.8, -2.8, 6.2, -2.6], col);
      break;
    default:
      oval(7.8, -1.4, 1.65, 1.4, -0.3, col);
      break;
  }
};

const drawHead = (look: Look, j: Joints, p: Pose) => {
  const [hx, hy] = j.head;
  const k = j.R / 7.2;
  // neck (body frame)
  part();
  capsule(j.sh[0] - 0.2, j.sh[1] - 1, 2.3, hx - 0.8, hy - j.R + 1.8, 2.1, shade(look.skin, -0.1));
  const ctxs = I ? [C, I] : [C];
  for (const c of ctxs) {
    c.save();
    c.translate(hx, hy);
    c.scale(k, k);
  }
  const outerPx = px1;
  px1 = px1 / k;
  const lw = px1;
  const es = look.eyeStyle;
  const masked = es === 'mask' || es === 'cowl';
  const headCol = masked ? (look.mask ?? '#c22') : look.skin;
  const geo = HEADS[headShapeOf(look)];
  const ex = exprOf(look, p);

  hairBack(look);
  part();
  noCast[partN] = 1;
  const head = smoothPath(geo.pts);
  fill(headCol);
  if (geo.cheek && !masked)
    ink([0.6, -1.6, 2.4, -2.4, 4.2, -2.3], lw * 0.9, shade(headCol, -0.16));
  if (look.brow && !masked)
    // heavy brow ridge shadow
    ink([1.0, 2.9, 4.0, 3.3, 7.2, 2.6], lw * 1.2, shade(headCol, -0.12));
  if (!masked) drawBeard(look, geo, head);
  if (!masked && es !== 'visor') hairCap(look, geo);
  if (es === 'cowl') {
    // cowl opening: mouth, chin and lower cheeks show skin
    part();
    noCast[partN] = 1;
    clipped(head, () =>
      polyFill([-1.6, -8.6, -0.6, -3.4, 1.8, -1.4, 4.4, -1.0, 6.4, -2.4, 12, -2.6, 12, -12, -1.6, -12], look.skin)
    );
  }
  // ear
  if (!masked && es !== 'visor') {
    // painted on the head (a separate part would ring it in ink)
    const [ex0, ey0] = geo.ear;
    const ec = shade(look.skin, -0.24);
    inkDot(ex0, ey0, 1.35, ec);
    inkDot(ex0 + 0.3, ey0 + 0.05, 1.35 - lw * 0.9, look.skin);
    ink([ex0 + 0.5, ey0 + 0.8, ex0 - 0.2, ey0 + 0.2, ex0 + 0.3, ey0 - 0.6], lw * 0.9, ec);
  }
  if (es !== 'visor' && es !== 'mask') drawNose(look, geo, headCol);
  else if (es === 'mask') {
    // a hint of nose under the mask
    part();
    oval(7.4, -1.6, 1.2, 1.1, -0.3, headCol);
  }
  const L = OUTLINE;
  if (es === 'cartoon') {
    drawEyes(look, ex, headCol, lw);
  } else if (es === 'mask' || es === 'cowl') {
    // lenses: the top edge carries the expression
    const big = es === 'mask';
    let lidIn = big ? -0.3 : 0.2;
    let lidOut = big ? 0.3 : 0;
    if (ex === 'mean' || ex === 'snarl' || ex === 'shout' || ex === 'intense') lidIn -= 0.9;
    if (ex === 'pain' || ex === 'ko' || ex === 'dazed') {
      lidIn -= 0.6;
      lidOut -= 0.9;
    }
    if (ex === 'grin') lidIn += 0.3;
    const y = big ? 0.8 : 1.0;
    const lens = (x: number, rx: number, ry: number, inner: number) => {
      const xi = x + inner * rx;
      const xo = x - inner * rx;
      const pts = big
        ? [xi, y + ry * 0.55 + lidIn, xo - inner * 0.4, y + ry + lidOut, xo, y - ry * 0.2, x - inner * rx * 0.2, y - ry, xi, y - ry * 0.4]
        : [xi, y + 0.5 + lidIn * 0.6, xo, y + 1.0 + lidOut * 0.6, xo + inner * 0.4, y - 0.6, xi, y - 0.4];
      C.lineWidth = lw * (big ? 2.2 : 1.6);
      C.strokeStyle = L;
      C.lineJoin = 'round';
      inkPoly(pts, '#fbf8f2');
      C.stroke();
      if (I) {
        I.lineWidth = C.lineWidth;
        I.lineJoin = 'round';
        I.stroke();
      }
    };
    if (big) {
      // web lines radiating from between the eyes
      const wc = shade(headCol, -0.42);
      const w = lw * 0.6;
      ink([4.0, 1.0, -5.6, 4.4], w, wc);
      ink([4.0, 1.0, -1.2, 7.4], w, wc);
      ink([4.0, 1.0, 5.0, 7.0], w, wc);
      ink([4.0, 1.0, -6.0, -2.4], w, wc);
      ink([4.0, 1.0, 1.2, -6.8], w, wc);
      ink([-3.4, 6.2, -5.6, 1.0, -4.0, -4.6], w, wc);
    }
    if (1 / lw < PIXEL_FACE) {
      const pain = ex === 'pain' || ex === 'ko' || ex === 'dazed';
      const angry = ex === 'mean' || ex === 'snarl' || ex === 'shout' || ex === 'intense';
      pixelEyes(
        look,
        'round',
        [
          { x: big ? 2.1 : 2.4, rx: 1.3, inner: 1 },
          { x: big ? 5.6 : 5.5, rx: 1.0, inner: -1 },
        ],
        y,
        {
          lid: pain ? [0.5, 0.5] : angry ? [0.45, 0] : big ? [0.1, 0.2] : [0, 0],
          lower: 0,
          pdy: 0,
          pupil: 1,
          open: true,
          ex,
          brow: [0, 0],
        },
        headCol,
        headCol,
        big ? 'big' : 'slit'
      );
    } else
    asDetail(() => {
      if (big) {
        lens(2.0, 1.8, 2.0, 1);
        lens(5.7, 1.2, 1.9, -1);
      } else {
        lens(2.4, 1.6, 1, 1);
        lens(5.6, 1.2, 1, -1);
      }
    });
  } else if (es === 'blindfold') {
    part();
    capsule(-7.4, 1.4, 2.0, 7.8, 1.2, 1.8, look.mask ?? '#151522');
    ink([-6.6, 2.2, 7.2, 2.0], lw * 0.7, shade(look.mask ?? '#151522', 0.3));
  } else if (es === 'visor') {
    part();
    capsule(-1.0, 1.0, 1.9, 8.4, 0.8, 1.7, look.mask ?? '#34e7ff');
    ink([1.0, 1.7, 6.8, 1.5], lw, '#ffffff');
    // eye glints inside the visor carry the mood
    const angry = ex === 'mean' || ex === 'shout' || ex === 'intense' || ex === 'snarl';
    const hurt = ex === 'pain' || ex === 'ko' || ex === 'dazed';
    asDetail(() => {
      for (const [x, inner] of [
        [2.8, 1],
        [6.0, -1],
      ] as const) {
        const a = angry ? 0.5 * inner : hurt ? -0.4 * inner : 0;
        ink([x - 0.8, 0.8 - a, x + 0.8, 0.8 + a], lw * 1.3, mix(look.mask ?? '#34e7ff', '#0a0a20', 0.75));
      }
    });
  } else if (es === 'shades') {
    part();
    smoothFill([0.4, 2.2, 7.6, 2.2, 7.2, -0.2, 5.4, -0.6, 4.4, 0.6, 3.4, -0.6, 0.8, -0.4], '#101018');
    ink([1.4, 1.4, 2.6, 1.4], lw, '#8fd3ff');
    ink([5.2, 1.4, 6.4, 1.4], lw, '#8fd3ff');
    ink([-1.6, 1.4, 0.6, 1.6], lw * 1.2, '#101018');
    // brows above the shades still show the mood
    const b = ex === 'mean' || ex === 'shout' || ex === 'intense' || ex === 'snarl' ? -0.6 : ex === 'pain' ? 0.6 : 0.1;
    ink([0.8, 3.4, 3.4, 3.4 + b], 1.0, browCol(look));
    ink([4.6, 3.4 + b, 6.8, 3.4], 0.9, browCol(look));
  }
  // mouth
  if (es !== 'mask') {
    const lip = shade(es === 'cowl' ? look.skin : headCol, -0.5);
    drawMouth(look, geo, ex, lip, lw);
    if (!masked) drawMustache(look, geo, ex === 'shout' || ex === 'intense' || ex === 'grin');
  }
  hairFront(look);
  px1 = outerPx;
  for (const c of ctxs) c.restore();
};

const drawProp = (look: Look, j: Joints, p: Pose) => {
  const prop = look.prop ?? 'none';
  const hx = j.shF[0] + j.armF[2];
  const hy = j.shF[1] + j.armF[3];
  if (prop === 'shield') {
    part();
    const lift = p.prop ? 4 : 0;
    const x0 = hx + 0.2;
    const y0 = hy + lift;
    // riot shield: tall rounded slab with a viewport and a reflective bevel
    smoothFill(
      [
        x0 - 0.6,
        y0 - 12,
        x0 + 6.4,
        y0 - 11.4,
        x0 + 7.2,
        y0,
        x0 + 6.6,
        y0 + 11.6,
        x0 - 0.4,
        y0 + 12.2,
        x0 - 1.4,
        y0,
      ],
      '#8fa3b8'
    );
    asDetail(() => {
      inkPoly(
        [x0 + 1.4, y0 + 4.4, x0 + 5.4, y0 + 4.2, x0 + 5.4, y0 + 8.6, x0 + 1.4, y0 + 8.9],
        '#2c3a52'
      );
      ink([x0 + 2, y0 + 7.8, x0 + 3.2, y0 + 8.3], px1, '#9fe7ff');
    });
    ink([x0 + 3.4, y0 - 9, x0 + 3.5, y0 + 2], px1 * 1.4, look.trim);
    ink([x0 + 1.2, y0 - 2.2, x0 + 5.8, y0 - 2.4], px1, shade('#8fa3b8', -0.3));
    ink([x0 + 6, y0 - 10, x0 + 6.3, y0 + 10], px1, '#d8e4ef');
  } else if (prop === 'chainsaw' && p.prop) {
    part();
    const jit = p.prop === 2 ? 0.6 : -0.6;
    capsule(hx + 3, hy + jit + 0.2, 2.4, hx + 18, hy + 1 + jit, 2.0, '#c9d1d9');
    smoothFill([hx - 3, hy - 3, hx + 4.5, hy - 3, hx + 5, hy + 3.6, hx - 2.5, hy + 4.2], '#f28c28');
    ink([hx - 1.5, hy + 0.5, hx + 3.5, hy + 0.5], px1, '#1d1d1d');
    for (let t = 5; t < 18; t += 2.6) {
      const o = p.prop === 2 ? 1.3 : 0;
      inkPoly(
        [hx + t + o, hy + 3 + jit, hx + t + 1.2 + o, hy + 4.4 + jit, hx + t + 2 + o, hy + 3 + jit],
        OUTLINE
      );
      inkPoly(
        [
          hx + t + o,
          hy - 1.6 + jit,
          hx + t + 1.2 + o,
          hy - 3 + jit,
          hx + t + 2 + o,
          hy - 1.6 + jit,
        ],
        OUTLINE
      );
    }
    ink([hx + 6, hy + 0.6 + jit, hx + 16, hy + 1.2 + jit], px1, '#ffffff');
  } else if (prop === 'wrench') {
    part();
    const ex = j.shF[0] + j.armF[0];
    const ey = j.shF[1] + j.armF[1];
    const dx = hx - ex;
    const dy = hy - ey;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    const tx = hx + ux * 12;
    const ty = hy + uy * 12;
    capsule(hx - ux * 2, hy - uy * 2, 1.3, tx, ty, 1.5, '#9aa7b4');
    disc(tx, ty, 3.3, '#9aa7b4');
    inkDot(tx + ux * 1.8, ty + uy * 1.8, 1.4, OUTLINE);
    ink(
      [
        hx + ux * 2 - uy * 0.5,
        hy + uy * 2 + ux * 0.5,
        tx - ux * 2.5 - uy * 0.5,
        ty - uy * 2.5 + ux * 0.5,
      ],
      px1,
      '#dfe7ef'
    );
  }
};

/** Motion smear behind a striking limb (baked into impact frames). */
const drawSmear = (j: Joints, p: Pose) => {
  const sm = p.smear ?? (p.fist ? 'hF' : p.fistB ? 'hB' : null);
  if (!sm) return;
  let x: number;
  let y: number;
  let ox: number;
  let oy: number;
  if (sm === 'hF' || sm === 'hB') {
    const s = sm === 'hF' ? j.shF : j.shB;
    const a = sm === 'hF' ? j.armF : j.armB;
    x = s[0] + a[2];
    y = s[1] + a[3];
    ox = s[0];
    oy = s[1];
  } else {
    const h = sm === 'fF' ? j.hipF : j.hipB;
    const l = sm === 'fF' ? j.legF : j.legB;
    x = h[0] + l[2];
    y = h[1] + l[3];
    ox = h[0];
    oy = h[1];
  }
  const dx = x - ox;
  const dy = y - oy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  fxPart();
  // swoosh crescent swept along the strike arc + parallel speed lines
  const R = len;
  const ang = Math.atan2(dy, dx);
  if (sm[0] === 'f') {
    begin();
    arc(ox, oy, R + 0.6, ang - 0.85, ang - 0.12);
    arc(ox, oy, R - 2.2, ang - 0.12, ang - 0.85, true);
    close();
    C.fillStyle = '#fffbe6';
    C.fill();
    if (I) I.fill(currentPath);
  }
  for (const o of [-3.2, 3.2]) {
    begin();
    moveTo(x - ux * 3 - uy * o, y - uy * 3 + ux * o);
    lineTo(x - ux * (o > 0 ? 12 : 9) - uy * o, y - uy * (o > 0 ? 12 : 9) + ux * o);
    C.strokeStyle = '#ffffff';
    C.lineWidth = px1 * 1.6;
    C.stroke();
    if (I) {
      I.lineWidth = px1 * 1.6;
      I.stroke(currentPath);
    }
  }
};

/**
 * Paint a full figure into `ctx` (+ optional id buffer). (ax, ay) is the feet
 * anchor in canvas pixels; the figure faces right.
 */
const paintFigure = (
  ctx: Ctx,
  ids: Ctx | null,
  look: Look,
  p: Pose,
  ax: number,
  ay: number
): { hand: V2; headTop: number } => {
  const s = look.scale;
  const j = solve(look, p);
  C = ctx;
  I = ids;
  px1 = 1 / s;
  partN = 0;
  noCast.fill(0);
  for (const c of ids ? [ctx, ids] : [ctx]) {
    c.save();
    c.setTransform(s, 0, 0, -s, ax, ay);
  }
  const rot = p.rot ?? 0;
  if (rot) {
    for (const c of ids ? [ctx, ids] : [ctx]) {
      c.translate(p.hip[0], p.hip[1]);
      c.rotate(rot);
      c.translate(-p.hip[0], -p.hip[1]);
    }
  }
  drawSmear(j, p);
  drawCape(look, j, p);
  drawArm(look, j.shB, j.armB, true, !!p.fistB);
  drawLeg(look, j.hipB, j.legB, true);
  drawLeg(look, j.hipF, j.legF, false);
  drawTorso(look, j, p);
  drawHead(look, j, p);
  drawArm(look, j.shF, j.armF, false, !!p.fist);
  drawProp(look, j, p);
  ctx.restore();
  ids?.restore();
  I = null;

  // front hand in canvas space (respecting rotation)
  let hx = j.shF[0] + j.armF[2];
  let hy = j.shF[1] + j.armF[3];
  let tx = j.head[0];
  let ty = j.head[1] + j.R;
  if (rot) {
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const rx = (x: number, y: number): V2 => {
      const dx = x - p.hip[0];
      const dy = y - p.hip[1];
      return [p.hip[0] + dx * c - dy * sn, p.hip[1] + dx * sn + dy * c];
    };
    [hx, hy] = rx(hx, hy);
    [tx, ty] = rx(tx, ty);
  }
  return { hand: [ax + hx * s, ay - hy * s], headTop: ay - Math.max(ty, p.hip[1] + 8) * s };
};

// ---------------------------------------------------------------------------
// Pixel pass: ids -> lines, cel shading, rim light, silhouette outline, aura
// ---------------------------------------------------------------------------

const OUT_RGB = hexRgb(OUTLINE);
const ALPHA_MIN = 110;

const finish = (
  col: CanvasRenderingContext2D,
  ids: CanvasRenderingContext2D | null,
  w: number,
  h: number,
  aura: string | null,
  seed: number
) => {
  const img = col.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  const pid = new Uint8Array(n); // 0 = empty, 255 = fx, else part index
  if (ids) {
    const idd = ids.getImageData(0, 0, w, h).data;
    for (let i = 0; i < n; i++) {
      if (d[i * 4 + 3] < ALPHA_MIN) continue;
      const a = idd[i * 4 + 3];
      if (a < ALPHA_MIN) {
        pid[i] = 254; // painted detail outside any part: treat as its own unshaded part
        continue;
      }
      const r = idd[i * 4];
      const g = idd[i * 4 + 1];
      if (r === FX_ID && g === idHash(FX_ID)) pid[i] = 255;
      else if (r === DETAIL_ID && g === idHash(DETAIL_ID)) pid[i] = 254;
      else if (r % ID_STEP === 0 && Math.abs(g - idHash(r)) <= 1) pid[i] = r / ID_STEP;
      else pid[i] = 253; // anti-aliased id seam: resolved below
    }
    // resolve seams to the front-most neighbouring part (part/part seams
    // belong to the edge of whatever was painted last). Read from a snapshot
    // so resolved pixels never chain across a whole region.
    const src = pid.slice();
    for (let i = 0; i < n; i++) {
      if (src[i] !== 253) continue;
      const x = i % w;
      let best = 0;
      let detail = false;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const xx = x + ox;
          const k = i + oy * w + ox;
          if (xx < 0 || xx >= w || k < 0 || k >= n) continue;
          const v = src[k];
          if (v === 254) detail = true;
          else if (v > 0 && v < 253 && v > best) best = v;
        }
      // a detail's anti-aliased rim stays with the detail (eye whites, teeth)
      pid[i] = detail ? 254 : best || 254;
    }
  } else {
    for (let i = 0; i < n; i++) if (d[i * 4 + 3] >= ALPHA_MIN) pid[i] = 1;
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : pid[y * w + x]);
  const body = (v: number) => v > 0 && v < 200;
  // shading probes: painted details count as part of whatever they sit on
  let cur = 0;
  const pr = (x: number, y: number) => {
    const q = at(x, y);
    return q === 254 ? cur : q;
  };

  const out = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      const v = pid[i];
      if (v === 0) continue;
      let r = d[o];
      let g = d[o + 1];
      let b = d[o + 2];
      out[o + 3] = 255;
      if (v === 255 || v === 254) {
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = b;
        continue;
      }
      cur = v;
      // internal line: a part painted in front starts next to this pixel
      const nU = pr(x, y - 1);
      const nD = pr(x, y + 1);
      const nL = pr(x - 1, y);
      const nR = pr(x + 1, y);
      const front = (q: number) => body(q) && q > v;
      if (front(nU) || front(nD) || front(nL) || front(nR)) {
        out[o] = r * 0.22 + OUT_RGB[0] * 0.78;
        out[o + 1] = g * 0.22 + OUT_RGB[1] * 0.78;
        out[o + 2] = b * 0.22 + OUT_RGB[2] * 0.78;
        continue;
      }
      // key light from the upper front (+x, -y on screen)
      const away = pr(x - 1, y + 2); // form shadow on the far side
      const away2 = pr(x - 1, y + 1);
      const toward = pr(x + 1, y - 2); // cast shadow from parts in front

      const lit = pr(x + 1, y - 1);
      const formShadow = !(body(away) && away >= v) || !(body(away2) && away2 >= v);
      const castShadow = !noCast[v] && body(toward) && toward > v;
      // thin features (hair strands, fingers) keep their flat colour on the
      // lit/rim edge so they do not turn into noise
      const rim = nL === 0 && !castShadow && nR === v && pr(x + 2, y) === v;
      const hi =
        !(body(lit) && lit >= v) &&
        !castShadow &&
        pr(x - 1, y + 1) === v &&
        pr(x - 2, y + 2) === v &&
        pr(x - 1, y) === v;
      if (castShadow || formShadow) {
        // cool multiply shadow
        r *= 0.64;
        g *= 0.6;
        b = b * 0.7 + 10;
      }
      if (rim) {
        r += (150 - r) * 0.42;
        g += (205 - g) * 0.42;
        b += (255 - b) * 0.42;
      } else if (hi) {
        // dark materials get a subtler, cooler sheen
        const k = 0.16 + Math.min(0.2, (r + g + b) / 2000);
        r += (255 - r) * k;
        g += (248 - g) * k;
        b += (235 - b) * k;
      }
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  // silhouette outline (fx pixels touching the body are outlined too)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = pid[i];
      if (v !== 0 && v !== 255) continue;
      if (body(at(x - 1, y)) || body(at(x + 1, y)) || body(at(x, y - 1)) || body(at(x, y + 1))) {
        const o = i * 4;
        out[o] = OUT_RGB[0];
        out[o + 1] = OUT_RGB[1];
        out[o + 2] = OUT_RGB[2];
        out[o + 3] = 255;
        pid[i] = 252; // outline
      }
    }
  // ink weight: the silhouette line doubles on the shadow side (back and
  // underside), the classic cel-animation trick for weight and grounding
  for (let y = h - 1; y >= 0; y--)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (pid[i] !== 0) continue;
      const under = at(x, y - 1) === 252 && body(at(x, y - 2));
      const behind = at(x + 1, y) === 252 && body(at(x + 2, y));
      if (!under && !behind) continue;
      const o = i * 4;
      out[o] = OUT_RGB[0];
      out[o + 1] = OUT_RGB[1];
      out[o + 2] = OUT_RGB[2];
      out[o + 3] = 255;
      pid[i] = 251;
    }
  if (aura) {
    const ac = hexRgb(aura);
    const core = hexRgb(mix(aura, '#ffffff', 0.6));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (pid[i] !== 0) continue;
        let near = 0;
        for (let r = 1; r <= 3 && !near; r++) {
          const q = at(x, y + r) || at(x - r, y) || at(x + r, y) || at(x, y - r);
          if (q !== 0 && q !== 255) near = r;
        }
        if (!near) {
          // flame licks rising from the head/shoulders
          const below = at(x, y + 5) || at(x, y + 6);
          if (!(below && below !== 255 && (x * 7 + seed * 3) % 5 === 0)) continue;
          near = 3;
        }
        const flick = (x * 3 + y * 5 + seed * 7) % 4;
        if (near === 3 && flick > 1) continue;
        const o = i * 4;
        const c = near === 1 ? core : ac;
        out[o] = c[0];
        out[o + 1] = c[1];
        out[o + 2] = c[2];
        out[o + 3] = near === 1 ? 255 : 200;
      }
  }
  img.data.set(out);
  return img;
};

const OUT_MATCH = (d: Uint8ClampedArray, i: number) =>
  Math.abs(d[i] - OUT_RGB[0]) < 6 &&
  Math.abs(d[i + 1] - OUT_RGB[1]) < 6 &&
  Math.abs(d[i + 2] - OUT_RGB[2]) < 6;

/** Impact-flash copy: body goes white-hot, the dark ink lines stay. */
const flashOf = (img: ImageData): ImageData => {
  const f = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  const d = f.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0 || OUT_MATCH(d, i)) continue;
    const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    d[i] = 255;
    d[i + 1] = 236 + l * 19;
    d[i + 2] = 200 + l * 55;
  }
  return f;
};

// scratch surfaces reused across bakes (CPU-backed for fast readback)
const scratch = new Map<number, { col: Surface; ids: Surface }>();
const scratchFor = (size: number) => {
  let s = scratch.get(size);
  if (!s) {
    s = { col: createSurface(size, size, true), ids: createSurface(size, size, true) };
    scratch.set(size, s);
  }
  s.col.ctx?.setTransform(1, 0, 0, 1, 0, 0);
  s.col.ctx?.clearRect(0, 0, size, size);
  s.ids.ctx?.setTransform(1, 0, 0, 1, 0, 0);
  s.ids.ctx?.clearRect(0, 0, size, size);
  return s;
};

const toCanvas = (img: ImageData): HTMLCanvasElement => {
  const s = createSurface(img.width, img.height);
  s.ctx?.putImageData(img, 0, 0);
  return s.canvas;
};

export interface Baked {
  canvas: HTMLCanvasElement;
  /** white impact-flash variant, when requested */
  flash: HTMLCanvasElement | null;
  hand: V2;
  headTop: number;
}

/** Render one frame of a figure into a fresh size x size canvas. */
export const bakeFigure = (
  look: Look,
  p: Pose,
  size: number,
  ax: number,
  ay: number,
  seed = 0,
  withFlash = false
): Baked | null => {
  const s = scratchFor(size);
  if (!s.col.ctx) return null;
  const res = paintFigure(s.col.ctx, s.ids.ctx, look, p, ax, ay);
  const img = finish(
    s.col.ctx,
    s.ids.ctx,
    size,
    size,
    p.aura ? (look.aura ?? '#fff3a0') : null,
    seed
  );
  return { canvas: toCanvas(img), flash: withFlash ? toCanvas(flashOf(img)) : null, ...res };
};

/** Head-only render for HUD portraits (same pipeline as the body). */
export const bakePortrait = (look: Look, size: number): HTMLCanvasElement => {
  const s = scratchFor(size);
  const col = s.col;
  const ids = s.ids;
  if (!col.ctx) return createSurface(size, size).canvas;
  const p: Pose = { ...ANIMS.idle.poses[0], mouth: 'grin' };
  const j = solve(look, p);
  const scale = (size / 22) * 1.15;
  const cx = size / 2 - 1;
  const cy = size / 2 + 1.5;
  C = col.ctx;
  I = ids.ctx;
  px1 = 1 / scale;
  partN = 0;
  noCast.fill(0);
  for (const c of [col.ctx, ids.ctx]) {
    if (!c) continue;
    c.save();
    c.setTransform(scale, 0, 0, -scale, cx - j.head[0] * scale + scale, cy + j.head[1] * scale);
  }
  drawHead(look, j, p);
  col.ctx.restore();
  ids.ctx?.restore();
  I = null;
  return toCanvas(finish(col.ctx, ids.ctx, size, size, null, 0));
};
