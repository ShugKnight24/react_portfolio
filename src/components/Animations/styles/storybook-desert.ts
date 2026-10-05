/**
 * Storybook, desert road: companion helpers to storybook.ts for "The Shepherd's Road".
 * Same watercolour language (reserve, multiply glaze, granulation, wet rim, loose pencil); new
 * cast: the shepherd (the owner: shaved head, full dark beard, broad build, in a cream tunic and a
 * madder cloak, sandals and a crook), sheep, dromedaries with a real pacing gait, and an old king.
 * Every figure draws in its own rig space, facing +x, ground at y = 0 unless noted.
 */
import type { Ctx } from '../riso/engine';
import { TAU, clamp, lerp, smoothPath, type Pt } from '../riso/kit';
import { SB, chain, deepen, lift, limb, manJoints, mixHex, pencil, rgba, ribbon, sparkle, wash, type ManJoints, type ManPose, type Studio, type WashOpts } from './storybook';

/* ---------- palette ---------- */

export const SD = {
  sand: '#e8c48c',
  sandDeep: '#c9975c',
  sandPale: '#f3dfb6',
  duneShade: '#c98a6e',
  duneRose: '#d9a08a',
  sea: '#5f93b0',
  seaDeep: '#3d6a8c',
  seaPale: '#a9cbd8',
  olive: '#8f9c64',
  oliveDeep: '#5f6e45',
  hill: '#cdb57c',
  hillGreen: '#a9b27a',
  stone: '#cdb9a0',
  stoneDeep: '#9c8572',
  wall: '#f0e6d2',
  terracotta: '#c7714f',
  tunic: '#ebdfc3',
  tunicDeep: '#cdb994',
  cloak: '#b4513f',
  cloakDeep: '#8a3a32',
  belt: '#7b5a3e',
  sandal: '#6f4a31',
  crook: '#8a6240',
  wool: '#f3ecdc',
  woolShade: '#d9cdb5',
  sheepFace: '#56463f',
  camel: '#cf9f68',
  camelDeep: '#a77548',
  camelPale: '#e8c99c',
  robe: '#5d5288',
  robeDeep: '#3f3768',
  goldDeep: '#c9973f',
  glass: '#a8cfd4',
  amber: '#e7a54e',
  palm: '#6f8a55',
  palmDeep: '#4d6640',
  pyramid: '#dcb47c',
  pyramidShade: '#b98760',
  indigo: '#4b5a8f',
} as const;

/* ---------- small geometry ---------- */

const vec = (a: number, l: number): Pt => [Math.sin(a) * l, Math.cos(a) * l];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const rot = (p: Pt, a: number, o: Pt = [0, 0]): Pt => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] - o[0];
  const y = p[1] - o[1];
  return [o[0] + x * c - y * s, o[1] + x * s + y * c];
};
const mid = (a: Pt, b: Pt, k = 0.5): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

