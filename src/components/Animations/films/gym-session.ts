import type { RisoFilm, Riso } from '../riso/engine';
import {
  TAU,
  clamp,
  lerp,
  seg,
  tween,
  ease,
  noise1,
  mulberry,
  morph,
  morphPair,
  smoothPath,
  polyPath,
  ellipsePts,
  DISPLAY,
  MONO,
  type Pt,
} from '../riso/kit';

/*
 * Session: one heavy morning in the gym, told through the round iron.
 * A big bearded lifter chalks up in a halftone cloud, the cloud clears on his hand closing round
 * the knurled bar, and the camera pulls out to a low angle as he walks the squat out, sinks below
 * parallel and drives it up while the plate-loaded bar whips. We push into the sleeve of the bar,
 * which turns into the hex end of a dumbbell in the mirror: hammer curls, sweat, music in his
 * ears. The hex end becomes the gym clock and we pull out wide: he sits on the bench, towel over
 * his shoulders, breathing, the bar racked behind him.
 */

const K = 0; // black
const RD = 1; // red
const YE = 2; // yellow
const TL = 3; // teal
type Spec = [number, number, number, number];

const DUR = 19.5;
const FLOOR = 860;
const D2R = Math.PI / 180;

/* ---------- timeline ---------- */

const T_CLAP = 1.75;
const T_GRIP = 3.22; // world under the bar from here
const T_SQZ0 = 3.5;
const T_SQZ1 = 4.1;
const T_UNRACK0 = 4.5;
const T_UNRACK1 = 5.1;
const T_PULL0 = 4.35;
const T_PULL1 = 6.55;
const T_DOWN0 = 6.85;
const T_DOWN1 = 8.0;
const T_UP0 = 8.12;
const T_UP1 = 9.15;
const T_IMPACT = 8.2;
const T_RERACK = 10.28;
const T_PUSH0 = 10.42;
const T_PUSH1 = 11.0;
const T_MASK0 = 10.9;
const T_MIRROR = 11.62; // mirror world fills the frame
const T_MPUSH0 = 14.35;
const T_MPUSH1 = 14.95;
const T_CLOCK = 14.82; // clock shows inside the hex
const T_WIDE0 = 15.05;
const T_WIDE1 = 17.4;

/* ---------- palette ---------- */

const SKIN: Spec = [0, 0.3, 0.88, 0];
const SKIN_SH: Spec = [0.05, 0.4, 0, 0];
const FAR: Spec = [0.34, 0.14, 0, 0.16];
const TANK: Spec = [0.86, 0, 0, 0.3];
const SHORTS: Spec = [0.2, 0, 0.05, 0.95];
const BELT: Spec = [0.25, 1, 0.3, 0];
const SLEEVE: Spec = [0.9, 0.05, 0, 0.28];
const BEARD: Spec = [0.92, 0.3, 0.05, 0];
const PHONES: Spec = [0.94, 0, 0, 0.2];
const STEEL: Spec = [0.34, 0, 0.04, 0.16];
const RACK: Spec = [0.82, 0, 0, 0.42];
const P_RED: Spec = [0.05, 1, 0.22, 0];
const P_YEL: Spec = [0.04, 0.12, 1, 0];
const P_TEAL: Spec = [0.12, 0, 0.1, 1];
const RUBBER: Spec = [0.88, 0.05, 0, 0.32];

/* ---------- ink helpers ---------- */

const ink = (r: Riso, p: Path2D, s: Spec, rule: CanvasFillRule = 'nonzero') => {
  const L = r.layers;
  for (let i = 0; i < 4; i++) {
    const d = s[i];
    if (d <= 0.012) continue;
    const c = L[i];
    c.fillStyle = d >= 0.985 ? '#000' : r.tone(c, d);
    c.fill(p, rule);
  }
};

const knock = (r: Riso, p: Path2D, rule: CanvasFillRule = 'nonzero', d = 1) => {
  for (const c of r.layers) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = d >= 0.985 ? '#000' : r.tone(c, d);
    c.fill(p, rule);
    c.restore();
  }
};

const solid = (r: Riso, p: Path2D, s: Spec, rule: CanvasFillRule = 'nonzero') => {
  knock(r, p, rule);
  ink(r, p, s, rule);
};

const stroke = (r: Riso, p: Path2D, lw: number, s: Spec) => {
  for (let i = 0; i < 4; i++) {
    const d = s[i];
    if (d <= 0.012) continue;
    const c = r.layers[i];
    c.save();
    c.lineWidth = lw;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = d >= 0.985 ? '#000' : r.tone(c, d);
    c.stroke(p);
    c.restore();
  }
};

const knockStroke = (r: Riso, p: Path2D, lw: number, d = 1) => {
  for (const c of r.layers) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = lw;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = d >= 0.985 ? '#000' : r.tone(c, d);
    c.stroke(p);
    c.restore();
  }
};

const clipDo = (r: Riso, clip: Path2D, fn: () => void, rule: CanvasFillRule = 'nonzero') => {
  for (const c of r.layers) {
    c.save();
    c.clip(clip, rule);
  }
  fn();
  for (const c of r.layers) c.restore();
};

/* ---------- geometry ---------- */

const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const lerpPt = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const dirDown = (deg: number): Pt => [Math.sin(deg * D2R), Math.cos(deg * D2R)];

/** Local path placed at (x, y), rotated by deg, scaled */
const xf = (p: Path2D, x: number, y: number, deg: number, sx = 1, sy = sx) => {
  const q = new Path2D();
  q.addPath(p, new DOMMatrix().translate(x, y).rotate(deg).scale(sx, sy));
  return q;
};

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0, p = new Path2D()) => {
  p.moveTo(cx + Math.cos(rot) * rx, cy + Math.sin(rot) * rx);
  p.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  return p;
};

const rrect = (x: number, y: number, w: number, h: number, rad: number, p = new Path2D()) => {
  const rr = Math.max(0.01, Math.min(rad, w / 2, h / 2));
  p.moveTo(x + rr, y);
  p.arcTo(x + w, y, x + w, y + h, rr);
  p.arcTo(x + w, y + h, x, y + h, rr);
  p.arcTo(x, y + h, x, y, rr);
  p.arcTo(x, y, x + w, y, rr);
  p.closePath();
  return p;
};

const flipX = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [-x, y] as Pt);
const offPts = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map(([x, y]) => [x + dx, y + dy] as Pt);

/** Outline of a muscled limb from a to b; fr/bk are half widths at even stations, fr on n = (uy, -ux) */
const limbPts = (a: Pt, b: Pt, fr: number[], bk: number[], cap = 0.55): Pt[] => {
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  let L = Math.hypot(dx, dy);
  if (L < 0.01) {
    dx = 0;
    dy = 0.01;
    L = 0.01;
  }
  const u: Pt = [dx / L, dy / L];
  const n: Pt = [u[1], -u[0]];
  const m = fr.length;
  const pts: Pt[] = [];
  for (let i = 0; i < m; i++) {
    const k = i / (m - 1);
    pts.push([a[0] + dx * k + n[0] * fr[i], a[1] + dy * k + n[1] * fr[i]]);
  }
  const eb = (fr[m - 1] + bk[m - 1]) * cap;
  const mb = (fr[m - 1] - bk[m - 1]) / 2;
  pts.push([b[0] + u[0] * eb + n[0] * mb, b[1] + u[1] * eb + n[1] * mb]);
  for (let i = m - 1; i >= 0; i--) {
    const k = i / (m - 1);
    pts.push([a[0] + dx * k - n[0] * bk[i], a[1] + dy * k - n[1] * bk[i]]);
  }
  const ea = (fr[0] + bk[0]) * cap;
  const ma = (fr[0] - bk[0]) / 2;
  pts.push([a[0] - u[0] * ea + n[0] * ma, a[1] - u[1] * ea + n[1] * ma]);
  return pts;
};
const limb = (a: Pt, b: Pt, fr: number[], bk: number[], cap = 0.55) => smoothPath(limbPts(a, b, fr, bk, cap), true, 0.5);
/** The back strip of a limb, for shading */
const limbShade = (a: Pt, b: Pt, bk: number[], k = 0.3) => limb(a, b, bk.map((v) => -v * k), bk, 0.5);
/** A line along a limb at normal offset off, between stations s0..s1 */
const limbLine = (a: Pt, b: Pt, s0: number, s1: number, off: number, bow = 0, p = new Path2D()) => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const u: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const n: Pt = [u[1], -u[0]];
  const P0 = add(add(a, u, L * s0), n, off);
  const P1 = add(add(a, u, L * s1), n, off);
  const M = add(add(a, u, (L * (s0 + s1)) / 2), n, off + bow);
  p.moveTo(P0[0], P0[1]);
  p.quadraticCurveTo(M[0], M[1], P1[0], P1[1]);
  return p;
};

const ik = (a: Pt, t: Pt, l1: number, l2: number, bend: number): Pt => {
  const dx = t[0] - a[0];
  const dy = t[1] - a[1];
  let d = Math.hypot(dx, dy) || 0.001;
  const u: Pt = [dx / d, dy / d];
  d = clamp(d, Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.5);
  const ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  const n: Pt = [u[1], -u[0]];
  return [a[0] + u[0] * l1 * ca + n[0] * l1 * sa * bend, a[1] + u[1] * l1 * ca + n[1] * l1 * sa * bend];
};
const reach = (a: Pt, t: Pt, l: number): Pt => {
  const d = sub(t, a);
  const L = Math.hypot(d[0], d[1]) || 1;
  return L <= l ? t : [a[0] + (d[0] / L) * l, a[1] + (d[1] / L) * l];
};

const hull = (pts: Pt[]): Pt[] => {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
};

const hexPts = (cx: number, cy: number, R: number, sy = 1, rot = 0): Pt[] =>
  Array.from({ length: 6 }, (_, i) => {
    const a = rot + (i * TAU) / 6;
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R * sy] as Pt;
  });

/* ---------- body dimensions (side view, facing +x) ---------- */

const SHIN = 138;
const THIGH = 145;
const UARM = 104;
const FARM = 92;
const ANK_Y = FLOOR - 17;
const BAR_U = 196;
const BAR_V = -36;
const MID = 14; // bar stays over mid-foot, this far ahead of the ankle
const BARF = 245; // px per metre along the bar in the 3/4 view
const BAR_DY = 6; // the near end sits a touch lower
const GRIP = 0.28;
const PLATE_R = 70;
const PLATE_SX = 0.6;
const AX_RACK = 780;
const AX_SQ = 706;

/** Torso point: u up the spine, v forward */
const tl = (hip: Pt, lean: number, u: number, v: number): Pt => {
  const a = lean * D2R;
  return [hip[0] + Math.sin(a) * u + Math.cos(a) * v, hip[1] - Math.cos(a) * u + Math.sin(a) * v];
};

/** Hip for a squat depth d with the ankle at ax */
const legPose = (ax: number, d: number): Pt => {
  const ps = lerp(3, 35, d) * D2R;
  const th = lerp(3, 103, d) * D2R;
  const knee: Pt = [ax + Math.sin(ps) * SHIN, ANK_Y - Math.cos(ps) * SHIN];
  return [knee[0] - Math.sin(th) * THIGH, knee[1] - Math.cos(th) * THIGH];
};
const solveLean = (hip: Pt, targetX: number) => {
  let l = 0.25;
  for (let i = 0; i < 8; i++) l = Math.asin(clamp((targetX - hip[0] - BAR_V * Math.cos(l)) / BAR_U, -1, 1));
  return l / D2R;
};

const RACK_BAR = (() => {
  const hip = legPose(AX_RACK, 0.14);
  return tl(hip, solveLean(hip, AX_RACK + MID), BAR_U, BAR_V);
})();
const BX0 = RACK_BAR[0];
const HOOK_Y = RACK_BAR[1];
const HOOK_X = BX0 + 0.6 * BARF;
const POST_F = HOOK_X + 20;
const POST_B = POST_F - 300;

/* ---------- world props ---------- */

const CHALK_AX = 1330;
const CDX = CHALK_AX - 1150;
const BOWL: Pt = [1262 + CDX, 596];
const CLOCK: Pt = [1760, 150];
const CLOCK_R = 64;
const BENCH_X0 = 1600;
const BENCH_X1 = 1975;
const BENCH_Y = 712;
const LAMPS = [260, 1060, 1860, 2660];

/* ---------- mirror world ---------- */

const MCX = 740;
const M_SH_DX = 240;
const M_SH_Y = 440;
const M_EL_DX = 262;
const M_EL_Y = 640;
const M_FARM = 190;
const HEX_R = 46;
const HEX_A = 70; // plate centre along the handle
const HEX_TH = 34;
const HEXA: Pt = [MCX - M_EL_DX, M_EL_Y + M_FARM];
const HEX_FACE_R = HEX_R * (1 + (HEX_A + HEX_TH / 2) * 0.0015);

/* ---------- state ---------- */

interface Puff {
  a: number;
  v: number;
  r0: number;
  ph: number;
  h: number;
}

interface Speck {
  a: number;
  v: number;
  r: number;
  g: number;
}

