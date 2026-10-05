import type { RisoFilm, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, noise1, mulberry, MONO } from '../riso/kit';
import {
  LowPoly,
  MeshB,
  mat,
  rgb,
  mixRGB,
  add,
  sub,
  mul,
  dot,
  cross,
  norm,
  len,
  lerp3,
  crt,
  hud,
  bounds,
  shardsOf,
  rotAxis,
  F_UNLIT,
  F_NOFOG,
  F_TWO,
  F_ADD,
  F_ALPHA,
  RW,
  type Mesh,
  type M34,
  type V3,
  type RGB,
  type Env,
  type Cam,
} from '../styles/lowpoly';

/* ---------- palette ---------- */

const FOG = rgb('#7c8a86');
const SKY: [number, RGB][] = [
  [-1, rgb('#4a5258')],
  [-0.02, rgb('#9a9a88')],
  [0.03, rgb('#f0b878')],
  [0.12, rgb('#c8906e')],
  [0.28, rgb('#4a6a72')],
  [0.6, rgb('#1e3a4a')],
  [1, rgb('#0c1a26')],
];
const STONE = rgb('#a8998a');
const STONE_D = rgb('#7e7266');
const MOSS = rgb('#6a7e4a');
const EMBER = rgb('#ffa040');
const CYAN = rgb('#7af4ff');

/* ---------- timeline (one unbroken take) ---------- */

const T_RISE0 = 3.0;
const T_RISE1 = 6.0;
const T_RUN0 = 5.9;
const T_ROLL0 = 7.3;
const T_ROLL1 = 7.95;
const T_WIND = 6.1;
const T_SLAM = 7.55;
const T_LOCK = 8.2;
const T_CLIMB0 = 9.55;
const T_CLIMB1 = 12.9;
const T_STRIKE = 14.15;
const HITSTOP = 0.3;
const T_FALL0 = 14.85;
const T_LAND = 15.85;
const T_VICTORY = 17.0;

/** Animation clock: freezes for the hit-stop */
const anim = (t: number) => (t < T_STRIKE ? t : t < T_STRIKE + HITSTOP ? T_STRIKE : t - HITSTOP);

/* ---------- small math ---------- */

/** Matrix whose +y runs from a to b (unit scale), +x as close to xHint as possible */
const segM = (a: V3, b: V3, xHint: V3): M34 => {
  const Y = norm(sub(b, a));
  let Z = cross(xHint, Y);
  if (len(Z) < 1e-4) Z = cross([0, 0, 1], Y);
  Z = norm(Z);
  const X = cross(Y, Z);
  return new Float64Array([X[0], X[1], X[2], Y[0], Y[1], Y[2], Z[0], Z[1], Z[2], a[0], a[1], a[2]]);
};