/** Two-bone IK: joint between root r and target t with bone lengths a, b. bend +1 puts the joint toward -x for a downward limb */
export const ik2 = (r: Pt, t: Pt, a: number, b: number, bend: 1 | -1): Pt => {
  const dx = t[0] - r[0];
  const dy = t[1] - r[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(a - b) + 0.01, a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const ang = base + bend * Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  return [r[0] + Math.cos(ang) * a, r[1] + Math.sin(ang) * a];
};

const strokeP = (c: Ctx, p: Path2D, color: string, w: number, a = 1, op: GlobalCompositeOperation = 'source-over') => {
  c.save();
  c.globalCompositeOperation = op;
  c.globalAlpha = a;
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke(p);
  c.restore();
};

const silTint = (c: Ctx, sil: Path2D, tint?: [string, number], glow?: number, glowCol: string = SB.apricot) => {
  if (tint && tint[1] > 0.01) {
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = tint[1];
    c.fillStyle = tint[0];
    c.fill(sil);
    c.restore();
  }
  if (glow && glow > 0.01) {
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = glow * 0.35;
    c.fillStyle = glowCol;
    c.fill(sil);
    c.restore();
  }
};

/* ---------- the shepherd ---------- */

const TORSO = 30;

const handPath = (w: Pt, h: Pt, p: Path2D, grip = 0.5) => {
  const a = Math.atan2(h[1] - w[1], h[0] - w[0]);
  const P = (x: number, y: number): Pt => add(w, rot([x, y], a));
  smoothPath([P(-0.5, -2.6), P(3, -3.1), P(6, -2.2 + grip), P(7, 0.4), P(5.5, 2.6), P(1.5, 2.9), P(-0.6, 2.2)], true, 0.5, p);
  smoothPath([P(1.5, -2), P(4.2, -4.3), P(5.6, -3.6), P(3.8, -1.2)], true, 0.5, p);
  return p;
};

/** A bare foot in a sandal: the foot in skin, a dark sole and straps */
const sandal = (c: Ctx, st: Studio, an: Pt, toe: Pt, far: boolean, sil: Path2D, penA: number) => {
  const a = Math.atan2(toe[1] - an[1], toe[0] - an[0]);
  const P = (x: number, y: number): Pt => add(an, rot([x, y], a));
  const foot = smoothPath([P(-3.5, -2.8), P(0, -3.6), P(4, -2.6), P(9.5, -0.8), P(11, 1.2), P(9, 2.4), P(-3, 2.4), P(-4.4, 0)], true, 0.5);
  wash(c, st, foot, far ? deepen(SB.skin, 0.2) : SB.skin, { reserve: 0.96, a: 0.86, gran: 0.3, rim: 1.2, rimA: 0.4 });
  const sole = smoothPath([P(-4.6, 2), P(11.4, 2), P(11.2, 3.6), P(-4.2, 3.8)], true, 0.4);
  wash(c, st, sole, far ? deepen(SD.sandal, 0.25) : SD.sandal, { reserve: 0.9, a: 0.9, gran: 0.3, rim: 0.6 });
  const straps = new Path2D();
  straps.moveTo(...P(-2.5, -2.8));
  straps.lineTo(...P(-1.5, 2.2));
  straps.moveTo(...P(2.5, -2.9));
  straps.quadraticCurveTo(...P(4.5, 0), ...P(5.5, 2.2));
  straps.moveTo(...P(-3.2, -2.2));
  straps.lineTo(...P(-3.6, -6.5));
  strokeP(c, straps, far ? deepen(SD.sandal, 0.3) : SD.sandal, 1.2, 0.9);
  sil.addPath(foot);
  sil.addPath(sole);
  if (penA > 0) pencil(c, st, foot, penA * 0.8, 0.7);
};

export interface ShepOpts {
  t: number;
  /** wind for the cloak: + blows it back (to -x in rig space) */
  wind?: number;
  tint?: [string, number];
  glow?: number;
  glowCol?: string;
  /** rig y of the ground, so the cloak and tunic don't sink through it */
  ground?: number;
  pencil?: number;
  /** the crook in the near hand: lean from vertical (+ top forward); null for none */
  crook?: number | null;
  /** hold the crook in the far hand instead */
  crookFar?: boolean;
  noFarArm?: boolean;
  farFront?: boolean;
  /** eyes shut in sleep */
  sleep?: boolean;
  /** called before anything (props behind the whole figure) */
  behind?: (j: ManJoints) => void;
  /** called between the body and the near arm (props in the near hand) */
  held?: (j: ManJoints) => void;
  /** called last */
  front?: (j: ManJoints) => void;
  /** the cloak hood up (storm) 0..1 */
  hood?: number;
}

const drawCrook = (c: Ctx, st: Studio, h: Pt, lean: number, low: number, far: boolean) => {
  const dir: Pt = [Math.sin(lean), -Math.cos(lean)];
  const top: Pt = [h[0] + dir[0] * 64, h[1] + dir[1] * 64];
  const bot: Pt = [h[0] - dir[0] * low, h[1] - dir[1] * low];
  const p = new Path2D();
  p.moveTo(bot[0], bot[1]);
  p.lineTo(top[0], top[1]);
  // the hook curls forward and down
  const nrm: Pt = [Math.cos(lean), Math.sin(lean)];
  const P = (u: number, v: number): Pt => [top[0] + dir[0] * u + nrm[0] * v, top[1] + dir[1] * u + nrm[1] * v];
  p.bezierCurveTo(...P(7, 0), ...P(10, 9), ...P(4, 11));
  p.quadraticCurveTo(...P(-1, 11.5), ...P(-2.5, 9));
  const col = far ? deepen(SD.crook, 0.3) : SD.crook;
  strokeP(c, p, col, 2.6, 0.95);
  strokeP(c, p, rgba(SB.paper, 1), 0.7, 0.35);
  pencil(c, st, p, 0.3, 0.6, 1.2, -0.6);
};

/**
 * The shepherd: broad, bearded, shaved head; a cream tunic to the knee with a rope belt, a madder
 * cloak over the shoulders, sandals and a crook. Rig space: pelvis at (0, 0), facing +x.
 */
export const drawShepherd = (c: Ctx, st: Studio, p: ManPose, o: ShepOpts) => {
  const j = manJoints(p);
  const t = o.t;
  const wind = o.wind ?? 0.3;
  const up: Pt = [Math.sin(p.spine), -Math.cos(p.spine)];
  const fw: Pt = [Math.cos(p.spine), Math.sin(p.spine)];
  const at = (h: number, d: number): Pt => [up[0] * h + fw[0] * d, up[1] * h + fw[1] * d];
  const sil = new Path2D();
  const penA = o.pencil ?? 0.34;
  const ground = o.ground ?? 1e9;
  const part = (path: Path2D, color: string, opt: WashOpts = {}, inSil = true) => {
    wash(c, st, path, color, { reserve: 0.96, a: 0.86, gran: 0.4, rim: 1.6, rimA: 0.45, ...opt });
    if (inSil) sil.addPath(path);
    if (penA > 0) pencil(c, st, path, penA, 0.8);
  };
  const gclamp = (q: Pt): Pt => [q[0], Math.min(q[1], ground - 0.5)];
  o.behind?.(j);

  // ---- cloak, the back fall ----
  const aMax = Math.max(p.lN[0], p.lF[0]);
  const aMin = Math.min(p.lN[0], p.lF[0]);
  const sit = clamp((aMax - 0.7) / 0.7);
  const fl = Math.sin(t * 3.3) * 1.6 * wind + Math.sin(t * 5.1 + 1) * 0.7 * wind;
  const hemDrop = lerp(30, 12, sit);
  const cbHem = gclamp(add(at(-hemDrop, -13 - wind * 9), [-wind * 14 + fl, 0]));
  const cbHem2 = gclamp(add(at(-hemDrop + 3, -4 - wind * 4), [-wind * 7 + fl * 0.6, 2]));
  const cloakBack = smoothPath(
    [at(TORSO + 1, -2), at(TORSO - 2, -11.5), add(at(14, -14.5), [-wind * 4, 0]), add(at(0, -15 - wind * 4), [-wind * 7 + fl * 0.4, 0]), cbHem, mid(cbHem, cbHem2, 0.5), cbHem2, at(2, -2), at(18, 2)],
    true,
    0.4
  );
  part(cloakBack, deepen(SD.cloak, 0.22), { gran: 0.5, rim: 1.8 });
  // folds in the cloak
  const cf = new Path2D();
  cf.moveTo(...at(TORSO - 4, -9));
  cf.quadraticCurveTo(...add(at(8, -13), [-wind * 4, 0]), ...add(mid(cbHem, cbHem2, 0.35), [0, -2]));
  cf.moveTo(...at(TORSO - 6, -5));
  cf.quadraticCurveTo(...add(at(6, -7), [-wind * 3, 0]), ...add(mid(cbHem, cbHem2, 0.75), [0, -2]));
  strokeP(c, cf, deepen(SD.cloak, 0.6), 1, 0.35, 'multiply');

  // ---- far arm ----
  const farArm = () => {
    const front = !!o.farFront;
    part(chain([j.eF, j.wF], [7.4, 6.2]), front ? SB.skin : deepen(SB.skin, 0.18));
    part(chain([j.sF, j.eF, mid(j.eF, j.wF, 0.35)], [10.5, 8.8, 7.8]), front ? SD.tunic : deepen(SD.tunic, 0.2), { gran: 0.3 });
    part(handPath(j.wF, j.hF, new Path2D()), front ? SB.skin : deepen(SB.skin, 0.18));
  };
  if (o.crookFar && o.crook != null) drawCrook(c, st, j.hF, o.crook, ground - j.hF[1], true);
  if (!o.noFarArm && !o.farFront) farArm();

  // ---- legs: bare shins, sandals ----
  part(chain([j.hipF, j.kF, j.anF], [12, 8, 6]), deepen(SB.skin, 0.2), { gran: 0.3 });
  sandal(c, st, j.anF, j.toeF, true, sil, penA);
  part(chain([j.hipN, j.kN, j.anN], [12, 8, 6]), SB.skin, { gran: 0.3, grad: [...j.kN, ...j.anN, SB.skinDeep] as [number, number, number, number, string] });
  sandal(c, st, j.anN, j.toeN, false, sil, penA);

  // ---- tunic ----
  const hemL = 23;
  const kneeN = add(j.hipN, vec(aMax, hemL));
  const kneeF = add(j.hipF, vec(aMin, hemL));
  const F = gclamp(add(kneeN, vec(aMax + Math.PI / 2, 7.5)));
  const B = gclamp(add(kneeF, vec(aMin - Math.PI / 2, 7.5 + (1 - sit) * 1.5)));
  const M = gclamp(add(mid(kneeN, kneeF), [-fw[0] * 1.5, 2.5 + (1 - sit) * 1.5]));
  const swing = Math.sin(t * 2.6) * 0.8 * wind;
  const tunic = smoothPath(
    [at(TORSO + 0.5, -4), at(TORSO - 3, -11), at(16, -12), at(4, -11.5), add(B, [swing, 0]), M, add(F, [swing * 0.5, 0]), at(4, 11.5), at(15, 12.6), at(23, 12.4), at(TORSO - 2, 8), at(TORSO + 0.5, 4)],
    true,
    0.4
  );
  part(tunic, SD.tunic, { grad: [...at(TORSO, 0), ...M, SD.tunicDeep] as [number, number, number, number, string], gran: 0.4, rim: 1.8 });
  // folds from the belt
  const tf = new Path2D();
  tf.moveTo(...at(6, 4));
  tf.quadraticCurveTo(...add(mid(at(6, 4), F), [-2, 0]), ...add(F, [-3, -1]));
  tf.moveTo(...at(6, -5));
  tf.quadraticCurveTo(...add(mid(at(6, -5), B), [1, 0]), ...add(M, [-1, -2]));
  tf.moveTo(...at(22, 9));
  tf.quadraticCurveTo(...at(17, 4), ...at(12, 7));
  strokeP(c, tf, deepen(SD.tunicDeep, 0.4), 1, 0.4, 'multiply');
  // neckline
  const nl = new Path2D();
  nl.moveTo(...at(TORSO - 0.5, 1));
  nl.quadraticCurveTo(...at(TORSO - 5, 5), ...at(TORSO - 1, 8.5));
  strokeP(c, nl, deepen(SD.tunicDeep, 0.4), 0.9, 0.5, 'multiply');
  // rope belt and a small pouch (the stones live there)
  const belt = limb(at(10, -11.8), at(9, 12.4), 3.2, 3.2);
  part(belt, SD.belt, { gran: 0.3, rim: 0.8 });
  const knot = add(at(9, 9.5), [0, 0]);
  const tails = new Path2D();
  tails.moveTo(...knot);
  tails.quadraticCurveTo(...add(knot, [2 + swing, 6]), ...add(knot, [1 + swing * 1.5, 11]));
  tails.moveTo(...knot);
  tails.quadraticCurveTo(...add(knot, [4 + swing, 5]), ...add(knot, [4.5 + swing * 1.5, 9]));
  strokeP(c, tails, SD.belt, 1.3, 0.9);
  const pouch = smoothPath([at(9, -3), at(9, 3), at(2, 3.5), at(0.5, 0), at(2, -3.5)], true, 0.5);
  part(pouch, mixHex(SD.belt, SD.sandal, 0.4), { gran: 0.4, rim: 1 });

  // ---- cloak over the shoulders (the front drape) and its clasp ----
  const hood = o.hood ?? 0;
  const drape = smoothPath([at(TORSO + 1.5, -6), at(TORSO + 1, 3), at(TORSO - 3, 7.5), at(TORSO - 9, 6), at(TORSO - 13, -2), at(TORSO - 11, -12.5), at(TORSO - 3, -12.5)], true, 0.45);
  part(drape, SD.cloak, { grad: [...at(TORSO + 1, 0), ...at(TORSO - 12, -8), SD.cloakDeep] as [number, number, number, number, string], gran: 0.5, rim: 1.6 });
  const clasp = at(TORSO - 2, 5.5);
  const cl = new Path2D();
  cl.arc(clasp[0], clasp[1], 1.7, 0, TAU);
  wash(c, st, cl, SB.gold, { reserve: 1, a: 0.95, gran: 0, rim: 0.6, edge: SD.goldDeep });

  // ---- neck & head ----
  const hA = j.headA;
  const H = (x: number, y: number): Pt => add(j.head, rot([x, y], hA));
  part(limb(at(TORSO - 2, 0.5), H(0.5, 9), 8.2, 7.2), deepen(SB.skin, 0.12), { rim: 1 });
  const skull = smoothPath(
    [H(0, -10.6), H(5.8, -9.4), H(9, -5.2), H(9.8, -1.2), H(11, 1.6), H(12.6, 4), H(10.8, 5.4), H(11.2, 7.6), H(8.5, 12), H(2, 12), H(-4.5, 9.2), H(-8.8, 3.4), H(-9.4, -3), H(-6.4, -8.6)],
    true,
    0.5
  );
  part(skull, SB.skin, { grad: [...H(-6, -8), ...H(4, 10), SB.skinDeep] as [number, number, number, number, string], gran: 0.3, rim: 1.4 });
  wash(c, st, smoothPath([H(-1, -10.4), H(4, -9.8), H(1, -6), H(-5, -2), H(-9.2, -2.6), H(-6.5, -8.4)], true, 0.5), SB.beard, { a: 0.1, gran: 0.25, rim: 0 });
  lift(c, smoothPath([H(-2.5, -8.6), H(2.5, -9), H(1.6, -7.4), H(-3, -6.6)], true, 0.5), 0.55);
  part(smoothPath([H(-2.6, -1.5), H(-0.6, -1.8), H(0.2, 1), H(-0.8, 3.6), H(-2.8, 3), H(-3.4, 0.6)], true, 0.5), SB.skinDeep, { a: 0.7, rim: 0.8 });
  const smile = p.smile ?? 0.6;
  const beard = smoothPath(
    [H(0.4, -2.2), H(1.2, 2.6), H(4.2, 3.4), H(6.6, 5.2), H(9.4, 5.1), H(11.6, 6.6), H(11.6, 9.4), H(9.8, 13.2), H(5, 15.4), H(0.6, 13.2), H(-1.6, 8), H(-1.4, 2.6)],
    true,
    0.5
  );
  part(beard, SB.beard, { a: 0.92, gran: 0.6, rim: 1.2, granColor: '#1b1414' });
  const cheek = new Path2D();
  const ck = H(6.4, 2);
  cheek.ellipse(ck[0], ck[1], 2.4, 1.6, hA, 0, TAU);
  wash(c, st, cheek, SB.blush, { a: 0.35, gran: 0, rim: 0 });
  const mouth = new Path2D();
  const m0 = H(7.8, 7.5 - smile * 0.6);
  const m1 = H(11, 7.4);
  const mc = H(9.6, 7.6 + smile * 1.6);
  mouth.moveTo(m0[0], m0[1]);
  mouth.quadraticCurveTo(mc[0], mc[1], m1[0], m1[1]);
  strokeP(c, mouth, rgba('#c46b62', 0.9), 1.5);
  if (smile > 0.75) strokeP(c, mouth, rgba(SB.paper, 0.85), 0.7);
  wash(c, st, smoothPath([H(10.6, 1.4), H(12.4, 4), H(10.6, 5), H(9.8, 3.6)], true, 0.5), SB.skinDeep, { a: 0.35, gran: 0, rim: 0.6 });
  const blink = p.blink ?? 0;
  const look = p.look ?? 0;
  if (o.sleep) {
    const e = new Path2D();
    e.moveTo(...H(5, -1.4));
    e.quadraticCurveTo(...H(6.5, -0.2), ...H(8, -1.2));
    strokeP(c, e, rgba(SB.beard, 0.95), 1.1);
  } else if (smile > 0.85 || blink > 0.6) {
    const e = new Path2D();
    e.moveTo(...H(5, -1));
    e.quadraticCurveTo(...H(6.5, -2.4), ...H(8, -1));
    strokeP(c, e, rgba(SB.beard, 0.95), 1.1);
  } else {
    const eyeC = H(6.4, -1.4 + look * 0.5);
    const eye = new Path2D();
    eye.ellipse(eyeC[0], eyeC[1], 1.15, 1.45 * (1 - blink), hA, 0, TAU);
    c.fillStyle = rgba(SB.beard, 0.95);
    c.fill(eye);
    const hi = H(6.8, -1.9 + look * 0.5);
    c.fillStyle = rgba('#ffffff', 0.85);
    c.beginPath();
    c.arc(hi[0], hi[1], 0.38, 0, TAU);
    c.fill();
  }
  const brow = new Path2D();
  brow.moveTo(...H(4.2, -4 + look * 0.3));
  brow.quadraticCurveTo(...H(6.6, -4.9 + look * 0.3), ...H(8.8, -3.6 + look * 0.2));
  strokeP(c, brow, rgba(SB.beard, 0.85), 1.5);
  const bt = new Path2D();
  for (let i = 0; i < 7; i++) {
    bt.moveTo(...H(0.5 + i * 1.5, 6 + (i % 3)));
    bt.lineTo(...H(1 + i * 1.5, 9.5 + (i % 2) * 2));
  }
  strokeP(c, bt, '#6a5a52', 0.5, 0.25);
  // hood up against the storm: a fold of the cloak over the crown
  if (hood > 0.01) {
    const hd = smoothPath([H(-11, 8), H(-11.5, -4), H(-6, -12.5), H(3, -13.2), H(9.5, -8.5), H(10.4, -4.6), H(4, -6.5), H(-2, -4), H(-4, 4), H(-5, 10)], true, 0.45);
    c.save();
    c.globalAlpha = hood;
    part(hd, SD.cloak, { gran: 0.5, rim: 1.4 });
    c.restore();
  }

  // ---- props in the near hand, the near arm ----
  if (!o.crookFar && o.crook != null) drawCrook(c, st, j.hN, o.crook, ground - j.hN[1], false);
  o.held?.(j);
  part(chain([j.eN, j.wN], [7.6, 6.4]), SB.skin, { gran: 0.3 });
  part(chain([j.sN, j.eN, mid(j.eN, j.wN, 0.35)], [10.8, 9, 8]), SD.tunic, { grad: [...j.sN, ...j.eN, SD.tunicDeep] as [number, number, number, number, string], gran: 0.35 });
  part(handPath(j.wN, j.hN, new Path2D()), SB.skin);
  if (!o.noFarArm && o.farFront) farArm();
  o.front?.(j);
  silTint(c, sil, o.tint, o.glow, o.glowCol);
  return j;
};

/* ---------- sheep ---------- */

export interface SheepPose {
  /** body height above the ground (standing ~34) */
  y: number;
  /** head: 0 up and alert, 1 down grazing */
  graze: number;
  /** foot offsets x and lift: ff, fn, bf, bn */
  feet: [Pt, Pt, Pt, Pt];
  /** 0 standing, 1 lying with legs tucked */
  lie: number;
  blink?: number;
  /** head turn toward camera 0..1 */
  turn?: number;
}

export const SHEEP_STAND: SheepPose = { y: 30, graze: 0, feet: [[16, 0], [20, 0], [-16, 0], [-12, 0]], lie: 0 };
export const SHEEP_GRAZE: SheepPose = { ...SHEEP_STAND, graze: 1 };
export const SHEEP_LIE: SheepPose = { y: 15, graze: 0.35, feet: [[16, 0], [20, 0], [-16, 0], [-12, 0]], lie: 1, blink: 1 };

export const sheepWalk = (p: number, stride = 16): SheepPose => {
  const foot = (off: number, base: number): Pt => {
    const q = (((p + off) % 1) + 1) % 1;
    const duty = 0.6;
    if (q < duty) return [base + stride * (0.5 - q / duty), 0];
    const s = (q - duty) / (1 - duty);
    return [base + stride * (-0.5 + s * s * (3 - 2 * s)), Math.sin(Math.PI * s) * 5];
  };
  return { y: 30 + Math.sin(p * TAU * 2) * 0.8, graze: 0.15, feet: [foot(0.75, 16), foot(0.25, 20), foot(0.5, -16), foot(0, -12)], lie: 0 };
};

export const mixSheep = (a: SheepPose, b: SheepPose, k: number): SheepPose => ({
  y: lerp(a.y, b.y, k),
  graze: lerp(a.graze, b.graze, k),
  feet: a.feet.map((f, i) => [lerp(f[0], b.feet[i][0], k), lerp(f[1], b.feet[i][1], k)]) as [Pt, Pt, Pt, Pt],
  lie: lerp(a.lie, b.lie, k),
  blink: lerp(a.blink ?? 0, b.blink ?? 0, k),
  turn: lerp(a.turn ?? 0, b.turn ?? 0, k),
});

/** Scalloped fleece outline around an ellipse */
const fleecePts = (cx: number, cy: number, rx: number, ry: number, n: number, bumps: number, amp: number, ph: number): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + amp * Math.pow(Math.abs(Math.sin(a * bumps * 0.5 + ph)), 0.6);
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
};