interface State {
  torso: Path2D;
  tank: Path2D;
  shortsT: Path2D;
  belt: Path2D;
  buckle: Path2D;
  torsoShade: Path2D;
  pecLine: Path2D;
  towel: Path2D;
  towelStripe: Path2D;
  towelFold: Path2D;
  head: Path2D;
  headShade: Path2D;
  beard: Path2D;
  beardLines: Path2D;
  cup: Path2D;
  cupRing: Path2D;
  band: Path2D;
  eye: Path2D;
  brow: Path2D;
  browHard: Path2D;
  nostril: Path2D;
  shine: Path2D;
  teeth: Path2D;
  fist: Path2D;
  fistThumb: Path2D;
  fistLines: Path2D;
  open: Path2D;
  openThumb: Path2D;
  openLines: Path2D;
  shoe: Path2D;
  sole: Path2D;
  strap: Path2D;
  wall: Path2D;
  seams: Path2D;
  stripeR: Path2D;
  stripeY: Path2D;
  ceiling: Path2D;
  beams: Path2D;
  lampShade: Path2D;
  lampCord: Path2D;
  cones: Path2D[];
  floor: Path2D;
  floorLines: Path2D;
  floorEdge: Path2D;
  mat: Path2D;
  posts: Path2D;
  postHoles: Path2D;
  rackFeet: Path2D;
  pins: Path2D;
  hook: Path2D;
  tree: Path2D;
  stand: Path2D;
  bowl: Path2D;
  bowlRim: Path2D;
  chalkMound: Path2D;
  benchPad: Path2D;
  benchFrame: Path2D;
  floorDB: Path2D;
  floorDBFace: Path2D;
  dbRack: Path2D;
  dbHeads: Path2D;
  dbHandles: Path2D;
  mirror: Path2D;
  mirrorFrame: Path2D;
  mirrorGlare: Path2D;
  clockRim: Path2D;
  clockFace: Path2D;
  clockTicks: Path2D;
  puffs: Puff[];
  specks: Speck[];
  irisA: [Pt[], Pt[]];
  irisB: [Pt[], Pt[]];
  mWall: Path2D;
  mPanels: Path2D;
  mStripeR: Path2D;
  mStripeY: Path2D;
  mShelf: Path2D;
  mHex: Path2D;
  mHexRing: Path2D;
  mLights: Path2D;
  mGlare: Path2D;
  mFrame: Path2D;
  mOutside: Path2D;
}

/* ---------- local art (built once) ---------- */

const TORSO_UV: Pt[] = [
  [-30, 22], [-6, 40], [30, 48], [70, 49], [104, 55], [124, 67], [150, 71], [172, 59], [190, 38], [204, 20],
  [210, -18], [200, -46], [180, -66], [148, -70], [112, -59], [80, -46], [48, -46], [20, -54], [-10, -56],
  [-34, -44], [-44, -18], [-40, 6],
];
const uv = (pts: Pt[]): Pt[] => pts.map(([u, v]) => [v, -u] as Pt);

const HEAD_PTS: Pt[] = [
  [-40, -48], [-37, -68], [-24, -84], [-2, -91], [20, -87], [35, -74], [42, -60], [45, -52], [41, -46], [45, -41],
  [53, -31], [49, -27], [43, -26], [43, -18], [38, -8], [20, -2], [0, -6], [-20, -16], [-35, -30],
];
const BEARD_PTS: Pt[] = [
  [0, -50], [6, -41], [16, -36], [30, -35], [38, -30], [46, -27], [51, -21], [54, -10], [49, 4], [36, 14], [16, 18],
  [-4, 10], [-15, -4], [-14, -22], [-7, -38], [-5, -50],
];

/* ---------- side-view lifter ---------- */

type HandKind = 'fist' | 'open' | 'grip';

interface Rig {
  hip: Pt;
  hipF: Pt;
  lean: number;
  neck: number;
  breath: number;
  kN: Pt;
  aN: Pt;
  kF: Pt;
  aF: Pt;
  shN: Pt;
  eN: Pt;
  wN: Pt;
  shF: Pt;
  eF: Pt;
  wF: Pt;
  handN: HandKind;
  handF: HandKind;
  gripN: Pt;
  gripF: Pt;
  grip: number;
  chalk: number;
  effort: number;
  towel: boolean;
  sweat: number;
}

interface RigIn {
  hip: Pt;
  lean: number;
  neck: number;
  breath?: number;
  ankN: Pt;
  ankF: Pt;
  wristN: Pt;
  wristF: Pt;
  elbowN?: Pt;
  elbowF?: Pt;
  handN: HandKind;
  handF: HandKind;
  gripN?: Pt;
  gripF?: Pt;
  grip?: number;
  chalk?: number;
  effort?: number;
  towel?: boolean;
  sweat?: number;
}

const buildRig = (p: RigIn): Rig => {
  const hip = p.hip;
  const hipF: Pt = [hip[0] - 5, hip[1] - 3];
  const kN = ik(hip, p.ankN, THIGH, SHIN, 1);
  const aN = reach(kN, p.ankN, SHIN + 2);
  const kF = ik(hipF, p.ankF, THIGH, SHIN, 1);
  const aF = reach(kF, p.ankF, SHIN + 2);
  const br = p.breath ?? 0;
  const shN = tl(hip, p.lean, 164 + br * 3, 4);
  const shF = add(tl(hip, p.lean, 164 + br * 3, -4), [-4, -3]);
  const eN = p.elbowN ?? ik(shN, p.wristN, UARM, FARM, -1);
  const wN = p.elbowN ? p.wristN : reach(eN, p.wristN, FARM);
  const eF = p.elbowF ?? ik(shF, p.wristF, UARM, FARM, -1);
  const wF = p.elbowF ? p.wristF : reach(eF, p.wristF, FARM);
  return {
    hip,
    hipF,
    lean: p.lean,
    neck: p.neck,
    breath: br,
    kN,
    aN,
    kF,
    aF,
    shN,
    eN,
    wN,
    shF,
    eF,
    wF,
    handN: p.handN,
    handF: p.handF,
    gripN: p.gripN ?? wN,
    gripF: p.gripF ?? wF,
    grip: p.grip ?? 1,
    chalk: p.chalk ?? 0,
    effort: p.effort ?? 0,
    towel: p.towel ?? false,
    sweat: p.sweat ?? 0,
  };
};

const angleOf = (a: Pt, b: Pt) => Math.atan2(-(b[0] - a[0]), b[1] - a[1]) / D2R;

const chalkSpots = (r: Riso, p: Path2D, amt: number) => {
  if (amt <= 0.02) return;
  knock(r, p, 'nonzero', 0.55 * amt);
};

const HS = 1.32; // the gripping hand is drawn a touch large so it reads in the close-up

const drawGripHand = (r: Riso, P: Pt, g: number, chalk: number, far: boolean) => {
  const m = (p: Path2D) => xf(p, P[0], P[1], 0, HS);
  const back = m(
    smoothPath(
      [
        [-14, -8], [-8, -11], [2, -11.5], [10, -10.5], [15, -6], [16, 3], [13, 14], [9, 24], [6, 33], [-6, 33],
        [-11, 24], [-15, 12], [-16, 0],
      ],
      true,
      0.5
    )
  );
  const fl = new Path2D();
  const flen = lerp(22, 4.5, g);
  const fx = [-10, -3.5, 3, 9.5];
  fx.forEach((cx, i) => {
    const l = flen * (i === 3 ? 0.82 : i === 0 ? 0.92 : 1);
    rrect(cx - 3.3, -9.5 - l, 6.6, l + 3, 3.2, fl);
  });
  const fingers = m(fl);
  const kn = new Path2D();
  fx.forEach((cx) => ell(cx, -9.2, 3.5, 2.7, 0, kn));
  const knuck = m(kn);
  const tOpen: Pt[] = [[-15, 4], [-23, -2], [-28, -9], [-24, -12], [-17, -6], [-13, -2]];
  const tShut: Pt[] = [[-15, 2], [-17, 9], [-9, 12.5], [1, 11], [2, 6.5], [-8, 5]];
  const thumb = m(smoothPath(morph(tOpen, tShut, g), true, 0.5));
  solid(r, back, SKIN);
  solid(r, fingers, SKIN);
  ink(r, fingers, [0, 0.16, 0, 0]);
  solid(r, knuck, SKIN);
  const gp = new Path2D();
  fx.slice(0, 3).forEach((cx) => {
    gp.moveTo(cx + 3.25, -9 - flen);
    gp.lineTo(cx + 3.25, -6);
  });
  stroke(r, m(gp), 1.1, [0.4, 0.5, 0, 0]);
  const td = new Path2D();
  fx.forEach((cx) => {
    td.moveTo(cx * 0.85, -5);
    td.quadraticCurveTo(cx * 0.6, 10, cx * 0.3 - 1, 26);
  });
  stroke(r, m(td), 1, [0, 0.6, 0, 0]);
  const vn = new Path2D();
  vn.moveTo(8, 31);
  vn.bezierCurveTo(11, 20, 4, 14, 7, 2);
  stroke(r, m(vn), 1.4, [0.1, 0.75, 0, 0]);
  const sh = new Path2D();
  sh.moveTo(-16, -2);
  sh.lineTo(-7, 0);
  sh.lineTo(-5, 33);
  sh.lineTo(-14, 33);
  sh.closePath();
  clipDo(r, back, () => ink(r, m(sh), SKIN_SH));
  solid(r, thumb, SKIN);
  ink(r, thumb, [0.04, 0.2, 0, 0]);
  knock(r, m(ell(lerp(-25, -1, g), lerp(-10, 9, g), 2.2, 1.6)), 'nonzero', 0.45);
  const ch = new Path2D();
  ell(-6, -4, 4.5, 2.2, 0.3, ch);
  ell(6, -7, 3.5, 1.8, -0.2, ch);
  ell(1, 6, 3, 1.6, 0.1, ch);
  ell(-10, 8, 2.4, 1.6, 0.5, ch);
  fx.forEach((cx) => ell(cx, -10.5, 2.2, 1.2, 0, ch));
  chalkSpots(r, m(ch), chalk);
  if (g > 0.85) knock(r, knuck, 'nonzero', (0.25 * (g - 0.85)) / 0.15);
  if (far) {
    const all = new Path2D();
    all.addPath(back);
    all.addPath(fingers);
    all.addPath(thumb);
    ink(r, all, FAR);
  }
};

const drawHand = (r: Riso, s: State, w: Pt, e: Pt, kind: HandKind, chalk: number) => {
  const deg = angleOf(e, w);
  if (kind === 'fist') {
    const f = xf(s.fist, w[0], w[1], deg);
    solid(r, f, SKIN);
    stroke(r, xf(s.fistLines, w[0], w[1], deg), 1.1, [0.2, 0.5, 0, 0]);
    const th = xf(s.fistThumb, w[0], w[1], deg);
    solid(r, th, SKIN);
    ink(r, th, [0.04, 0.22, 0, 0]);
    chalkSpots(r, xf(s.fistLines, w[0], w[1], deg), 0);
  } else {
    const o = xf(s.open, w[0], w[1], deg);
    solid(r, o, SKIN);
    knockStroke(r, xf(s.openLines, w[0], w[1], deg), 1.5);
    const th = xf(s.openThumb, w[0], w[1], deg);
    solid(r, th, SKIN);
    ink(r, th, [0.04, 0.22, 0, 0]);
    if (chalk > 0.02) {
      const ch = new Path2D();
      ell(0, 30, 7, 9, 0, ch);
      ell(-4, 44, 5, 4, 0, ch);
      ell(4, 12, 6, 5, 0, ch);
      knock(r, xf(ch, w[0], w[1], deg), 'nonzero', 0.6 * chalk);
    }
  }
};

const ARM_FR = [20, 23, 26, 21, 15];
const ARM_BK = [25, 29, 26, 19, 14];
const FARM_FR = [17, 20, 16, 11.5, 9];
const FARM_BK = [16, 20, 15, 11, 9];

const drawArm = (r: Riso, s: State, g: Rig, near: boolean) => {
  const sh = near ? g.shN : g.shF;
  const e = near ? g.eN : g.eF;
  const w = near ? g.wN : g.wF;
  const kind = near ? g.handN : g.handF;
  const grip = near ? g.gripN : g.gripF;
  const ua = limb(sh, e, ARM_FR, ARM_BK);
  const fa = limb(e, w, FARM_FR, FARM_BK);
  const u = sub(e, sh);
  const L = Math.hypot(u[0], u[1]) || 1;
  const delt = ell(sh[0] + (u[0] / L) * 10, sh[1] + (u[1] / L) * 10, 36, 31, Math.atan2(u[1], u[0]));
  if (near) {
    const out = new Path2D();
    out.addPath(ua);
    out.addPath(delt);
    knockStroke(r, out, 3.5);
  }
  solid(r, fa, SKIN);
  ink(r, limbShade(e, w, FARM_BK, 0.2), SKIN_SH);
  const vein = limbLine(e, w, 0.15, 0.85, FARM_FR[1] * 0.35, 3);
  stroke(r, vein, 1.4, [0.08, 0.7, 0, 0]);
  solid(r, ua, SKIN);
  solid(r, delt, SKIN);
  ink(r, limbShade(sh, e, ARM_BK, 0.25), SKIN_SH);
  const lines = new Path2D();
  limbLine(sh, e, 0.3, 0.88, -3, 3, lines);
  stroke(r, lines, 1.6, [0.12, 0.6, 0, 0]);
  const dl = new Path2D();
  const dA = add(sh, [(u[0] / L) * 40, (u[1] / L) * 40]);
  dl.moveTo(dA[0] + (u[1] / L) * 20, dA[1] - (u[0] / L) * 20);
  dl.quadraticCurveTo(dA[0] + (u[0] / L) * 6, dA[1] + (u[1] / L) * 6, dA[0] - (u[1] / L) * 22, dA[1] + (u[0] / L) * 22);
  stroke(r, dl, 1.6, [0.12, 0.6, 0, 0]);
  if (kind === 'grip') drawGripHand(r, grip, g.grip, g.chalk, !near);
  else drawHand(r, s, w, e, kind, g.chalk);
  if (!near) {
    const all = new Path2D();
    all.addPath(ua);
    all.addPath(fa);
    all.addPath(delt);
    ink(r, all, FAR);
  }
};