/** Two-bone IK: returns the elbow/knee */
const ik = (s: V3, t: V3, a: number, b: number, pole: V3): V3 => {
  const d0 = sub(t, s);
  const d = clamp(len(d0), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const dir = norm(d0);
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  let p = sub(pole, mul(dir, dot(pole, dir)));
  p = norm(p);
  return add(add(s, mul(dir, x)), mul(p, h));
};

const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/* ---------- the hero ---------- */

const HERO = {
  tunic: rgb('#2e7a86'),
  tunicD: rgb('#245e6a'),
  cape: rgb('#c4323c'),
  skin: rgb('#e6ae8a'),
  hair: rgb('#2a1c22'),
  pants: rgb('#3a3452'),
  boot: rgb('#5a3a2a'),
  belt: rgb('#8a5a2a'),
  steel: rgb('#dfe6f0'),
  gold: rgb('#e0b040'),
};

const L_THIGH = 0.46;
const L_SHIN = 0.45;
const L_UARM = 0.3;
const L_FARM = 0.27;
const HIP_H = L_THIGH + L_SHIN + 0.07;

interface HeroMeshes {
  torso: Mesh;
  pelvis: Mesh;
  head: Mesh;
  thigh: Mesh;
  shin: Mesh;
  boot: Mesh;
  uarm: Mesh;
  farm: Mesh;
  hand: Mesh;
  sword: Mesh;
  swordHot: Mesh;
}

const buildHero = (): HeroMeshes => {
  const torso = new MeshB();
  // waist to neck, flattened front to back, a chest plate and a belt
  torso.frustum(6, 0.13, 0.19, 0.42, HERO.tunic, undefined, { flat: 0.68, shade: 0.12 });
  torso.frustum(6, 0.19, 0.12, 0.14, HERO.tunicD, mat(0, 0.42, 0), { flat: 0.7 });
  torso.frustum(6, 0.145, 0.145, 0.07, HERO.belt, mat(0, 0.0, 0), { flat: 0.72 });
  torso.box(0.05, 0.05, 0.03, HERO.gold, mat(0, 0.035, 0.105));
  // shoulder pads
  torso.rock(0.085, 11, HERO.tunicD, mat(0.2, 0.47, 0, 0, 0, 0, 1, 0.7, 1), { jit: 0.1 });
  torso.rock(0.085, 12, HERO.tunicD, mat(-0.2, 0.47, 0, 0, 0, 0, 1, 0.7, 1), { jit: 0.1 });
  // scarf
  torso.frustum(6, 0.11, 0.08, 0.08, HERO.cape, mat(0, 0.52, 0), { flat: 0.9 });
  const pelvis = new MeshB();
  pelvis.frustum(6, 0.16, 0.14, 0.16, HERO.pants, mat(0, -0.12, 0), { flat: 0.7 });
  // tunic skirt flaps
  pelvis.frustum(6, 0.2, 0.15, 0.2, HERO.tunicD, mat(0, -0.2, 0), { flat: 0.72, caps: false, flags: F_TWO });
  const head = new MeshB();
  head.rock(0.115, 21, HERO.skin, mat(0, 0.14, 0.0, 0, 0, 0, 0.95, 1.12, 1), { jit: 0.06, vary: 0.05 });
  head.frustum(5, 0.045, 0.05, 0.07, HERO.skin, mat(0, 0, 0)); // neck
  // hair: a cap and a swept tail
  head.rock(0.125, 23, HERO.hair, mat(0, 0.2, -0.025, 0, 0, 0, 1, 0.8, 1), { jit: 0.12 });
  head.poly([[0.06, 0.24, -0.08], [-0.06, 0.24, -0.08], [0, 0.1, -0.24]], HERO.hair, F_TWO);
  head.poly([[0.1, 0.25, 0.02], [0.13, 0.12, -0.04], [0.02, 0.28, 0.06]], HERO.hair, F_TWO);
  // eyes and brow
  head.box(0.028, 0.02, 0.01, '#1a1420', mat(0.04, 0.15, 0.105));
  head.box(0.028, 0.02, 0.01, '#1a1420', mat(-0.04, 0.15, 0.105));
  const thigh = new MeshB().frustum(5, 0.085, 0.062, L_THIGH, HERO.pants, undefined, { shade: 0.1 });
  const shin = new MeshB().frustum(5, 0.062, 0.045, L_SHIN, HERO.pants, undefined, { shade: 0.1 });
  shin.frustum(5, 0.07, 0.06, 0.24, HERO.boot, mat(0, L_SHIN - 0.24, 0));
  const boot = new MeshB().box(0.11, 0.08, 0.24, HERO.boot, mat(0, 0.04, 0.05));
  const uarm = new MeshB().frustum(5, 0.058, 0.046, L_UARM, HERO.tunic, undefined, { shade: 0.1 });
  const farm = new MeshB().frustum(5, 0.046, 0.034, L_FARM, HERO.skin, undefined, { shade: 0.08 });
  farm.frustum(5, 0.05, 0.045, 0.12, HERO.boot, mat(0, L_FARM - 0.12, 0)); // bracer
  const hand = new MeshB().box(0.07, 0.1, 0.06, HERO.skin, mat(0, 0.05, 0));
  hand.box(0.03, 0.05, 0.03, HERO.skin, mat(0.04, 0.03, 0.02));
  const sword = (hot: boolean) => {
    const b = new MeshB();
    b.frustum(4, 0.022, 0.022, 0.18, '#3a2420', mat(0, -0.06, 0));
    b.rock(0.03, 5, HERO.gold, mat(0, -0.08, 0));
    b.box(0.2, 0.035, 0.05, HERO.gold, mat(0, 0.13, 0));
    b.frustum(4, 0.05, 0.012, 1.0, hot ? '#e8ffff' : HERO.steel, mat(0, 0.15, 0), { flat: 0.25, a0: 0, flags: hot ? F_UNLIT : 0 });
    return b.build({ spec: 1.2, shin: 20 });
  };
  return {
    torso: torso.build(),
    pelvis: pelvis.build(),
    head: head.build(),
    thigh: thigh.build(),
    shin: shin.build(),
    boot: boot.build(),
    uarm: uarm.build(),
    farm: farm.build(),
    hand: hand.build(),
    sword: sword(false),
    swordHot: sword(true),
  };
};

interface Pose {
  /** pelvis drop below standing */
  crouch: number;
  /** torso pitch forward */
  lean: number;
  /** torso twist */
  twist: number;
  /** thigh swing (+ forward) and knee bend per leg [left(+x), right(-x)] */
  thigh: [number, number];
  knee: [number, number];
  /** shoulder forward raise, outward spread, elbow bend */
  arm: [[number, number, number], [number, number, number]];
  /** sword direction in body space */
  sword: V3;
  /** root pitch for the roll */
  flip: number;
  headPitch: number;
}

const P0: Pose = {
  crouch: 0,
  lean: 0.05,
  twist: 0,
  thigh: [0.05, -0.05],
  knee: [0.1, 0.1],
  arm: [
    [0.1, 0.2, 0.3],
    [0.2, 0.15, 0.5],
  ],
  sword: [0.15, -0.55, -0.8],
  flip: 0,
  headPitch: 0,
};

const mixPose = (a: Pose, b: Pose, k: number): Pose => ({
  crouch: lerp(a.crouch, b.crouch, k),
  lean: lerp(a.lean, b.lean, k),
  twist: lerp(a.twist, b.twist, k),
  thigh: [lerp(a.thigh[0], b.thigh[0], k), lerp(a.thigh[1], b.thigh[1], k)],
  knee: [lerp(a.knee[0], b.knee[0], k), lerp(a.knee[1], b.knee[1], k)],
  arm: [
    [lerp(a.arm[0][0], b.arm[0][0], k), lerp(a.arm[0][1], b.arm[0][1], k), lerp(a.arm[0][2], b.arm[0][2], k)],
    [lerp(a.arm[1][0], b.arm[1][0], k), lerp(a.arm[1][1], b.arm[1][1], k), lerp(a.arm[1][2], b.arm[1][2], k)],
  ],
  sword: norm(lerp3(a.sword, b.sword, k)),
  flip: lerp(a.flip, b.flip, k),
  headPitch: lerp(a.headPitch, b.headPitch, k),
});

/** Gait: walk (amp ~0.45) or run (amp ~0.9), phase in cycles */
const gait = (ph: number, amp: number, run: boolean): Pose => {
  const a = ph * TAU;
  const s = Math.sin(a);
  const kL = Math.max(0, Math.sin(a + 1.3)) * (run ? 1.4 : 0.7) + 0.1;
  const kR = Math.max(0, Math.sin(a + 1.3 + Math.PI)) * (run ? 1.4 : 0.7) + 0.1;
  return {
    crouch: (run ? 0.07 : 0.025) * (1 - Math.abs(Math.cos(a))),
    lean: run ? 0.32 : 0.08,
    twist: s * (run ? 0.18 : 0.1),
    thigh: [s * amp, -s * amp],
    knee: [kL, kR],
    arm: [
      [-s * amp * 0.8 + (run ? 0.3 : 0), 0.2, run ? 1.3 : 0.35],
      [s * amp * 0.5 + (run ? 0.4 : 0.15), 0.25, run ? 1.1 : 0.5],
    ],
    sword: run ? [0.2, -0.3, -0.9] : [0.15, -0.6, -0.75],
    flip: 0,
    headPitch: run ? -0.2 : 0,
  };
};

const READY: Pose = {
  crouch: 0.1,
  lean: 0.18,
  twist: -0.25,
  thigh: [0.45, -0.35],
  knee: [0.6, 0.35],
  arm: [
    [0.6, 0.35, 0.9],
    [0.9, 0.1, 0.9],
  ],
  sword: [0.1, 0.55, 0.8],
  flip: 0,
  headPitch: -0.15,
};
const LOOKUP: Pose = { ...READY, headPitch: -0.5, lean: 0.02, crouch: 0.06 };
const TUCK: Pose = {
  crouch: 0.42,
  lean: 0.9,
  twist: 0,
  thigh: [1.9, 1.7],
  knee: [2.3, 2.2],
  arm: [
    [1.0, 0.2, 1.6],
    [1.2, 0.1, 1.4],
  ],
  sword: [0, -0.2, -1],
  flip: 0,
  headPitch: 0.4,
};
const CLIMB: Pose = {
  crouch: 0.12,
  lean: 0.55,
  twist: 0,
  thigh: [0.7, -0.4],
  knee: [1.0, 0.6],
  arm: [
    [0.4, 0.6, 0.6],
    [0.3, 0.5, 0.9],
  ],
  sword: [0.3, -0.4, -0.85],
  flip: 0,
  headPitch: -0.3,
};
const OVERHEAD: Pose = {
  crouch: 0.0,
  lean: -0.2,
  twist: 0,
  thigh: [0.6, -0.3],
  knee: [1.4, 0.9],
  arm: [
    [3.0, 0.1, 0.4],
    [2.9, 0.12, 0.4],
  ],
  sword: [0, 0.4, -0.9],
  flip: 0,
  headPitch: -0.3,
};
const STAB: Pose = {
  crouch: 0.32,
  lean: 0.75,
  twist: 0,
  thigh: [1.2, 0.2],
  knee: [1.9, 1.2],
  arm: [
    [1.25, 0.08, 0.15],
    [1.2, 0.08, 0.2],
  ],
  sword: [0, -0.92, 0.38],
  flip: 0,
  headPitch: 0.3,
};
const LAND: Pose = {
  crouch: 0.48,
  lean: 0.7,
  twist: 0.2,
  thigh: [1.5, -0.2],
  knee: [2.2, 1.6],
  arm: [
    [0.9, 0.9, 0.3],
    [0.6, 0.2, 0.5],
  ],
  sword: [0.7, -0.4, -0.6],
  flip: 0,
  headPitch: 0.1,
};
const VICTORY: Pose = {
  crouch: 0.02,
  lean: -0.04,
  twist: 0.15,
  thigh: [0.2, -0.22],
  knee: [0.15, 0.25],
  arm: [
    [0.25, 0.35, 0.6],
    [2.95, 0.2, 0.1],
  ],
  sword: [0.05, 1, 0.12],
  flip: 0,
  headPitch: -0.2,
};

interface HeroState {
  root: V3;
  yaw: number;
  pose: Pose;
  /** world velocity for the cape */
  vel: V3;
  hot: boolean;
  /** surface tilt (climbing the arm): pitch of the support */
  tilt: number;
}

/** Joint positions in world space */
const heroJoints = (h: HeroState) => {
  const p = h.pose;
  const R = mat(h.root[0], h.root[1] - p.crouch, h.root[2], h.yaw, -p.flip, 0);
  const body = mat(0, 0, 0, p.twist, -p.lean, 0);
  const W = (q: V3) => {
    const r = R;
    return [r[0] * q[0] + r[3] * q[1] + r[6] * q[2] + r[9], r[1] * q[0] + r[4] * q[1] + r[7] * q[2] + r[10], r[2] * q[0] + r[5] * q[1] + r[8] * q[2] + r[11]] as V3;
  };
  const B = (q: V3) => {
    const b = body;
    return [b[0] * q[0] + b[3] * q[1] + b[6] * q[2], b[1] * q[0] + b[4] * q[1] + b[7] * q[2], b[2] * q[0] + b[5] * q[1] + b[8] * q[2]] as V3;
  };
  const pelvis: V3 = [0, 0, 0];
  const neck = B([0, 0.56, 0]);
  const headTop = B([0, 0.56 + 0.3, 0.03 + p.headPitch * -0.06]);
  const legs = [1, -1].map((sd, i) => {
    const hip: V3 = [sd * 0.095, -0.05, 0];
    const th = p.thigh[i];
    const kn = p.knee[i];
    const knee = add(hip, mul([sd * 0.02, -Math.cos(th), Math.sin(th)], L_THIGH));
    const ank = add(knee, mul([0, -Math.cos(th - kn), Math.sin(th - kn)], L_SHIN));
    const toe = add(ank, [0, -0.02, 0.12]);
    return { hip, knee, ank, toe };
  });
  const arms = [1, -1].map((sd, i) => {
    const [fa, sp, el] = p.arm[i];
    const sh = B([sd * 0.2, 0.47, 0]);
    const dir = B(norm([sd * Math.sin(sp), -Math.cos(fa) * Math.cos(sp), Math.sin(fa) * Math.cos(sp)]));
    const elb = add(sh, mul(dir, L_UARM));
    const fdir = B(norm([sd * Math.sin(sp) * 0.6, -Math.cos(fa + el) * Math.cos(sp), Math.sin(fa + el) * Math.cos(sp)]));
    const wr = add(elb, mul(fdir, L_FARM));
    return { sh, elb, wr, fdir };
  });
  return {
    R,
    W,
    pelvis: W(pelvis),
    neck: W(neck),
    headTop: W(headTop),
    legs: legs.map((l) => ({ hip: W(l.hip), knee: W(l.knee), ank: W(l.ank), toe: W(l.toe) })),
    arms: arms.map((a) => ({ sh: W(a.sh), elb: W(a.elb), wr: W(a.wr), fdir: a.fdir })),
    right: norm(sub(W([1, 0, 0]), W([0, 0, 0]))),
    sword: norm(sub(W(p.sword), W([0, 0, 0]))),
  };
};

const drawHero = (lp: LowPoly, m: HeroMeshes, h: HeroState, cape: MeshB, bias = 1) => {
  const J = heroJoints(h);
  const x = J.right;
  const o = { layer: 2, bias };
  lp.mesh(m.pelvis, segM(J.pelvis, add(J.pelvis, sub(J.neck, J.pelvis)), x), o);
  lp.mesh(m.torso, segM(J.pelvis, J.neck, x), o);
  lp.mesh(m.head, segM(J.neck, J.headTop, x), o);
  for (const l of J.legs) {
    lp.mesh(m.thigh, segM(l.hip, l.knee, x), o);
    lp.mesh(m.shin, segM(l.knee, l.ank, x), o);
    const fwd = norm(sub(l.toe, l.ank));
    const up = norm(cross(fwd, x));
    lp.mesh(m.boot, new Float64Array([x[0], x[1], x[2], -up[0], -up[1], -up[2], fwd[0], fwd[1], fwd[2], l.ank[0], l.ank[1], l.ank[2]]) as M34, o);
  }
  J.arms.forEach((a, i) => {
    lp.mesh(m.uarm, segM(a.sh, a.elb, x), o);
    lp.mesh(m.farm, segM(a.elb, a.wr, x), o);
    lp.mesh(m.hand, segM(a.wr, add(a.wr, mul(norm(sub(a.wr, a.elb)), 0.1)), x), o);
    if (i === 1) {
      const sw = J.sword;
      const side = norm(cross(sw, add(x, [0, 0.01, 0])));
      lp.mesh(h.hot ? m.swordHot : m.sword, segM(a.wr, add(a.wr, sw), side), { layer: 2, bias: bias + 0.3 });
    }
  });
  // cape: three rows hanging from the shoulders, pushed back by speed and wind
  const bk = norm(sub(J.pelvis, add(J.pelvis, mul(norm(cross(x, sub(J.neck, J.pelvis))), 1))));
  const back: V3 = mul(bk, 1);
  const sh0 = J.arms[0].sh;
  const sh1 = J.arms[1].sh;
  const v = h.vel;
  cape.v.length = 0;
  cape.f.length = 0;
  cape.c.length = 0;
  cape.fl.length = 0;
  const rows = 4;
  const ids: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const k = r / (rows - 1);
    const row: number[] = [];
    for (let cc = 0; cc < 3; cc++) {
      const u = cc / 2;
      const top = lerp3(add(sh0, mul(back, 0.15)), add(sh1, mul(back, 0.15)), u);
      const spread = (u - 0.5) * 0.12 * k;
      const wave = Math.sin(r * 1.7 + cc + v[0] * 0.2) * 0.04 * k;
      const drag = mul(v, -0.06 * k * k);
      const p: V3 = add(add(add(top, [0, -0.78 * k, 0]), mul(back, 0.12 * k + wave)), add(mul(x, spread), drag));
      row.push(cape.vert(p));
    }
    ids.push(row);
  }
  for (let r = 0; r < rows - 1; r++)
    for (let cc = 0; cc < 2; cc++) {
      const col = (r + cc) % 2 ? HERO.cape : mixRGB(HERO.cape, [60, 10, 30], 0.3);
      cape.tri(ids[r][cc], ids[r][cc + 1], ids[r + 1][cc + 1], col, F_TWO);
      cape.tri(ids[r][cc], ids[r + 1][cc + 1], ids[r + 1][cc], col, F_TWO);
    }
  lp.mesh(cape.build(), mat(0, 0, 0), { layer: 2, bias: bias - 0.2 });
  return J;
};