export interface SheepOpts {
  t: number;
  tint?: [string, number];
  glow?: number;
  pencil?: number;
  seed?: number;
  /** fleece tone 0 cream .. 1 a darker, browner sheep */
  dark?: number;
}

/** A sheep, ground at y = 0, facing +x, about 52 long and 50 tall */
export const drawSheep = (c: Ctx, st: Studio, p: SheepPose, o: SheepOpts) => {
  const sil = new Path2D();
  const penA = o.pencil ?? 0.3;
  const seed = o.seed ?? 1;
  const wool = mixHex(SD.wool, '#b9a588', o.dark ?? 0);
  const face = SD.sheepFace;
  const part = (path: Path2D, color: string, opt: WashOpts = {}) => {
    wash(c, st, path, color, { reserve: 0.97, a: 0.86, gran: 0.4, rim: 1.4, rimA: 0.45, ...opt });
    sil.addPath(path);
    if (penA > 0) pencil(c, st, path, penA, 0.75);
  };
  const by = -p.y;
  const lie = p.lie;
  const legTop = (x: number): Pt => [x, by + 12];
  const leg = (x: number, f: Pt, far: boolean) => {
    if (lie > 0.6) return;
    const top = legTop(x);
    const foot: Pt = [f[0], -f[1]];
    const front = x > 0;
    const len = Math.hypot(foot[0] - top[0], foot[1] - top[1]);
    const knee = ik2(top, foot, 9, 9.5, front ? -1 : 1);
    const pth = chain(len > 18.4 ? [top, mid(top, foot), foot] : [top, knee, foot], [7.5, 4.4, 3.8]);
    part(pth, far ? deepen(face, 0.25) : face, { gran: 0.3, rim: 0.8 });
    const hoof = new Path2D();
    hoof.ellipse(foot[0] + 0.8, foot[1] - 1, 2.4, 1.6, 0, 0, TAU);
    wash(c, st, hoof, '#2f2623', { a: 0.9, gran: 0, rim: 0 });
  };
  leg(16, p.feet[0], true);
  leg(-16, p.feet[2], true);
  // tucked legs when lying
  if (lie > 0.4) {
    const tk = smoothPath([[10, -4], [26, -5], [28, -1.5], [12, -0.5]], true, 0.5);
    part(tk, face, { a: 0.86 * clamp((lie - 0.4) / 0.3), gran: 0.3, rim: 0.8 });
  }
  // fleece
  const rx = 27;
  const ry = 17;
  const body = smoothPath(fleecePts(0, by, rx, ry, 44, 11, 0.13, seed), true, 0.5);
  part(body, wool, { grad: [0, by - ry, 0, by + ry, mixHex(wool, SD.woolShade, 0.9)], gran: 0.45, rim: 1.8, edge: deepen(SD.woolShade, 0.35) });
  // curls
  const curls = new Path2D();
  for (let i = 0; i < 9; i++) {
    const a = i * 2.3 + seed;
    const x = Math.cos(a) * rx * 0.55 * ((i % 3) / 3 + 0.4);
    const y = by + Math.sin(a * 1.3) * ry * 0.5;
    curls.moveTo(x - 2.5, y);
    curls.arc(x, y, 2.5, Math.PI, Math.PI * 1.9);
  }
  strokeP(c, curls, deepen(SD.woolShade, 0.3), 0.9, 0.55, 'multiply');
  lift(c, smoothPath(fleecePts(-3, by - ry * 0.45, rx * 0.6, ry * 0.28, 24, 7, 0.15, seed + 2), true, 0.5), 0.45);
  leg(20, p.feet[1], false);
  leg(-12, p.feet[3], false);
  // head and neck
  const g = p.graze;
  const neckA: Pt = [rx * 0.7, by - 4];
  const hc: Pt = [lerp(rx + 7, rx + 10, g), lerp(by - 12, -9, g) + (lie > 0.5 ? lerp(0, 9, lie) * (1 - g) : 0)];
  const ang = lerp(0.15, 1.15, g);
  const neck = ribbon([neckA, mid(neckA, hc, 0.5), hc], (k) => lerp(15, 10, k));
  part(neck, wool, { gran: 0.4, rim: 1.4, edge: deepen(SD.woolShade, 0.35) });
  const Hh = (x: number, y: number): Pt => add(hc, rot([x, y], ang));
  // ear (far)
  const flick = Math.max(0, Math.sin(o.t * 1.7 + seed * 3)) ** 12;
  part(smoothPath([Hh(-2, -4), Hh(-9, -7 - flick * 3), Hh(-11, -4.5 - flick * 2), Hh(-3, -1)], true, 0.5), deepen(face, 0.3), { gran: 0.2, rim: 0.6 });
  const head = smoothPath([Hh(-4, -5.5), Hh(3, -6.5), Hh(9, -4.5), Hh(13.5, -1), Hh(14, 2.5), Hh(11, 4.5), Hh(4, 5), Hh(-3, 4)], true, 0.5);
  part(head, face, { grad: [...Hh(-4, 0), ...Hh(14, 0), deepen(face, 0.3)] as [number, number, number, number, string], gran: 0.35, rim: 1.1 });
  // forelock of wool
  part(smoothPath(fleecePts(hc[0] - 2, hc[1] - 5, 6, 4, 18, 5, 0.2, seed), true, 0.5), wool, { gran: 0.3, rim: 1, edge: deepen(SD.woolShade, 0.35) });
  // near ear sticking out sideways
  part(smoothPath([Hh(-1, -3), Hh(-7, 1 + flick * 2), Hh(-8.5, 3.5), Hh(-1.5, 1.5)], true, 0.5), face, { gran: 0.2, rim: 0.7 });
  // eye
  const e = Hh(4.5, -1.6);
  const bl = p.blink ?? 0;
  if (bl > 0.6) {
    const ep = new Path2D();
    ep.moveTo(e[0] - 1.6, e[1]);
    ep.quadraticCurveTo(e[0], e[1] + 1, e[0] + 1.6, e[1]);
    strokeP(c, ep, '#e8dccb', 0.8, 0.9);
  } else {
    c.fillStyle = rgba('#efe4d0', 0.95);
    c.beginPath();
    c.ellipse(e[0], e[1], 1.6, 1.2, ang, 0, TAU);
    c.fill();
    c.fillStyle = rgba('#1c1513', 0.95);
    c.beginPath();
    c.ellipse(e[0] + 0.3, e[1], 0.9, 0.6, ang, 0, TAU);
    c.fill();
  }
  // nostril and mouth
  const nm = new Path2D();
  nm.moveTo(...Hh(12.5, 0.5));
  nm.lineTo(...Hh(13, 1.5));
  nm.moveTo(...Hh(13, 3));
  nm.quadraticCurveTo(...Hh(11, 4), ...Hh(9.5, 3.2));
  strokeP(c, nm, '#241b18', 0.7, 0.8);
  silTint(c, sil, o.tint, o.glow);
  return { head: hc };
};