const THIGH_FR = [31, 39, 39, 31, 21];
const THIGH_BK = [37, 35, 30, 23, 19];
const SHIN_FR = [17, 15, 13, 11, 9];
const SHIN_BK = [19, 31, 26, 14, 10];

const drawLeg = (r: Riso, s: State, hip: Pt, knee: Pt, ank: Pt, far: boolean) => {
  const shin = limb(knee, ank, SHIN_FR, SHIN_BK);
  const thigh = limb(hip, knee, THIGH_FR, THIGH_BK);
  solid(r, shin, SKIN);
  ink(r, limbShade(knee, ank, SHIN_BK, 0.25), SKIN_SH);
  stroke(r, limbLine(knee, ank, 0.12, 0.6, -SHIN_BK[1] * 0.3, -4), 1.4, [0.1, 0.55, 0, 0]);
  solid(r, thigh, SKIN);
  ink(r, limbShade(hip, knee, THIGH_BK, 0.3), SKIN_SH);
  stroke(r, limbLine(hip, knee, 0.25, 0.85, THIGH_FR[2] * 0.25, 5), 1.6, [0.1, 0.6, 0, 0]);
  // shorts
  const mid = lerpPt(hip, knee, 0.4);
  const shorts = limb(hip, mid, [36, 43, 43], [42, 41, 37], 0.6);
  knockStroke(r, shorts, 2.5);
  solid(r, shorts, SHORTS);
  ink(r, limbShade(hip, mid, [42, 40, 35], 0.35), [0.25, 0, 0, 0.1]);
  stroke(r, limbLine(hip, mid, 0.2, 0.95, 10, 4), 1.6, [0.4, 0, 0, 0.3]);
  knockStroke(r, limbLine(lerpPt(hip, mid, 0.97), mid, 0, 1, 0, 0), 2, 0.6);
  // knee sleeve
  const sl = new Path2D();
  sl.addPath(limb(lerpPt(hip, knee, 0.8), knee, [29, 26, 24], [24, 22, 21], 0.1));
  sl.addPath(limb(knee, lerpPt(knee, ank, 0.28), [21, 18, 16], [22, 27, 29], 0.1));
  ell(knee[0], knee[1], 23, 23, 0, sl);
  solid(r, sl, SLEEVE);
  stroke(r, limbLine(knee, lerpPt(knee, ank, 0.32), 0.3, 0.95, 0, 0), 1.3, [0, 0, 0, 0.9]);
  // shoe
  const fdeg = 0;
  const shoe = xf(s.shoe, ank[0], ank[1], fdeg);
  const sole = xf(s.sole, ank[0], ank[1], fdeg);
  solid(r, shoe, [0.9, 0.08, 0, 0.2]);
  solid(r, sole, [0.1, 1, 0.3, 0]);
  stroke(r, xf(s.strap, ank[0], ank[1], fdeg), 4, [0, 0.1, 1, 0]);
  if (far) {
    const all = new Path2D();
    all.addPath(shin);
    all.addPath(thigh);
    all.addPath(shorts);
    all.addPath(sl);
    all.addPath(shoe);
    ink(r, all, FAR);
  }
};

const drawTorso = (r: Riso, s: State, g: Rig) => {
  const [hx, hy] = g.hip;
  const sy = 1 + g.breath * 0.025;
  const T = xf(s.torso, hx, hy, g.lean, 1 + g.breath * 0.03, sy);
  const m = (p: Path2D) => xf(p, hx, hy, g.lean, 1 + g.breath * 0.03, sy);
  solid(r, T, SKIN);
  clipDo(r, T, () => {
    solid(r, m(s.tank), TANK, 'evenodd');
    // chest catches the light through the shirt
    ink(r, m(s.pecLine), [0, 0, 0, 0.35]);
    solid(r, m(s.shortsT), SHORTS);
    ink(r, m(s.torsoShade), [0.14, 0.18, 0, 0.06]);
  });
  solid(r, m(s.belt), BELT);
  stroke(r, m(s.belt), 1.2, [0.6, 0, 0, 0]);
  solid(r, m(s.buckle), [0.3, 0, 1, 0]);
};

const drawTowel = (r: Riso, s: State, g: Rig) => {
  const [hx, hy] = g.hip;
  const m = (p: Path2D) => xf(p, hx, hy, g.lean, 1 + g.breath * 0.03, 1 + g.breath * 0.025);
  const tw = m(s.towel);
  knock(r, tw);
  ink(r, tw, [0.06, 0, 0.06, 0.06]);
  clipDo(r, tw, () => ink(r, m(s.towelStripe), [0.05, 0, 0, 0.95]));
  stroke(r, m(s.towelFold), 1.5, [0.3, 0, 0, 0.3]);
};

const drawHead = (r: Riso, s: State, g: Rig, t: number) => {
  const nb = tl(g.hip, g.lean, 192 + g.breath * 3, 6);
  const hd = g.lean + g.neck;
  const ho = add(nb, [Math.sin((g.lean + g.neck * 0.5) * D2R) * 22, -Math.cos((g.lean + g.neck * 0.5) * D2R) * 22]);
  const neck = limb(nb, ho, [20, 21, 21], [26, 25, 24], 0.3);
  solid(r, neck, SKIN);
  ink(r, limbShade(nb, ho, [26, 25, 24], 0.1), SKIN_SH);
  const m = (p: Path2D) => xf(p, ho[0], ho[1], hd);
  const head = m(s.head);
  solid(r, head, SKIN);
  clipDo(r, head, () => ink(r, m(s.headShade), SKIN_SH));
  knockStroke(r, m(s.shine), 5, 0.75);
  const beard = m(s.beard);
  solid(r, beard, BEARD);
  stroke(r, m(s.beardLines), 1, [0, 0.6, 0.3, 0]);
  if (g.effort > 0.45) knock(r, m(s.teeth), 'nonzero', clamp((g.effort - 0.45) * 4));
  ink(r, m(s.eye), [0.95, 0, 0, 0.2]);
  stroke(r, m(g.effort > 0.4 ? s.browHard : s.brow), 4.5, [0.92, 0.2, 0, 0]);
  ink(r, m(s.nostril), [0.4, 0.6, 0, 0]);
  // headphones
  const band = m(s.band);
  knockStroke(r, band, 9);
  stroke(r, band, 7, PHONES);
  const cup = m(s.cup);
  solid(r, cup, PHONES);
  ink(r, m(s.cupRing), [0, 1, 0.1, 0]);
  // sweat beads slide down the scalp
  if (g.sweat > 0.02) {
    const drops = new Path2D();
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.35 + i * 0.27) % 1;
      const dx = [8, 22, -24, 30][i];
      const dy = lerp(-80, -50, ph) + i * 4;
      drops.moveTo(dx, dy - 4.5);
      drops.quadraticCurveTo(dx + 3, dy + 1, dx, dy + 2.5);
      drops.quadraticCurveTo(dx - 3, dy + 1, dx, dy - 4.5);
    }
    const dp = m(drops);
    knock(r, dp, 'nonzero', g.sweat);
    stroke(r, dp, 0.8, [0, 0, 0, 0.8 * g.sweat]);
  }
};

const drawSideBack = (r: Riso, s: State, g: Rig, t: number, farArm = true) => {
  if (farArm) drawArm(r, s, g, false);
  drawLeg(r, s, g.hipF, g.kF, g.aF, true);
  drawTorso(r, s, g);
  drawLeg(r, s, g.hip, g.kN, g.aN, false);
  if (g.towel) drawTowel(r, s, g);
  drawHead(r, s, g, t);
};

/* ---------- barbell ---------- */

const NEAR_PLATES: [number, Spec, string][] = [
  [0.7, P_RED, '25'],
  [0.765, P_RED, '25'],
  [0.83, P_YEL, '15'],
  [0.885, P_TEAL, '10'],
];

const barPt = (B: Pt, bend: number, sM: number): Pt => {
  const e = Math.max(0, Math.abs(sM) - 0.34) / 0.76;
  return [B[0] - sM * BARF, B[1] + sM * BAR_DY + bend * e * e];
};
const barRot = (bend: number, sM: number) => {
  const e = Math.max(0, Math.abs(sM) - 0.34) / 0.76;
  const dy = BAR_DY + Math.sign(sM) * (2 * bend * e) / 0.76;
  return Math.atan(dy / -BARF);
};

const plateText = (r: Riso, c: Pt, R: number, sx: number, rot: number, label: string) => {
  for (const L of r.layers) {
    L.save();
    L.translate(c[0], c[1]);
    L.rotate(rot);
    L.scale(sx, 1);
    L.globalCompositeOperation = 'destination-out';
    L.fillStyle = '#000';
    L.font = `900 ${(R * 0.22).toFixed(1)}px ${DISPLAY}`;
    L.textAlign = 'center';
    L.textBaseline = 'middle';
    L.fillText(label, 0, -R * 0.79);
    L.font = `900 ${(R * 0.12).toFixed(1)}px ${DISPLAY}`;
    L.fillText('KG', 0, R * 0.8);
    L.restore();
  }
};

const drawPlate = (r: Riso, c: Pt, R: number, sx: number, rot: number, col: Spec, label: string, edge: number) => {
  const rx = R * sx;
  const e = ell(c[0] - edge, c[1], rx, R, rot);
  solid(r, e, [Math.min(1, col[0] + 0.42), col[1] * 0.85, col[2] * 0.85, col[3] * 0.9]);
  const face = ell(c[0], c[1], rx, R, rot);
  solid(r, face, col);
  const rim = new Path2D();
  ell(c[0], c[1], rx, R, rot, rim);
  ell(c[0], c[1], rx * 0.92, R * 0.92, rot, rim);
  ink(r, rim, [0.32, 0, 0, 0.05], 'evenodd');
  stroke(r, ell(c[0], c[1], rx * 0.64, R * 0.64, rot), Math.max(1.2, R * 0.03), [0.3, 0, 0, 0]);
  const hub = ell(c[0], c[1], rx * 0.3, R * 0.3, rot);
  solid(r, hub, STEEL);
  stroke(r, ell(c[0], c[1], rx * 0.22, R * 0.22, rot), Math.max(0.8, R * 0.015), [0.5, 0, 0, 0]);
  ink(r, ell(c[0], c[1], rx * 0.13, R * 0.13, rot), [0.85, 0, 0, 0.3]);
  if (R > 20) plateText(r, c, R, sx, rot, label);
  const hl = new Path2D();
  hl.ellipse(c[0], c[1], rx * 0.82, R * 0.82, rot, Math.PI * 1.08, Math.PI * 1.36);
  knockStroke(r, hl, Math.max(1.5, R * 0.045), 0.6);
};

const drawSleeve = (r: Riso, B: Pt, bend: number, side: 1 | -1) => {
  const a = barPt(B, bend, side * 0.66);
  const c0 = barPt(B, bend, side * 0.93);
  const c1 = barPt(B, bend, side * 1.12);
  const rot = barRot(bend, side * 1.0);
  const sl = new Path2D();
  sl.moveTo(a[0], a[1]);
  sl.lineTo(c1[0], c1[1]);
  knockStroke(r, sl, 16);
  stroke(r, sl, 15, STEEL);
  const hl = new Path2D();
  hl.moveTo(a[0], a[1] - 4);
  hl.lineTo(c1[0], c1[1] - 4);
  knockStroke(r, hl, 2.4, 0.7);
  const scale = 1 + side * 0.05;
  const collar = ell(c0[0], c0[1], 11 * PLATE_SX * scale, 13 * scale, rot);
  solid(r, collar, [0.85, 0, 0, 0.3]);
  const inner = ell(a[0], a[1], 12 * PLATE_SX, 13, rot);
  solid(r, inner, [0.7, 0, 0, 0.3]);
  if (side > 0) {
    const end = ell(c1[0], c1[1], 7.6 * PLATE_SX, 7.6, rot);
    solid(r, end, [0.25, 0, 0.03, 0.12]);
    ink(r, ell(c1[0], c1[1], 5 * PLATE_SX, 5, rot), [0.82, 0.05, 0, 0.35]);
  }
};

const drawPlates = (r: Riso, B: Pt, bend: number, side: 1 | -1) => {
  const list = side > 0 ? NEAR_PLATES : NEAR_PLATES.slice().reverse().map(([sM, c, l]) => [-sM, c, l] as [number, Spec, string]);
  for (const [sM, col, label] of list) {
    const c = barPt(B, bend, sM);
    const sc = 1 + sM * 0.05;
    drawPlate(r, c, PLATE_R * sc, PLATE_SX, barRot(bend, sM), col, label, -11);
  }
};