/* ---------- hero choreography ---------- */

const ENTRY0: V3 = [0, 0, 37];
const ENTRY1: V3 = [0, 0, 29.5];
const RUN1: V3 = [0.9, 0, 15.8];
const ROLL1: V3 = [5.2, 0, 14.4];
/** where the fist lands */
const FIST: V3 = [1.4, 1.5, 11.6];

const heroAt = (ta: number, C: ColState): HeroState => {
  let root: V3 = ENTRY0;
  let yaw = Math.PI;
  let pose: Pose = P0;
  let vel: V3 = [0, 0, 0];
  let hot = false;
  let tilt = 0;
  if (ta < 3.6) {
    const k = tween(ta, 0, 3.6, (q) => q * (0.85 + 0.15 * q));
    root = lerp3(ENTRY0, ENTRY1, k);
    pose = gait(ta * 0.95, 0.42, false);
    vel = [0, 0, -2];
  } else if (ta < T_RUN0) {
    // stops, draws, looks up as the floor erupts
    const k = tween(ta, 3.6, 4.3);
    root = ENTRY1;
    pose = mixPose(mixPose(gait(3.6 * 0.95, 0.42, false), READY, k), LOOKUP, tween(ta, 4.6, 5.4));
    root = add(root, [0, 0, tween(ta, 4.8, 5.6) * 0.6]);
  } else if (ta < T_ROLL0) {
    const k = tween(ta, T_RUN0, T_ROLL0, (q) => q * q * (2 - q) * 0.5 + q * 0.5);
    root = lerp3(add(ENTRY1, [0, 0, 0.6]), RUN1, k);
    yaw = Math.PI + Math.atan2(RUN1[0] - ENTRY1[0], -(RUN1[2] - ENTRY1[2])) * -1;
    pose = mixPose(LOOKUP, gait((ta - T_RUN0) * 2.3, 0.95, true), tween(ta, T_RUN0, T_RUN0 + 0.3));
    vel = [0, 0, -9];
  } else if (ta < T_ROLL1 + 0.35) {
    // dodge roll to the right of the slam: turn toward +x and tumble
    const k = tween(ta, T_ROLL0, T_ROLL1, ease.inOutSine);
    root = lerp3(RUN1, ROLL1, k);
    yaw = lerp(Math.PI, Math.PI / 2 + 0.25, tween(ta, T_ROLL0, T_ROLL0 + 0.15));
    const flipK = tween(ta, T_ROLL0 + 0.05, T_ROLL1, ease.inOutSine);
    pose = mixPose(gait((ta - T_RUN0) * 2.3, 0.95, true), TUCK, Math.sin(Math.min(1, flipK * 1.05) * Math.PI) ** 0.6);
    pose.flip = flipK * TAU;
    root = add(root, [0, Math.sin(flipK * Math.PI) * 0.35 + 0.25 * Math.sin(flipK * Math.PI), 0]);
    if (ta > T_ROLL1) {
      const r = tween(ta, T_ROLL1, T_ROLL1 + 0.35);
      pose = mixPose(TUCK, READY, r);
      pose.flip = 0;
      yaw = lerp(Math.PI / 2 + 0.25, Math.PI + 0.6, r);
    }
    vel = [6, 0, -2];
  } else if (ta < T_CLIMB0) {
    root = ROLL1;
    yaw = Math.PI + 0.6;
    const breathe = Math.sin(ta * 3) * 0.02;
    pose = mixPose(READY, LOOKUP, tween(ta, T_LOCK - 0.3, T_LOCK + 0.3) * 0.6);
    pose.crouch += breathe;
    // run to the fist
    const k = tween(ta, T_CLIMB0 - 0.75, T_CLIMB0, ease.inSine);
    if (k > 0) {
      const fistTop = C.climb[0];
      root = lerp3(ROLL1, fistTop, k);
      root[1] = lerp(0, fistTop[1], tween(ta, T_CLIMB0 - 0.3, T_CLIMB0, ease.outSine)) + Math.sin(tween(ta, T_CLIMB0 - 0.3, T_CLIMB0) * Math.PI) * 0.6;
      const d = sub(fistTop, ROLL1);
      yaw = Math.atan2(d[0], d[2]);
      pose = mixPose(pose, gait(ta * 2.4, 0.9, true), clamp(k * 4));
      vel = mul(norm(d), 7);
    }
  } else if (ta < T_CLIMB1) {
    // up the arm: fist, wrist, elbow, shoulder
    const k = tween(ta, T_CLIMB0, T_CLIMB1, (q) => q);
    const pts = C.climb;
    const nseg = pts.length - 1;
    const f = k * nseg;
    const i = Math.min(nseg - 1, Math.floor(f));
    const u = f - i;
    root = lerp3(pts[i], pts[i + 1], u);
    const d = sub(pts[i + 1], pts[i]);
    yaw = Math.atan2(d[0], d[2]);
    tilt = Math.atan2(d[1], Math.hypot(d[0], d[2]));
    pose = mixPose(gait(ta * 2.0, 0.8, true), CLIMB, 0.55);
    pose.lean += tilt * 0.4;
    vel = mul(norm(d), 5);
  } else if (ta < T_STRIKE) {
    // leap from the shoulder into the air above the crystal, sword up, then down
    const top = C.climb[C.climb.length - 1];
    const k = seg(ta, T_CLIMB1, T_STRIKE);
    const wp = C.weak;
    const aim = add(wp, [0, 0.95, 0.15]);
    root = lerp3(top, aim, ease.inOutSine(k));
    root[1] += Math.sin(k * Math.PI) * 2.6;
    const d = sub(wp, top);
    yaw = Math.atan2(d[0], d[2]);
    pose = mixPose(mixPose(CLIMB, OVERHEAD, tween(ta, T_CLIMB1, T_CLIMB1 + 0.35)), STAB, tween(ta, T_STRIKE - 0.22, T_STRIKE, ease.inQuint));
    hot = ta > T_STRIKE - 0.6;
    vel = [0, k < 0.5 ? 6 : -10, 0];
  } else if (ta < T_FALL0) {
    const wp = C.weak;
    root = add(wp, [0, 0.95, 0.15]);
    const d = sub(wp, C.climb[C.climb.length - 1]);
    yaw = Math.atan2(d[0], d[2]);
    pose = STAB;
    hot = true;
  } else {
    // backflip off, fall, superhero landing, rise, victory
    const wp = C.weak;
    const from = add(wp, [0, 0.95, 0.15]);
    const to: V3 = [3.2, 0, 8.2];
    const k = seg(ta, T_FALL0, T_LAND);
    root = lerp3(from, to, ease.inSine(k));
    root[1] = lerp(from[1], 0, k * k) + Math.sin(k * Math.PI) * 1.6;
    yaw = Math.PI * 0.95;
    if (ta < T_LAND) {
      pose = mixPose(STAB, TUCK, tween(ta, T_FALL0, T_FALL0 + 0.3));
      pose.flip = -tween(ta, T_FALL0, T_LAND - 0.2, ease.inOutSine) * TAU;
      pose = mixPose(pose, LAND, tween(ta, T_LAND - 0.25, T_LAND));
      vel = [0, -8, 0];
    } else {
      root = to;
      pose = mixPose(LAND, VICTORY, tween(ta, T_LAND + 0.5, T_VICTORY, ease.inOutCubic));
      yaw = lerp(Math.PI * 0.95, Math.PI * 1.08, tween(ta, T_LAND + 0.5, T_VICTORY));
      vel = [Math.sin(ta * 1.3) * 2 + 2, 0, 1.5];
    }
    hot = ta > T_VICTORY - 0.2;
  }
  void tilt;
  return { root, yaw, pose, vel, hot, tilt };
};

/* ---------- the colossus ---------- */

interface ColMeshes {
  torso: Mesh;
  pelvis: Mesh;
  head: Mesh;
  uarm: Mesh;
  farm: Mesh;
  fist: Mesh;
  thigh: Mesh;
  shin: Mesh;
  foot: Mesh;
  crystal: Mesh;
}

const C_UA = 5.4;
const C_FA = 5.6;
const C_TH = 3.8;
const C_SH = 3.6;