/* ---------- the dromedary ---------- */

export interface CamelPose {
  /** body lift (0 standing; - lowers) */
  drop: number;
  /** body pitch */
  tilt: number;
  /** neck raise: 0 normal, + lifts, - lowers */
  neck: number;
  /** head nod */
  head: number;
  /** foot targets: [x, lift] for front far, front near, hind far, hind near */
  feet: [Pt, Pt, Pt, Pt];
  /** pastern angle per foot (0 = vertical, + forward-down) */
  pa: [number, number, number, number];
  /** 0 standing, 1 couched (kush), legs folded under */
  kneel: number;
  blink?: number;
  /** jaw chewing 0..1 */
  chew?: number;
}

const C_FRONT: [number, number] = [34, 40];
const C_HIND: [number, number] = [-34, -28];

export const CAMEL_STAND: CamelPose = {
  drop: 0, tilt: 0, neck: 0, head: 0, feet: [[34, 0], [40, 0], [-38, 0], [-32, 0]], pa: [0.35, 0.35, 0.35, 0.35], kneel: 0,
};
export const CAMEL_KUSH: CamelPose = { ...CAMEL_STAND, drop: 56, neck: 0.1, head: 0.05, kneel: 1, blink: 0.5 };

/** A pacing walk: both legs on one side move together, the body rolls side to side */
export const camelWalk = (p: number, stride = 46): CamelPose => {
  const foot = (off: number, base: number): [Pt, number] => {
    const q = (((p + off) % 1) + 1) % 1;
    const duty = 0.58;
    if (q < duty) return [[base + stride * (0.5 - q / duty), 0], 0.35 - (q / duty) * 0.3];
    const s = (q - duty) / (1 - duty);
    const e = s * s * (3 - 2 * s);
    return [[base + stride * (-0.5 + e), Math.sin(Math.PI * s) * 13], 0.25 + Math.sin(Math.PI * s) * 1.1];
  };
  const fn = foot(0, C_FRONT[1]);
  const bn = foot(0.04, C_HIND[1]);
  const ff = foot(0.5, C_FRONT[0]);
  const bf = foot(0.54, C_HIND[0]);
  const bob = Math.sin(p * TAU * 2 + 0.4);
  return {
    drop: bob * 2.2,
    tilt: Math.sin(p * TAU) * 0.012,
    neck: Math.sin(p * TAU * 2 + 1.6) * 0.07,
    head: Math.sin(p * TAU * 2 + 2.2) * 0.05,
    feet: [ff[0], fn[0], bf[0], bn[0]],
    pa: [ff[1], fn[1], bf[1] * 0.8, bn[1] * 0.8],
    kneel: 0,
  };
};

