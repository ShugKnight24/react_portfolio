import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import { TAU, clamp, ease, hash, lerp, noise1, seg, smoothPath, tween, type Pt } from '../riso/kit';
import {
  SUMI,
  applyCam,
  bake,
  blotPts,
  bloom,
  drawPlate,
  enso,
  ink,
  inscription,
  keys,
  layerView,
  makeSeal,
  mist,
  mountain,
  paperA,
  paperAge,
  ridgeLine,
  spline,
  splatterPath,
  stampSeal,
  stroke,
  strokePath,
  sweepPath,
  toScreen,
  verm,
  type Brush,
  type Cam,
  type Plate,
} from '../styles/inkwash';

/*
 * Iron Mountain: discipline as a mountain, painted in sumi ink.
 * Motif: the single horizontal stroke. It is laid down as the horizon at dawn, rises into the
 * ridge of the far range, comes back as the bamboo pole a lone figure lifts on a cliff ledge
 * (the lockout is the climax: the sun flares, ink bursts), and at the end the brush closes the
 * whole scene inside an enso.
 */

const DURATION = 18.5;
const FX = 1180;
const GY = 655;
const FS = 0.8;
const T_LOCK = 11.5;

/* ---------- world ---------- */

const hump = (x: number, c: number, w: number, e = 1.2) => {
  const u = Math.abs(x - c) / w;
  return u >= 1 ? 0 : Math.pow(0.5 + 0.5 * Math.cos(Math.PI * u), e);
};

/** Far range (layer p 0.1): the dawn peaks */
const yA = (x: number) =>
  505 -
  185 * hump(x, 1035, 250, 1.3) -
  110 * hump(x, 690, 200) -
  80 * hump(x, 420, 190) -
  100 * hump(x, 1470, 170) -
  60 * hump(x, 1250, 120) -
  30 * hump(x, 210, 160) +
  5 * noise1(x / 21, 3) -
  9 * Math.abs(noise1(x / 48, 4));

/** Middle range (p 0.3): the spires and the waterfall notch */
const yB = (x: number) =>
  655 -
  390 * hump(x, 330, 165, 1.1) -
  300 * hump(x, 545, 175, 1.1) -
  250 * hump(x, 140, 130) -
  150 * hump(x, 780, 170) -
  80 * hump(x, 1320, 230) -
  60 * hump(x, -60, 160) +
  6 * noise1(x / 18, 7) -
  10 * Math.abs(noise1(x / 40, 8));

/** Low hills (p 0.55) */
const yC = (x: number) => 790 - 80 * hump(x, 170, 280) - 50 * hump(x, 640, 220) - 40 * hump(x, -200, 200) + 4 * noise1(x / 25, 9);

const WATER_X = 436;
const ENSO = [1188, 468, 288] as const;

/* ---------- camera ---------- */

const logKeys = (t: number, ks: [number, number][], fn: (k: number) => number) => Math.exp(keys(t, ks.map(([a, b]) => [a, Math.log(b)] as [number, number]), fn));

const camAt = (t: number): Cam => {
  const fn = ease.inOutSine;
  const push = (k: number) => ease.inOutCubic(k);
  let x: number;
  let y: number;
  let z: number;
  if (t < 7.4) {
    x = keys(t, [[0, 905], [3.6, 880], [6.2, 800], [7.4, 812]], fn);
    y = keys(t, [[0, 470], [3.6, 466], [6.2, 450], [7.4, 455]], fn);
    z = logKeys(t, [[0, 1.24], [3.6, 1.17], [6.2, 1.0], [7.4, 1.02]], fn);
  } else if (t < 12.7) {
    const k = push(seg(t, 7.4, 9.6));
    x = lerp(812, FX, k);
    y = keys(t, [[7.4, 455], [9.6, 585], [10.4, 582], [11.0, 568], [T_LOCK, 552], [12.7, 548]], fn);
    z = t < 9.6 ? Math.exp(lerp(Math.log(1.02), Math.log(3.25), k)) : logKeys(t, [[9.6, 3.25], [10.4, 3.42], [11.0, 3.3], [T_LOCK, 3.6], [12.7, 3.5]], fn);
  } else {
    const k = push(seg(t, 12.7, 14.6));
    x = t < 14.6 ? lerp(FX, 1040, k) : keys(t, [[14.6, 1040], [DURATION, 1052]], fn);
    y = t < 14.6 ? lerp(548, 462, k) : keys(t, [[14.6, 462], [DURATION, 466]], fn);
    z = t < 14.6 ? Math.exp(lerp(Math.log(3.5), Math.log(1.06), k)) : logKeys(t, [[14.6, 1.06], [DURATION, 1.14]], fn);
  }
  let rot = keys(t, [[7.4, 0], [9.6, -0.025], [11.0, 0.01], [T_LOCK, 0], [12.7, 0.0], [13.6, 0.035], [14.6, 0.0]], fn);
  // the lockout hits the lens: a punch in and a shake that dies away
  if (t > T_LOCK) {
    const d = t - T_LOCK;
    const e = Math.exp(-d * 7);
    z *= 1 + 0.09 * e;
    x += (7 * e * Math.sin(d * 83)) / z;
    y += (6 * e * Math.cos(d * 71)) / z;
    rot += 0.006 * e * Math.sin(d * 60);
  }
  return { x, y, z, rot };
};

/* ---------- the figure (front view, feet at the origin, about 180 units tall) ---------- */

interface Pose {
  pel: Pt;
  tor: number;
  lean: number;
  head: number;
  fL: Pt;
  fR: Pt;
  hL: Pt;
  hR: Pt;
  eL: Pt;
  eR: Pt;
  effort: number;
  /** apparent leg length: thighs foreshorten as they point at us in a squat */
  leg?: number;
}

const STAND: Pose = { pel: [0, -93], tor: 1, lean: 0, head: 0, fL: [-17, 0], fR: [17, 0], hL: [-34, -90], hR: [34, -90], eL: [-1, 0.1], eR: [1, 0.1], effort: 0 };
const LOOK: Pose = { ...STAND, head: 0.0, pel: [0, -92], hL: [-36, -88], hR: [36, -88], effort: 0.3 };
const SQUAT: Pose = { pel: [0, -42], tor: 0.54, lean: 0, head: 0, fL: [-33, 0], fR: [33, 0], hL: [-60, -22], hR: [60, -22], eL: [-1, 0.25], eR: [1, 0.25], effort: 0.6, leg: 0.72 };
const SQUAT_T: Pose = { ...SQUAT, pel: [0, -44], hL: [-60, -25], hR: [60, -25], effort: 1 };
const PULL: Pose = { pel: [0, -91], tor: 0.98, lean: 0, head: -0.02, fL: [-35, 0], fR: [35, 0], hL: [-55, -120], hR: [55, -120], eL: [-1, -0.6], eR: [1, -0.6], effort: 1 };
const RACK: Pose = { pel: [0, -76], tor: 1, lean: 0, head: 0, fL: [-38, 0], fR: [38, 0], hL: [-44, -139], hR: [44, -139], eL: [-0.3, 1], eR: [0.3, 1], effort: 0.9, leg: 0.9 };
const RACK_UP: Pose = { ...RACK, leg: 1, pel: [0, -91], fL: [-36, 0], fR: [36, 0], hL: [-44, -154], hR: [44, -154], effort: 0.6 };
const DIP: Pose = { ...RACK_UP, leg: 0.95, pel: [0, -81], hL: [-44, -144], hR: [44, -144], effort: 0.9 };
const LOCK: Pose = { pel: [0, -93], tor: 1, lean: 0, head: 0.0, fL: [-40, 0], fR: [40, 0], hL: [-50, -206], hR: [50, -206], eL: [-1, 0], eR: [1, 0], effort: 1 };
const HOLD: Pose = { ...LOCK, effort: 0.45 };

const POSES: [number, Pose, (k: number) => number][] = [
  [0, STAND, ease.inOutSine],
  [8.3, STAND, ease.inOutSine],
  [8.75, LOOK, ease.inOutSine],
  [9.55, SQUAT, ease.inOutCubic],
  [10.3, SQUAT_T, ease.inOutSine],
  [10.5, PULL, ease.inQuint],
  [10.68, RACK, ease.outCubic],
  [11.1, RACK_UP, ease.inOutSine],
  [11.3, DIP, ease.inOutSine],
  [T_LOCK, LOCK, ease.outQuint],
  [12.6, HOLD, ease.inOutSine],
];