const buildColossus = (): ColMeshes => {
  const rune = (b: MeshB, pts: V3[], w: number, M?: M34) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const c = pts[i + 1];
      b.quad([a[0] - w, a[1], a[2]], [c[0] - w, c[1], c[2]], [c[0] + w, c[1], c[2]], [a[0] + w, a[1], a[2]], EMBER, F_UNLIT | F_TWO, M);
    }
  };
  const torso = new MeshB();
  torso.frustum(6, 2.1, 3.3, 5.0, STONE, undefined, { flat: 0.62, shade: 0.15 });
  torso.frustum(6, 3.3, 2.0, 1.4, STONE_D, mat(0, 5.0, 0), { flat: 0.66 });
  // chest plates and back ridge
  torso.rock(1.9, 31, STONE, mat(1.3, 3.8, 1.2, 0, 0, 0, 1, 0.8, 0.6), { jit: 0.3 });
  torso.rock(1.9, 32, STONE, mat(-1.3, 3.8, 1.2, 0, 0, 0, 1, 0.8, 0.6), { jit: 0.3 });
  torso.rock(1.5, 33, MOSS, mat(0, 5.4, -1.2, 0, 0, 0, 1.6, 0.6, 0.9), { jit: 0.35 });
  for (let k = 0; k < 4; k++) torso.rock(0.8, 40 + k, STONE_D, mat(0, 1.4 + k * 1.2, -2.0, 0, 0, 0, 0.7, 0.8, 1.3), { jit: 0.3 });
  // pauldrons
  torso.rock(2.0, 34, STONE_D, mat(3.5, 5.6, 0, 0, 0, 0, 1, 0.75, 1), { jit: 0.3 });
  torso.rock(2.0, 35, STONE_D, mat(-3.5, 5.6, 0, 0, 0, 0, 1, 0.75, 1), { jit: 0.3 });
  // glowing runes on the belly
  rune(torso, [[-1.2, 1.0, 1.42], [0, 2.2, 1.55], [1.2, 1.0, 1.42]], 0.12);
  rune(torso, [[0, 0.3, 1.36], [0, 2.2, 1.55]], 0.12);
  const pelvis = new MeshB();
  pelvis.rock(2.4, 50, STONE_D, mat(0, 0, 0, 0, 0, 0, 1.15, 0.6, 0.8), { jit: 0.25 });
  pelvis.rock(1.4, 51, MOSS, mat(0, -0.6, 1.4, 0, 0, 0, 1.2, 0.7, 0.5), { jit: 0.3 });
  const head = new MeshB();
  head.rock(1.45, 60, STONE, mat(0, 1.2, 0.2, 0, 0, 0, 1, 1.1, 1.05), { jit: 0.22 });
  head.rock(0.9, 61, STONE_D, mat(0, 0.9, 1.25, 0, 0, 0, 1.3, 0.55, 0.6), { jit: 0.2 }); // jaw
  head.box(2.2, 0.5, 1.2, STONE_D, mat(0, 1.75, 0.65, 0, 0.12, 0)); // brow
  head.rock(0.5, 62, STONE_D, mat(1.2, 2.3, -0.2, 0, 0, -0.6, 0.6, 1.6, 0.6), { jit: 0.2 }); // horns
  head.rock(0.5, 63, STONE_D, mat(-1.2, 2.3, -0.2, 0, 0, 0.6, 0.6, 1.6, 0.6), { jit: 0.2 });
  const uarm = new MeshB().frustum(6, 1.1, 1.25, C_UA, STONE, undefined, { shade: 0.15 });
  uarm.rock(1.0, 70, MOSS, mat(0, C_UA * 0.5, -0.9, 0, 0, 0, 1, 1.3, 0.6), { jit: 0.3 });
  const farm = new MeshB().frustum(6, 1.05, 1.45, C_FA, STONE_D, undefined, { shade: 0.15 });
  rune(farm, [[0, 0.8, 1.32], [0, C_FA - 1, 1.5]], 0.11, mat(0, 0, 0));
  for (let k = 0; k < 3; k++) farm.rock(0.7, 75 + k, STONE, mat(0, 1 + k * 1.6, -1.1, 0, 0, 0, 1.3, 0.9, 0.7), { jit: 0.3 });
  const fist = new MeshB().rock(1.7, 80, STONE, mat(0, 1.2, 0, 0, 0, 0, 1.05, 1, 0.95), { jit: 0.3, sub: true });
  const thigh = new MeshB().frustum(6, 1.4, 1.15, C_TH, STONE_D, undefined, { shade: 0.15 });
  const shin = new MeshB().frustum(6, 1.15, 1.45, C_SH, STONE, undefined, { shade: 0.15 });
  const foot = new MeshB().box(2.4, 1.0, 3.2, STONE_D, mat(0, 0.5, 0.5));
  const crystal = new MeshB();
  const oct: V3[] = [
    [0, 1.2, 0],
    [0.55, 0, 0],
    [0, 0, 0.55],
    [-0.55, 0, 0],
    [0, 0, -0.55],
    [0, -0.5, 0],
  ];
  const fc: [number, number, number][] = [
    [0, 2, 1],
    [0, 3, 2],
    [0, 4, 3],
    [0, 1, 4],
    [5, 1, 2],
    [5, 2, 3],
    [5, 3, 4],
    [5, 4, 1],
  ];
  const ids = oct.map((p) => crystal.vert(p));
  fc.forEach(([a, b, c], i) => crystal.tri(ids[a], ids[b], ids[c], i % 2 ? CYAN : rgb('#c8fcff'), F_UNLIT | F_NOFOG));
  return {
    torso: torso.build(),
    pelvis: pelvis.build(),
    head: head.build(),
    uarm: uarm.build(),
    farm: farm.build(),
    fist: fist.build(),
    thigh: thigh.build(),
    shin: shin.build(),
    foot: foot.build(),
    crystal: crystal.build(),
  };
};

interface ColState {
  parts: { m: keyof ColMeshes; M: M34 }[];
  weak: V3;
  /** climbing path along the slam arm */
  climb: V3[];
  eyes: V3[];
  rise: number;
  lean: number;
  fistP: V3;
}

/** Pose of the colossus at animation time ta */
const colAt = (ta: number): ColState => {
  const rise = lerp(-17, 0, tween(ta, T_RISE0, T_RISE1, (q) => 1 - Math.pow(1 - q, 2.2))) + Math.sin(ta * 9) * 0.06 * seg(ta, T_RISE0, T_RISE1) * (1 - seg(ta, T_RISE1 - 0.3, T_RISE1));
  const breath = Math.sin(ta * 1.4) * 0.12;
  const slamK = tween(ta, T_SLAM - 0.45, T_SLAM, ease.inQuint);
  const wind = tween(ta, T_WIND, T_SLAM - 0.45, ease.inOutCubic);
  const lean = lerp(0.12 - 0.25 * (1 - seg(ta, T_RISE0 + 1.5, T_RISE1)), lerp(0.02, 0.5, slamK), seg(ta, T_WIND, T_SLAM));
  const crouch = lerp(0, 1.6, slamK) + breath * 0.3;
  const yaw = 0.05 + 0.08 * Math.sin(ta * 0.5);
  const pelvisY = 7.4 + rise - crouch - 1.2;
  const R = mat(0, pelvisY, 0, yaw, 0, 0);
  const B = mat(0, 0, 0, 0, -lean, 0);
  const W = (q: V3) => {
    const b = [B[0] * q[0] + B[3] * q[1] + B[6] * q[2], B[1] * q[0] + B[4] * q[1] + B[7] * q[2], B[2] * q[0] + B[5] * q[1] + B[8] * q[2]];
    return [R[0] * b[0] + R[3] * b[1] + R[6] * b[2] + R[9], R[1] * b[0] + R[4] * b[1] + R[7] * b[2] + R[10], R[2] * b[0] + R[5] * b[1] + R[8] * b[2] + R[11]] as V3;
  };
  const Wr = (q: V3) => [R[0] * q[0] + R[3] * q[1] + R[6] * q[2] + R[9], R[1] * q[0] + R[4] * q[1] + R[7] * q[2] + R[10], R[2] * q[0] + R[5] * q[1] + R[8] * q[2] + R[11]] as V3;
  const xr = norm(sub(Wr([1, 0, 0]), Wr([0, 0, 0])));
  const pelvis = Wr([0, 0, 0]);
  const neck = W([0, 6.3, 0.2]);
  const headTop = W([0, 8.4, 0.5]);
  const parts: ColState['parts'] = [];
  parts.push({ m: 'pelvis', M: segM(pelvis, add(pelvis, [0, 1, 0]), xr) });
  parts.push({ m: 'torso', M: segM(W([0, 0.4, 0]), W([0, 1.4, 0]), xr) });
  // head tracks the hero a little
  const look = 0.12 * Math.sin(ta * 0.8);
  parts.push({ m: 'head', M: segM(neck, add(headTop, [look * 3, 0, 0]), xr) });
  // legs: planted feet, knees by IK
  for (const sd of [1, -1]) {
    const hip = Wr([sd * 1.8, -0.6, 0]);
    const foot: V3 = [sd * 2.6 + Math.sin(yaw) * 0, -1.2 + Math.min(0, rise), 0.6];
    const knee = ik(hip, foot, C_TH, C_SH, [0, 0, 1]);
    parts.push({ m: 'thigh', M: segM(hip, knee, xr) });
    parts.push({ m: 'shin', M: segM(knee, foot, xr) });
    parts.push({ m: 'foot', M: segM(foot, add(foot, [0, 1, 0]), xr) });
  }
  // left (+x) arm: idle, wind up overhead, slam down onto the fist mark
  const shL = W([3.6, 5.2, 0]);
  const idleL = W([4.6, -1.0, 2.2]);
  const upL = W([2.6, 13.5, -2.5]);
  let fistL = lerp3(idleL, upL, wind);
  fistL = lerp3(fistL, FIST, slamK);
  if (ta < T_RISE1) fistL = W([4.4, -0.8 + Math.sin(ta) * 0.3, 2.6 + (1 - seg(ta, T_RISE0, T_RISE1)) * 2]);
  const elL = ik(shL, fistL, C_UA, C_FA, add([0.6, 0.2, -1], [0, wind * 1.5, 0]));
  parts.push({ m: 'uarm', M: segM(shL, elL, xr) });
  parts.push({ m: 'farm', M: segM(elL, fistL, xr) });
  const fdir = norm(sub(fistL, elL));
  parts.push({ m: 'fist', M: segM(sub(fistL, mul(fdir, 0.8)), add(fistL, fdir), xr) });
  // right arm hangs and sways
  const shR = W([-3.6, 5.2, 0]);
  const fistR = W([-4.8 - Math.sin(ta * 0.9) * 0.3, -1.4 + slamK * 2, 2.2 + Math.sin(ta * 0.7) * 0.6]);
  const elR = ik(shR, fistR, C_UA, C_FA, [-0.5, 0, -1]);
  parts.push({ m: 'uarm', M: segM(shR, elR, xr) });
  parts.push({ m: 'farm', M: segM(elR, fistR, xr) });
  const fdR = norm(sub(fistR, elR));
  parts.push({ m: 'fist', M: segM(sub(fistR, mul(fdR, 0.8)), add(fistR, fdR), xr) });
  // weak point on top of the left pauldron
  const weak = W([3.4, 6.9, -0.2]);
  // climbing path: on top of the fist, along the forearm and upper arm, onto the pauldron
  const topOff = (p: V3, r: number): V3 => add(p, [0, r, 0]);
  const climb: V3[] = [topOff(FIST, 1.75), topOff(lerp3(FIST, elL, 0.45), 1.35), topOff(elL, 1.3), topOff(lerp3(elL, shL, 0.6), 1.3), topOff(lerp3(shL, weak, 0.5), 1.6)];
  const eyes = [W([0.55, 7.75, 1.75]), W([-0.55, 7.75, 1.75])];
  return { parts, weak, climb, eyes, rise, lean, fistP: fistL };
};