const drawShaft = (r: Riso, B: Pt, bend: number, s0: number, s1: number) => {
  const p = new Path2D();
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const q = barPt(B, bend, lerp(s0, s1, i / n));
    if (i) p.lineTo(q[0], q[1]);
    else p.moveTo(q[0], q[1]);
  }
  knockStroke(r, p, 10.5);
  stroke(r, p, 9, STEEL);
  // knurl
  const kn = new Path2D();
  const a = Math.max(Math.min(s0, s1), -0.62);
  const b = Math.min(Math.max(s0, s1), 0.62);
  for (let sM = a; sM <= b; sM += 0.0085) {
    if (Math.abs(sM) < 0.07) continue;
    const q = barPt(B, bend, sM);
    kn.moveTo(q[0] - 2.2, q[1] - 4);
    kn.lineTo(q[0] + 2.2, q[1] + 4);
    kn.moveTo(q[0] + 2.2, q[1] - 4);
    kn.lineTo(q[0] - 2.2, q[1] + 4);
  }
  stroke(r, kn, 0.6, [0.8, 0, 0, 0.2]);
  const hl = new Path2D();
  const h0 = barPt(B, bend, s0);
  const h1 = barPt(B, bend, s1);
  hl.moveTo(h0[0], h0[1] - 2.6);
  hl.lineTo(h1[0], h1[1] - 2.6);
  knockStroke(r, hl, 1.4, 0.55);
};

/* ---------- gym world ---------- */

const drawGym = (r: Riso, s: State, t: number) => {
  ink(r, s.wall, [0, 0, 0.12, 0.26]);
  for (const cone of s.cones) {
    r.gradient(r.layers[YE], cone, { kind: 'linear', x0: 0, y0: -150, x1: 0, y1: FLOOR, from: 0.5, to: 0.05 }, 6);
  }
  stroke(r, s.seams, 2, [0.18, 0, 0, 0.2]);
  ink(r, s.stripeR, [0.05, 1, 0.2, 0]);
  ink(r, s.stripeY, [0, 0.05, 0.75, 0]);
  ink(r, s.ceiling, [0.6, 0, 0, 0.5]);
  stroke(r, s.beams, 10, [0.85, 0, 0, 0.3]);
  stroke(r, s.lampCord, 2, [0.9, 0, 0, 0]);
  solid(r, s.lampShade, [0.88, 0.1, 0, 0.25]);
  // mirror on the wall
  knock(r, s.mirror);
  ink(r, s.mirror, [0.04, 0, 0.08, 0.18]);
  knock(r, s.mirrorGlare, 'nonzero', 0.5);
  stroke(r, s.mirrorFrame, 5, [0.85, 0, 0, 0.2]);
  // clock
  solid(r, s.clockFace, [0, 0, 0.12, 0]);
  ink(r, s.clockRim, [0.92, 0, 0, 0.25], 'evenodd');
  stroke(r, s.clockTicks, 2.4, [0.9, 0, 0, 0]);
  const sec = 12 + Math.floor(t) + ease.outBack(clamp((t % 1) * 6));
  const minute = 47 + (sec - 12) / 60;
  const hour = 6 + minute / 60;
  const hand = (a: number, l: number, w: number, spec: Spec, tail = 8) => {
    const p = new Path2D();
    p.moveTo(CLOCK[0] - Math.sin(a) * tail, CLOCK[1] + Math.cos(a) * tail);
    p.lineTo(CLOCK[0] + Math.sin(a) * l, CLOCK[1] - Math.cos(a) * l);
    stroke(r, p, w, spec);
  };
  hand((hour / 12) * TAU, 32, 6, [0.92, 0, 0, 0.2]);
  hand((minute / 60) * TAU, 48, 4, [0.92, 0, 0, 0.2]);
  hand((sec / 60) * TAU, 52, 1.8, [0, 1, 0.1, 0], 14);
  ink(r, ell(CLOCK[0], CLOCK[1], 4, 4), [0, 1, 0.1, 0]);
  // floor
  ink(r, s.floor, [0.55, 0, 0, 0.3]);
  ink(r, s.mat, [0.2, 0, 0, 0.15]);
  stroke(r, s.floorLines, 2, [0.3, 0, 0, 0.1]);
  knockStroke(r, s.floorEdge, 2, 0.5);
  // rack (far side)
  solid(r, s.pins, RACK);
  solid(r, s.posts, RACK);
  knock(r, s.postHoles);
  solid(r, s.rackFeet, RACK);
  solid(r, s.hook, [0.82, 0.1, 0, 0.42]);
  // plate tree
  solid(r, s.tree, RACK);
  const tree: [number, number, Spec, string][] = [
    [470, 0, P_RED, '25'],
    [470, 14, P_RED, '25'],
    [620, 0, P_YEL, '15'],
    [770, 0, P_TEAL, '10'],
    [770, 12, P_TEAL, '10'],
  ];
  for (const [y, dx, col, label] of tree) drawPlate(r, [140 + dx, y], 66, 0.9, 0, col, label, 9);
  // chalk stand
  solid(r, s.stand, RACK);
  solid(r, s.bowl, [0.1, 1, 0.25, 0]);
  solid(r, s.bowlRim, [0.3, 1, 0.25, 0]);
  knock(r, s.chalkMound);
  ink(r, s.chalkMound, [0.05, 0, 0, 0.05]);
  // dumbbell rack under the mirror
  solid(r, s.dbRack, RACK);
  stroke(r, s.dbHandles, 7, STEEL);
  solid(r, s.dbHeads, RUBBER);
  // bench + dumbbells by it
  solid(r, s.benchFrame, RACK);
  solid(r, s.benchPad, [0.15, 1, 0.25, 0]);
  knockStroke(r, rrect(BENCH_X0 + 10, BENCH_Y - 18, BENCH_X1 - BENCH_X0 - 20, 2, 1), 2, 0.5);
  solid(r, s.floorDB, RUBBER);
  ink(r, s.floorDBFace, [0, 1, 0.1, 0], 'evenodd');
};

const drawRackedBar = (r: Riso, bend: number) => {
  const B: Pt = [BX0, HOOK_Y];
  drawSleeve(r, B, bend, -1);
  drawPlates(r, B, bend, -1);
  drawShaft(r, B, bend, -0.66, 0.66);
  drawPlates(r, B, bend, 1);
  drawSleeve(r, B, bend, 1);
};

/* ---------- lifter over time ---------- */

const stepK = (t: number, a: number, b: number) => tween(t, a, b, ease.inOutSine);

const feetAt = (t: number): [number, number, number, number] => {
  const fo = stepK(t, 5.3, 5.72);
  const no = stepK(t, 5.72, 6.14);
  const ni = stepK(t, 9.42, 9.8);
  const fi = stepK(t, 9.74, 10.12);
  const nx = AX_RACK + (AX_SQ - AX_RACK) * (no - ni);
  const fx = AX_RACK + (AX_SQ - AX_RACK) * (fo - fi);
  const lift = (k: number) => Math.sin(Math.PI * k) * 13;
  return [nx, lift(no) + lift(ni), fx, lift(fo) + lift(fi)];
};

const depthAt = (t: number) => {
  if (t < T_UNRACK0) return 0.14;
  if (t < T_UNRACK1) return lerp(0.14, 0, tween(t, T_UNRACK0, T_UNRACK1));
  if (t < T_DOWN0) return 0.03 * (Math.sin(Math.PI * seg(t, 5.3, 5.72)) + Math.sin(Math.PI * seg(t, 5.72, 6.14)));
  if (t < T_DOWN1) return ease.inOutSine(seg(t, T_DOWN0, T_DOWN1));
  if (t < T_UP0) return 1 + 0.015 * Math.sin(Math.PI * seg(t, T_DOWN1, T_UP0));
  if (t < T_UP1) {
    const k = seg(t, T_UP0, T_UP1);
    return 1 - ease.inOutSine(clamp(k + 0.1 * Math.sin(TAU * k)));
  }
  if (t < 10.08) return 0.03 * (Math.sin(Math.PI * seg(t, 9.42, 9.8)) + Math.sin(Math.PI * seg(t, 9.74, 10.12)));
  return lerp(0, 0.17, tween(t, 10.08, T_RERACK));
};

const bump = (t: number, a: number, b: number, c: number, d: number) => tween(t, a, b) * (1 - tween(t, c, d));

const bendAt = (t: number) => {
  let b = 3.5;
  if (t > T_UNRACK0) b += 5 * Math.exp(-(t - T_UNRACK0) * 4) * Math.sin((t - T_UNRACK0) * 22);
  for (const ts of [5.72, 6.14]) if (t > ts - 0.1) b += 3 * Math.exp(-(t - ts + 0.1) * 6) * Math.sin((t - ts + 0.1) * 20);
  b += 16 * Math.exp(-(((t - 8.08) / 0.13) ** 2));
  if (t > T_IMPACT) b += 5 * Math.exp(-(t - T_IMPACT) * 5) * Math.sin((t - T_IMPACT) * 26);
  if (t > T_UP1 - 0.05) b += 7 * Math.exp(-(t - T_UP1 + 0.05) * 4) * Math.sin((t - T_UP1 + 0.05) * 24);
  if (t > T_RERACK) b += 11 * Math.exp(-(t - T_RERACK) * 4.5) * Math.cos((t - T_RERACK) * 28);
  return b;
};

interface SquatState {
  rig: Rig;
  bar: Pt;
  bend: number;
}

const squatState = (t: number): SquatState => {
  const [nx, nl, fx, fl] = feetAt(t);
  const ax = (nx + fx) / 2;
  const d = depthAt(t);
  const hip = legPose(ax, d);
  const lean = solveLean(hip, ax + MID);
  const breath = tween(t, 6.3, 6.8) * (1 - tween(t, 9.15, 9.6));
  let bar = tl(hip, lean, BAR_U + breath * 2, BAR_V);
  if (Math.abs(bar[0] - BX0) < 12 && bar[1] > HOOK_Y) bar = [bar[0], HOOK_Y];
  const bend = bendAt(t);
  const gN = barPt(bar, bend, GRIP);
  const gF = barPt(bar, bend, -GRIP);
  const shN = tl(hip, lean, 164 + breath * 3, 4);
  const shF = add(tl(hip, lean, 164, -4), [-4, -3]);
  const elbow = (sh: Pt): Pt => add(sh, dirDown(-lean * 0.7 - 8), 84);
  const effort = 0.3 * seg(t, 6.8, 7.9) + 0.7 * bump(t, 7.9, 8.15, 9.0, 9.35);
  return {
    rig: buildRig({
      hip,
      lean,
      neck: -lean * 0.55 - 2,
      breath,
      ankN: [nx, ANK_Y - nl],
      ankF: [fx - 6, ANK_Y - 2 - fl],
      wristN: add(gN, [-1, 41]),
      wristF: add(gF, [-1, 41]),
      elbowN: elbow(shN),
      elbowF: elbow(shF),
      handN: 'grip',
      handF: 'grip',
      gripN: gN,
      gripF: gF,
      grip: tween(t, T_SQZ0, T_SQZ1, ease.inOutCubic),
      chalk: 1,
      effort: t > 9.6 ? 0 : effort,
      sweat: clamp(seg(t, 6.0, 7.0)),
    }),
    bar,
    bend,
  };
};

const chalkRig = (t: number): Rig => {
  const hip = legPose(CHALK_AX, 0.03);
  const rise = tween(t, 0.95, 1.5);
  const lean = lerp(17, 5, rise);
  const neck = lerp(22, -6, tween(t, 0.9, 1.6)) + 4 * Math.exp(-(((t - T_CLAP - 0.05) / 0.12) ** 2));
  const rub = (ph: number): Pt => [BOWL[0] - 18 + 9 * Math.sin(t * 10 + ph), BOWL[1] - 36 + 3 * Math.cos(t * 10 + ph)];
  const up = tween(t, 0.95, 1.5, ease.inOutCubic);
  const slap = tween(t, 1.52, T_CLAP, ease.inQuint);
  const after = seg(t, T_CLAP, 3.3);
  const dust = Math.sin(after * 16) * 8 * (1 - after);
  const nRaise: Pt = [1222 + CDX, 418];
  const nHit: Pt = [1212 + CDX, 474];
  const fHold: Pt = [1196 + CDX, 488];
  const n = lerpPt(lerpPt(rub(0), nRaise, up), nHit, slap);
  const f = lerpPt(rub(2.4), fHold, up);
  const nw: Pt = [n[0] + dust, n[1] + (after > 0 ? 6 * after : 0)];
  const fw: Pt = [f[0] - dust * 0.4, f[1] + 6 * after];
  return buildRig({
    hip,
    lean,
    neck,
    ankN: [CHALK_AX, ANK_Y],
    ankF: [CHALK_AX - 8, ANK_Y - 2],
    wristN: nw,
    wristF: fw,
    handN: 'open',
    handF: 'open',
    chalk: clamp(seg(t, 0.1, 0.7)),
  });
};

const BENCH_HIP: Pt = [1712, 700];