const lp = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

const blend = (a: Pose, b: Pose, k: number): Pose => ({
  pel: lp(a.pel, b.pel, k),
  tor: lerp(a.tor, b.tor, k),
  lean: lerp(a.lean, b.lean, k),
  head: lerp(a.head, b.head, k),
  fL: lp(a.fL, b.fL, k),
  fR: lp(a.fR, b.fR, k),
  hL: lp(a.hL, b.hL, k),
  hR: lp(a.hR, b.hR, k),
  eL: lp(a.eL, b.eL, k),
  eR: lp(a.eR, b.eR, k),
  effort: lerp(a.effort, b.effort, k),
  leg: lerp(a.leg ?? 1, b.leg ?? 1, k),
});

/** Figure time: the lockout freezes for a beat */
const figT = (t: number) => (t < T_LOCK ? t : t < T_LOCK + 0.6 ? T_LOCK + (t - T_LOCK) * 0.08 : T_LOCK + 0.048 + (t - T_LOCK - 0.6));

const poseAt = (tf: number): Pose => {
  let P = POSES[POSES.length - 1][1];
  for (let i = 1; i < POSES.length; i++) {
    if (tf <= POSES[i][0]) {
      const k = POSES[i][2](clamp((tf - POSES[i - 1][0]) / (POSES[i][0] - POSES[i - 1][0])));
      P = blend(POSES[i - 1][1], POSES[i][1], k);
      break;
    }
  }
  // breathing, and the shake of a held strain
  const br = Math.sin(tf * 2.4);
  const strain = tf > 9.5 && tf < 10.32 ? seg(tf, 9.5, 10.2) : tf > T_LOCK + 0.1 ? 0.35 * Math.exp(-(tf - T_LOCK) * 0.6) : 0;
  const sh = (s: number) => strain * 0.9 * noise1(tf * 22, s);
  return {
    ...P,
    pel: [P.pel[0] + sh(1), P.pel[1] + br * 0.8 + sh(2)],
    hL: [P.hL[0] + sh(3), P.hL[1] + sh(4) + br * 0.4],
    hR: [P.hR[0] + sh(5), P.hR[1] + sh(6) + br * 0.4],
  };
};

const ik = (a: Pt, b: Pt, l1: number, l2: number, hint: Pt): { j: Pt; e: Pt } => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const D = Math.hypot(dx, dy) || 1e-3;
  const d = clamp(D, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.02);
  const ux = dx / D;
  const uy = dy / D;
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const px = -uy;
  const py = ux;
  const sg = px * hint[0] + py * hint[1] >= 0 ? 1 : -1;
  return { j: [a[0] + ux * x + px * h * sg, a[1] + uy * x + py * h * sg], e: [a[0] + ux * d, a[1] + uy * d] };
};

interface Skel {
  P: Pose;
  up: Pt;
  rt: Pt;
  neck: Pt;
  head: Pt;
  shL: Pt;
  shR: Pt;
  hipL: Pt;
  hipR: Pt;
  kL: Pt;
  kR: Pt;
  anL: Pt;
  anR: Pt;
  elL: Pt;
  elR: Pt;
  wL: Pt;
  wR: Pt;
}

const skel = (P: Pose): Skel => {
  const up: Pt = [Math.sin(P.lean), -Math.cos(P.lean)];
  const rt: Pt = [Math.cos(P.lean), Math.sin(P.lean)];
  const at = (o: Pt, a: number, b: number): Pt => [o[0] + rt[0] * a + up[0] * b, o[1] + rt[1] * a + up[1] * b];
  const neck = at(P.pel, 0, 58 * P.tor);
  const hu: Pt = [Math.sin(P.lean + P.head), -Math.cos(P.lean + P.head)];
  const head: Pt = [neck[0] + hu[0] * 19, neck[1] + hu[1] * 19];
  const shL = at(neck, -27, -5);
  const shR = at(neck, 27, -5);
  const hipL = at(P.pel, -13, 0);
  const hipR = at(P.pel, 13, 0);
  const anL: Pt = [P.fL[0], P.fL[1] - 5];
  const anR: Pt = [P.fR[0], P.fR[1] - 5];
  const f = P.leg ?? 1;
  const kL = ik(hipL, anL, 46 * f, 44 * f, [-1, -0.15]).j;
  const kR = ik(hipR, anR, 46 * f, 44 * f, [1, -0.15]).j;
  const aL = ik(shL, P.hL, 31, 28, P.eL);
  const aR = ik(shR, P.hR, 31, 28, P.eR);
  return { P, up, rt, neck, head, shL, shR, hipL, hipR, kL, kR, anL, anR, elL: aL.j, elR: aR.j, wL: aL.e, wR: aR.e };
};

/* ---------- the pole and stones ---------- */

interface Pole {
  mid: Pt;
  ang: number;
  sag: number;
  lifted: number;
}

const REST: Pt = [0, -22];
const HALF = 118;

const poleAt = (t: number): Pole => {
  const tf = figT(t);
  const grip = seg(tf, 9.45, 9.55);
  const hm = (q: number) => {
    const S = skel(poseAt(q));
    return lp(S.wL, S.wR, 0.5);
  };
  const S = skel(poseAt(tf));
  const hands = lp(S.wL, S.wR, 0.5);
  const lifted = clamp((REST[1] - hands[1]) / 4);
  const mid = lp(REST, [hands[0], Math.min(REST[1], hands[1])], grip);
  const ang = grip * Math.atan2(S.wR[1] - S.wL[1], S.wR[0] - S.wL[0]);
  // the ends lag behind the hands: they droop as the pole is driven up and whip at the lock
  const dt = 0.05;
  const a = (hm(tf + dt)[1] - 2 * hands[1] + hm(tf - dt)[1]) / (dt * dt);
  let sag = lifted * (3 + clamp(-a * 0.0011, -8, 14));
  if (t > T_LOCK) {
    const d = t - T_LOCK;
    sag += 12 * Math.exp(-d * 3.2) * Math.cos(d * 17);
  }
  return { mid, ang, sag, lifted };
};

const polePts = (pl: Pole, s0: number, s1: number): Pt[] => {
  const out: Pt[] = [];
  const c = Math.cos(pl.ang);
  const s = Math.sin(pl.ang);
  const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / 5));
  for (let i = 0; i <= n; i++) {
    const q = lerp(s0, s1, i / n);
    const dy = pl.sag * (q / HALF) * (q / HALF);
    out.push([pl.mid[0] + c * q - s * dy, pl.mid[1] + s * q + c * dy]);
  }
  return out;
};

/* ---------- state ---------- */

interface State {
  A: Plate;
  B: Plate;
  C: Plate;
  mists: Plate[];
  seal: HTMLCanvasElement;
  horizon: Pt[];
  ridgeA: Pt[];
  ridgeB: Pt[];
  lipY: number;
  cliffTop: Pt[];
  cliffLip: Pt[];
  cliffBody: Path2D;
  cun: { pts: Pt[]; w: number; at: number; seed: number }[];
  stone: Pt[];
  tiny: Pt[];
  enso: Plate;
}

const mistPlate = (r: Riso, w: number, h: number, seed: number, a: number): Plate =>
  bake(r, 0, 0, w, h, 0.5, (g) => {
    g.filter = `blur(${Math.round(h * 0.16 * r.scale * 0.5)}px)`;
    for (let i = 0; i < 26; i++) {
      const x = hash(seed + i) * w;
      const y = h * (0.5 + (hash(seed * 3 + i) - 0.5) * 0.35);
      g.fillStyle = paperA(a * (0.55 + 0.45 * hash(i * 7 + seed)));
      g.beginPath();
      g.ellipse(x, y, 120 + hash(i * 5 + seed) * 240, h * (0.14 + 0.12 * hash(i + seed * 9)), 0, 0, TAU);
      g.fill();
    }
  });