/* ---------- arena ---------- */

const ARENA_R = 34;
const PIT_R = 7.5;

const buildArena = () => {
  const floor = new MeshB();
  const rings = [PIT_R, 10, 14, 19, 25, 30, ARENA_R];
  const rng = mulberry(9);
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    const n = Math.round(r1 * 1.2);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU + i * 0.13;
      const a1 = ((k + 1) / n) * TAU + i * 0.13;
      const p = (r: number, a: number): V3 => [Math.cos(a) * r, 0, Math.sin(a) * r];
      const base = i % 2 ? rgb('#b4a690') : rgb('#a8987e');
      const col = mixRGB(base, rng() < 0.15 ? MOSS : rgb('#6a5a4a'), rng() * 0.25);
      floor.quad(p(r0, a0), p(r0, a1), p(r1, a1), p(r1, a0), col);
    }
    // the glowing ring between the first tiles (the seal border)
    if (i === 0) {
      const n2 = 32;
      for (let k = 0; k < n2; k++) {
        const a0 = (k / n2) * TAU;
        const a1 = ((k + 1) / n2) * TAU;
        const p = (r: number, a: number): V3 => [Math.cos(a) * r, 0.03, Math.sin(a) * r];
        floor.quad(p(PIT_R + 0.9, a0), p(PIT_R + 0.9, a1), p(PIT_R + 1.3, a1), p(PIT_R + 1.3, a0), EMBER, F_UNLIT);
      }
    }
  }
  // the sealed lid (shown until the eruption)
  const seal = new MeshB();
  const ns = 8;
  for (let k = 0; k < ns; k++) {
    const a0 = (k / ns) * TAU;
    const a1 = ((k + 1) / ns) * TAU;
    const p = (r: number, a: number): V3 => [Math.cos(a) * r, 0.02, Math.sin(a) * r];
    seal.quad(p(0.01, a0), p(0.01, a1), p(PIT_R, a1), p(PIT_R, a0), k % 2 ? rgb('#8e8272') : rgb('#9a8e7e'));
    seal.quad(p(1.2, a0 + 0.15), p(1.2, a0 + 0.25), p(PIT_R - 0.6, a0 + 0.22), p(PIT_R - 0.6, a0 + 0.12), EMBER, F_UNLIT);
  }
  // the crater: rim wall and dark bottom
  const pit = new MeshB();
  const np = 20;
  for (let k = 0; k < np; k++) {
    const a0 = (k / np) * TAU;
    const a1 = ((k + 1) / np) * TAU;
    const p = (r: number, y: number, a: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
    pit.quad(p(PIT_R, 0, a0), p(PIT_R - 0.8, -1.3, a0), p(PIT_R - 0.8, -1.3, a1), p(PIT_R, 0, a1), mixRGB(rgb('#3a2a24'), EMBER, k % 3 ? 0.05 : 0.3));
    pit.quad(p(PIT_R - 0.8, -1.3, a0), p(0.01, -1.3, a0), p(0.01, -1.3, a1), p(PIT_R - 0.8, -1.3, a1), rgb('#2a1c1a'));
  }
  // walls, tiers, pillars, gate
  const wall = new MeshB();
  const nw = 40;
  const gateA = Math.PI / 2;
  for (let k = 0; k < nw; k++) {
    const a0 = (k / nw) * TAU;
    const a1 = ((k + 1) / nw) * TAU;
    const am = (a0 + a1) / 2;
    if (Math.abs(am - gateA) < 0.12) continue;
    const p = (r: number, y: number, a: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
    const col = mixRGB(STONE_D, rgb('#5a5048'), (k % 3) * 0.15);
    wall.quad(p(ARENA_R, 0, a0), p(ARENA_R, 0, a1), p(ARENA_R, 5, a1), p(ARENA_R, 5, a0), col, F_TWO);
    wall.quad(p(ARENA_R, 5, a0), p(ARENA_R, 5, a1), p(ARENA_R + 3, 5, a1), p(ARENA_R + 3, 5, a0), STONE, F_TWO);
    wall.quad(p(ARENA_R + 3, 5, a0), p(ARENA_R + 3, 5, a1), p(ARENA_R + 3, 9, a1), p(ARENA_R + 3, 9, a0), mixRGB(col, [0, 0, 0], 0.1), F_TWO);
    wall.quad(p(ARENA_R + 3, 9, a0), p(ARENA_R + 3, 9, a1), p(ARENA_R + 6, 9, a1), p(ARENA_R + 6, 9, a0), STONE, F_TWO);
    wall.quad(p(ARENA_R + 6, 9, a0), p(ARENA_R + 6, 9, a1), p(ARENA_R + 6, 13 + (k % 4 === 0 ? -3 : 0), a1), p(ARENA_R + 6, 13 + (k % 4 === 0 ? -3 : 0), a0), mixRGB(col, [0, 0, 0], 0.2), F_TWO);
  }
  const braziers: V3[] = [];
  const np2 = 12;
  for (let k = 0; k < np2; k++) {
    const a = (k / np2) * TAU + TAU / 24;
    if (Math.abs(a - gateA) < 0.3) continue;
    const r = ARENA_R - 2;
    const broken = k % 4 === 1;
    const h = broken ? 6 + (k % 3) : 13;
    wall.frustum(6, 1.1, 0.9, h, STONE, mat(Math.cos(a) * r, 0, Math.sin(a) * r, a), { shade: 0.2 });
    wall.box(2.6, 0.8, 2.6, STONE_D, mat(Math.cos(a) * r, 0.4, Math.sin(a) * r, a));
    if (broken) wall.rock(1.2, 200 + k, STONE_D, mat(Math.cos(a) * (r - 2), 0.6, Math.sin(a) * (r - 2), k), { sy: 0.6 });
    else {
      wall.box(2.4, 0.6, 2.4, STONE_D, mat(Math.cos(a) * r, h + 0.3, Math.sin(a) * r, a));
      wall.frustum(6, 0.9, 1.3, 0.8, '#3a2a24', mat(Math.cos(a) * r, h + 0.6, Math.sin(a) * r));
      braziers.push([Math.cos(a) * r, h + 1.6, Math.sin(a) * r]);
    }
  }
  // gate arch
  for (const sd of [-1, 1]) {
    const a = gateA + sd * 0.13;
    wall.box(2.4, 12, 3, STONE_D, mat(Math.cos(a) * ARENA_R, 6, Math.sin(a) * ARENA_R, -a + Math.PI / 2));
  }
  wall.box(11, 2.2, 3.2, STONE, mat(0, 12.6, ARENA_R, 0));
  wall.rock(1.6, 300, EMBER, mat(0, 12.6, ARENA_R - 1.7, 0, 0, 0, 1, 1, 0.3), { flags: F_UNLIT, jit: 0.1 });
  // corridor outside the gate
  const out = new MeshB();
  for (let k = 0; k < 6; k++) out.quad([-4, 0, ARENA_R + k * 6], [-4, 0, ARENA_R + 6 + k * 6], [4, 0, ARENA_R + 6 + k * 6], [4, 0, ARENA_R + k * 6], k % 2 ? rgb('#a8987e') : rgb('#9a8a72'));
  // the plain around the arena
  for (let j = -5; j < 5; j++)
    for (let i = -5; i < 5; i++) {
      const x0 = i * 70;
      const z0 = j * 70;
      if (Math.abs(x0 + 35) < 50 && Math.abs(z0 + 35) < 50) continue;
      const col = mixRGB(rgb('#8e8068'), rgb('#6e7a56'), hash(i * 13 + j * 7) * 0.5);
      out.quad([x0, -0.05, z0], [x0, -0.05, z0 + 70], [x0 + 70, -0.05, z0 + 70], [x0 + 70, -0.05, z0], col);
    }
  // mountains far away, pre-hazed silhouettes
  const mtn = new MeshB();
  const rm = mulberry(31);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + rm() * 0.3;
    const d = 280 + rm() * 60;
    const s = 22 + rm() * 26;
    const col = mixRGB(rgb('#2e4450'), FOG, 0.2 + rm() * 0.3);
    mtn.rock(1, 400 + k, col, mat(Math.cos(a) * d, -s * 0.2, Math.sin(a) * d, rm() * 3, 0, 0, s, s * (0.6 + rm() * 0.5), s), { flags: F_NOFOG | F_UNLIT, jit: 0.45, vary: 0.2 });
  }
  return { floor: floor.build(), seal: seal.build(), pit: pit.build(), wall: wall.build(), out: out.build(), mtn: mtn.build(), braziers };
};

/* ---------- shards ---------- */

interface Shards {
  local: Float32Array;
  cen: Float32Array;
  nrm: Float32Array;
  mesh: Mesh;
  /** per shard: delay, spin axis (3), spin speed, float (0/1), vx, vz */
  prm: Float32Array;
}