export const mixCamel = (a: CamelPose, b: CamelPose, k: number): CamelPose => ({
  drop: lerp(a.drop, b.drop, k),
  tilt: lerp(a.tilt, b.tilt, k),
  neck: lerp(a.neck, b.neck, k),
  head: lerp(a.head, b.head, k),
  feet: a.feet.map((f, i) => [lerp(f[0], b.feet[i][0], k), lerp(f[1], b.feet[i][1], k)]) as [Pt, Pt, Pt, Pt],
  pa: a.pa.map((v, i) => lerp(v, b.pa[i], k)) as [number, number, number, number],
  kneel: lerp(a.kneel, b.kneel, k),
  blink: lerp(a.blink ?? 0, b.blink ?? 0, k),
  chew: lerp(a.chew ?? 0, b.chew ?? 0, k),
});

const CB: Pt[] = [
  [50, -88], [44, -100], [30, -106], [16, -118], [2, -127], [-10, -128], [-24, -117], [-38, -104], [-52, -98], [-60, -88],
  [-61, -74], [-52, -64], [-38, -64], [-22, -68], [0, -67], [22, -67], [38, -68], [50, -74],
];

export interface CamelOpts {
  t: number;
  tint?: [string, number];
  glow?: number;
  pencil?: number;
  /** saddle blanket and frame */
  saddle?: boolean;
  /** coat tone shift 0..1 toward a darker camel */
  dark?: number;
  /** pack bundles instead of a riding saddle */
  pack?: boolean;
  /** lead rope from the nose back to (x, y) in rig space */
  rope?: Pt | null;
}

/**
 * A dromedary, ground at y = 0, facing +x, about 175 long and 160 tall at the head.
 * Front knees bend forward, hocks point back; the pace moves both legs on a side together.
 */