const build = (r: Riso): State => {
  const blur = (px: number) => Math.max(0.5, px * r.scale);
  const A = bake(r, -200, 150, 2000, 600, 1.1, (g) => {
    mountain(g, yA, -200, 1800, { alpha: 0.2, fade: 230, seed: 3, cun: 2.2, dots: 3, blur: blur(2.6), cunAlpha: 0.2 });
    // the range thins out toward both edges
    g.globalCompositeOperation = 'destination-in';
    const gr = g.createLinearGradient(-200, 0, 1800, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.17, 'rgba(0,0,0,1)');
    gr.addColorStop(0.83, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(-200, 150, 2000, 600);
    g.globalCompositeOperation = 'source-over';
  });
  const lipY = yB(WATER_X) + 4;
  const B = bake(r, -400, 180, 2200, 640, 1.3, (g) => {
    mountain(g, yB, -400, 1800, { alpha: 0.46, fade: 290, seed: 11, cun: 4, dots: 4, blur: blur(2.2), cunAlpha: 0.42 });
    // reserve the waterfall: the paper is left white where the water falls
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.filter = `blur(${blur(2)}px)`;
    g.fillStyle = '#000';
    const fall = new Path2D();
    fall.moveTo(WATER_X - 13, lipY - 6);
    fall.lineTo(WATER_X + 13, lipY - 6);
    fall.bezierCurveTo(WATER_X + 16, lipY + 80, WATER_X + 26, lipY + 160, WATER_X + 40, 720);
    fall.lineTo(WATER_X - 38, 720);
    fall.bezierCurveTo(WATER_X - 24, lipY + 160, WATER_X - 16, lipY + 80, WATER_X - 13, lipY - 6);
    g.fill(fall);
    g.restore();
    // dark wet rock lips either side of the fall
    const lips = new Path2D();
    strokePath(spline([[WATER_X - 16, lipY - 10], [WATER_X - 22, lipY + 50], [WATER_X - 24, lipY + 120], [WATER_X - 36, lipY + 190]], 8), { w: 9, dry: 0.7, outT: 0.6, seed: 31 }, lips);
    strokePath(spline([[WATER_X + 16, lipY - 12], [WATER_X + 20, lipY + 40], [WATER_X + 28, lipY + 110], [WATER_X + 34, lipY + 170]], 8), { w: 8, dry: 0.7, outT: 0.6, seed: 32 }, lips);
    g.fillStyle = ink(0.8);
    g.fill(lips);
  });
  const tiny: Pt[] = [];
  const C = bake(r, -500, 560, 1800, 360, 1.3, (g) => {
    mountain(g, yC, -500, 1300, { alpha: 0.5, fade: 130, seed: 21, cun: 2, dots: 2, blur: blur(1.2), cunAlpha: 0.4 });
    // little pines along the hill line
    const trees = new Path2D();
    for (let x = -480; x < 1000; x += 16 + hash(x) * 30) {
      if (hash(x * 1.7) < 0.35) continue;
      const y = yC(x) + 3;
      const h = 12 + hash(x * 3) * 16;
      strokePath([[x, y], [x + 0.5, y - h]], { w: 2.2, outT: 0.3, seed: x }, trees);
      for (let j = 0; j < 3; j++) {
        const yy = y - h * (0.35 + j * 0.22);
        const ww = (4.5 - j) * 1.6;
        strokePath([[x - ww, yy + 1.5], [x + ww, yy - 0.5]], { w: 3.2 - j * 0.6, outT: 0.4, seed: x + j }, trees);
      }
      tiny.push([x, y - h]);
    }
    g.fillStyle = ink(0.62);
    g.fill(trees);
  });
  const mists = [mistPlate(r, 2600, 160, 41, 0.95), mistPlate(r, 2600, 140, 43, 0.9), mistPlate(r, 2600, 180, 47, 0.95)];

  const horizon: Pt[] = [];
  const ridgeA: Pt[] = [];
  for (let x = 120; x <= 1560; x += 8) {
    horizon.push([x, 505 + 1.4 * noise1(x / 90, 2)]);
    ridgeA.push([x, yA(x)]);
  }
  const ridgeB = ridgeLine(yB, -30, 1100, 6);

  // the near cliff: a ledge running off to the right, its lip under the pine
  const cliffTop: Pt[] = spline([[880, 666], [925, 657], [1010, 652], [1120, 656], [1250, 654], [1420, 649], [1700, 646], [2000, 650], [2600, 640]], 10);
  const cliffLip: Pt[] = spline([[884, 664], [862, 692], [874, 738], [858, 792], [880, 860], [868, 960]], 10);
  const cliffBody = new Path2D();
  cliffBody.moveTo(cliffLip[cliffLip.length - 1][0], cliffLip[cliffLip.length - 1][1]);
  for (let i = cliffLip.length - 1; i >= 0; i--) cliffBody.lineTo(cliffLip[i][0], cliffLip[i][1]);
  for (const q of cliffTop) cliffBody.lineTo(q[0], q[1]);
  cliffBody.lineTo(2600, 640);
  cliffBody.lineTo(2600, 1100);
  cliffBody.lineTo(860, 1100);
  cliffBody.closePath();
  // axe-cut texture strokes on the rock face
  const cun: State['cun'] = [];
  // in groups, like axe cuts: a few near-parallel strokes slanting down off the ledge
  for (let gI = 0; gI < 16; gI++) {
    const gx = 900 + hash(gI * 3.3) * 1300;
    const gy = 670 + Math.pow(hash(gI * 7.1), 1.3) * 150;
    const a = 1.2 + (hash(gI * 2.9) - 0.5) * 0.35;
    const m = 2 + Math.floor(hash(gI * 5.5) * 3);
    for (let j = 0; j < m; j++) {
      const i = gI * 5 + j;
      const x = gx + j * (9 + hash(i) * 6);
      const y = gy + j * 4 + hash(i * 1.3) * 6;
      const len = 36 + hash(i * 5.7) * 60;
      cun.push({
        pts: spline([[x, y], [x + Math.cos(a) * len * 0.5 - 4, y + Math.sin(a) * len * 0.5], [x + Math.cos(a + 0.12) * len, y + Math.sin(a + 0.12) * len]], 6),
        w: 3 + hash(i * 1.9) * 4.5,
        at: 6.0 + hash(gI * 4.4) * 0.8 + j * 0.06,
        seed: 50 + i,
      });
    }
  }

  return {
    A,
    B,
    C,
    mists,
    seal: makeSeal(r, 120, carveMountain, 7),
    horizon,
    ridgeA,
    ridgeB,
    lipY,
    cliffTop,
    cliffLip,
    cliffBody,
    cun,
    stone: blotPts(0, 0, 23, 77, 0.1, 40, 0.92),
    tiny,
    enso: bake(r, ENSO[0] - ENSO[2] - 70, ENSO[1] - ENSO[2] - 70, ENSO[2] * 2 + 140, ENSO[2] * 2 + 140, 1.3, (g) => enso(g, ENSO[0], ENSO[1], ENSO[2], 1, ink(0.9), 12, 2.25)),
  };
};

/** 山 carved into the seal */
const carveMountain = (g: Ctx, s: number) => {
  const w = s * 0.11;
  const brush = (pts: Pt[], seed: number, ww = w) => {
    const p = strokePath(pts, { w: ww, inT: 0.05, outT: 0.06, startW: 0.9, minW: 0.8, jitter: 0.06, rough: 0.05, seed, step: 1 });
    g.fill(p);
  };
  brush([[0, -s * 0.36], [0, s * 0.26]], 1, w * 1.1);
  brush([[-s * 0.27, -s * 0.12], [-s * 0.27, s * 0.27]], 2);
  brush([[s * 0.27, -s * 0.12], [s * 0.27, s * 0.27]], 3);
  brush([[-s * 0.31, s * 0.27], [s * 0.31, s * 0.27]], 4);
};

/* ---------- painters ---------- */

/** Rock and grass of the near ledge (world space, p = 1) */
const drawCliff = (c: Ctx, s: State, t: number, step: number) => {
  const k = seg(t, 5.7, 7.0);
  if (k <= 0) return;
  // the face: a wash that falls away into the mist
  c.save();
  c.clip(sweepPath(860, 640, 2600, 1100, tween(t, 5.7, 6.7, ease.inOutSine), 2));
  const g = c.createLinearGradient(0, 650, 0, 960);
  g.addColorStop(0, ink(0.42));
  g.addColorStop(0.35, ink(0.22));
  g.addColorStop(1, ink(0));
  c.fillStyle = g;
  c.fill(s.cliffBody);
  c.restore();
  const cun = new Path2D();
  for (const q of s.cun) {
    const p = tween(t, q.at, q.at + 0.35, ease.outCubic);
    if (p > 0) strokePath(q.pts, { w: q.w, p, dry: 0.85, outT: 0.6, seed: q.seed, step }, cun);
  }
  const fade = c.createLinearGradient(0, 650, 0, 920);
  fade.addColorStop(0, ink(0.78));
  fade.addColorStop(1, ink(0));
  c.fillStyle = fade;
  c.fill(cun);
  // the lip and the ledge line
  stroke(c, s.cliffLip, { w: 15, p: tween(t, 6.0, 6.5, ease.inOutSine), dry: 0.8, outT: 0.55, seed: 61, step }, ink(0.86));
  stroke(c, s.cliffTop, { w: 5.5, p: tween(t, 5.95, 6.7, ease.inOutSine), dry: 0.6, outT: 0.4, inT: 0.03, seed: 62, step, press: (u) => 1 + 0.5 * Math.sin(u * 13) * (1 - u) }, ink(0.85));
  // moss dots and grass flicks on the ledge
  const d = tween(t, 6.6, 7.0);
  if (d > 0) {
    const dots = new Path2D();
    for (let i = 0; i < 30; i++) {
      if (hash(i * 3.7) > d) continue;
      const x = 900 + Math.pow(hash(i * 1.3), 1.6) * 1100;
      if (Math.abs(x - FX) < 130) continue;
      const y = 652 + (hash(i * 9.1) - 0.5) * 6;
      const rr = 1.1 + hash(i * 2.3) * 1.8;
      dots.moveTo(x + rr * 1.4, y);
      dots.ellipse(x, y, rr * 1.4, rr, -0.3, 0, TAU);
    }
    for (let i = 0; i < 9; i++) {
      if (hash(i * 5.3) > d) continue;
      const x = 960 + hash(i * 8.1) * 620;
      const y = 653;
      strokePath([[x, y], [x - 3, y - 9], [x - 8, y - 15]], { w: 2, outT: 0.8, seed: i, step }, dots);
      strokePath([[x + 3, y], [x + 5, y - 8]], { w: 1.6, outT: 0.8, seed: i + 3, step }, dots);
    }
    c.fillStyle = ink(0.85);
    c.fill(dots);
  }
};

/** Wind at time t, positive leans the pine further out over the void */
const wind = (t: number) => 0.55 * Math.sin(t * 1.25) + 0.3 * Math.sin(t * 2.7 + 1.3) + 0.15 * Math.sin(t * 5.3 + 0.4) + 0.4 * Math.max(0, Math.sin(t * 0.7 - 1));

const PINE_ROOT: Pt = [908, 658];

const PINE = {
  trunk: [[0, 0], [-12, -38], [6, -80], [-14, -120], [-64, -158], [-140, -178], [-228, -184], [-300, -178]] as Pt[],
  branches: [
    { pts: [[-14, -120], [8, -160], [34, -196], [26, -232]] as Pt[], w: 9, at: 0.25 },
    { pts: [[-64, -158], [-110, -150], [-176, -138], [-240, -146]] as Pt[], w: 7, at: 0.4 },
    { pts: [[6, -80], [36, -96], [66, -94]] as Pt[], w: 6, at: 0.5 },
    { pts: [[-140, -178], [-160, -214], [-150, -244]] as Pt[], w: 5, at: 0.6 },
  ],
  pads: [
    [26, -236, 46],
    [-58, -192, 40],
    [-150, -246, 36],
    [-160, -200, 50],
    [-262, -196, 50],
    [-328, -186, 32],
    [-232, -152, 44],
    [70, -102, 30],
    [-108, -164, 30],
  ] as [number, number, number][],
};

const bendPt = (q: Pt, w: number): Pt => {
  const h = clamp(-q[1] / 240);
  const out = clamp(-q[0] / 330);
  return [PINE_ROOT[0] + q[0] - w * (h * h * 18 + out * 8), PINE_ROOT[1] + q[1] + w * out * out * 10];
};

const drawPine = (c: Ctx, t: number, step: number) => {
  const k = seg(t, 6.2, 7.6);
  if (k <= 0) return;
  const w = wind(t);
  const bend = (pts: Pt[]) => pts.map((q) => bendPt(q, w));
  const wash = new Path2D();
  const needles = new Path2D();
  PINE.pads.forEach(([px, py, span], i) => {
    const pk = tween(t, 6.75 + i * 0.07, 7.25 + i * 0.07, ease.outCubic);
    if (pk <= 0) return;
    const ctr = bendPt([px, py], w);
    wash.moveTo(ctr[0] + span * 1.15, ctr[1] + 4);
    wash.ellipse(ctr[0], ctr[1] - 4, span * 1.25 * pk, 20 * pk, -0.04, 0, TAU);
    const bunches = Math.max(3, Math.round(span / 10));
    for (let b = 0; b < bunches; b++) {
      const bx = ctr[0] + (b / (bunches - 1) - 0.5) * span * 1.6;
      const by = ctr[1] + Math.sin(b * 2.1 + i) * 3 - 2;
      const fl = 0.12 * Math.sin(t * 3.1 + i + b) + w * 0.12;
      const m = 12;
      for (let j = 0; j < m; j++) {
        const a = -Math.PI + 0.22 + (j / (m - 1)) * (Math.PI - 0.44) + fl + (hash(i * 31 + b * 7 + j) - 0.5) * 0.15;
        const len = (17 + hash(i + b * 3 + j * 5) * 15) * pk * (0.75 + 0.25 * Math.sin((j / (m - 1)) * Math.PI));
        strokePath([[bx, by], [bx + Math.cos(a) * len * 0.5, by + Math.sin(a) * len * 0.5 - 1], [bx + Math.cos(a) * len, by + Math.sin(a) * len]], { w: 2.3, inT: 0.05, outT: 0.75, startW: 0.8, seed: j + b * 9, step: Math.max(step, 2), jitter: 0 }, needles);
      }
    }
  });
  c.fillStyle = ink(0.2);
  c.fill(wash);
  // trunk: one heavy dry stroke, then bark marks
  const trunk = bend(spline(PINE.trunk, 8));
  stroke(c, trunk, { w: 24, p: tween(t, 6.2, 6.75, ease.inOutSine), inT: 0.03, outT: 0.55, dry: 0.75, seed: 71, step, startW: 1, press: (u) => 1 + 0.15 * Math.sin(u * 17) }, ink(0.82));
  PINE.branches.forEach((b, i) => {
    const p = tween(t, 6.45 + b.at * 0.6, 6.85 + b.at * 0.6, ease.outCubic);
    stroke(c, bend(spline(b.pts, 8)), { w: b.w, p, outT: 0.6, dry: 0.5, seed: 80 + i, step }, ink(0.82));
  });
  const bark = new Path2D();
  const bk = seg(t, 6.6, 7.0);
  for (let i = 0; i < 9; i++) {
    if (hash(i * 4.1) > bk) continue;
    const u = 0.05 + i * 0.09;
    const q = trunk[Math.floor(u * (trunk.length - 1))];
    strokePath([[q[0] - 5, q[1] + 2], [q[0] + 1, q[1] - 2], [q[0] + 6, q[1] + 1]], { w: 2.4, outT: 0.6, seed: i, step }, bark);
  }
  c.fillStyle = paperA(0.6);
  c.fill(bark);
  c.fillStyle = ink(0.9);
  c.fill(needles);
};

/** The waterfall: falling dry streaks in the reserved paper, spray at the foot */
const drawWaterfall = (c: Ctx, s: State, t: number, a: number) => {
  if (a <= 0) return;
  const top = s.lipY - 4;
  const bot = 700;
  const streaks = new Path2D();
  for (let i = 0; i < 16; i++) {
    const len = 30 + hash(i * 3.1) * 70;
    const sp = 230 + hash(i * 5.3) * 120;
    const span = bot - top + len;
    const y = top - len + ((hash(i * 7.7) * span + t * sp) % span);
    const fx = (hash(i * 9.9) - 0.5) * 18;
    const wid = (yy: number) => 1 + (yy - top) / (bot - top);
    const p0: Pt = [WATER_X + fx * wid(y), Math.max(top, y)];
    const p1: Pt = [WATER_X + fx * wid(y + len), Math.min(bot, y + len)];
    if (p1[1] - p0[1] < 4) continue;
    strokePath([p0, p1], { w: 1.6 + hash(i) * 1.6, inT: 0.2, outT: 0.5, dry: 0.4, seed: i, step: 3 }, streaks);
  }
  c.fillStyle = ink(0.32 * a);
  c.fill(streaks);
  // spray clouds at the foot
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.6 + i / 3) % 1;
    bloom(c, WATER_X + (i - 1) * 16, 668 - ph * 26, 24 + ph * 26, 1, { seed: 90 + i, rgb: [236, 228, 209], alpha: 0.75 * a * (1 - ph), ring: 0, feather: 0 });
  }
};