const buildShards = (cm: ColMeshes): Shards => {
  const C = colAt(T_STRIKE);
  const all = new MeshB();
  for (const p of C.parts) {
    const m = cm[p.m];
    const b = new MeshB();
    b.v = Array.from(m.v);
    b.f = Array.from(m.f);
    b.c = Array.from(m.c);
    b.fl = Array.from(m.fl);
    all.merge(b, p.M);
  }
  const sh = shardsOf(all.build());
  const nf = sh.cen.length / 3;
  const prm = new Float32Array(nf * 8);
  const rng = mulberry(1234);
  for (let i = 0; i < nf; i++) {
    const c: V3 = [sh.cen[i * 3], sh.cen[i * 3 + 1], sh.cen[i * 3 + 2]];
    const d = len(sub(c, C.weak));
    const ax = norm([rng() - 0.5, rng() - 0.5, rng() - 0.5]);
    prm.set([d / 22 + rng() * 0.15, ax[0], ax[1], ax[2], 2 + rng() * 6, rng() < 0.28 ? 1 : 0, (rng() - 0.5) * 4, (rng() - 0.5) * 4], i * 8);
  }
  return { ...sh, prm };
};

/** Update shard vertices for time since the crumble began */
const updateShards = (S: Shards, tc: number, eye: V3) => {
  const nf = S.cen.length / 3;
  const v = S.mesh.v;
  const fl = S.mesh.fl;
  const col = S.mesh.c;
  let alive = 0;
  for (let i = 0; i < nf; i++) {
    const o = i * 8;
    const tau = tc - S.prm[o];
    const cx = S.cen[i * 3];
    const cy = S.cen[i * 3 + 1];
    const cz = S.cen[i * 3 + 2];
    let px = cx;
    let py = cy;
    let pz = cz;
    let ang = 0;
    let sc = 1;
    if (tau > 0) {
      const nx = S.nrm[i * 3];
      const ny = S.nrm[i * 3 + 1];
      const nz = S.nrm[i * 3 + 2];
      if (S.prm[o + 5] > 0) {
        // glowing fragments drift up and away
        const k = 1 - Math.exp(-tau * 1.5);
        px = cx + nx * 2.2 * k + S.prm[o + 6] * tau * 0.35;
        py = cy + ny * 2 * k + tau * 1.6;
        pz = cz + nz * 2.2 * k + S.prm[o + 7] * tau * 0.35;
        ang = tau * S.prm[o + 4] * 0.4;
        sc = Math.max(0, 1 - tau / 6);
      } else {
        // the rest falls as rubble and settles
        const out = 1.2 + S.prm[o + 4] * 0.25;
        px = cx + (nx * out + S.prm[o + 6]) * Math.min(tau, 1.4);
        pz = cz + (nz * out + S.prm[o + 7]) * Math.min(tau, 1.4);
        const fall = cy + ny * 2 * tau - 4.9 * tau * tau;
        py = Math.max(0.15 + (i % 5) * 0.08, fall);
        ang = Math.min(tau, 1.4) * S.prm[o + 4];
        sc = py < 0.4 ? 0.7 : 1;
      }
      const de = Math.hypot(px - eye[0], py - eye[1], pz - eye[2]);
      sc *= clamp((de - 2) / 4);
    }
    const ax: V3 = [S.prm[o + 1], S.prm[o + 2], S.prm[o + 3]];
    for (let k = 0; k < 3; k++) {
      const j = i * 9 + k * 3;
      let q: V3 = [S.local[j] * sc, S.local[j + 1] * sc, S.local[j + 2] * sc];
      if (ang) q = rotAxis(q, ax, ang);
      v[j] = px + q[0];
      v[j + 1] = py + q[1];
      v[j + 2] = pz + q[2];
    }
    if (S.prm[o + 5] > 0 && tau > 0) {
      fl[i] = F_UNLIT;
      const g = clamp(tau * 1.2);
      col[i * 3] = lerp(STONE[0], CYAN[0], g);
      col[i * 3 + 1] = lerp(STONE[1], CYAN[1], g);
      col[i * 3 + 2] = lerp(STONE[2], CYAN[2], g);
    }
    if (sc > 0) alive++;
  }
  bounds(S.mesh);
  return alive;
};

/* ---------- camera: one take ---------- */

type CamFn = (t: number) => Cam;

const blendCam = (a: Cam, b: Cam, k: number): Cam => ({
  eye: lerp3(a.eye, b.eye, k),
  at: lerp3(a.at, b.at, k),
  fov: lerp(a.fov, b.fov, k),
  roll: lerp(a.roll ?? 0, b.roll ?? 0, k),
});

interface State {
  lp: LowPoly;
  hero: HeroMeshes;
  col: ColMeshes;
  arena: ReturnType<typeof buildArena>;
  shards: Shards;
  cape: MeshB;
  shardFresh: Float32Array;
  shardCol: Float32Array;
  shardFl: Uint8Array;
}

const ENV = (): Env => ({
  fog: FOG,
  fogNear: 45,
  fogFar: 240,
  sun: norm([-0.55, 0.62, 0.55]),
  sunCol: rgb('#ffd6a0'),
  amb: rgb('#4a5a6a'),
  hemi: 0.4,
  snap: 1,
});

const camAt = (t: number, H: HeroState, C: ColState): Cam => {
  const hp = add(H.root, [0, 1.0, 0]);
  const shake = (amp: number, f = 21): V3 => [noise1(t * f, 1) * amp, noise1(t * f, 2) * amp, noise1(t * f, 3) * amp];
  // 1: crane down from above the gate onto the hero's back
  const c1: CamFn = (tt) => {
    const k = tween(tt, 0, 3.4, ease.inOutCubic);
    const hi: Cam = { eye: [8, 24, 84], at: [0, 6, 12], fov: 50 };
    const lo: Cam = { eye: add(hp, [1.3, 0.7, 4.2]), at: add(hp, [-0.4, 0.9, -8]), fov: 52 };
    return blendCam(hi, lo, k);
  };
  // 2: the rise: slide down and back to a worm's eye behind the hero, tilting up
  const c2: CamFn = (tt) => {
    const k = tween(tt, 3.2, 6.0, ease.inOutSine);
    const eye: V3 = lerp3(add(hp, [1.3, 0.7, 4.2]), [-2.6, 0.55, 32.4], k);
    const tgt: V3 = lerp3(add(hp, [-0.4, 0.9, -8]), [0, 9 + C.rise * 0.3, 0], k);
    return { eye, at: tgt, fov: lerp(52, 56, k), roll: -0.04 * k };
  };
  // 3: orbit to the side for the charge, the slam and the roll
  const c3: CamFn = (tt) => {
    const k = tween(tt, 5.9, 7.6, ease.inOutSine);
    const a = lerp(Math.atan2(32.4, -2.6), Math.PI * 0.93, k);
    const r = lerp(Math.hypot(32.4, 2.6), 9, k);
    const eye: V3 = [Math.cos(a) * r + lerp(0, 1.5, k), lerp(0.55, 2.4, k), Math.sin(a) * r + lerp(0, 16.5, k)];
    const tgt: V3 = lerp3([0, 9 + C.rise * 0.3, 0], lerp3(hp, [2.5, 4.5, 11], 0.45), k);
    return { eye, at: tgt, fov: lerp(56, 58, k), roll: 0 };
  };
  // 4: over the hero's shoulder, looking up at the weak point (lock-on)
  const c4: CamFn = (tt) => {
    const k = tween(tt, 8.0, 9.4, ease.inOutSine);
    const bk = norm(sub(hp, C.weak));
    const flat = norm([bk[0], 0, bk[2]]);
    const side: V3 = [-flat[2], 0, flat[0]];
    const eye = add(add(hp, mul(flat, lerp(4.5, 3.2, k))), add(mul(side, -1.5), [0, 0.7, 0]));
    const tgt = lerp3(lerp3(hp, C.weak, 0.4), lerp3(hp, C.weak, 0.55), k);
    return { eye, at: tgt, fov: lerp(56, 58, k), roll: 0.03 };
  };
  // 5: tracking the climb from the side of the arm
  const c5: CamFn = (tt) => {
    void tt;
    const fwd = norm(sub(C.climb[C.climb.length - 1], C.climb[0]));
    const fl = norm([fwd[0], 0, fwd[2]]);
    const side: V3 = [fl[2], 0, -fl[0]];
    const eye = add(add(hp, mul(side, -6.5)), add(mul(fl, -2.5), [0, 1.2, 0]));
    return { eye, at: add(hp, mul(fl, 1.5)), fov: 54, roll: -0.05 };
  };
  // 6: the leap and strike: rise with the hero, close on the crystal
  const c6: CamFn = (tt) => {
    const k = tween(tt, T_CLIMB1, T_STRIKE, ease.inOutSine);
    const w = C.weak;
    const eye = lerp3(add(w, [-10, 2.5, 8]), add(w, [-5.4, 1.7, 4.4]), k);
    const tgt = lerp3(add(w, [0, 3.0, 0]), add(w, [0, 1.0, 0]), k);
    return { eye, at: tgt, fov: lerp(56, 44, k), roll: lerp(-0.05, 0.08, k) };
  };
  // 7: pull out wide as it crumbles, the hero dropping to the floor
  const c7: CamFn = (tt) => {
    const k = tween(tt, T_STRIKE + HITSTOP, 17.3, ease.inOutCubic);
    const w = C.weak;
    const eye = lerp3(add(w, [-5.4, 1.7, 4.4]), [-14, 4.2, 22], k);
    const tgt = lerp3(add(w, [0, 1.0, 0]), [1.5, 5.5, 4], k);
    return { eye, at: tgt, fov: lerp(44, 52, k), roll: lerp(0.08, 0, k) };
  };
  // 8: the poster: low and close in front of the hero, sword to the sky, the ruin behind
  const c8: CamFn = (tt) => {
    const k = tween(tt, 16.8, 18.6, ease.inOutCubic);
    const drift = (tt - 16.8) * 0.06;
    const eye = lerp3([-14, 4.2, 22], [3.2 - 0.3 + drift, 0.4, 8.2 + 3.4 - drift * 2], k);
    const tgt = lerp3([1.5, 5.5, 4], [3.2 - 1.1, 2.7, 8.2 - 5], k);
    return { eye, at: tgt, fov: lerp(52, 58, k), roll: lerp(0, -0.04, k) };
  };
  const chain: [number, number, CamFn][] = [
    [0, 3.1, c1],
    [3.1, 3.4, c2],
    [5.9, 6.2, c3],
    [7.75, 8.3, c4],
    [T_CLIMB0 - 0.3, T_CLIMB0 + 0.4, c5],
    [T_CLIMB1 - 0.2, T_CLIMB1 + 0.3, c6],
    [T_STRIKE + HITSTOP, T_STRIKE + HITSTOP + 0.01, c7],
    [16.8, 16.85, c8],
  ];
  let cam = chain[0][2](t);
  for (let i = 1; i < chain.length; i++) {
    const [a, b, fn] = chain[i];
    if (t < a) break;
    cam = blendCam(cam, fn(t), tween(t, a, b, ease.inOutSine));
  }
  // impacts
  const kick = (t0: number, amp: number, dec = 5) => (t > t0 ? Math.exp(-(t - t0) * dec) * amp : 0);
  const sh = kick(T_SLAM, 0.9) + kick(5.4, 0.35, 2) + (t > T_RISE0 && t < T_RISE1 ? 0.12 : 0) + kick(T_LAND, 0.4, 7) + kick(T_STRIKE + HITSTOP, 0.5, 4);
  if (sh > 0.005) {
    cam.eye = add(cam.eye, shake(sh));
    cam.at = add(cam.at, shake(sh * 0.6, 27));
  }
  // hit-stop punch-in
  if (t >= T_STRIKE && t < T_STRIKE + HITSTOP) cam.fov *= 1 - 0.18 * Math.sin(seg(t, T_STRIKE, T_STRIKE + HITSTOP) * Math.PI);
  return cam;
};