export const drawCamel = (c: Ctx, st: Studio, p: CamelPose, o: CamelOpts) => {
  const t = o.t;
  const sil = new Path2D();
  const penA = o.pencil ?? 0.3;
  const coat = mixHex(SD.camel, SD.camelDeep, (o.dark ?? 0) * 0.6);
  const part = (path: Path2D, color: string, opt: WashOpts = {}) => {
    wash(c, st, path, color, { reserve: 0.97, a: 0.86, gran: 0.45, rim: 1.6, rimA: 0.45, ...opt });
    sil.addPath(path);
    if (penA > 0) pencil(c, st, path, penA, 0.8);
  };
  const B = (q: Pt): Pt => {
    const r = rot(q, p.tilt, [0, -80]);
    return [r[0], r[1] + p.drop];
  };
  const kn = p.kneel;
  // ---- legs ----
  const frontLeg = (rootX: number, f: Pt, pa: number): Pt[] => {
    const root = B([rootX - 2, -76]);
    const foot: Pt = [f[0], -f[1] - 3];
    const fet = add(foot, vec(pa + Math.PI, 11));
    const knee = ik2(root, fet, 38, 30, -1);
    // couched: forearm folded under, knee forward on the ground, cannon tucked back
    const kR = root;
    const kK: Pt = [rootX + 22, -6];
    const kF: Pt = [rootX - 6, -5];
    const kP: Pt = [rootX - 14, -3];
    return [mid(root, kR, kn), mid(knee, kK, kn), mid(fet, kF, kn), mid(foot, kP, kn)];
  };
  const hindLeg = (rootX: number, f: Pt, pa: number): Pt[] => {
    const root = B([rootX + 8, -70]);
    const foot: Pt = [f[0], -f[1] - 3];
    const fet = add(foot, vec(pa * 0.6 + Math.PI, 11));
    const hock = ik2(root, fet, 36, 30, 1);
    const kR = root;
    const kH: Pt = [rootX - 22, -8];
    const kF: Pt = [rootX + 4, -5];
    const kP: Pt = [rootX + 14, -3];
    return [mid(root, kR, kn), mid(hock, kH, kn), mid(fet, kF, kn), mid(foot, kP, kn)];
  };
  const pad = (q: Pt, dir: number, pth: Path2D) => {
    const P = (x: number, y: number): Pt => add(q, rot([x, y], dir));
    return smoothPath([P(-7, -2), P(-3, -5.5), P(4, -5.5), P(9, -2.5), P(11, 2.6), P(0, 3.4), P(-8, 2.6)], true, 0.5, pth);
  };
  const legPath = (j: Pt[], front: boolean) => {
    const pth = chain([j[0], j[1], j[2], j[3]], front ? [22, 11.5, 8, 7.6] : [18, 12.5, 7.6, 7.4]);
    return pth;
  };
  // knee callus (front) and the hock knob (hind): drawn on top so they never punch holes
  const knob = (j: Pt[], front: boolean, col: string) => {
    const lifted = clamp((-j[3][1] - 3) / 10);
    const pd = pad(j[3], lifted * (Math.atan2(j[3][1] - j[2][1], j[3][0] - j[2][0]) - Math.PI / 2) * 0.6, new Path2D());
    wash(c, st, pd, mixHex(col, coat, 0.5), { reserve: 0.96, a: 0.86, gran: 0.4, rim: 1.2 });
    sil.addPath(pd);
    const kc = new Path2D();
    kc.ellipse(j[1][0], j[1][1], front ? 6.4 : 5.8, front ? 5.6 : 6.4, 0, 0, TAU);
    wash(c, st, kc, col, { a: 0.55, gran: 0.4, rim: 0.8 });
    const fk = new Path2D();
    fk.ellipse(j[2][0], j[2][1], 4.6, 4, 0, 0, TAU);
    wash(c, st, fk, col, { a: 0.3, gran: 0.3, rim: 0 });
  };
  const legs = {
    ff: frontLeg(C_FRONT[0], p.feet[0], p.pa[0]),
    fn: frontLeg(C_FRONT[1], p.feet[1], p.pa[1]),
    bf: hindLeg(C_HIND[0], p.feet[2], p.pa[2]),
    bn: hindLeg(C_HIND[1], p.feet[3], p.pa[3]),
  };
  const far = deepen(coat, 0.3);
  part(legPath(legs.ff, true), far, { gran: 0.4 });
  knob(legs.ff, true, deepen(coat, 0.5));
  part(legPath(legs.bf, false), far, { gran: 0.4 });
  knob(legs.bf, false, deepen(coat, 0.5));
  // far haunch
  // ---- tail ----
  const tr = B([-60, -86]);
  const sw = Math.sin(t * 1.9) * 2;
  const tl = Math.min(1, (-tr[1] - 2) / 40);
  const tail = new Path2D();
  tail.moveTo(tr[0], tr[1]);
  tail.quadraticCurveTo(tr[0] - 5, tr[1] + 14 * tl, tr[0] - 3 + sw, tr[1] + 30 * tl);
  strokeP(c, tail, deepen(coat, 0.35), 2.4, 0.9);
  const tuft = smoothPath([[tr[0] - 5 + sw, tr[1] + 26 * tl], [tr[0] - 1 + sw, tr[1] + 27 * tl], [tr[0] + sw, tr[1] + 38 * tl], [tr[0] - 5 + sw, tr[1] + 37 * tl]], true, 0.5);
  part(tuft, SB.beard, { a: 0.75, gran: 0.4, rim: 0.6 });
  // ---- neck & head ----
  const nb = B([44, -94]);
  const nl = p.neck;
  const n1: Pt = [nb[0] + 24, nb[1] + 6 - nl * 20];
  const n2: Pt = [nb[0] + 42, nb[1] - 14 - nl * 40];
  const hb: Pt = [nb[0] + 46, nb[1] - 36 - nl * 52];
  const neck = ribbon([[nb[0] - 14, nb[1] - 2], nb, n1, n2, hb], (k) => lerp(34, 16, Math.pow(k, 0.7)));
  part(neck, coat, { grad: [nb[0], nb[1], hb[0], hb[1], mixHex(coat, SD.camelPale, 0.3)], gran: 0.5, rim: 1.8 });
  // throat shading
  const throat = new Path2D();
  throat.moveTo(nb[0] + 4, nb[1] + 12);
  throat.quadraticCurveTo(n1[0] + 4, n1[1] + 14, n2[0] + 6, n2[1] + 6);
  strokeP(c, throat, deepen(coat, 0.5), 1.2, 0.4, 'multiply');
  // ---- body ----
  const body = smoothPath(CB.map(B), true, 0.5);
  const top = B([0, -128]);
  const bot = B([0, -66]);
  part(body, coat, { grad: [top[0], top[1], bot[0], bot[1], deepen(coat, 0.2)], gran: 0.55, rim: 2.2 });
  // belly shade and hump light
  wash(c, st, smoothPath([B([-40, -70]), B([0, -74]), B([40, -72]), B([38, -67]), B([0, -66]), B([-40, -64])], true, 0.5), deepen(coat, 0.45), { a: 0.35, gran: 0.3, rim: 0 });
  lift(c, smoothPath([B([18, -116]), B([0, -124]), B([-16, -121]), B([-4, -116])], true, 0.5), 0.35);
  // haunch line and shoulder line
  const ml = new Path2D();
  ml.moveTo(...B([-30, -100]));
  ml.quadraticCurveTo(...B([-46, -88]), ...B([-36, -66]));
  ml.moveTo(...B([30, -100]));
  ml.quadraticCurveTo(...B([36, -86]), ...B([30, -70]));
  strokeP(c, ml, deepen(coat, 0.55), 1.1, 0.4, 'multiply');
  const ha = 0.1 + p.head - nl * 0.15;
  const Hd = (x: number, y: number): Pt => add(hb, rot([x * 1.18, y * 1.18], ha));
  const chew = (o.t * 2.2) % 1 < 0.5 ? (p.chew ?? 0) * 1.5 : 0;
  // ear
  part(smoothPath([Hd(-2, -8), Hd(-6, -16), Hd(-1, -13), Hd(2, -9)], true, 0.5), deepen(coat, 0.2), { gran: 0.3, rim: 0.8 });
  const head = smoothPath(
    [Hd(-4, -2), Hd(-2, -9), Hd(6, -11), Hd(14, -9), Hd(24, -6), Hd(32, -3.5), Hd(36.5, 0), Hd(37, 4), Hd(34, 6.5), Hd(33, 9 + chew), Hd(26, 11 + chew), Hd(14, 10), Hd(4, 9), Hd(-3, 5)],
    true,
    0.5
  );
  part(head, coat, { grad: [...Hd(0, 0), ...Hd(36, 0), mixHex(coat, SD.camelPale, 0.35)] as [number, number, number, number, string], gran: 0.45, rim: 1.4 });
  // muzzle pale, lip split, nostril
  wash(c, st, smoothPath([Hd(26, -4), Hd(36.5, 0), Hd(37, 4), Hd(33, 9 + chew), Hd(26, 9)], true, 0.5), SD.camelPale, { a: 0.6, gran: 0.2, rim: 0 });
  const lip = new Path2D();
  lip.moveTo(...Hd(37, 4));
  lip.quadraticCurveTo(...Hd(32, 5.5), ...Hd(27, 5.5 + chew * 0.5));
  lip.moveTo(...Hd(31.5, -1.5));
  lip.lineTo(...Hd(34.5, -0.2));
  strokeP(c, lip, '#4a3326', 0.9, 0.8);
  // eye: heavy lid, long lashes, calm
  const ec = Hd(13, -4);
  const bl = p.blink ?? 0;
  const eye = new Path2D();
  eye.ellipse(ec[0], ec[1], 2.6, 1.8 * (1 - bl * 0.85), ha, 0, TAU);
  c.fillStyle = rgba('#2a1d17', 0.95);
  c.fill(eye);
  const lid = new Path2D();
  lid.moveTo(...Hd(9.5, -5));
  lid.quadraticCurveTo(...Hd(13, -7.5 + bl * 3), ...Hd(16.5, -4.8));
  for (let i = 0; i < 4; i++) {
    const q = Hd(10.5 + i * 1.8, -5.6 + bl * 2);
    lid.moveTo(q[0], q[1]);
    lid.lineTo(...Hd(10 + i * 2.2, -8.2 + bl * 2));
  }
  strokeP(c, lid, '#2a1d17', 0.9, 0.85);
  if (bl < 0.5) {
    const hi = Hd(13.6, -4.6);
    c.fillStyle = rgba('#fff8e8', 0.85);
    c.beginPath();
    c.arc(hi[0], hi[1], 0.6, 0, TAU);
    c.fill();
  }
  // bridle: a simple headstall in rose and indigo
  const br = new Path2D();
  br.moveTo(...Hd(1, -8));
  br.quadraticCurveTo(...Hd(4, 2), ...Hd(5, 9));
  br.moveTo(...Hd(4, 2));
  br.quadraticCurveTo(...Hd(18, 1), ...Hd(30, 2));
  strokeP(c, br, SB.rose, 1.5, 0.85);
  // ---- near legs ----
  part(legPath(legs.bn, false), coat, { grad: [...legs.bn[0], ...legs.bn[3], deepen(coat, 0.15)] as [number, number, number, number, string] });
  knob(legs.bn, false, deepen(coat, 0.35));
  part(legPath(legs.fn, true), coat, { grad: [...legs.fn[0], ...legs.fn[3], deepen(coat, 0.15)] as [number, number, number, number, string] });
  knob(legs.fn, true, deepen(coat, 0.35));
  // near haunch: the big thigh over the hind leg
  const hip = B([-40, -98]);
  const sti = legs.bn[0];
  const haunch = smoothPath([[hip[0] - 18, hip[1] + 6], [hip[0] - 6, hip[1] - 6], [hip[0] + 14, hip[1] + 2], [sti[0] + 10, sti[1] - 2], [sti[0] + 2, sti[1] + 8], [sti[0] - 10, sti[1] + 2]], true, 0.5);
  part(haunch, coat, { reserve: 0, a: 0.35, gran: 0.3, rim: 1, rimA: 0.3, grad: [hip[0], hip[1], sti[0], sti[1], deepen(coat, 0.18)] });
  // ---- saddle or pack ----
  if (o.saddle) {
    const sb = B([-14, -126]);
    const blanket = smoothPath([B([12, -122]), B([2, -131]), B([-24, -130]), B([-40, -112]), B([-38, -88]), B([8, -86]), B([16, -104])], true, 0.4);
    part(blanket, SB.rose, { gran: 0.45, rim: 1.4 });
    const stripes = new Path2D();
    for (const y of [-100, -94]) {
      stripes.moveTo(...B([-38, y]));
      stripes.quadraticCurveTo(...B([-14, y + 2]), ...B([12, y - 4]));
    }
    strokeP(c, stripes, SD.indigo, 3, 0.8, 'multiply');
    strokeP(c, stripes, SB.gold, 1, 0.8);
    const fringe = new Path2D();
    for (let i = 0; i < 10; i++) {
      const q = mid(B([-38, -88]), B([8, -86]), i / 9);
      fringe.moveTo(q[0], q[1]);
      fringe.lineTo(q[0] + Math.sin(t * 3 + i) * 0.8, q[1] + 5);
    }
    strokeP(c, fringe, SB.gold, 1, 0.8);
    // wooden saddle horns
    const horn = new Path2D();
    horn.moveTo(...add(sb, [14, 2]));
    horn.lineTo(...add(sb, [18, -12]));
    horn.moveTo(...add(sb, [-14, 2]));
    horn.lineTo(...add(sb, [-18, -9]));
    strokeP(c, horn, SB.wood, 3, 0.9);
  }
  if (o.pack) {
    const pk = smoothPath([B([12, -118]), B([-2, -136]), B([-28, -130]), B([-44, -108]), B([-46, -88]), B([-2, -90]), B([14, -102])], true, 0.45);
    part(pk, mixHex(SD.tunicDeep, SD.sandDeep, 0.3), { gran: 0.5, rim: 1.4 });
    const ropes = new Path2D();
    for (const x of [-30, -16, -2]) {
      ropes.moveTo(...B([x, -132 + (x === -30 ? 6 : 0)]));
      ropes.lineTo(...B([x - 4, -90]));
    }
    strokeP(c, ropes, SD.belt, 1.4, 0.8);
    const rug = smoothPath([B([-6, -112]), B([-36, -106]), B([-40, -92]), B([-8, -94])], true, 0.4);
    part(rug, SD.indigo, { gran: 0.5, rim: 1 });
  }
  if (o.rope) {
    const nose = Hd(30, 3);
    const rp = new Path2D();
    rp.moveTo(nose[0], nose[1]);
    rp.quadraticCurveTo((nose[0] + o.rope[0]) / 2, Math.max(nose[1], o.rope[1]) + 30, o.rope[0], o.rope[1]);
    strokeP(c, rp, SD.belt, 1.2, 0.8);
  }
  silTint(c, sil, o.tint, o.glow);
  return { seat: B([-12, -132]), nose: Hd(34, 2), head: Hd(10, 0), hump: B([-6, -128]) };
};