/** Pole + stones (figure-local units) */
const drawPole = (c: Ctx, s: State, pl: Pole, reveal: number, step: number) => {
  if (reveal <= 0) return;
  // stones first so the pole sits into them
  const sk = ease.outCubic(seg(reveal, 0.45, 1));
  for (const side of [-1, 1]) {
    if (sk <= 0) continue;
    const e = polePts(pl, side * HALF, side * HALF)[0];
    const sc = lerp(0.3, 1, sk);
    const pts = s.stone.map(([x, y]) => [e[0] + (x * Math.cos(pl.ang) - y * Math.sin(pl.ang)) * sc * (side < 0 ? -1 : 1), e[1] + (x * Math.sin(pl.ang) + y * Math.cos(pl.ang)) * sc] as Pt);
    const body = new Path2D();
    body.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts) body.lineTo(q[0], q[1]);
    body.closePath();
    c.fillStyle = SUMI.paper;
    c.fill(body);
    const g = c.createRadialGradient(e[0] - 8 * sc, e[1] - 9 * sc, 2, e[0], e[1], 26 * sc);
    g.addColorStop(0, ink(0.22));
    g.addColorStop(0.7, ink(0.55));
    g.addColorStop(1, ink(0.8));
    c.fillStyle = g;
    c.fill(body);
    stroke(c, [...pts, pts[0], pts[1]], { w: 4.2 * sc, p: sk, dry: 0.5, outT: 0.4, seed: side + 5, step }, ink(0.92));
    // cracks and pits in the stone, drawn in its own turning frame
    const tex = new Path2D();
    const ca = Math.cos(pl.ang);
    const sa = Math.sin(pl.ang);
    const L = (x: number, y: number): Pt => [e[0] + (x * side * ca - y * sa) * sc, e[1] + (x * side * sa + y * ca) * sc];
    strokePath(spline([L(-15, -8), L(-6, -3), L(-1, 5), L(3, 15)], 4), { w: 2.6 * sc, outT: 0.6, inT: 0.2, dry: 0.4, seed: 3 + side, step }, tex);
    strokePath(spline([L(-1, 5), L(8, 6), L(16, 1)], 4), { w: 2 * sc, outT: 0.7, seed: 4 + side, step }, tex);
    strokePath([L(6, -15), L(11, -9)], { w: 1.8 * sc, outT: 0.6, seed: 6 + side, step }, tex);
    for (const [x, y, rr] of [[9, -4, 1.6], [-9, 9, 1.3], [12, 11, 1.1], [-14, 3, 1]] as [number, number, number][]) {
      const q = L(x, y);
      tex.moveTo(q[0] + rr * sc, q[1]);
      tex.arc(q[0], q[1], rr * sc, 0, TAU);
    }
    c.fillStyle = ink(0.85 * sk);
    c.fill(tex);
  }
  // bamboo: segments between nodes, one stroke each, painted left to right
  const nodes = [-HALF + 4, -88, -48, -10, 30, 68, HALF - 4];
  const segs = new Path2D();
  const ticks = new Path2D();
  const pk = seg(reveal, 0, 0.6);
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i] + 1.2;
    const b = nodes[i + 1] - 1.2;
    const p = clamp(pk * (nodes.length - 1) - i);
    if (p <= 0) continue;
    strokePath(polePts(pl, a, b), { w: 7.5, p, inT: 0.05, outT: 0.12, startW: 0.85, minW: 0.72, dry: 0.12, seed: 40 + i, step: Math.min(step, 2) }, segs);
    if (i > 0) {
      const q = polePts(pl, nodes[i], nodes[i])[0];
      const nx = -Math.sin(pl.ang);
      const ny = Math.cos(pl.ang);
      strokePath([[q[0] - nx * 6, q[1] - ny * 6], [q[0] + nx * 6, q[1] + ny * 6]], { w: 2.6, outT: 0.4, seed: i, step: 1 }, ticks);
    }
  }
  c.fillStyle = ink(0.86);
  c.fill(segs);
  c.fillStyle = ink(0.95);
  c.fill(ticks);
};