const benchRig = (t: number): Rig => {
  const b = 0.5 + 0.5 * Math.sin(((t - 15) * TAU) / 2.4);
  const hip: Pt = [BENCH_HIP[0], BENCH_HIP[1] - b * 1.5];
  return buildRig({
    hip,
    lean: 30 + b * 2,
    neck: 15 - b * 4,
    breath: b,
    ankN: [1868, ANK_Y],
    ankF: [1858, ANK_Y - 2],
    wristN: [1860, 730 - b * 3],
    wristF: [1850, 724 - b * 3],
    handN: 'fist',
    handF: 'fist',
    chalk: 1,
    towel: true,
    sweat: 1,
  });
};

/* ---------- chalk cloud (screen space) ---------- */

const drawCloud = (r: Riso, s: State, t: number, origin: Pt) => {
  if (t < T_CLAP - 0.02 || t > 4.1) return;
  const age = Math.max(0, t - T_CLAP);
  const white = tween(t, 2.5, 3.12, ease.inCubic);
  const clear = tween(t, 3.22, 3.95, ease.outCubic);
  const core = new Path2D();
  const mid = new Path2D();
  const outer = new Path2D();
  const shade = new Path2D();
  s.puffs.forEach((p, i) => {
    const dist = p.v * (1 - Math.exp(-age * 2.6)) * (1 + 2.2 * white);
    const sw = noise1(age * 0.8 + p.ph, i) * 30;
    const x = origin[0] + Math.cos(p.a) * dist + sw;
    const y = origin[1] + Math.sin(p.a) * dist * 0.75 - p.h * age * 30;
    const k = clamp(1 - clear * (1 + 0.7 * ((i * 0.37) % 1)));
    const rr = p.r0 * (0.3 + 1.25 * (1 - Math.exp(-age * 2))) * (1 + 7 * white) * k;
    if (rr < 0.5) return;
    ell(x, y, rr * 0.72, rr * 0.66, 0, core);
    ell(x, y, rr, rr * 0.9, 0, mid);
    ell(x, y, rr * 1.28, rr * 1.16, 0, outer);
    ell(x + rr * 0.1, y + rr * 0.35, rr * 0.55, rr * 0.4, 0, shade);
  });
  knock(r, outer, 'nonzero', 0.22);
  knock(r, mid, 'nonzero', 0.55);
  knock(r, core);
  if (white < 0.6) ink(r, shade, [0.05 * (1 - white), 0, 0, 0.1 * (1 - white)]);
  // flying specks
  const sp = new Path2D();
  s.specks.forEach((q) => {
    const d = q.v * age;
    const x = origin[0] + Math.cos(q.a) * d;
    const y = origin[1] + Math.sin(q.a) * d + q.g * age * age * 200;
    const rr = q.r * (1 - clear);
    if (rr > 0.3) ell(x, y, rr, rr, 0, sp);
  });
  knock(r, sp);
};

/** Chalk dust lifting off the bowl while he rubs his hands */
const drawBowlDust = (r: Riso, t: number) => {
  if (t > 1.6) return;
  const p = new Path2D();
  for (let i = 0; i < 9; i++) {
    const ph = (t * 0.9 + i * 0.13) % 1;
    const x = BOWL[0] - 30 + ((i * 37) % 60) + Math.sin(t * 3 + i) * 6;
    const y = BOWL[1] - 20 - ph * 90;
    const rr = 4 + ph * 14;
    ell(x, y, rr, rr * 0.8, 0, p);
  }
  knock(r, p, 'nonzero', 0.35 * (1 - seg(t, 1.0, 1.6)));
};

/* ---------- world camera ---------- */

type Cam = [number, number, number, number];

const SQC: Cam = [760, 560, 1.3, -0.04];
const WIDE: Cam = [1480, 500, 0.8, 0];

const zoomPath = (k: number, a: Cam, b: Cam, anchorA: Pt, anchorB: Pt): Cam => {
  const z = Math.exp(lerp(Math.log(a[2]), Math.log(b[2]), k));
  const kc = Math.abs(1 / b[2] - 1 / a[2]) < 1e-6 ? k : (1 / z - 1 / a[2]) / (1 / b[2] - 1 / a[2]);
  return [lerp(anchorA[0], anchorB[0], kc), lerp(anchorA[1], anchorB[1], kc), z, lerp(a[3], b[3], k)];
};

const shake = (t: number, t0: number, amp: number, decay = 10): Pt => {
  if (t < t0) return [0, 0];
  const e = Math.exp(-(t - t0) * decay) * amp;
  return [noise1((t - t0) * 40, 3) * e, noise1((t - t0) * 40, 9) * e];
};

const chalkCam = (t: number): Cam => {
  const push = tween(t, 0, T_CLAP, ease.inOutSine);
  const punch = tween(t, T_CLAP - 0.05, 2.4, ease.outCubic);
  const sh = shake(t, T_CLAP, 4);
  return [1196 + CDX + push * 14 + sh[0], 448 + punch * 10 + sh[1], 1.85 + push * 0.15 + punch * 0.3, 0];
};

const worldCam = (t: number, sq: SquatState | null): Cam => {
  if (t < T_GRIP) return chalkCam(t);
  if (t < 15) {
    const st = sq ?? squatState(t);
    const hand = st.rig.gripN;
    const close: Cam = [hand[0] - 6, hand[1] + 10, 7.2 - 0.6 * seg(t, T_GRIP, T_PULL0), 0];
    if (t < T_PULL0) return close;
    // squat framing: push in for the descent, punch on the drive
    const down = tween(t, T_DOWN0 - 0.3, T_DOWN1 + 0.1, ease.inOutSine);
    const back = tween(t, T_UP0 + 0.1, T_UP1 + 0.4, ease.inOutSine);
    const fwd = tween(t, 9.4, 10.2, ease.inOutSine);
    const k = down * (1 - back);
    const punch = t > T_IMPACT ? 0.14 * Math.exp(-(t - T_IMPACT) * 6) * (1 - Math.exp(-(t - T_IMPACT) * 40)) : 0;
    const sh1 = shake(t, T_IMPACT, 7);
    const sh2 = shake(t, T_RERACK, 9);
    const sq2: Cam = [
      lerp(SQC[0], 738, k) + fwd * 40 + sh1[0] + sh2[0],
      lerp(SQC[1], 612, k) + sh1[1] + sh2[1],
      lerp(SQC[2], 1.55, k) + punch - fwd * 0.03,
      lerp(SQC[3], -0.02, k),
    ];
    if (t < T_PULL1) {
      const kk = tween(t, T_PULL0, T_PULL1, ease.inOutCubic);
      return zoomPath(kk, close, sq2, [close[0], close[1]], [sq2[0], sq2[1]]);
    }
    if (t < T_PUSH0) return sq2;
    const end = barPt(st.bar, st.bend, 1.12);
    const kk = tween(t, T_PUSH0, T_PUSH1, ease.inCubic);
    const target: Cam = [end[0], end[1], 38, 0];
    return zoomPath(kk, sq2, target, [sq2[0], sq2[1]], [end[0], end[1]]);
  }
  const z0 = (HEX_FACE_R * mirrorPushZoom()) / CLOCK_R;
  const kz = 1 - Math.pow(1 - tween(t, T_WIDE0, T_WIDE1, ease.inOutSine), 2.4);
  const z = Math.exp(lerp(Math.log(z0), Math.log(WIDE[2]), kz));
  // tilt down to the bench early so the wall never sits empty
  const kc = tween(t, T_WIDE0 + 0.25, 16.9, ease.inOutSine);
  const cx = lerp(CLOCK[0], WIDE[0], kc);
  const cy = lerp(CLOCK[1], WIDE[1], kc);
  // final hold: a slow push toward him on the bench
  const d = ease.inOutSine(seg(t, T_WIDE1 - 0.3, DUR));
  return [lerp(cx, 1600, d), lerp(cy, 545, d), z * (1 + d * 0.2), 0];
};

const toScreen = (cam: Cam, p: Pt): Pt => {
  const dx = (p[0] - cam[0]) * cam[2];
  const dy = (p[1] - cam[1]) * cam[2];
  const c = Math.cos(cam[3]);
  const sn = Math.sin(cam[3]);
  return [800 + dx * c - dy * sn, 450 + dx * sn + dy * c];
};

/* ---------- the drive: impact burst ---------- */

const drawBurst = (r: Riso, t: number, c: Pt) => {
  const k = seg(t, T_IMPACT - 0.04, T_IMPACT + 0.7);
  if (k <= 0 || k >= 1) return;
  const fade = 1 - ease.inCubic(k);
  const p = new Path2D();
  const n = 22;
  const R0 = 120 + k * 120;
  const R1 = 900;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.07;
    const w = 0.055 + 0.03 * ((i * 7) % 3);
    p.moveTo(c[0] + Math.cos(a - w * 0.3) * R0, c[1] + Math.sin(a - w * 0.3) * R0);
    p.lineTo(c[0] + Math.cos(a - w) * R1, c[1] + Math.sin(a - w) * R1);
    p.lineTo(c[0] + Math.cos(a + w) * R1, c[1] + Math.sin(a + w) * R1);
    p.lineTo(c[0] + Math.cos(a + w * 0.3) * R0, c[1] + Math.sin(a + w * 0.3) * R0);
    p.closePath();
  }
  ink(r, p, [0, 0.7 * fade, 0.5 * fade, 0]);
};

/* ---------- mirror world (front view) ---------- */

const repCurve = (k: number) => {
  if (k <= 0 || k >= 1) return 0;
  if (k < 0.42) return ease.inOutSine(k / 0.42);
  if (k < 0.55) return 1;
  return 1 - ease.inOutSine((k - 0.55) / 0.45);
};
const CURL_MAX = 140 * D2R;
const curlA = (t: number) => CURL_MAX * (repCurve(seg(t, 11.62, 12.62)) + repCurve(seg(t, 13.42, 14.32)));
const curlB = (t: number) => CURL_MAX * repCurve(seg(t, 12.52, 13.52));

const handFront = (side: number, th: number): Pt => [
  MCX + side * M_EL_DX - side * 30 * Math.sin(th),
  M_EL_Y + M_FARM * Math.cos(th),
];

const mirrorPushZoom = () => 300 / HEX_FACE_R;
const MIRROR_C: Pt = [800, 450];

const mirrorCam = (t: number): Cam => {
  const z0 = mirrorStartZoom();
  if (t < 11.15) return [HEXA[0], HEXA[1], z0, 0];
  const pull = tween(t, 11.15, 12.5, ease.inOutCubic);
  const dolly = tween(t, 12.3, T_MPUSH0, ease.inOutSine);
  const base: Cam = [MIRROR_C[0] + dolly * 50, MIRROR_C[1] + 22 - dolly * 14, 0.94 + dolly * 0.1, 0];
  const c = zoomPath(pull, [HEXA[0], HEXA[1], z0, 0], base, HEXA, [base[0], base[1]]);
  if (t < T_MPUSH0) return c;
  const push = tween(t, T_MPUSH0, T_MPUSH1, ease.inCubic);
  return zoomPath(push, c, [HEXA[0], HEXA[1], mirrorPushZoom(), 0], [c[0], c[1]], HEXA);
};

/** Zoom that makes the hex end match the sleeve end at the hand-off */
const mirrorStartZoom = () => (7.6 * 38) / HEX_FACE_R;

const drawDumbbell = (r: Riso, hand: Pt, th: number, fist: () => void) => {
  const ax = -Math.sin(th);
  const az = Math.cos(th);
  const plate = (a: number) => {
    const pts: Pt[] = [];
    for (const off of [-HEX_TH / 2, HEX_TH / 2]) {
      const z = (a + off) * az;
      const sc = 1 + z * 0.0015;
      pts.push(...hexPts(hand[0], hand[1] + (a + off) * ax, HEX_R * sc, Math.abs(az)));
    }
    const prism = polyPath(hull(pts));
    // visible face: the one nearer the camera
    const off = az >= 0 ? HEX_TH / 2 : -HEX_TH / 2;
    const zf = (a + off) * az;
    const sc = 1 + zf * 0.0015;
    const fc: Pt = [hand[0], hand[1] + (a + off) * ax];
    solid(r, prism, RUBBER);
    if (Math.abs(az) > 0.12) {
      const face = polyPath(hexPts(fc[0], fc[1], HEX_R * sc, Math.abs(az)));
      ink(r, face, [-0.3 + 0.3, 0, 0, 0.1]);
      const ring = new Path2D();
      polyPath(hexPts(fc[0], fc[1], HEX_R * sc * 0.78, Math.abs(az)), true, ring);
      polyPath(hexPts(fc[0], fc[1], HEX_R * sc * 0.64, Math.abs(az)), true, ring);
      ink(r, ring, [0, 1, 0.15, 0], 'evenodd');
      ink(r, polyPath(hexPts(fc[0], fc[1], HEX_R * sc * 0.18, Math.abs(az))), STEEL);
      if (Math.abs(az) > 0.5) {
        for (const L of r.layers) {
          L.save();
          L.translate(fc[0], fc[1]);
          L.scale(1, Math.abs(az));
          L.globalCompositeOperation = 'destination-out';
          L.fillStyle = '#000';
          L.font = `900 ${(HEX_R * sc * 0.3).toFixed(1)}px ${DISPLAY}`;
          L.textAlign = 'center';
          L.textBaseline = 'middle';
          L.fillText('40', 0, HEX_R * sc * 0.42);
          L.restore();
        }
      }
      const hl = polyPath(hexPts(fc[0], fc[1], HEX_R * sc * 0.93, Math.abs(az)).slice(3, 6), false);
      knockStroke(r, hl, 2.5, 0.55);
    }
  };
  const near = az >= 0 ? HEX_A : -HEX_A;
  plate(-near);
  const hd = new Path2D();
  hd.moveTo(hand[0], hand[1] - HEX_A * ax);
  hd.lineTo(hand[0], hand[1] + HEX_A * ax);
  stroke(r, hd, 16, STEEL);
  fist();
  plate(near);
};