/* ---------- film ---------- */

export const lowpolyBossArenaFilm: RisoFilm<State> = {
  id: 'lowpoly-boss-arena',
  title: 'Boss Arena',
  caption: 'One unbroken take: a lone swordsman, a stone colossus rising from the arena floor, a roll, a climb, one strike at the glowing heart, and the giant falls apart into polygons.',
  theme: 'Video game',
  category: 'Video game',
  motif: 'the glowing cyan weak point',
  series: 'Low poly',
  mode: 'direct',
  duration: 20,
  paper: '#0c1a26',
  grain: 0,
  inks: [{ color: '#7af4ff' }, { color: '#ffa040' }, { color: '#a8998a' }, { color: '#c4323c' }, { color: '#1e3a4a' }],
  scenes: [
    { at: 0, label: 'The arena' },
    { at: T_RISE0, label: 'It rises' },
    { at: T_RUN0, label: 'Slam & roll' },
    { at: T_LOCK, label: 'Lock-on' },
    { at: T_CLIMB0, label: 'The climb' },
    { at: T_STRIKE, label: 'Strike' },
    { at: T_LAND, label: 'Crumble' },
  ],
  posterTime: 19.2,

  setup() {
    const col = buildColossus();
    const shards = buildShards(col);
    return {
      lp: new LowPoly(),
      hero: buildHero(),
      col,
      arena: buildArena(),
      shards,
      cape: new MeshB(),
      shardFresh: shards.mesh.v.slice(),
      shardCol: shards.mesh.c.slice(),
      shardFl: shards.mesh.fl.slice(),
    };
  },

  draw(r, t, s) {
    const c = r.layers[0];
    r.camera(800, 450, 1);
    const ta = anim(t);
    const C = colAt(Math.min(ta, T_STRIKE));
    const H = heroAt(ta, C);
    const cam = camAt(t, H, C);
    const lp = s.lp;
    lp.far = 600;
    const env = ENV();
    lp.begin(cam, env);
    lp.sky(SKY, { dir: norm([0.25, 0.1, -1]), col: rgb('#fff0d0'), size: 0.06, glow: rgb('#ffb070'), glowPow: 10, glowAmt: 0.7 });
    const A = s.arena;
    lp.mesh(A.mtn, mat(0, 0, 0), { layer: 0, bias: -1000 });
    lp.mesh(A.out, mat(0, 0, 0), { layer: 0 });
    lp.mesh(A.floor, mat(0, 0, 0), { layer: 0 });
    // the seal: glows, cracks, then drops away into the crater
    const open = ta > T_RISE0 + 0.15;
    if (!open) {
      const g = tween(ta, 1.2, T_RISE0, ease.inCubic);
      lp.mesh(A.seal, mat(0, Math.sin(ta * 40) * 0.05 * g, 0), { layer: 0, bias: 1, glow: [g * 80, g * 40, 0] });
    } else lp.mesh(A.pit, mat(0, 0, 0), { layer: 0, bias: -2 });
    lp.mesh(A.wall, mat(0, 0, 0), { layer: 1 });
    // braziers
    for (let i = 0; i < A.braziers.length; i++) {
      const b = A.braziers[i];
      for (let k = 0; k < 3; k++) {
        const fl = noise1(t * 6 + i * 3 + k, k);
        lp.sprite(add(b, [0, k * 0.7 + fl * 0.2, 0]), 1.1 - k * 0.3 + fl * 0.15, k ? rgb('#ffd060') : EMBER, { flags: F_ADD | F_UNLIT, alpha: 0.8 - k * 0.2, sides: 5, rot: t * 3 + k, layer: 1, bias: 0.5 });
      }
    }
    // the colossus, or its shards
    const crumble = t > T_STRIKE + HITSTOP;
    const tc = t - (T_STRIKE + HITSTOP);
    if (!crumble) {
      for (const p of C.parts) lp.mesh(s.col[p.m], p.M, { layer: 2, clipY: -1.25 });
      // eyes ignite on the roar
      const eg = tween(ta, 5.2, 5.5);
      if (eg > 0) for (const e of C.eyes) lp.sprite(e, 0.35 * eg + 0.05 * Math.sin(t * 20), EMBER, { flags: F_ADD | F_UNLIT, alpha: 1, sides: 5, layer: 2, bias: 4 });
    } else {
      s.shards.mesh.c.set(s.shardCol);
      s.shards.mesh.fl.set(s.shardFl);
      updateShards(s.shards, tc, cam.eye);
      lp.mesh(s.shards.mesh, mat(0, 0, 0), { layer: 2, clipY: -1.25 });
    }
    // weak point
    if (ta > T_RISE1 - 0.5 && !crumble) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      const lock = tween(ta, T_LOCK, T_LOCK + 0.4);
      const sc = 1 + pulse * 0.12 + lock * 0.1;
      lp.mesh(s.col.crystal, mat(C.weak[0], C.weak[1], C.weak[2], t * 0.8, 0, 0, sc), { layer: 2, bias: 3 });
      lp.sprite(add(C.weak, [0, 0.4, 0]), 0.9 + pulse * 0.3, CYAN, { flags: F_ADD | F_UNLIT | F_NOFOG, alpha: 0.25 + lock * 0.15, sides: 8, layer: 2, bias: 5 });
    }
    // eruption debris and dust
    if (ta > T_RISE0 - 0.1 && ta < T_RISE1 + 1.5) {
      const k0 = ta - T_RISE0;
      for (let i = 0; i < 26; i++) {
        const a = i * 2.39996;
        const st = (i % 7) * 0.32;
        const age = k0 - st;
        if (age < 0 || age > 2.2) continue;
        const rr = PIT_R * (0.7 + (i % 3) * 0.12) + age * 2.2;
        const y = Math.max(0.2, age * 9 - 9 * age * age * 0.9);
        lp.sprite([Math.cos(a) * rr, y, Math.sin(a) * rr], 0.5 + (i % 4) * 0.2, i % 2 ? STONE : STONE_D, { flags: 0 | F_UNLIT, sides: 4, rot: age * 6 + i, layer: 2 });
        lp.sprite([Math.cos(a + 0.3) * (rr + 1), 1 + age * 2.2, Math.sin(a + 0.3) * (rr + 1)], 1.5 + age * 2.4, rgb('#c8b8a4'), { flags: F_ALPHA | F_UNLIT, alpha: 0.45 * (1 - age / 2.2), sides: 7, layer: 2, bias: -1 });
      }
    }
    // the slam: shockwave ring and dust
    if (ta > T_SLAM && ta < T_SLAM + 1.4) {
      const age = ta - T_SLAM;
      const rr = 2 + age * 14;
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        lp.sprite([FIST[0] + Math.cos(a) * rr, 0.5 + age, FIST[2] + Math.sin(a) * rr], 1.2 + age * 1.8, rgb('#d8c8b4'), { flags: F_ALPHA | F_UNLIT, alpha: 0.6 * (1 - age / 1.4), sides: 6, rot: i, layer: 2, bias: -1 });
      }
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4;
        const sp = 4 + (i % 4) * 2;
        lp.sprite([FIST[0] + Math.cos(a) * sp * age, Math.max(0.2, 7 * age - 9 * age * age), FIST[2] + Math.sin(a) * sp * age], 0.35, STONE_D, { flags: F_UNLIT, sides: 4, rot: i + age * 8, layer: 2 });
      }
    }
    // hero
    s.cape.v.length = 0;
    const J = drawHero(lp, s.hero, H, s.cape, ta > T_CLIMB0 - 0.3 && ta < T_LAND ? 2.5 : 1);
    // sword glow trail when charged
    if (H.hot) {
      const tip = add(J.arms[1].wr, mul(J.sword, 1.1));
      lp.sprite(tip, 0.16 + 0.04 * Math.sin(t * 30), CYAN, { flags: F_ADD | F_UNLIT | F_NOFOG, alpha: 0.9, sides: 6, layer: 2, bias: 6 });
    }
    // hero blob shadow
    if (H.root[1] < 0.5 || ta > T_LAND) {
      const sh = new MeshB();
      sh.poly(
        Array.from({ length: 8 }, (_, i) => {
          const a = -(i / 8) * TAU;
          return [H.root[0] + Math.cos(a) * 0.5, 0.03, H.root[2] + Math.sin(a) * 0.5] as V3;
        }),
        '#1a1418',
        F_UNLIT | F_ALPHA,
      );
      lp.mesh(sh.build(), mat(0, 0, 0), { layer: 0, bias: 2, alpha: 0.5 });
    }
    // final: motes of light rising
    if (crumble) {
      for (let i = 0; i < 30; i++) {
        const ph = hash(i) * 5;
        const age = (tc * 0.5 + ph) % 5;
        const a = hash(i + 9) * TAU;
        const rr = 2 + hash(i + 3) * 9;
        lp.sprite([Math.cos(a) * rr + 1.5, 0.5 + age * 2.4, Math.sin(a) * rr + 4], 0.12 + hash(i + 5) * 0.12, i % 3 ? CYAN : EMBER, { flags: F_ADD | F_UNLIT | F_NOFOG, alpha: Math.sin((age / 5) * Math.PI) * clamp(tc), sides: 4, rot: t + i, layer: 2, bias: 2 });
      }
    }
    lp.flush();
    // impact frame and flash
    if (t >= T_STRIKE && t < T_STRIKE + 0.1) lp.impact(rgb('#f4fcff'), rgb('#0c1a26'), 120);
    else if (t >= T_STRIKE + 0.1 && t < T_STRIKE + HITSTOP) lp.impact(rgb('#0c1a26'), rgb('#9af6ff'), 110);
    else if (t >= T_STRIKE + HITSTOP) lp.wash(rgb('#e8fcff'), 0.8 * Math.exp(-(t - T_STRIKE - HITSTOP) * 3.5));
    if (ta > T_SLAM && ta < T_SLAM + 0.08) lp.wash(rgb('#ffe8c8'), 0.5);
    lp.blit(c);
    drawHud(c, t, ta, s, C, H, cam);
    crt(c, 0.85);
  },
};