const pathOf = (pts: Pt[]) => {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts) p.lineTo(q[0], q[1]);
  p.closePath();
  return p;
};

/** Paper first so the figure is reserved out of what lies behind, then the wash, then lines */
const part = (c: Ctx, path: Path2D, wash: string) => {
  c.fillStyle = SUMI.paper;
  c.fill(path);
  c.fillStyle = wash;
  c.fill(path);
};

/** Width keys along the arm (u 0 shoulder, 0.53 elbow, 1 wrist), outer and inner side */
const ARM_OUT: [number, number][] = [[0, 7.4], [0.1, 8.6], [0.26, 7.4], [0.38, 7.6], [0.53, 5.6], [0.62, 6.9], [0.8, 5.2], [1, 4.1]];
const ARM_IN: [number, number][] = [[0, 6.4], [0.14, 6.2], [0.32, 7.2], [0.47, 5.6], [0.55, 5.2], [0.63, 6.6], [0.82, 4.8], [1, 3.8]];
const pw = (ks: [number, number][], u: number) => keys(u, ks, (k) => k * k * (3 - 2 * k));

const drawArm = (c: Ctx, sh: Pt, el: Pt, wr: Pt, side: number, p: number, step: number) => {
  const ctrl: Pt[] = [lp(sh, el, -0.1), lp(sh, el, 0.5), el, lp(el, wr, 0.5), wr];
  const pts = spline(ctrl, 8);
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[n - 1] || 1;
  // which normal faces away from the body
  const ux = el[0] - sh[0];
  const uy = el[1] - sh[1];
  let sg = -uy * side >= 0 ? 1 : -1;
  if (Math.abs(uy) < 0.2 * Math.hypot(ux, uy)) sg = ux * side > 0 ? (uy > 0 ? -1 : 1) * 1 : sg;
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  const P = clamp(p);
  for (let i = 0; i < n; i++) {
    const u = cum[i] / L;
    if (u > P) break;
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / l) * sg;
    const ny = ((b[0] - a[0]) / l) * sg;
    const wo = pw(ARM_OUT, u);
    const wi = pw(ARM_IN, u);
    outer.push([pts[i][0] + nx * wo, pts[i][1] + ny * wo]);
    inner.push([pts[i][0] - nx * wi, pts[i][1] - ny * wi]);
  }
  if (outer.length < 3) return;
  const body = new Path2D();
  body.moveTo(outer[0][0], outer[0][1]);
  for (const q of outer) body.lineTo(q[0], q[1]);
  const last = pts[outer.length - 1];
  body.quadraticCurveTo(last[0] + (last[0] - pts[outer.length - 2][0]) * 2, last[1] + (last[1] - pts[outer.length - 2][1]) * 2, inner[inner.length - 1][0], inner[inner.length - 1][1]);
  for (let i = inner.length - 1; i >= 0; i--) body.lineTo(inner[i][0], inner[i][1]);
  body.closePath();
  part(c, body, ink(0.56));
  // light on the top of the shoulder and forearm
  const hi = (u0: number, u1: number, off: number, w: number) => {
    const q: Pt[] = [];
    for (let i = 0; i < outer.length; i++) {
      const u = cum[i] / L;
      if (u < u0 || u > u1) continue;
      q.push(lp(pts[i], outer[i], off));
    }
    if (q.length > 2) stroke(c, q, { w, outT: 0.5, inT: 0.4, seed: u0 * 10 + side, step }, paperA(0.2));
  };
  hi(0.02, 0.3, 0.45, 4.5);
  hi(0.58, 0.85, 0.4, 3);
  // contours: a strong outer line, a broken inner one, the deltoid and the elbow
  const sub = (arr: Pt[], u0: number, u1: number) => arr.filter((_, i) => cum[i] / L >= u0 && cum[i] / L <= u1);
  const line = (q: Pt[], w: number, a: number, seed: number) => {
    if (q.length > 2) stroke(c, q, { w, outT: 0.35, inT: 0.25, dry: 0.3, seed, step }, ink(a));
  };
  line(sub(outer, 0.0, 0.52), 2.6, 0.88, 61 + side);
  line(sub(outer, 0.55, 1), 2.2, 0.88, 62 + side);
  line(sub(inner, 0.12, 0.5), 1.8, 0.8, 63 + side);
  line(sub(inner, 0.6, 0.95), 1.6, 0.75, 64 + side);
  const dl = sub(outer, 0.22, 0.3);
  if (dl.length && P > 0.3) {
    const a0 = dl[0];
    const c0 = pts[Math.floor(n * 0.17)];
    stroke(c, [a0, lp(a0, c0, 0.5), lp(c0, pts[Math.floor(n * 0.12)], 0.3)], { w: 1.8, outT: 0.6, seed: 65 + side, step }, ink(0.7));
  }
  if (P > 0.6) {
    const ie = inner[Math.min(inner.length - 1, Math.floor(n * 0.53))];
    const ce = pts[Math.floor(n * 0.55)];
    stroke(c, [ie, lp(ie, ce, 0.6)], { w: 1.8, outT: 0.6, seed: 66 + side, step }, ink(0.8));
  }
};