interface FrontArm {
  side: number;
  th: number;
}

const drawFrontArm = (r: Riso, a: FrontArm, t: number) => {
  const { side, th } = a;
  const flex = Math.sin(clamp(th / CURL_MAX) * Math.PI * 0.5);
  const sh: Pt = [MCX + side * M_SH_DX, M_SH_Y];
  const el: Pt = [MCX + side * M_EL_DX, M_EL_Y];
  const hand = handFront(side, th);
  const persp = 1 + Math.sin(th) * 0.16;
  // outer/inner half widths; fr is +x of a downward limb
  const outer = [48, 56, 52 + flex * 4, 40, 33];
  const inner = [38, 44, 50 + flex * 14, 44 + flex * 5, 31];
  const fr = side > 0 ? outer : inner;
  const bk = side > 0 ? inner : outer;
  const ua = limb(sh, el, fr, bk);
  const delt = ell(MCX + side * 232, 432, 60, 68, side * 0.28);
  solid(r, ua, SKIN);
  // shade the inner/under side, keep a light ridge on the bicep
  ink(r, limbShade(sh, el, bk, 0.32), SKIN_SH);
  stroke(r, limbLine(sh, el, 0.3, 0.92, side * 12, side * 6), 2, [0.12, 0.6, 0, 0]);
  const peak = ell(lerp(sh[0], el[0], 0.55) - side * 6, lerp(sh[1], el[1], 0.55), 18 + flex * 6, 34 + flex * 6, 0);
  knock(r, peak, 'nonzero', 0.18 + flex * 0.12);
  solid(r, delt, SKIN);
  const dsh = ell(MCX + side * 232 - side * 22, 450, 40, 52, side * 0.28);
  clipDo(r, delt, () => ink(r, dsh, [0, 0.2, 0, 0]));
  knockStroke(r, (() => {
    const p = new Path2D();
    p.ellipse(MCX + side * 238, 418, 40, 44, side * 0.28, side > 0 ? -1.3 : Math.PI + 0.1, side > 0 ? -0.1 : Math.PI + 1.3);
    return p;
  })(), 4, 0.45);
  const sep = new Path2D();
  sep.moveTo(MCX + side * 196, 486);
  sep.quadraticCurveTo(MCX + side * 232, 506, MCX + side * 282, 486);
  stroke(r, sep, 2, [0.1, 0.6, 0, 0]);
  const vein = new Path2D();
  vein.moveTo(MCX + side * 230, 520);
  vein.bezierCurveTo(MCX + side * 220, 560, MCX + side * 236, 590, MCX + side * 226, 625);
  stroke(r, vein, 2, [0.05, 0.6 + flex * 0.3, 0, 0]);
  // forearm and dumbbell
  const fw = [31, 34, 28, 23].map((v) => v * lerp(1, persp, 0.6));
  const fa = limb(el, hand, fw, fw.map((v) => v * 0.95), 0.6);
  const fist = () => {
    const f = ell(hand[0], hand[1], 36 * persp, 33 * persp, 0);
    knockStroke(r, f, 4);
    solid(r, f, SKIN);
    clipDo(r, f, () => ink(r, ell(hand[0] - side * 14, hand[1] + 10, 34 * persp, 30 * persp, 0), SKIN_SH));
    const fl = new Path2D();
    for (let i = -1; i <= 2; i++) {
      const x = hand[0] + (i - 0.5) * 15 * persp * side;
      fl.moveTo(x, hand[1] - 4 * persp);
      fl.lineTo(x, hand[1] + 26 * persp);
    }
    stroke(r, fl, 2, [0.15, 0.6, 0, 0]);
    const th = ell(hand[0], hand[1] - 22 * persp, 24 * persp, 11 * persp, 0);
    solid(r, th, SKIN);
    ink(r, th, [0.04, 0.25, 0, 0]);
  };
  const elb = ell(el[0], el[1], 30, 30, 0);
  const fu = new Path2D();
  fu.addPath(elb);
  fu.addPath(fa);
  knockStroke(r, fu, 4);
  solid(r, elb, SKIN);
  solid(r, fa, SKIN);
  ink(r, limbShade(el, hand, fw, 0.3), SKIN_SH);
  const fv = limbLine(el, hand, 0.15, 0.8, 0, 6);
  stroke(r, fv, 2, [0.05, 0.75, 0, 0]);
  drawDumbbell(r, hand, th, fist);
  void t;
};

const drawFront = (r: Riso, s: State, t: number) => {
  const thA = curlA(t);
  const thB = curlB(t);
  const effort = Math.max(Math.sin(thA / CURL_MAX * Math.PI * 0.5), Math.sin(thB / CURL_MAX * Math.PI * 0.5));
  const breath = 0.5 + 0.5 * Math.sin(t * 4.2);
  const X = (dx: number) => MCX + dx;
  // torso
  const right: Pt[] = [
    [50, 296], [58, 342], [118, 360], [176, 382], [204, 398], [214, 470], [228, 520], [216, 590], [192, 680], [170, 780],
    [158, 900], [156, 1010],
  ];
  const body = smoothPath(
    offPts([...right, ...flipX(right).reverse()], MCX, breath * -2),
    true,
    0.45
  );
  solid(r, body, SKIN);
  const bodyShade = new Path2D();
  bodyShade.rect(X(-240), 300, 120, 720);
  clipDo(r, body, () => ink(r, bodyShade, SKIN_SH));
  // pecs
  const pecR: Pt[] = [[6, 398], [64, 390], [150, 402], [200, 440], [206, 486], [172, 530], [110, 544], [40, 538], [6, 522]];
  for (const side of [1, -1]) {
    const pts = side > 0 ? pecR : flipX(pecR);
    const sh = smoothPath(offPts(pts, MCX, 16), true, 0.5);
    clipDo(r, body, () => ink(r, sh, [0.12, 0.45, 0, 0]));
    const pec = smoothPath(offPts(pts, MCX, -breath * 2), true, 0.5);
    solid(r, pec, SKIN);
    clipDo(r, pec, () => ink(r, ell(X(side * 120), 520, 120, 40, 0), [0, 0.22, 0, 0]));
  }
  // serratus on the exposed sides
  const ser = new Path2D();
  for (const side of [1, -1])
    for (let i = 0; i < 3; i++) {
      ser.moveTo(X(side * (150 + i * 4)), 560 + i * 26);
      ser.lineTo(X(side * (182 + i * 2)), 548 + i * 26);
    }
  stroke(r, ser, 2.4, [0.1, 0.55, 0, 0]);
  // tank top (stringer)
  const tankR: Pt[] = [[0, 476], [36, 460], [62, 404], [72, 318], [98, 318], [106, 380], [114, 452], [124, 532], [132, 640], [140, 1012]];
  const tank = smoothPath(offPts([...tankR, ...flipX(tankR).reverse()], MCX, 0), true, 0.25);
  solid(r, tank, TANK);
  clipDo(r, tank, () => {
    for (const side of [1, -1]) ink(r, ell(X(side * 100), 470, 70, 58, 0), [0, 0, 0, 0.5]);
    const fold = new Path2D();
    fold.moveTo(X(-110), 600);
    fold.quadraticCurveTo(X(-70), 660, X(-80), 760);
    fold.moveTo(X(118), 620);
    fold.quadraticCurveTo(X(80), 700, X(96), 800);
    knockStroke(r, fold, 2.5, 0.25);
  });
  // neck and traps
  const neck = smoothPath(offPts([[-52, 280], [52, 280], [58, 352], [0, 366], [-58, 352]], MCX, 0), true, 0.4);
  solid(r, neck, SKIN);
  ink(r, ell(X(-30), 340, 40, 24, 0), [0.05, 0.4, 0, 0]);
  // head
  const hy = 238 - breath * 2;
  const skull = ell(X(0), hy, 64, 77, 0);
  solid(r, skull, SKIN);
  const crescent = new Path2D();
  crescent.rect(X(-120), hy - 120, 240, 240);
  ell(X(16), hy - 14, 64, 77, 0, crescent);
  clipDo(r, skull, () => ink(r, crescent, SKIN_SH, 'evenodd'));
  const shine = new Path2D();
  shine.ellipse(X(8), hy - 10, 46, 56, 0, -2.3, -1.2);
  knockStroke(r, shine, 7, 0.75);
  // ears
  for (const side of [1, -1]) solid(r, ell(X(side * 63), hy + 14, 12, 20, 0), SKIN);
  // face
  const browY = hy - 18;
  const furrow = effort * 7;
  const brows = new Path2D();
  brows.moveTo(X(-46), browY - 2);
  brows.lineTo(X(-12), browY + furrow);
  brows.moveTo(X(46), browY - 2);
  brows.lineTo(X(12), browY + furrow);
  const eyes = new Path2D();
  for (const side of [1, -1]) ell(X(side * 26), hy + 2, 12, 6 * (1 - effort * 0.5) + 1, 0, eyes);
  knock(r, eyes);
  ink(r, eyes, [0.05, 0, 0.05, 0.05]);
  const iris = new Path2D();
  for (const side of [1, -1]) ell(X(side * 26 - 2), hy + 2, 4.6, 4.4 * (1 - effort * 0.4), 0, iris);
  ink(r, iris, [0.95, 0, 0, 0.3]);
  stroke(r, brows, 7, [0.92, 0.2, 0, 0]);
  const nose = new Path2D();
  nose.moveTo(X(-4), hy + 4);
  nose.quadraticCurveTo(X(-14), hy + 34, X(-18), hy + 44);
  nose.quadraticCurveTo(X(0), hy + 54, X(18), hy + 44);
  ink(r, nose, [0.04, 0.45, 0, 0]);
  const nostr = new Path2D();
  ell(X(-9), hy + 46, 4, 2.4, 0, nostr);
  ell(X(9), hy + 46, 4, 2.4, 0, nostr);
  ink(r, nostr, [0.6, 0.6, 0, 0]);
  // beard
  const beardPts: Pt[] = [
    [-62, 12], [-60, 56], [-50, 100], [-28, 132], [0, 142], [28, 132], [50, 100], [60, 56], [62, 12], [52, 30], [38, 44],
    [24, 52], [0, 50], [-24, 52], [-38, 44], [-52, 30],
  ];
  const beard = smoothPath(offPts(beardPts, MCX, hy), true, 0.45);
  solid(r, beard, BEARD);
  const bl = new Path2D();
  for (let i = -3; i <= 3; i++) {
    bl.moveTo(X(i * 14), hy + 70 + Math.abs(i) * 2);
    bl.quadraticCurveTo(X(i * 15 + 3), hy + 100, X(i * 13), hy + 128 - Math.abs(i) * 6);
  }
  stroke(r, bl, 1.2, [0, 0.55, 0.3, 0]);
  if (effort > 0.4) {
    knock(r, rrect(X(-17), hy + 66, 34, 9, 3), 'nonzero', clamp((effort - 0.4) * 3));
  } else {
    ink(r, ell(X(0), hy + 72, 13, 5, 0), [0.1, 0.75, 0.4, 0]);
  }
  // sweat on the scalp
  const drops = new Path2D();
  for (let i = 0; i < 5; i++) {
    const ph = (t * 0.3 + i * 0.21) % 1;
    const dx = [-34, -8, 20, 40, -46][i];
    const dy = hy - 60 + ph * 40 + i * 6;
    drops.moveTo(X(dx), dy - 7);
    drops.quadraticCurveTo(X(dx + 5), dy + 2, X(dx), dy + 4);
    drops.quadraticCurveTo(X(dx - 5), dy + 2, X(dx), dy - 7);
  }
  knock(r, drops, 'nonzero', 0.9);
  stroke(r, drops, 1.2, [0, 0, 0, 0.7]);
  // headphones
  const band = new Path2D();
  band.ellipse(X(0), hy + 8, 80, 104, 0, Math.PI * 1.1, Math.PI * 1.9);
  knockStroke(r, band, 17);
  stroke(r, band, 13, PHONES);
  for (const side of [1, -1]) {
    const cup = ell(X(side * 74), hy + 14, 17, 38, 0);
    solid(r, cup, PHONES);
    ink(r, ell(X(side * 76), hy + 14, 7, 24, 0), [0, 1, 0.1, 0]);
  }
  // beat rings off the cups
  const beat = (t * 2.1) % 1;
  const ring = new Path2D();
  for (const side of [1, -1]) {
    ring.ellipse(X(side * 74), hy + 14, 24 + beat * 40, 46 + beat * 40, 0, side > 0 ? -0.8 : Math.PI - 0.8, side > 0 ? 0.8 : Math.PI + 0.8);
  }
  stroke(r, ring, 3, [0, 0, 0.8 * (1 - beat), 0.6 * (1 - beat)]);
  // arms: the one curling is drawn last
  const arms: FrontArm[] = [
    { side: -1, th: thA },
    { side: 1, th: thB },
  ];
  arms.sort((a, b) => a.th - b.th);
  for (const a of arms) drawFrontArm(r, a, t);
};