/* ---------- the old king ---------- */

export interface ElderOpts {
  t: number;
  /** offering arm reach 0..1 */
  reach: number;
  /** palm opened 0..1 (showing the stones) */
  open: number;
  tint?: [string, number];
  glow?: number;
  /** breastplate glint 0..1 */
  glint?: number;
}

/** An old king in a plain traveller's robe, seated, white beard, a gold breastplate under the robe. Seat at (0, 0), facing +x */
export const drawElder = (c: Ctx, st: Studio, o: ElderOpts) => {
  const sil = new Path2D();
  const part = (path: Path2D, color: string, opt: WashOpts = {}) => {
    wash(c, st, path, color, { reserve: 0.96, a: 0.86, gran: 0.45, rim: 1.6, rimA: 0.45, ...opt });
    sil.addPath(path);
    pencil(c, st, path, 0.33, 0.8);
  };
  const t = o.t;
  const breath = Math.sin(t * 1.4) * 0.6;
  // robe: seated, knees forward, hem to the ground
  const robe = smoothPath([[-6, -56 + breath], [-14, -46], [-16, -22], [-14, 0], [-8, 26], [6, 30], [30, 30], [34, 22], [30, 6], [22, 0], [10, -4], [12, -30], [8, -50 + breath]], true, 0.4);
  part(robe, SD.robe, { grad: [0, -56, 20, 30, SD.robeDeep], gran: 0.55, rim: 2 });
  // folds
  const fd = new Path2D();
  fd.moveTo(-10, -20);
  fd.quadraticCurveTo(-8, 4, -4, 28);
  fd.moveTo(8, 0);
  fd.quadraticCurveTo(18, 12, 20, 29);
  fd.moveTo(4, -2);
  fd.quadraticCurveTo(14, -1, 30, 6);
  strokeP(c, fd, deepen(SD.robe, 0.5), 1.1, 0.45, 'multiply');
  // the gold breastplate glimpsed where the robe opens, small stones set in a grid
  const plate = smoothPath([[-1, -46 + breath], [8, -47 + breath], [10, -30], [1, -28]], true, 0.3);
  part(plate, SB.gold, { gran: 0.3, rim: 1.2, edge: SD.goldDeep });
  const gems = ['#c94f5a', '#5f86b4', '#7f9e6c', '#e7a54e'];
  for (let i = 0; i < 6; i++) {
    const g = new Path2D();
    g.arc(2.2 + (i % 2) * 4.2, -43 + Math.floor(i / 2) * 5 + breath, 1.2, 0, TAU);
    wash(c, st, g, gems[i % 4], { a: 0.9, gran: 0, rim: 0 });
  }
  const gl = o.glint ?? 0;
  if (gl > 0.01) sparkle(c, 7, -42 + breath, 9 * gl, 1.3, '#fff3cf', gl, 0.2);
  c.globalAlpha = 1;
  // mantle over the shoulders
  const mantle = smoothPath([[-8, -60 + breath], [8, -59 + breath], [12, -48], [6, -40], [-2, -44], [-12, -38], [-17, -48]], true, 0.4);
  part(mantle, mixHex(SD.tunic, SD.tunicDeep, 0.4), { gran: 0.4, rim: 1.2 });
  // head: white headcloth with a thin gold band, long white beard
  const hx = 2;
  const hy = -70 + breath;
  const cloth = smoothPath([[hx - 12, hy + 12], [hx - 12, hy - 4], [hx - 6, hy - 12], [hx + 4, hy - 12.5], [hx + 9, hy - 7], [hx + 9, hy + 2], [hx + 4, hy - 2], [hx - 4, hy + 2], [hx - 6, hy + 14]], true, 0.45);
  const face = smoothPath([[hx + 3, hy - 6], [hx + 9, hy - 4], [hx + 10.5, hy + 1], [hx + 12, hy + 3.5], [hx + 10, hy + 5], [hx + 6, hy + 8], [hx + 1, hy + 4]], true, 0.5);
  part(face, SB.skin, { gran: 0.25, rim: 1 });
  part(cloth, '#f2ead8', { gran: 0.3, rim: 1.2, edge: SD.tunicDeep });
  const band = new Path2D();
  band.moveTo(hx - 10, hy - 4);
  band.quadraticCurveTo(hx - 1, hy - 9, hx + 8.5, hy - 6.5);
  strokeP(c, band, SB.gold, 1.6, 0.95);
  const beard = smoothPath([[hx + 2, hy + 3], [hx + 7, hy + 5], [hx + 11, hy + 5.5], [hx + 10, hy + 14], [hx + 6, hy + 24], [hx + 2, hy + 20], [hx - 1, hy + 10]], true, 0.5);
  part(beard, '#f4f0e6', { gran: 0.25, rim: 1, edge: '#b9b2a6' });
  const bs = new Path2D();
  for (let i = 0; i < 4; i++) {
    bs.moveTo(hx + 3 + i * 2, hy + 7);
    bs.quadraticCurveTo(hx + 4 + i * 1.6, hy + 14, hx + 3 + i * 1.2, hy + 20);
  }
  strokeP(c, bs, '#a59d92', 0.5, 0.5);
  // eye (kind, crinkled), brow
  const ep = new Path2D();
  ep.moveTo(hx + 5.5, hy - 1.5);
  ep.quadraticCurveTo(hx + 7, hy - 2.8, hx + 8.5, hy - 1.5);
  ep.moveTo(hx + 5, hy - 4.2);
  ep.quadraticCurveTo(hx + 7, hy - 5.4, hx + 9.4, hy - 4.2);
  strokeP(c, ep, '#3b302c', 1, 0.9);
  // arm offering the stones
  const r = o.reach;
  const sh: Pt = [6, -52 + breath];
  const el: Pt = [lerp(10, 20, r), lerp(-34, -38, r)];
  const wr: Pt = [lerp(18, 38, r), lerp(-26, -40, r)];
  part(chain([sh, el, wr], [10, 9, 8]), SD.robe, { gran: 0.45 });
  const hand = smoothPath([[wr[0] - 1, wr[1] - 3], [wr[0] + 6, wr[1] - 3 - o.open * 1.5], [wr[0] + 9, wr[1] + 0.5], [wr[0] + 6, wr[1] + 3.5], [wr[0], wr[1] + 3]], true, 0.5);
  part(hand, SB.skin, { gran: 0.2, rim: 1 });
  silTint(c, sil, o.tint, o.glow);
  return { palm: [wr[0] + 5, wr[1] - 3.5] as Pt, plate: [7, -42 + breath] as Pt };
};