const drawFigure = (c: Ctx, s: State, t: number, reveal: number, step: number) => {
  if (reveal <= 0) return;
  const tf = figT(t);
  const P = poseAt(tf);
  const S = skel(P);
  const pl = poleAt(t);
  const R = (a: number, b: number) => ease.outCubic(seg(reveal, a, b));
  const br: Brush = { w: 1, step, jitter: 0.05, rough: 0.04 };

  // ground shadow
  const sh = R(0, 0.3);
  if (sh > 0) stroke(c, [[-60, 2], [60, 1.5]], { ...br, w: 7, dry: 0.7, outT: 0.5, seed: 9 }, ink(0.2 * sh));

  // legs: wide training trousers
  const legK = R(0, 0.3);
  const legs = [
    { hip: S.hipL, k: S.kL, an: S.anL, side: -1 },
    { hip: S.hipR, k: S.kR, an: S.anR, side: 1 },
  ];
  for (const L of legs) {
    if (legK <= 0) break;
    const pts = spline([[L.hip[0] - L.side * 2, L.hip[1] - 6], L.k, L.an], 8);
    const path = strokePath(pts, { ...br, w: 31, p: legK, inT: 0.01, outT: 0.05, startW: 1, minW: 0.62, dry: 0.15, seed: 12 + L.side, press: (u) => lerp(1.04, 0.6, u) + 0.08 * Math.sin(u * Math.PI) });
    part(c, path, ink(0.8));
    // a pale fold down the front of each leg and creases at the knee
    const fold = strokePath(spline([[L.hip[0] + L.side * 3, L.hip[1] + 2], lp(L.k, L.hip, 0.15), lp(L.k, L.an, 0.5)], 6), { ...br, w: 3.4, p: legK, outT: 0.6, dry: 0.5, seed: 14 + L.side });
    c.fillStyle = paperA(0.32);
    c.fill(fold);
    const dx = L.k[0] - L.an[0];
    const dy = L.k[1] - L.an[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const cr = new Path2D();
    for (let j = 0; j < 2; j++) {
      const o = lp(L.k, L.an, 0.08 + j * 0.13);
      strokePath([[o[0] - nx * 9, o[1] - ny * 9 + 1], [o[0], o[1] + 2.5], [o[0] + nx * 8, o[1] + ny * 8]], { ...br, w: 2, outT: 0.6, seed: j + L.side }, cr);
    }
    c.fillStyle = ink(0.95 * legK);
    c.fill(cr);
    // bare feet turned out
    const fk = R(0.2, 0.35);
    if (fk > 0) {
      const toe: Pt = [L.an[0] + L.side * 12, L.an[1] + 5];
      const foot = strokePath([[L.an[0] - L.side * 3, L.an[1] + 1], lp(L.an, toe, 0.5), toe], { ...br, w: 10, p: fk, startW: 1, outT: 0.45, seed: 17 + L.side });
      part(c, foot, ink(0.5));
    }
  }

  // torso: a sleeveless training jacket, belted
  const tk = R(0.22, 0.55);
  if (tk > 0) {
    const at = (o: Pt, a: number, b: number): Pt => [o[0] + S.rt[0] * a + S.up[0] * b, o[1] + S.rt[1] * a + S.up[1] * b];
    const T = P.tor;
    const pel = P.pel;
    const N = S.neck;
    const pts: Pt[] = [
      at(N, -9, 2),
      at(N, -24, -2),
      at(S.shL, -3, -3),
      at(pel, -24, 40 * T),
      at(pel, -19, 12 * T),
      at(pel, -25, -16),
      at(pel, 0, -18),
      at(pel, 25, -16),
      at(pel, 19, 12 * T),
      at(pel, 24, 40 * T),
      at(S.shR, 3, -3),
      at(N, 24, -2),
      at(N, 9, 2),
    ];
    const body = smoothPath(pts, true, 0.35);
    c.save();
    c.globalAlpha = tk;
    part(c, body, ink(0.15));
    c.restore();
    const line = (q: Pt[], w: number, seed: number, from = 0) => {
      const p = strokePath(spline(q, 6), { ...br, w, p: tk, from, outT: 0.4, dry: 0.45, seed });
      c.fillStyle = ink(0.88);
      c.fill(p);
    };
    line([at(S.shL, -3, -3), at(pel, -24, 40 * T), at(pel, -19, 12 * T)], 3.8, 21);
    line([at(S.shR, 3, -3), at(pel, 24, 40 * T), at(pel, 19, 12 * T)], 3.8, 22);
    line([at(pel, -19, 6 * T), at(pel, -25, -16)], 3, 23);
    line([at(pel, 19, 6 * T), at(pel, 25, -16)], 3, 24);
    line([at(pel, -25, -16), at(pel, 0, -19), at(pel, 25, -15)], 2.6, 25);
    line([at(N, -24, -2), at(S.shL, -3, -3)], 3.4, 26);
    line([at(N, 24, -2), at(S.shR, 3, -3)], 3.4, 27);
    // lapels crossing left over right, and a fold under each arm
    line([at(N, -9, 1), at(pel, -2, 30 * T), at(pel, 9, 11 * T)], 3.2, 28);
    line([at(N, 9, 1), at(pel, 4, 34 * T)], 2.6, 29);
    line([at(pel, -20, 36 * T), at(pel, -12, 28 * T)], 2.2, 30);
    line([at(pel, 20, 36 * T), at(pel, 13, 26 * T)], 2.2, 31);
    // the belt and its knot
    const bk = R(0.45, 0.62);
    if (bk > 0) {
      stroke(c, [at(pel, -21, 9 * T), at(pel, 0, 7.5 * T), at(pel, 21, 9 * T)], { ...br, w: 7.5, p: bk, outT: 0.15, startW: 0.9, dry: 0.3, seed: 33 }, ink(0.95));
      const sway = 2.5 * Math.sin(t * 2.2) + (P.effort > 0.8 ? 1.5 : 0) * Math.sin(t * 9);
      const kn = at(pel, 3, 8 * T);
      const tails = new Path2D();
      strokePath([kn, [kn[0] - 3 + sway * 0.3, kn[1] + 10], [kn[0] - 5 + sway, kn[1] + 20]], { ...br, w: 4.4, p: bk, outT: 0.5, dry: 0.4, seed: 34 }, tails);
      strokePath([kn, [kn[0] + 4 + sway * 0.3, kn[1] + 9], [kn[0] + 7 + sway, kn[1] + 18]], { ...br, w: 4, p: bk, outT: 0.5, dry: 0.4, seed: 35 }, tails);
      tails.moveTo(kn[0] + 4, kn[1]);
      tails.ellipse(kn[0], kn[1], 4, 3.3, 0, 0, TAU);
      c.fillStyle = ink(0.95);
      c.fill(tails);
    }
  }

  // neck and head
  const hk = R(0.48, 0.75);
  if (hk > 0) {
    const neck = strokePath([lp(S.neck, P.pel, 0.04), lp(S.neck, S.head, 0.6)], { ...br, w: 13, p: hk, startW: 1, outT: 0.1, minW: 0.85, seed: 41 });
    part(c, neck, ink(0.42));
    const H = S.head;
    const ha = P.lean + P.head;
    c.save();
    c.translate(H[0], H[1]);
    c.rotate(ha);
    c.globalAlpha = hk;
    const face = new Path2D();
    face.ellipse(0, 0, 10, 12.6, 0, 0, TAU);
    part(c, face, ink(0.2));
    // ears
    const ears = new Path2D();
    ears.ellipse(-10.4, 1, 2.2, 3.6, 0.15, 0, TAU);
    ears.moveTo(12.6, 1);
    ears.ellipse(10.4, 1, 2.2, 3.6, -0.15, 0, TAU);
    c.fillStyle = ink(0.45);
    c.fill(ears);
    // jaw line
    stroke(c, spline([[-9.6, 2], [-6, 10], [0, 13], [6, 10], [9.6, 2]], 4), { ...br, w: 2.2, outT: 0.4, inT: 0.3, seed: 42, step: 0.8 }, ink(0.8));
    // hair: pulled back to a topknot
    const hair = new Path2D();
    hair.moveTo(-10.8, 0);
    hair.bezierCurveTo(-12.6, -11, -6, -15.5, 0, -15.5);
    hair.bezierCurveTo(6, -15.5, 12.6, -11, 10.8, 0);
    hair.bezierCurveTo(9, -5, 6, -7.5, 0, -7.2);
    hair.bezierCurveTo(-6, -7.5, -9, -5, -10.8, 0);
    hair.closePath();
    hair.moveTo(5, -18);
    hair.ellipse(0, -18.5, 5.2, 4.2, 0, 0, TAU);
    c.fillStyle = ink(0.94);
    c.fill(hair);
    // features: brows knit and the mouth sets as the effort grows
    const fk = R(0.85, 1);
    if (fk > 0) {
      const e = P.effort;
      const feat = new Path2D();
      const b = (sx: number) => strokePath([[sx * 7.5, -3.6 + e * 0.4], [sx * 2.2, -3.2 + e * 1.4]], { w: 2.1, outT: 0.5, inT: 0.2, seed: sx + 3, step: 0.6 }, feat);
      b(-1);
      b(1);
      const eye = (sx: number) => strokePath([[sx * 6.8, 0.6], [sx * 2.8, 0.4 + e * 0.6]], { w: 1.5, outT: 0.4, inT: 0.3, seed: sx + 5, step: 0.6 }, feat);
      eye(-1);
      eye(1);
      strokePath([[-0.6, 2], [0.6, 5.2], [-1, 6]], { w: 1.4, outT: 0.5, seed: 8, step: 0.6 }, feat);
      strokePath([[-3.6 - e, 8.6], [0, 8.4 + e * 0.3], [3.6 + e, 8.6]], { w: 1.6 + e * 0.6, outT: 0.4, inT: 0.3, seed: 9, step: 0.6 }, feat);
      c.globalAlpha = hk * fk;
      c.fillStyle = ink(0.9);
      c.fill(feat);
    }
    c.restore();
  }

  // the pole sits between body and arms
  drawPole(c, s, pl, seg(t, 7.0, 7.7), step);

  // arms: bare and muscled, an anatomical silhouette with its contour drawn in
  const ak = R(0.55, 0.9);
  if (ak > 0) {
    drawArm(c, S.shL, S.elL, S.wL, -1, ak, step);
    drawArm(c, S.shR, S.elR, S.wR, 1, ak, step);
  }

  // fists closed around the pole
  const fk = R(0.82, 1);
  if (fk > 0) {
    for (const [el, w, side] of [[S.elL, S.wL, -1], [S.elR, S.wR, 1]] as [Pt, Pt, number][]) {
      const a = Math.atan2(w[1] - el[1], w[0] - el[0]);
      const cx = w[0] + Math.cos(a) * 5;
      const cy = w[1] + Math.sin(a) * 5;
      c.save();
      c.translate(cx, cy);
      c.rotate(a);
      c.globalAlpha = fk;
      const fist = new Path2D();
      fist.ellipse(0.5, 0, 9, 7.8, 0, 0, TAU);
      part(c, fist, ink(0.64));
      const kn = new Path2D();
      strokePath(spline([[5, -6.5], [8, 0], [5, 6.5]], 4), { w: 2.6, outT: 0.3, inT: 0.3, seed: side, step: 0.6 }, kn);
      for (const fy of [-2.6, 1.2, 4.6]) strokePath([[4.2, fy], [8.2, fy + 0.3]], { w: 1.3, outT: 0.5, seed: fy, step: 0.5 }, kn);
      strokePath([[-3, side * -6.5], [1.5, side * -2.5], [5, side * -1.5]], { w: 2, outT: 0.5, seed: side + 2, step: 0.6 }, kn);
      c.fillStyle = ink(0.9);
      c.fill(kn);
      c.restore();
    }
  }
};

/* ---------- film ---------- */

export const inkIronMountainFilm: RisoFilm<State> = {
  id: 'ink-iron-mountain',
  title: 'Iron Mountain',
  caption: 'Dawn on a cliff ledge, painted in sumi: the stroke that draws the horizon becomes the weight he lifts.',
  theme: 'Fitness',
  motif: 'One horizontal stroke: horizon, ridge, the bamboo pole, the enso',
  duration: DURATION,
  series: 'Ink wash',
  mode: 'direct',
  paper: SUMI.paper,
  paperTexture: true,
  grain: 0.1,
  inks: [{ color: SUMI.ink }, { color: '#5d5853' }, { color: '#a49d92' }, { color: SUMI.verm }],
  scenes: [
    { at: 0, label: 'Horizon' },
    { at: 3.4, label: 'Peaks' },
    { at: 6.0, label: 'The ledge' },
    { at: 9.4, label: 'The lift' },
    { at: 12.7, label: 'Enso' },
  ],
  posterTime: 17.6,

  setup(r) {
    return build(r);
  },

  draw(r, t, s) {
    const c = r.layers[0];
    const C = camAt(t);
    const step = (p: number) => clamp(2.6 / Math.max(0.5, layerView(C, p).z), 0.5, 3);

    /* ----- sky: the sun ----- */
    const vA = layerView(C, 0.1);
    // horizon morphing up into the far ridge
    const mk = tween(t, 3.3, 5.0, ease.inOutCubic);
    const contour: Pt[] = s.horizon.map((q, i) => {
      const k = clamp(mk * 1.45 - (i / s.horizon.length) * 0.45);
      const kk = ease.inOutSine(k);
      return [q[0], lerp(q[1], s.ridgeA[i][1], kk)];
    });
    const sunRise = tween(t, 1.2, 5.0, ease.inOutSine);
    const sunW: Pt = [992, lerp(575, 300, sunRise)];
    const closeK = tween(t, 8.0, 9.6, ease.inOutSine) * (1 - tween(t, 12.75, 14.2, ease.inOutSine));
    const sunScr = toScreen(vA, sunW[0], sunW[1]);
    const cx = keys(t, [[9.6, 960], [10.4, 930], [T_LOCK, 800], [12.7, 806]], ease.inOutSine);
    const cy = keys(t, [[9.6, 352], [10.4, 346], [T_LOCK, 296], [12.7, 300]], ease.inOutSine);
    const cr = keys(t, [[9.6, 196], [10.4, 202], [T_LOCK, 246], [12.7, 248]], ease.inOutSine);
    const sx = lerp(sunScr[0], cx, closeK);
    const sy = lerp(sunScr[1], cy, closeK);
    let sr = lerp(64 * vA.z, cr, closeK);
    const hit = t > T_LOCK ? Math.exp(-(t - T_LOCK) * 3) : 0;
    sr *= 1 + 0.07 * hit;
    const sunK = tween(t, 1.25, 2.6, ease.outCubic);
    if (sunK > 0) {
      applyCam(r, vA);
      c.save();
      // the sun sits behind the line and the ridge it becomes
      const clip = new Path2D();
      clip.moveTo(-400, contour[0][1]);
      for (const q of contour) clip.lineTo(q[0], q[1]);
      clip.lineTo(2200, contour[contour.length - 1][1]);
      clip.lineTo(2200, -2000);
      clip.lineTo(-400, -2000);
      clip.closePath();
      c.clip(clip);
      r.camera(800, 450, 1);
      bloom(c, sx, sy, sr, sunK, { seed: 5, rgb: [194, 58, 34], alpha: 0.9, ring: 0.35, irr: 0.035, feather: 0.4 });
      if (hit > 0) {
        // the flare: a second wet ring spreads off the sun at the lockout
        const k = 1 - hit;
        bloom(c, sx, sy, sr * (1.1 + k * 0.7), 1, { seed: 6, rgb: [194, 58, 34], alpha: 0.35 * hit, ring: 0.8, irr: 0.06, feather: 1 });
      }
      c.restore();
    }

    /* ----- far range ----- */
    applyCam(r, vA);
    if (mk > 0) {
      c.save();
      const below = new Path2D();
      below.moveTo(contour[0][0] - 400, contour[0][1]);
      for (const q of contour) below.lineTo(q[0], q[1]);
      below.lineTo(contour[contour.length - 1][0] + 400, contour[contour.length - 1][1]);
      below.lineTo(2200, 1200);
      below.lineTo(-400, 1200);
      below.closePath();
      c.clip(below);
      c.globalAlpha = ease.inOutSine(clamp(mk * 1.3));
      drawPlate(c, s.A);
      c.restore();
    }
    // the stroke itself: landing drop, then the horizon
    const hp = tween(t, 0.35, 1.95, ease.inOutSine);
    if (t > 0.2) bloom(c, s.horizon[0][0] + 6, s.horizon[0][1], 16, ease.outCubic(seg(t, 0.2, 1.2)), { seed: 2, alpha: 0.5, ring: 0.6 });
    if (hp > 0) stroke(c, contour, { w: lerp(15, 6.5, mk), p: hp, inT: 0.03, outT: 0.28, dry: 0.65, seed: 4, step: 2.5, startW: 0.9, press: (u) => 1 + 0.25 * (1 - u) }, ink(lerp(0.9, 0.62, mk)));
    const drift = t * 9;
    const mistDraw = (pl: Plate, y: number, a: number, dx: number) => {
      if (a <= 0) return;
      c.save();
      c.globalAlpha = a;
      const x = -500 - ((dx % 1300) + 1300) % 1300;
      c.drawImage(pl.cv, x, y, pl.w, pl.h);
      c.drawImage(pl.cv, x + pl.w - 2, y, pl.w, pl.h);
      c.restore();
    };
    applyCam(r, layerView(C, 0.2));
    mist(c, 470, 660, 0.8 * seg(t, 3.6, 5.2));
    mistDraw(s.mists[0], 470, seg(t, 3.8, 5.4), drift);

    /* ----- middle range and the waterfall ----- */
    const vB = layerView(C, 0.3);
    applyCam(r, vB);
    const bk = tween(t, 4.15, 5.8, ease.inOutSine);
    if (bk > 0) {
      c.save();
      if (bk < 1) c.clip(sweepPath(-400, 150, 1300, 900, bk, 1));
      drawPlate(c, s.B);
      c.restore();
      stroke(c, s.ridgeB, { w: 7, p: tween(t, 4.3, 6.0, ease.inOutSine), dry: 0.7, outT: 0.35, inT: 0.03, seed: 15, step: step(0.3), press: (u) => 0.8 + 0.4 * Math.abs(Math.sin(u * 9)) }, ink(0.7));
      drawWaterfall(c, s, t, seg(t, 5.0, 6.0));
    }
    applyCam(r, layerView(C, 0.42));
    mist(c, 590, 790, 0.92 * seg(t, 4.6, 6.0));
    mistDraw(s.mists[1], 600, seg(t, 4.8, 6.2), -drift * 1.4 + 400);

    /* ----- low hills ----- */
    applyCam(r, layerView(C, 0.55));
    const ck = tween(t, 5.2, 6.3, ease.inOutSine);
    if (ck > 0) {
      c.save();
      if (ck < 1) c.clip(sweepPath(-500, 560, 1300, 920, ck, 4));
      drawPlate(c, s.C);
      c.restore();
    }
    applyCam(r, layerView(C, 0.75));
    mist(c, 760, 960, 0.95 * seg(t, 5.4, 6.4));
    mistDraw(s.mists[2], 770, seg(t, 5.4, 6.4), drift * 1.8 + 900);

    /* ----- impact burst behind the figure ----- */
    const vD = layerView(C, 1);
    const plW = (() => {
      const pl = poleAt(t);
      return toScreen(vD, FX + pl.mid[0] * FS, GY + pl.mid[1] * FS);
    })();
    if (t > T_LOCK - 0.02) {
      const k = tween(t, T_LOCK - 0.02, T_LOCK + 0.16, ease.outCubic);
      const fade = 1 - tween(t, 12.1, 13.2, ease.inOutSine);
      if (fade > 0) {
        r.camera(800, 450, 1);
        const burst = new Path2D();
        const n = 26;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + (hash(i * 3.3) - 0.5) * 0.18;
          const r0 = 250 + hash(i * 1.7) * 90;
          const r1 = r0 + 260 + hash(i * 5.1) * 380;
          const pts: Pt[] = [[plW[0] + Math.cos(a) * r0, plW[1] + 30 + Math.sin(a) * r0], [plW[0] + Math.cos(a + 0.02) * r1, plW[1] + 30 + Math.sin(a + 0.02) * r1]];
          strokePath(pts, { w: 8 + hash(i * 7.7) * 20, p: k, inT: 0.05, outT: 0.75, dry: 0.9, seed: 300 + i, step: 4, startW: 1 }, burst);
        }
        c.fillStyle = ink(0.8 * fade);
        c.fill(burst);
      }
    }

    /* ----- the near ledge: cliff, pine, figure ----- */
    applyCam(r, vD);
    drawCliff(c, s, t, step(1));
    // skip the pine when the camera is close on the lifter
    if (vD.z < 2.2) drawPine(c, t, step(1));
    c.save();
    c.translate(FX, GY);
    c.scale(FS, FS);
    drawFigure(c, s, t, seg(t, 7.25, 8.3), step(1) / FS);
    // droplets thrown off the stones at the lock
    if (t > T_LOCK) {
      const pl = poleAt(t);
      const k = ease.outCubic(seg(t, T_LOCK, T_LOCK + 0.7));
      const fade = 1 - seg(t, 12.6, 13.6);
      const sp = new Path2D();
      for (const side of [-1, 1]) {
        const e = polePts(pl, side * HALF, side * HALF)[0];
        splatterPath(e[0] + side * 20, e[1], side > 0 ? -0.35 : Math.PI + 0.35, 1.4, 120, 18, 2.6, k, 200 + side, sp);
      }
      c.fillStyle = ink(0.88 * fade);
      c.fill(sp);
    }
    c.restore();
    // the ledge drops into mist at the bottom
    mist(c, 840, 1140, 0.95, 700, 2800);

    /* ----- enso closes the picture ----- */
    const ep = tween(t, 14.15, 15.95, ease.inOutSine);
    if (ep >= 1) drawPlate(c, s.enso);
    else if (ep > 0) enso(c, ENSO[0], ENSO[1], ENSO[2], ep, ink(0.9), 12, 2.25);

    /* ----- impact flash ----- */
    r.camera(800, 450, 1);
    if (t > T_LOCK - 0.01 && t < T_LOCK + 0.2) {
      c.fillStyle = paperA(0.55 * (1 - seg(t, T_LOCK, T_LOCK + 0.2)));
      c.fillRect(0, 0, 1600, 900);
    }

    /* ----- title and seal ----- */
    const tk = seg(t, 16.25, 17.2);
    const tw = inscription(c, 'Iron Mountain', 112, 142, 60, Math.max(tk, 0.0001), 3, 500) ?? 420;
    stampSeal(c, s.seal, 112 + tw + 52, 124, 72, seg(t, 15.9, 16.6), -0.04);
    void verm;
    paperAge(c, 1);
  },
};