const drawMirrorWorld = (r: Riso, s: State, t: number, cam: Cam) => {
  r.camera(cam[0], cam[1], cam[2], cam[3]);
  ink(r, s.mWall, [0.08, 0, 0.1, 0.38]);
  for (const x of [220, 760, 1300]) {
    const cone = new Path2D();
    cone.moveTo(x - 120, 60);
    cone.lineTo(x + 120, 60);
    cone.lineTo(x + 300, 900);
    cone.lineTo(x - 300, 900);
    cone.closePath();
    r.gradient(r.layers[YE], cone, { kind: 'linear', x0: 0, y0: 60, x1: 0, y1: 900, from: 0.45, to: 0.04 }, 6);
  }
  stroke(r, s.mPanels, 2, [0.2, 0, 0, 0.2]);
  ink(r, s.mStripeR, [0.05, 1, 0.2, 0]);
  ink(r, s.mStripeY, [0, 0.05, 0.75, 0]);
  solid(r, s.mLights, [0, 0, 0.9, 0]);
  solid(r, s.mShelf, RACK);
  solid(r, s.mHex, RUBBER);
  ink(r, s.mHexRing, [0, 1, 0.1, 0], 'evenodd');
  drawFront(r, s, t);
  // glass: a cool tint and two glare bands
  ink(r, s.mWall, [0, 0, 0, 0.08]);
  knock(r, s.mGlare, 'nonzero', 0.3);
  // the edge of the mirror and the real wall beside it
  knock(r, s.mOutside);
  ink(r, s.mOutside, [0, 0.1, 0.35, 0.12]);
  solid(r, s.mFrame, [0.88, 0, 0, 0.3]);
  // the real lifter's shoulder in front of the glass
  const fz = 1 + (cam[2] - 1) * 1.3;
  const fc: Pt = [MIRROR_C[0] + (cam[0] - MIRROR_C[0]) * 1.3, MIRROR_C[1] + (cam[1] - MIRROR_C[1]) * 1.3];
  r.camera(fc[0], fc[1], fz, cam[3]);
  const bob = Math.sin(t * 4.2) * 3;
  const fg = new Path2D();
  fg.moveTo(1040, 960);
  fg.bezierCurveTo(1080, 840, 1200, 800, 1270, 790 + bob);
  fg.bezierCurveTo(1330, 690 + bob, 1460, 690 + bob, 1520, 770 + bob);
  fg.bezierCurveTo(1600, 790, 1700, 820, 1760, 960);
  fg.closePath();
  const fgHead = ell(1395, 690 + bob, 118, 132, 0.1);
  const sil = new Path2D();
  sil.addPath(fg);
  sil.addPath(fgHead);
  solid(r, sil, [0.82, 0.25, 0.15, 0.45]);
  const rim = new Path2D();
  rim.ellipse(1395, 690 + bob, 116, 130, 0.1, Math.PI * 1.15, Math.PI * 1.55);
  knockStroke(r, rim, 6, 0.5);
  const fb = new Path2D();
  fb.ellipse(1395, 700 + bob, 128, 140, 0.1, Math.PI * 1.05, Math.PI * 1.95);
  stroke(r, fb, 16, [1, 0, 0, 0.3]);
};

/* ---------- masks ---------- */

const maskPath = (pts: Pt[], cx: number, cy: number, R: number) =>
  polyPath(pts.map(([x, y]) => [cx + x * R, cy + y * R] as Pt));

/* ---------- film ---------- */