/** The two stones: white and black, glazed, with a highlight lifted out */
export const drawStones = (c: Ctx, st: Studio, x: number, y: number, s: number, glint = 0) => {
  const w = new Path2D();
  w.ellipse(x - s * 1.05, y, s, s * 0.78, -0.2, 0, TAU);
  wash(c, st, w, '#efe8dc', { reserve: 1, a: 0.95, gran: 0.25, rim: 1.2, edge: '#a9a197' });
  const b = new Path2D();
  b.ellipse(x + s * 1.05, y + s * 0.1, s * 0.95, s * 0.74, 0.25, 0, TAU);
  wash(c, st, b, '#2d2a30', { reserve: 1, a: 0.95, gran: 0.4, rim: 1, edge: '#141216' });
  const h1 = new Path2D();
  h1.ellipse(x - s * 1.3, y - s * 0.32, s * 0.32, s * 0.16, -0.4, 0, TAU);
  lift(c, h1, 0.9);
  const h2 = new Path2D();
  h2.ellipse(x + s * 0.8, y - s * 0.25, s * 0.28, s * 0.13, -0.3, 0, TAU);
  lift(c, h2, 0.55);
  if (glint > 0.01) {
    c.save();
    c.globalCompositeOperation = 'screen';
    sparkle(c, x + s * 0.75, y - s * 0.32, s * 1.4 * glint, s * 0.18, '#ffe9b0', glint, 0.15);
    c.restore();
  }
};