/* ---------- HUD ---------- */

function drawHud(c: Ctx, t: number, ta: number, s: State, C: ColState, H: HeroState, cam: Cam) {
  void H;
  void cam;
  const lp = s.lp;
  const crumble = t > T_STRIKE + HITSTOP;
  // boss intro card
  if (ta > 4.7 && ta < 7.0) {
    const k = tween(ta, 4.7, 5.2, ease.outCubic);
    const out = tween(ta, 6.6, 7.0);
    c.save();
    c.globalAlpha = 1 - out;
    c.fillStyle = 'rgba(8,16,24,0.55)';
    c.fillRect(0, 610, 1600 * k, 120);
    c.fillStyle = '#ffa040';
    c.fillRect(0, 610, 1600 * k, 3);
    c.fillRect(1600 * (1 - k), 727, 1600 * k, 3);
    hud(c, 'WARDEN OF THE HOLLOW RING', 800 + (1 - k) * 200, 668, 30, { align: 'center', fill: '#ffd8a0', italic: false, spacing: 8, sw: 5, font: MONO, weight: 700 });
    hud(c, 'THE STONE COLOSSUS', 800 - (1 - k) * 200, 712, 50, { align: 'center', fill: ['#ffffff', '#c8d8e0'], italic: false, spacing: 10, sw: 8 });
    c.restore();
  }
  // boss health
  if (ta > 6.4 && t < 17.2) {
    const k = tween(ta, 6.4, 6.9, ease.outCubic);
    const fade = 1 - tween(t, 16.6, 17.2);
    let hp = 1;
    if (t > T_STRIKE) hp = lerp(1, 0, tween(t, T_STRIKE + 0.05, T_STRIKE + 1.4, ease.outCubic));
    const lag = t > T_STRIKE ? lerp(1, 0, tween(t, T_STRIKE + 0.6, T_STRIKE + 2.4, ease.inOutCubic)) : 1;
    c.save();
    c.globalAlpha = fade;
    const x = 400;
    const w = 800 * k;
    const y = 828;
    hud(c, 'STONE COLOSSUS', x, y - 16, 24, { fill: '#ffffff', italic: false, spacing: 4, sw: 5 });
    c.fillStyle = 'rgba(8,10,16,0.75)';
    c.fillRect(x - 4, y - 4, w + 8, 26);
    c.fillStyle = '#e8d8b0';
    c.fillRect(x, y, w * lag, 18);
    c.fillStyle = '#c4323c';
    c.fillRect(x, y, w * hp, 18);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(x, y, w * hp, 5);
    c.restore();
  }
  // hero vitals
  if (ta > 2.5 && t < 17.4) {
    const k = tween(ta, 2.5, 3.0) * (1 - tween(t, 16.8, 17.4));
    c.save();
    c.globalAlpha = k;
    for (let i = 0; i < 5; i++) {
      const lost = i === 4 && ta > T_SLAM + 0.1 ? 1 : 0;
      const x = 70 + i * 46;
      c.fillStyle = 'rgba(8,10,16,0.7)';
      c.beginPath();
      c.moveTo(x, 62);
      c.lineTo(x + 18, 44);
      c.lineTo(x + 36, 62);
      c.lineTo(x + 18, 80);
      c.closePath();
      c.fill();
      c.fillStyle = lost ? '#3a2a30' : '#c4323c';
      c.beginPath();
      c.moveTo(x + 5, 62);
      c.lineTo(x + 18, 49);
      c.lineTo(x + 31, 62);
      c.lineTo(x + 18, 75);
      c.closePath();
      c.fill();
    }
    // stamina
    const st = ta > T_ROLL0 && ta < T_ROLL1 + 1.5 ? lerp(0.45, 1, seg(ta, T_ROLL1, T_ROLL1 + 1.5)) : ta > T_CLIMB0 && ta < T_STRIKE ? 1 - seg(ta, T_CLIMB0, T_STRIKE) * 0.7 : 1;
    c.fillStyle = 'rgba(8,10,16,0.7)';
    c.fillRect(66, 92, 228, 14);
    c.fillStyle = '#6ad86a';
    c.fillRect(70, 95, 220 * st, 8);
    c.restore();
  }
  // lock-on reticle on the weak point
  if (ta > T_LOCK && !crumble) {
    const p = lp.project(C.weak);
    if (p) {
      const x = (p[0] * 1600) / RW;
      const y = (p[1] * 1600) / RW;
      const k = tween(ta, T_LOCK, T_LOCK + 0.35, ease.outBack);
      const rr = lerp(140, 46, k) + Math.sin(t * 8) * 3;
      c.save();
      c.translate(x, y);
      c.rotate(t * 1.2);
      c.strokeStyle = '#ff5a4a';
      c.lineWidth = 5;
      c.shadowColor = 'rgba(0,0,0,0.6)';
      c.shadowBlur = 6;
      for (let i = 0; i < 4; i++) {
        c.rotate(Math.PI / 2);
        c.beginPath();
        c.moveTo(rr, -rr * 0.35);
        c.lineTo(rr, -rr);
        c.lineTo(rr * 0.35, -rr);
        c.stroke();
      }
      c.rotate(-t * 2.4);
      c.fillStyle = '#ff5a4a';
      for (let i = 0; i < 3; i++) {
        c.rotate(TAU / 3);
        c.beginPath();
        c.moveTo(0, -rr * 0.55);
        c.lineTo(-9, -rr * 0.55 - 16);
        c.lineTo(9, -rr * 0.55 - 16);
        c.closePath();
        c.fill();
      }
      c.restore();
      if (ta < T_LOCK + 1.4) hud(c, 'WEAK POINT', x + 70, y - 50, 26, { fill: '#ffffff', italic: false, spacing: 3, sw: 5, alpha: tween(ta, T_LOCK + 0.2, T_LOCK + 0.4) });
    }
  }
  // button prompt for the climb
  if (ta > T_CLIMB0 - 0.9 && ta < T_CLIMB0 + 0.9) {
    const a = tween(ta, T_CLIMB0 - 0.9, T_CLIMB0 - 0.6) * (1 - tween(ta, T_CLIMB0 + 0.5, T_CLIMB0 + 0.9));
    c.save();
    c.globalAlpha = a;
    c.fillStyle = 'rgba(8,10,16,0.7)';
    c.beginPath();
    c.arc(1250, 760, 30, 0, TAU);
    c.fill();
    c.strokeStyle = '#7af4ff';
    c.lineWidth = 4;
    c.stroke();
    c.restore();
    hud(c, '▲', 1250, 772, 30, { align: 'center', fill: '#7af4ff', italic: false, sw: 3, alpha: a });
    hud(c, 'CLIMB', 1296, 772, 32, { fill: '#ffffff', italic: false, spacing: 3, sw: 5, alpha: a });
  }
  // the strike word
  if (t > T_STRIKE + 0.02 && t < T_STRIKE + 1.5) {
    const k = tween(t, T_STRIKE + 0.02, T_STRIKE + 0.25, ease.outBack);
    const out = tween(t, T_STRIKE + 1.1, T_STRIKE + 1.5);
    c.save();
    c.globalAlpha = 1 - out;
    c.translate(800, 250);
    c.scale(0.6 + k * 0.4 + out * 0.2, 0.6 + k * 0.4 + out * 0.2);
    hud(c, 'CRITICAL', 0, 0, 120, { align: 'center', fill: ['#ffffff', '#7af4ff'], stroke: '#0c1a26', sw: 18 });
    c.restore();
  }
  // ending card
  if (t > 18.0) {
    const k = tween(t, 18.0, 18.8, ease.outCubic);
    c.save();
    c.globalAlpha = k;
    const g = c.createLinearGradient(0, 0, 1600, 0);
    g.addColorStop(0, 'rgba(8,16,24,0)');
    g.addColorStop(0.5, 'rgba(8,16,24,0.6)');
    g.addColorStop(1, 'rgba(8,16,24,0)');
    c.fillStyle = g;
    c.fillRect(0, 96, 1600, 112);
    c.fillStyle = '#ffa040';
    c.fillRect(800 - 330 * k, 98, 660 * k, 2);
    c.fillRect(800 - 330 * k, 204, 660 * k, 2);
    c.restore();
    hud(c, 'FOE  VANQUISHED', 800, 174, 60, { align: 'center', fill: ['#fff4d8', '#ffc070'], italic: false, spacing: 14, sw: 8, alpha: k });
  }
}