export const gymSessionFilm: RisoFilm<State> = {
  id: 'gym-session',
  title: 'Session',
  caption: 'Chalk, a heavy back squat, curls in the mirror, and the clock on the wall while he breathes.',
  theme: 'Fitness',
  category: 'Athletic',
  series: 'Risograph',
  motif: 'The round iron: plate, sleeve, hex dumbbell, clock',
  duration: DUR,
  paper: '#f3ead8',
  inks: [
    { color: '#2c2a31', offset: [0, 0], angle: 45 },
    { color: '#e8412e', offset: [1.4, -0.9], angle: 15 },
    { color: '#ffcf3a', offset: [-1.1, 1.0], angle: 0 },
    { color: '#13868c', offset: [0.8, 1.3], angle: 75 },
  ],
  scenes: [
    { at: 0, label: 'Chalk' },
    { at: T_GRIP, label: 'Grip' },
    { at: 6.6, label: 'Squat' },
    { at: 10.9, label: 'Mirror' },
    { at: 15.0, label: 'Rest' },
  ],
  posterTime: 8.24,

  setup() {
    const rng = mulberry(41);
    const P = (pts: Pt[], tension = 0.5) => smoothPath(pts, true, tension);

    const torso = P(uv(TORSO_UV));
    const tank = new Path2D();
    tank.rect(-90, -220, 180, 164);
    ell(-16, -150, 25, 44, 0, tank);
    const shortsT = new Path2D();
    shortsT.rect(-90, -56, 180, 130);
    const belt = polyPath([[-50, -46], [54, -46], [56, -90], [-49, -90]]);
    const buckle = rrect(47, -84, 11, 26, 2);
    const torsoShade = new Path2D();
    torsoShade.rect(-100, -240, 76, 330);
    const pecLine = ell(36, -150, 30, 26, 0);
    const towelUV: Pt[] = [
      [214, -26], [216, 30], [200, 42], [140, 64], [104, 68], [100, 50], [138, 44], [194, 24], [198, -10], [150, -42],
      [120, -58], [124, -74], [170, -60],
    ];
    const towel = P(uv(towelUV), 0.4);
    const towelStripe = new Path2D();
    towelStripe.rect(30, -122, 50, 8);
    towelStripe.rect(-100, -138, 60, 8);
    const towelFold = new Path2D();
    towelFold.moveTo(44, -186);
    towelFold.quadraticCurveTo(52, -150, 58, -112);
    towelFold.moveTo(-40, -186);
    towelFold.quadraticCurveTo(-56, -160, -66, -132);

    const head = P(HEAD_PTS);
    const headShade = new Path2D();
    headShade.rect(-60, -100, 34, 120);
    ell(-30, -40, 20, 40, 0, headShade);
    const beard = P(BEARD_PTS, 0.45);
    const beardLines = new Path2D();
    for (let i = 0; i < 6; i++) {
      const x = -6 + i * 9;
      beardLines.moveTo(x, -20 + i);
      beardLines.quadraticCurveTo(x + 3, -2, x - 2, 10 - Math.abs(i - 2.5) * 2);
    }
    const cup = ell(-10, -44, 15, 21, 0);
    const cupRing = ell(-12, -44, 7, 12, 0);
    const band = new Path2D();
    band.moveTo(-10, -64);
    band.quadraticCurveTo(-15, -96, 6, -98);
    const eye = ell(35, -47, 3.6, 2.2, 0);
    const brow = new Path2D();
    brow.moveTo(27, -54);
    brow.lineTo(45, -52);
    const browHard = new Path2D();
    browHard.moveTo(27, -56);
    browHard.lineTo(45, -50);
    const nostril = ell(46, -29, 2.6, 1.6, 0);
    const shine = new Path2D();
    shine.moveTo(-6, -82);
    shine.quadraticCurveTo(10, -90, 26, -81);
    const teeth = rrect(38, -20, 12, 4, 1.5);

    const fist = P([[-12, -2], [10, -2], [15, 8], [15, 24], [11, 33], [0, 35], [-11, 32], [-15, 22], [-14, 8]]);
    const fistThumb = P([[8, 4], [17, 10], [18, 21], [12, 23], [9, 14]]);
    const fistLines = new Path2D();
    for (const y of [16, 23, 29]) {
      fistLines.moveTo(-10, y);
      fistLines.lineTo(9, y + 1);
    }
    const open = P([[-12, -2], [11, -2], [13, 20], [12, 44], [8, 52], [-2, 53], [-10, 50], [-13, 40], [-14, 18]]);
    const openThumb = P([[10, 4], [20, 10], [27, 22], [24, 27], [17, 22], [11, 16]]);
    const openLines = new Path2D();
    for (const x of [-6, 0, 6]) {
      openLines.moveTo(x, 27);
      openLines.lineTo(x * 1.05, 49);
    }

    const shoe = P(
      [[-16, -16], [-4, -22], [12, -18], [26, -10], [46, -3], [58, 3], [61, 9], [-23, 9], [-25, -4]],
      0.35
    );
    const sole = polyPath([[-25, 7], [62, 8], [62, 13], [18, 13], [15, 17], [-25, 17]]);
    const strap = new Path2D();
    strap.moveTo(14, -15);
    strap.lineTo(28, -5);

    /* world */
    const wall = new Path2D();
    wall.rect(-1400, -900, 5200, FLOOR + 900);
    const seams = new Path2D();
    for (let x = -1000; x < 3600; x += 380) {
      seams.moveTo(x, -260);
      seams.lineTo(x, FLOOR);
    }
    const stripeR = new Path2D();
    stripeR.rect(-1400, 600, 5200, 14);
    const stripeY = new Path2D();
    stripeY.rect(-1400, 614, 5200, 20);
    const ceiling = new Path2D();
    ceiling.rect(-1400, -900, 5200, 640);
    const beams = new Path2D();
    beams.moveTo(-1400, -262);
    beams.lineTo(3800, -262);
    const lampShade = new Path2D();
    const lampCord = new Path2D();
    const cones: Path2D[] = [];
    for (const x of LAMPS) {
      lampCord.moveTo(x, -262);
      lampCord.lineTo(x, -150);
      lampShade.moveTo(x - 30, -152);
      lampShade.lineTo(x + 30, -152);
      lampShade.lineTo(x + 72, -108);
      lampShade.lineTo(x - 72, -108);
      lampShade.closePath();
      const c = new Path2D();
      c.moveTo(x - 66, -110);
      c.lineTo(x + 66, -110);
      c.lineTo(x + 420, FLOOR);
      c.lineTo(x - 420, FLOOR);
      c.closePath();
      cones.push(c);
    }
    const floor = new Path2D();
    floor.rect(-1400, FLOOR, 5200, 900);
    const floorLines = new Path2D();
    for (const y of [22, 58, 112, 190, 300, 460]) {
      floorLines.moveTo(-1400, FLOOR + y);
      floorLines.lineTo(3800, FLOOR + y);
    }
    const floorEdge = new Path2D();
    floorEdge.moveTo(-1400, FLOOR + 1);
    floorEdge.lineTo(3800, FLOOR + 1);
    const mat = new Path2D();
    mat.rect(POST_B - 120, FLOOR, POST_F - POST_B + 380, 64);

    const posts = new Path2D();
    const postHoles = new Path2D();
    for (const x of [POST_B, POST_F]) {
      posts.rect(x - 12, 110, 24, FLOOR - 110);
      for (let y = 160; y < FLOOR - 40; y += 28) ell(x, y, 3, 3, 0, postHoles);
    }
    posts.rect(POST_B - 12, 96, POST_F - POST_B + 24, 24);
    const rackFeet = new Path2D();
    rackFeet.rect(POST_B - 50, FLOOR - 16, POST_F - POST_B + 100, 16);
    const pins = new Path2D();
    pins.rect(POST_B - 30, 694, POST_F - POST_B + 70, 11);
    const hook = new Path2D();
    const hy = HOOK_Y - 0.6 * BAR_DY + 5;
    hook.moveTo(POST_F + 12, hy - 40);
    hook.lineTo(POST_F + 12, hy + 16);
    hook.lineTo(HOOK_X - 14, hy + 16);
    hook.lineTo(HOOK_X - 18, hy - 8);
    hook.lineTo(HOOK_X - 9, hy - 8);
    hook.lineTo(HOOK_X - 7, hy + 4);
    hook.lineTo(POST_F - 12, hy + 4);
    hook.lineTo(POST_F - 12, hy - 40);
    hook.closePath();

    const tree = new Path2D();
    tree.rect(134, 400, 14, FLOOR - 400);
    tree.rect(70, FLOOR - 14, 150, 14);

    const stand = new Path2D();
    stand.rect(BOWL[0] - 8, BOWL[1] + 20, 16, FLOOR - BOWL[1] - 20);
    stand.rect(BOWL[0] - 44, FLOOR - 12, 88, 12);
    const bowl = new Path2D();
    bowl.moveTo(BOWL[0] - 56, BOWL[1]);
    bowl.ellipse(BOWL[0], BOWL[1], 56, 34, 0, 0, Math.PI);
    bowl.closePath();
    const bowlRim = ell(BOWL[0], BOWL[1], 56, 9, 0);
    ell(BOWL[0], BOWL[1], 50, 6, 0, bowlRim);
    const chalkMound = ell(BOWL[0], BOWL[1] - 2, 46, 8, 0);
    ell(BOWL[0] + 14, BOWL[1] - 9, 14, 8, 0.2, chalkMound);

    const benchPad = rrect(BENCH_X0, BENCH_Y - 26, BENCH_X1 - BENCH_X0, 30, 10);
    const benchFrame = new Path2D();
    benchFrame.rect(BENCH_X0 + 16, BENCH_Y, BENCH_X1 - BENCH_X0 - 32, 14);
    benchFrame.rect(BENCH_X0 + 36, BENCH_Y, 18, FLOOR - BENCH_Y);
    benchFrame.rect(BENCH_X1 - 54, BENCH_Y, 18, FLOOR - BENCH_Y);
    benchFrame.rect(BENCH_X0 + 10, FLOOR - 10, 80, 10);
    benchFrame.rect(BENCH_X1 - 90, FLOOR - 10, 80, 10);
    const floorDB = new Path2D();
    const floorDBFace = new Path2D();
    for (const x of [2030, 2112]) {
      polyPath(hexPts(x, FLOOR - 34, 38), true, floorDB);
      polyPath(hexPts(x, FLOOR - 34, 30), true, floorDBFace);
      polyPath(hexPts(x, FLOOR - 34, 24), true, floorDBFace);
    }

    const dbRack = new Path2D();
    dbRack.rect(2230, 700, 520, 14);
    dbRack.rect(2230, 790, 520, 14);
    dbRack.rect(2240, 700, 14, FLOOR - 700);
    dbRack.rect(2726, 700, 14, FLOOR - 700);
    const dbHeads = new Path2D();
    const dbHandles = new Path2D();
    for (const [y, h] of [[700, 30], [790, 36]] as [number, number][]) {
      for (let x = 2270; x < 2700; x += 96) {
        dbHandles.moveTo(x, y - h / 2);
        dbHandles.lineTo(x + 70, y - h / 2);
        rrect(x - 8, y - h, 24, h, 5, dbHeads);
        rrect(x + 56, y - h, 24, h, 5, dbHeads);
      }
    }
    const mirror = new Path2D();
    mirror.rect(2230, 60, 520, 560);
    const mirrorFrame = new Path2D();
    mirrorFrame.rect(2230, 60, 520, 560);
    mirrorFrame.moveTo(2490, 60);
    mirrorFrame.lineTo(2490, 620);
    const mirrorGlare = polyPath([[2280, 620], [2400, 60], [2450, 60], [2330, 620]]);
    polyPath([[2560, 620], [2680, 60], [2700, 60], [2580, 620]], true, mirrorGlare);

    const clockRim = ell(CLOCK[0], CLOCK[1], CLOCK_R, CLOCK_R, 0);
    ell(CLOCK[0], CLOCK[1], CLOCK_R - 8, CLOCK_R - 8, 0, clockRim);
    const clockFace = ell(CLOCK[0], CLOCK[1], CLOCK_R, CLOCK_R, 0);
    const clockTicks = new Path2D();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const r0 = i % 3 === 0 ? CLOCK_R - 22 : CLOCK_R - 16;
      clockTicks.moveTo(CLOCK[0] + Math.sin(a) * r0, CLOCK[1] - Math.cos(a) * r0);
      clockTicks.lineTo(CLOCK[0] + Math.sin(a) * (CLOCK_R - 11), CLOCK[1] - Math.cos(a) * (CLOCK_R - 11));
    }

    const puffs: Puff[] = Array.from({ length: 26 }, () => ({
      a: rng() * TAU,
      v: 40 + rng() * 260,
      r0: 26 + rng() * 60,
      ph: rng() * 10,
      h: 0.3 + rng() * 1.2,
    }));
    const specks: Speck[] = Array.from({ length: 50 }, () => ({
      a: rng() * TAU,
      v: 150 + rng() * 520,
      r: 1.2 + rng() * 3.2,
      g: 0.4 + rng() * 0.8,
    }));

    const circ = ellipsePts(0, 0, PLATE_SX, 1, 96);
    const hexU = hexPts(0, 0, 1);
    const irisA = morphPair(circ, hexU, 120);
    const irisB = morphPair(hexU, ellipsePts(0, 0, 1, 1, 96), 120);

    /* mirror world */
    const mWall = new Path2D();
    mWall.rect(-600, -600, 2800, 2000);
    const mPanels = new Path2D();
    for (let x = -300; x < 2000; x += 340) {
      mPanels.moveTo(x, 0);
      mPanels.lineTo(x, 1400);
    }
    const mStripeR = new Path2D();
    mStripeR.rect(-600, 560, 2800, 14);
    const mStripeY = new Path2D();
    mStripeY.rect(-600, 574, 2800, 20);
    const mLights = new Path2D();
    for (const x of [220, 760, 1300]) rrect(x - 130, 30, 260, 22, 6, mLights);
    const mShelf = new Path2D();
    mShelf.rect(-400, 720, 2400, 16);
    mShelf.rect(-400, 830, 2400, 16);
    const mHex = new Path2D();
    const mHexRing = new Path2D();
    for (const [y, R] of [[690, 26], [800, 30]] as [number, number][]) {
      for (let x = -380; x < 2000; x += 76) {
        polyPath(hexPts(x, y, R), true, mHex);
        polyPath(hexPts(x, y, R * 0.74), true, mHexRing);
        polyPath(hexPts(x, y, R * 0.6), true, mHexRing);
      }
    }
    const mGlare = polyPath([[180, 1200], [620, -300], [760, -300], [320, 1200]]);
    polyPath([[860, 1200], [1300, -300], [1350, -300], [910, 1200]], true, mGlare);
    const mOutside = new Path2D();
    mOutside.rect(-600, -600, 640, 2000);
    const mFrame = new Path2D();
    mFrame.rect(40, -600, 22, 2000);
    mFrame.rect(1170, -600, 6, 2000);

    return {
      torso,
      tank,
      shortsT,
      belt,
      buckle,
      torsoShade,
      pecLine,
      towel,
      towelStripe,
      towelFold,
      head,
      headShade,
      beard,
      beardLines,
      cup,
      cupRing,
      band,
      eye,
      brow,
      browHard,
      nostril,
      shine,
      teeth,
      fist,
      fistThumb,
      fistLines,
      open,
      openThumb,
      openLines,
      shoe,
      sole,
      strap,
      wall,
      seams,
      stripeR,
      stripeY,
      ceiling,
      beams,
      lampShade,
      lampCord,
      cones,
      floor,
      floorLines,
      floorEdge,
      mat,
      posts,
      postHoles,
      rackFeet,
      pins,
      hook,
      tree,
      stand,
      bowl,
      bowlRim,
      chalkMound,
      benchPad,
      benchFrame,
      floorDB,
      floorDBFace,
      dbRack,
      dbHeads,
      dbHandles,
      mirror,
      mirrorFrame,
      mirrorGlare,
      clockRim,
      clockFace,
      clockTicks,
      puffs,
      specks,
      irisA,
      irisB,
      mWall,
      mPanels,
      mStripeR,
      mStripeY,
      mShelf,
      mHex,
      mHexRing,
      mLights,
      mGlare,
      mFrame,
      mOutside,
    };
  },

  draw(r, t, s) {
    const inWorldA = t < T_MIRROR;
    const inMirror = t >= T_MASK0 && t < T_WIDE0 + 0.7;
    const inWorldB = t >= T_CLOCK;

    const drawWorld = (tt: number) => {
      const sq = tt >= T_GRIP && tt < 15 ? squatState(tt) : null;
      const cam = worldCam(tt, sq);
      r.camera(cam[0], cam[1], cam[2], cam[3]);
      drawGym(r, s, tt);
      if (tt < T_GRIP) {
        drawRackedBar(r, 3.5);
        const g = chalkRig(tt);
        drawSideBack(r, s, g, tt);
        drawArm(r, s, g, true);
        r.camera(800, 450, 1);
        drawBowlDust(r, tt);
        drawCloud(r, s, tt, toScreen(cam, [1206 + CDX, 478]));
        return;
      }
      if (sq) {
        const { rig, bar, bend } = sq;
        drawBurst(r, tt, add(rig.hip, [20, -120]));
        drawSleeve(r, bar, bend, -1);
        drawPlates(r, bar, bend, -1);
        drawShaft(r, bar, bend, -0.66, 0);
        drawSideBack(r, s, rig, tt);
        drawShaft(r, bar, bend, 0, 0.66);
        drawArm(r, s, rig, true);
        drawPlates(r, bar, bend, 1);
        drawSleeve(r, bar, bend, 1);
        r.camera(800, 450, 1);
        drawCloud(r, s, tt, [800, 450]);
        return;
      }
      drawRackedBar(r, 3.5);
      const g = benchRig(tt);
      drawSideBack(r, s, g, tt);
      drawArm(r, s, g, true);
      // a drop of sweat falls off the beard
      const fk = seg(tt, 18.0, 18.55);
      if (fk > 0 && fk < 1) {
        const d = ell(1795 + fk * 6, 640 + ease.inQuint(fk) * 205, 3, 4.5, 0);
        knock(r, d);
        stroke(r, d, 1, [0, 0, 0, 0.8]);
      }
      const sk = seg(tt, 18.55, 18.9);
      if (sk > 0 && sk < 1) {
        const sp = new Path2D();
        sp.ellipse(1801, FLOOR + 2, 6 + sk * 16, 2 + sk * 3, 0, Math.PI, TAU);
        knockStroke(r, sp, 2 * (1 - sk), 0.8);
      }
    };

    if (inWorldA) drawWorld(t);

    // iris 1: the sleeve end of the bar becomes the hex end of a dumbbell in the mirror
    if (t >= T_MASK0 && t < T_MPUSH0) {
      const sq = squatState(Math.min(t, T_PUSH1));
      const wc = worldCam(Math.min(t, T_PUSH1), sq);
      const endS = toScreen(wc, barPt(sq.bar, sq.bend, 1.12));
      const rs = 7.6 * wc[2];
      const grow = tween(t, 11.08, T_MIRROR, ease.inCubic);
      const R = rs + grow * 1400;
      const k = tween(t, T_MASK0, 11.12, ease.inOutSine);
      const cx = lerp(endS[0], 800, grow);
      const cy = lerp(endS[1], 450, grow);
      const mask = maskPath(morph(s.irisA[0], s.irisA[1], k), cx, cy, R);
      const mc = mirrorCam(t);
      // keep the dumbbell end under the mask while they match
      const mz = t < 11.15 ? rs / HEX_FACE_R : mc[2];
      const mcam: Cam = t < 11.15 ? [HEXA[0] - (cx - 800) / mz, HEXA[1] - (cy - 450) / mz, mz, 0] : mc;
      if (t < T_MIRROR) {
        r.camera(800, 450, 1);
        knock(r, mask);
        clipDo(r, mask, () => drawMirrorWorld(r, s, t, mcam));
        r.camera(800, 450, 1);
        stroke(r, mask, 3, [0.6, 0, 0, 0.2]);
      } else {
        drawMirrorWorld(r, s, t, mcam);
      }
    } else if (inMirror && t < T_CLOCK) {
      drawMirrorWorld(r, s, t, mirrorCam(t));
    }

    // iris 2: the hex end becomes the gym clock
    if (t >= T_CLOCK && t < T_WIDE0 + 0.7) {
      const mc = mirrorCam(Math.min(t, T_MPUSH1));
      drawMirrorWorld(r, s, t, mc);
      const hexS = toScreen(mc, HEXA);
      const R0 = HEX_FACE_R * mc[2];
      const grow = tween(t, 15.1, 15.7, ease.inCubic);
      const k = tween(t, T_CLOCK, 15.12, ease.inOutSine);
      const R = R0 + grow * 1400;
      const mask = maskPath(morph(s.irisB[0], s.irisB[1], k), hexS[0], hexS[1], R);
      r.camera(800, 450, 1);
      knock(r, mask);
      clipDo(r, mask, () => drawWorld(Math.max(t, 15)));
      r.camera(800, 450, 1);
      if (grow < 1) stroke(r, mask, 3, [0.7, 0, 0, 0.2]);
    } else if (inWorldB) {
      drawWorld(t);
    }

    // title
    if (t > 17.2) {
      r.camera(800, 450, 1);
      const k = tween(t, 17.2, 17.7, ease.outBack);
      const a = clamp((t - 17.2) / 0.25);
      for (let i = 0; i < 4; i++) {
        const c = r.layers[i];
        c.save();
        c.translate(118, 842);
        c.scale(lerp(1.25, 1, k), lerp(1.25, 1, k));
        c.font = `900 78px ${DISPLAY}`;
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
        if (i === K) {
          c.globalCompositeOperation = 'destination-out';
          c.fillStyle = '#000';
          c.fillText('SESSION', 0, 0);
          c.globalCompositeOperation = 'source-over';
          c.fillStyle = r.tone(c, 0.6 * a);
          c.fillText('SESSION', 5, 5);
        } else if (i === RD) {
          c.fillStyle = a >= 1 ? '#000' : r.tone(c, a);
          c.fillText('SESSION', 0, 0);
        } else {
          c.globalCompositeOperation = 'destination-out';
          c.fillStyle = '#000';
          c.fillText('SESSION', 0, 0);
        }
        c.restore();
      }
      const c = r.layers[K];
      c.save();
      c.font = `600 20px ${MONO}`;
      c.textAlign = 'left';
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      c.fillText('06:47 / SQUAT / CURLS / REST', 122, 874);
      c.restore();
      for (const L of r.layers) {
        if (L === c) continue;
        L.save();
        L.font = `600 20px ${MONO}`;
        L.globalCompositeOperation = 'destination-out';
        L.fillStyle = '#000';
        L.fillText('06:47 / SQUAT / CURLS / REST', 122, 874);
        L.restore();
      }
    }
  },
};
