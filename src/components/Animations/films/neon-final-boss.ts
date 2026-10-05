import type { RisoFilm, Riso } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, noise1, mulberry, morphPair, morph, type Pt } from '../riso/kit';
import {
  NEON,
  Neon,
  createNeonFX,
  flick,
  hum,
  gridFloor,
  neonSun,
  makeStars,
  drawStars,
  sparks,
  rgba,
  rect,
  line,
  type NeonFX,
  type Star,
  type Part,
  type Baked,
} from '../styles/neon';

/*
 * Final Boss: one bar of light. It ignites and splits into the two health bars; the hero's last
 * sliver of health peels off the HUD and slides into his empty sheath; drawn out slowly, it is the
 * blade; its single slash cuts the boss in two, and the slash settles into the horizon.
 */

const HZ = 600;
const HERO_G = 684;
const BOSS_G = 652;
const BOSS_X = 1100;
const HS = 1.35; // hero scale
const BS = 0.86; // boss scale
const BAR = { y: 64, h: 18, hx0: 90, hx1: 690, bx0: 910, bx1: 1510 };
const SL0: Pt = [120, 800];
const SL1: Pt = [1520, 130];
const SLIVER = 0.06;

/* Combo hits in real time with their hit-stop freezes */
const HITS = [4.0, 4.38, 4.76, 5.12, 5.55];
const FREEZE = [0.06, 0.06, 0.07, 0.08, 0.2];
const FTOT = FREEZE.reduce((a, b) => a + b, 0);
/** Action time: real time with the freeze frames taken out */
const act = (t: number) => t - HITS.reduce((s, h, i) => s + clamp(t - h, 0, FREEZE[i]), 0);
const HIT_A = HITS.map((h, i) => h - FREEZE.slice(0, i).reduce((a, b) => a + b, 0));
/** Key time for something authored in real time after the combo */
const R = (x: number) => x - FTOT;

const SLAM = 8.5; // real time the fist lands
const SLASH = 11.4; // real time of the cut

/* ---------- rig ---------- */

interface Pose {
  hy: number;
  lean: number;
  head: number;
  aF: [number, number];
  aB: [number, number];
  lF: [number, number];
  lB: [number, number];
}

const P = (hy: number, lean: number, aF: [number, number], aB: [number, number], lF: [number, number], lB: [number, number], head = 0): Pose => ({
  hy,
  lean,
  head,
  aF,
  aB,
  lF,
  lB,
});

const lp2 = (a: [number, number], b: [number, number], k: number): [number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const lpPose = (a: Pose, b: Pose, k: number): Pose => ({
  hy: lerp(a.hy, b.hy, k),
  lean: lerp(a.lean, b.lean, k),
  head: lerp(a.head, b.head, k),
  aF: lp2(a.aF, b.aF, k),
  aB: lp2(a.aB, b.aB, k),
  lF: lp2(a.lF, b.lF, k),
  lB: lp2(a.lB, b.lB, k),
});

/** Direction for an angle measured from straight down, positive swinging forward (+x) */
const dir = (a: number): Pt => [Math.sin(a), Math.cos(a)];
const add = (p: Pt, d: Pt, l: number): Pt => [p[0] + d[0] * l, p[1] + d[1] * l];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt) => Math.hypot(v[0], v[1]);
const unit = (v: Pt): Pt => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l];
};

interface Dims {
  thigh: number;
  shin: number;
  torso: number;
  sh: number;
  upper: number;
  fore: number;
}

interface Joints {
  hip: Pt;
  up: Pt;
  n: Pt;
  shoulder: Pt;
  neck: Pt;
  kneeF: Pt;
  footF: Pt;
  kneeB: Pt;
  footB: Pt;
  elbF: Pt;
  handF: Pt;
  elbB: Pt;
  handB: Pt;
}

/** Two-bone IK: elbow for a hand at target, bending toward side */
const ik = (s: Pt, target: Pt, l1: number, l2: number, side: number): [Pt, Pt] => {
  const v = sub(target, s);
  const d = clamp(len(v), 1, l1 + l2 - 0.5);
  const base = Math.atan2(v[1], v[0]);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const elb: Pt = [s[0] + Math.cos(base + side * a) * l1, s[1] + Math.sin(base + side * a) * l1];
  const hand = add(s, unit(v), d);
  return [elb, hand];
};

const rig = (p: Pose, d: Dims, handTarget?: Pt): Joints => {
  const hip: Pt = [0, p.hy];
  const up: Pt = [Math.sin(p.lean), -Math.cos(p.lean)];
  const n: Pt = [-up[1], up[0]];
  const shoulder = add(hip, up, d.sh);
  const neck = add(hip, up, d.torso);
  const kneeF = add(hip, dir(p.lF[0]), d.thigh);
  const footF = add(kneeF, dir(p.lF[0] - p.lF[1]), d.shin);
  const kneeB = add(hip, dir(p.lB[0]), d.thigh);
  const footB = add(kneeB, dir(p.lB[0] - p.lB[1]), d.shin);
  let elbF = add(shoulder, dir(p.aF[0]), d.upper);
  let handF = add(elbF, dir(p.aF[0] + p.aF[1]), d.fore);
  if (handTarget) [elbF, handF] = ik(shoulder, handTarget, d.upper, d.fore, -1);
  const elbB = add(shoulder, dir(p.aB[0]), d.upper);
  const handB = add(elbB, dir(p.aB[0] + p.aB[1]), d.fore);
  return { hip, up, n, shoulder, neck, kneeF, footF, kneeB, footB, elbF, handF, elbB, handB };
};

const chain = (pts: Pt[]) => {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  return p;
};
const poly = (pts: Pt[], p = new Path2D()) => {
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
};
const disc = (c: Pt, r: number, p = new Path2D()) => {
  p.moveTo(c[0] + r, c[1]);
  p.arc(c[0], c[1], r, 0, TAU);
  return p;
};

interface Key {
  t: number;
  p: Pose;
  x: number;
  y: number;
}

const sample = (keys: Key[], t: number) => {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k = ease.inOutSine(seg(t, a.t, b.t));
  return { p: lpPose(a.p, b.p, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
};

/* ---------- hero ---------- */

const HD: Dims = { thigh: 52, shin: 54, torso: 72, sh: 62, upper: 40, fore: 38 };

const H_IDLE = P(-100, 0.14, [0.95, 1.3], [0.5, 1.5], [0.42, 0.34], [-0.38, 0.2]);
const H_DASH = P(-88, 0.7, [1.3, 0.3], [-0.95, 0.6], [1.0, 1.3], [-1.0, 0.6], 0.1);
const H_PUNCH = P(-96, 0.32, [1.6, 0.04], [0.15, 1.9], [0.6, 0.25], [-0.6, 0.12], 0.1);
const H_KICK = P(-104, -0.45, [0.6, 1.5], [-0.5, 1.1], [1.95, 0.04], [-0.12, 0.1], -0.2);
const H_UPPER = P(-100, 0.05, [3.0, 0.12], [0.3, 1.6], [0.35, 1.5], [-0.45, 0.2], -0.3);
const H_TUCK = P(-84, -0.25, [0.9, 1.7], [0.5, 1.7], [1.7, 2.3], [1.3, 2.1]);
const H_HURT = P(-94, -0.7, [-0.8, 0.3], [-1.1, 0.4], [0.6, 0.5], [0.1, 0.7], -0.4);
const H_KNEEL = P(-62, 0.3, [0.8, 1.1], [0.3, 0.9], [1.45, 1.6], [-0.1, 1.7], 0.15);
const H_LUNGE = P(-62, 0.75, [1.6, 0.05], [-0.7, 0.5], [1.2, 1.4], [-1.2, 0.2], 0.2);
const H_STAND = P(-104, 0.04, [0.3, 0.9], [-0.15, 0.25], [0.14, 0.05], [-0.14, 0.05], -0.05);

const HERO_KEYS: Key[] = [
  { t: 0, p: H_IDLE, x: 400, y: 0 },
  { t: 3.62, p: H_IDLE, x: 400, y: 0 },
  { t: 3.86, p: H_DASH, x: 760, y: 0 },
  { t: HIT_A[0], p: H_PUNCH, x: 825, y: 0 },
  { t: HIT_A[0] + 0.16, p: H_IDLE, x: 828, y: 0 },
  { t: HIT_A[1], p: H_KICK, x: 832, y: 0 },
  { t: HIT_A[1] + 0.15, p: H_IDLE, x: 838, y: -50 },
  { t: HIT_A[2], p: H_UPPER, x: 846, y: -175 },
  { t: HIT_A[3], p: H_KICK, x: 852, y: -262 },
  { t: HIT_A[3] + 0.17, p: H_DASH, x: 846, y: -258 },
  { t: HIT_A[4], p: H_PUNCH, x: 866, y: -276 },
  { t: R(6.2), p: H_TUCK, x: 760, y: -190 },
  { t: R(6.7), p: H_IDLE, x: 700, y: 0 },
  { t: R(8.4), p: H_IDLE, x: 700, y: 0 },
  { t: R(8.6), p: H_HURT, x: 670, y: -70 },
  { t: R(9.0), p: H_HURT, x: 380, y: -90 },
  { t: R(9.25), p: H_KNEEL, x: 330, y: 0 },
  { t: R(SLASH - 0.02), p: H_KNEEL, x: 330, y: 0 },
  { t: R(SLASH), p: H_LUNGE, x: 1380, y: 0 },
  { t: R(14.8), p: H_LUNGE, x: 1380, y: 0 },
  { t: R(15.6), p: H_STAND, x: 1380, y: 0 },
  { t: 99, p: H_STAND, x: 1380, y: 0 },
];

/** Katana sheath at the hip: mouth in local rig space, and the forward (draw) direction */
const SHEATH_FWD: Pt = unit([0.94, -0.36]);
const REACH = 64;
const BLADE = 132;
const mouthOf = (j: Joints): Pt => [j.hip[0] + 14, j.hip[1] - 20];

/** Sword state in real time: 'sheath' | drawing (p) | held at angle */
const swordAt = (t: number) => {
  // reach for the hilt, draw slowly, hold, (cut), hold forward, sheathe
  const reach = tween(t, 10.25, 10.55, ease.inOutSine);
  const drawK = tween(t, 10.55, 11.25, ease.inOutSine);
  const sheathe = tween(t, 15.5, 16.2, ease.inOutCubic);
  const rest = t > 16.2;
  if (t >= SLASH && t < 15.5) return { mode: 'held' as const, p: 1, reach: 0, ang: 1.62 };
  if (t >= 15.5) return { mode: 'draw' as const, p: rest ? 0 : 1 - sheathe, reach: 1, ang: 0 };
  if (t >= 10.55) return { mode: 'draw' as const, p: drawK, reach: 1, ang: 0 };
  return { mode: 'draw' as const, p: 0, reach, ang: 0 };
};

interface HeroOpts {
  p: Pose;
  x: number;
  y: number;
  on: number;
  t: number;
  ghost?: boolean;
  white?: boolean;
  bladeOn: number;
  sheathGlow?: number;
}

const drawHero = (N: Neon, o: HeroOpts) => {
  const t = o.t;
  const sw = swordAt(t);
  // hand target for the draw / sheathe
  const j0 = rig(o.p, HD);
  const mouth0 = mouthOf(j0);
  let target: Pt | undefined;
  // the hand pulls forward as far as it can; the sheath slides back for the rest of the blade
  const pull = sw.mode === 'draw' ? Math.min(REACH, BLADE * sw.p) : 0;
  const slideBack = sw.mode === 'draw' ? Math.max(0, BLADE * sw.p - REACH) : 0;
  const mouth = add(mouth0, SHEATH_FWD, -slideBack);
  if (sw.mode === 'draw' && sw.reach > 0) {
    const grip = add(mouth0, SHEATH_FWD, 8 + pull);
    target = [lerp(j0.handF[0], grip[0], sw.reach), lerp(j0.handF[1], grip[1], sw.reach)];
  }
  const j = target ? rig(o.p, HD, target) : j0;
  const rimCol = o.white ? NEON.white : NEON.cyan;
  N.with(
    () => {
      N.translate(o.x, HERO_G + o.y);
      N.scale(HS);
    },
    () => {
      const up = j.up;
      const n = j.n;
      const at = (base: Pt, along: number, side: number): Pt => add(add(base, up, along), n, side);
      const wave = (i: number, k: number) => Math.sin(t * 9 - i * 0.9) * 6 * k;
      // long coat tails streaming back from the waist
      const tail = (off: number, l: number, seed: number) => {
        const a = at(j.hip, 18, -10);
        const b = at(j.hip, 4, 8 + off);
        const pts: Pt[] = [a];
        for (let i = 1; i <= 5; i++) {
          const k = i / 5;
          pts.push([a[0] - k * l * 0.85 - o.p.lean * 12 * k, a[1] + k * l * 0.55 + wave(i + seed, k)]);
        }
        for (let i = 5; i >= 1; i--) {
          const k = i / 5;
          pts.push([b[0] - k * l * 0.7 - 6 - o.p.lean * 12 * k, b[1] + k * l * 0.62 + wave(i + seed + 0.6, k)]);
        }
        pts.push(b);
        return poly(pts);
      };
      // jacket body: shoulders broader than the hips, a raised collar
      const jacket = poly([
        at(j.hip, -6, 15),
        at(j.hip, 40, 17),
        at(j.shoulder, 0, 23),
        at(j.shoulder, 10, 14),
        at(j.neck, 4, 9),
        at(j.neck, 4, -10),
        at(j.shoulder, 6, -20),
        at(j.hip, 40, -15),
        at(j.hip, -6, -13),
      ]);
      const hc = at(j.neck, 19, 2 + o.p.head * 4);
      const head = disc(hc, 15);
      // hair swept back in spikes
      const hair = poly([
        add(hc, [0.3, -1], 17),
        add(hc, [-1.6, -0.9], 26),
        add(hc, [-0.7, -0.2], 14),
        add(hc, [-2.0, -0.1], 24 + 3 * Math.sin(t * 7)),
        add(hc, [-0.8, 0.5], 14),
        add(hc, [-1.6, 0.9], 20 + 3 * Math.sin(t * 6 + 1)),
        add(hc, [0, 1], 10),
        add(hc, [0.9, -0.4], 15),
      ]);
      const boot = (f: Pt, k: Pt) => {
        const d = unit(sub(f, k));
        const fwd: Pt = [Math.abs(d[1]) > 0.4 ? 1 : d[0] > 0 ? 1 : -1, 0];
        return poly([add(f, [-1, 0], 7), add(add(f, [0, -1], 12), [-1, 0], 7), add(f, [0, -1], 10), add(add(f, fwd, 20), [0, 1], 2), add(f, [0, 1], 3)]);
      };
      const glove = disc(j.handF, 8);
      disc(j.handB, 7.5, glove);
      const parts: Part[] = [
        { p: tail(0, 72, 0) },
        { p: tail(6, 56, 2) },
        { p: chain([j.hip, j.kneeB, j.footB]), w: 17 },
        { p: boot(j.footB, j.kneeB) },
        { p: chain([j.shoulder, j.elbB, j.handB]), w: 13 },
        { p: jacket },
        { p: head },
        { p: hair },
        { p: chain([j.hip, j.kneeF, j.footF]), w: 19 },
        { p: boot(j.footF, j.kneeF) },
        { p: chain([j.shoulder, j.elbF, j.handF]), w: 14 },
        { p: glove },
      ];
      const a = o.on * (o.ghost ? 0.45 : 1);
      // the scarf, a thick magenta ribbon
      if (!o.ghost) {
        const sp: Pt[] = [];
        const s0 = at(j.neck, 2, -4);
        for (let i = 0; i < 10; i++) {
          const k = i / 9;
          sp.push([s0[0] - i * 15 - o.p.lean * 14 * k, s0[1] + i * 2.4 + Math.sin(t * 10 - i * 0.85) * 9 * k]);
        }
        N.tube(chain(sp), NEON.magenta, 5.5, o.on, 1.1);
        const sp2 = sp.slice(0, 7).map(([x, y], i): Pt => [x + 4, y + 9 + Math.sin(t * 11 - i) * 3 * (i / 6)]);
        N.tube(chain(sp2), NEON.magenta, 3.5, o.on * 0.85);
      }
      // sheath behind the body
      const tip = add(mouth, SHEATH_FWD, -BLADE - 10);
      const sheath = chain([mouth, tip]);
      if (!o.ghost) {
        N.rim([{ p: sheath, w: 7 }], NEON.violet, 1.4, a, NEON.ink);
        if (o.sheathGlow && o.sheathGlow > 0) N.tube(sheath, NEON.cyan, 2.4, o.sheathGlow, 1.3);
      }
      N.rim(parts, rimCol, 2.2, a, o.ghost ? 'rgba(7,4,15,0.25)' : o.white ? '#000' : NEON.ink);
      if (!o.ghost && a > 0.05) {
        // jacket seam, belt and the scarf knot
        const seams = new Path2D();
        const z0 = at(j.neck, 0, 2);
        const z1 = at(j.hip, 4, 3);
        seams.moveTo(z0[0], z0[1]);
        seams.lineTo(z1[0], z1[1]);
        N.tube(seams, rimCol, 1, 0.5 * a, 0.3);
        const belt = chain([at(j.hip, 6, -13), at(j.hip, 6, 15)]);
        N.tube(belt, NEON.amber, 1.6, 0.8 * a, 0.6);
        // eye
        const ey = add(hc, [1, -0.2], 8);
        N.tube(chain([ey, add(ey, [1, 0], 5)]), rimCol, 1.4, a, 0.6);
        // sheath fittings
        N.tube(chain([add(mouth, [0, 1], -5), add(mouth, [0, 1], 5)]), NEON.amber, 2, a);
      }
      // blade
      if (o.bladeOn > 0.01 && !o.ghost) {
        let b0: Pt;
        let b1: Pt;
        if (sw.mode === 'held') {
          b0 = j.handF;
          b1 = add(j.handF, dir(sw.ang), BLADE);
          N.tube(chain([add(j.handF, dir(sw.ang), -22), j.handF]), NEON.violet, 3.2, a);
        } else {
          // the visible part of a drawing blade runs from the hand back to the sheath mouth
          b0 = add(j.handF, SHEATH_FWD, -4);
          b1 = add(mouth, SHEATH_FWD, 0);
          if (sw.p < 0.02) b1 = b0;
          N.tube(chain([j.handF, add(j.handF, SHEATH_FWD, 18)]), NEON.violet, 3.2, a * sw.reach);
        }
        if (len(sub(b1, b0)) > 2) {
          N.tube(chain([b0, b1]), '#c4f7ff', 2.6, o.bladeOn * a, 1.5);
          N.tube(chain([b0, b1]), NEON.white, 1, o.bladeOn * a, 0.4);
        }
        // light spilling where the blade leaves the sheath
        if (sw.mode === 'draw' && sw.p > 0.02 && sw.p < 0.98) {
          const g = new Path2D();
          const r0 = 10 + 4 * Math.sin(t * 30);
          g.moveTo(mouth[0] - r0, mouth[1]);
          g.lineTo(mouth[0] + r0, mouth[1]);
          g.moveTo(mouth[0], mouth[1] - r0);
          g.lineTo(mouth[0], mouth[1] + r0);
          N.tube(g, NEON.white, 1.4, a);
          N.haze(disc(mouth, 6), NEON.cyan, 30, 0.8);
        }
        // guard
        N.tube(chain([add(j.handF, [0, 1], -9), add(j.handF, [0, 1], 9)]), NEON.amber, 2.6, a * (sw.mode === 'held' ? 1 : sw.reach));
      }
    }
  );
  return { j, mouth };
};

/* ---------- boss ---------- */

const BD: Dims = { thigh: 140, shin: 128, torso: 222, sh: 196, upper: 150, fore: 142 };
const B_IDLE = P(-262, 0.12, [0.3, 0.4], [-0.2, 0.5], [0.28, 0.14], [-0.28, 0.1]);
const B_ROAR = P(-270, -0.28, [1.5, 0.9], [-1.5, -0.7], [0.36, 0.2], [-0.36, 0.12], -0.5);
const B_HURT = P(-256, -0.22, [0.0, 0.6], [-0.5, 0.4], [0.22, 0.2], [-0.32, 0.1], -0.4);
const B_WIND = P(-272, -0.3, [2.95, 0.75], [0.7, 1.0], [0.46, 0.3], [-0.38, 0.14], -0.3);
const B_SLAM = P(-218, 0.82, [0.22, 0.05], [-0.35, 0.6], [0.7, 0.55], [-0.55, 0.1], 0.2);
const B_STUN = P(-258, 0.02, [0.18, 0.25], [0.08, 0.3], [0.24, 0.12], [-0.24, 0.1], 0.35);

const BOSS_KEYS: Key[] = [
  { t: 0, p: B_IDLE, x: BOSS_X, y: 0 },
  { t: 1.2, p: B_IDLE, x: BOSS_X, y: 0 },
  { t: 1.6, p: B_ROAR, x: BOSS_X, y: 0 },
  { t: 2.4, p: B_ROAR, x: BOSS_X, y: 0 },
  { t: 2.9, p: B_IDLE, x: BOSS_X, y: 0 },
  { t: HIT_A[4], p: B_IDLE, x: BOSS_X, y: 0 },
  { t: HIT_A[4] + 0.25, p: B_HURT, x: BOSS_X + 40, y: 0 },
  { t: R(7.0), p: B_IDLE, x: BOSS_X + 20, y: 0 },
  { t: R(7.7), p: B_IDLE, x: BOSS_X + 20, y: 0 },
  { t: R(8.3), p: B_WIND, x: BOSS_X + 40, y: 0 },
  { t: R(SLAM), p: B_SLAM, x: BOSS_X - 20, y: 0 },
  { t: R(9.3), p: B_SLAM, x: BOSS_X - 20, y: 0 },
  { t: R(10.2), p: B_IDLE, x: BOSS_X, y: 0 },
  { t: R(SLASH), p: B_IDLE, x: BOSS_X, y: 0 },
  { t: R(SLASH + 0.5), p: B_STUN, x: BOSS_X, y: 0 },
  { t: 99, p: B_STUN, x: BOSS_X, y: 0 },
];

interface BossOpts {
  p: Pose;
  x: number;
  t: number;
  on: number;
  eyes: number;
  core: number;
  charge: number;
  body: number;
  rimCol?: string;
}

const drawBoss = (N: Neon, o: BossOpts) => {
  const j = rig(o.p, BD);
  const t = o.t;
  const c = N.c;
  N.with(
    () => {
      N.translate(o.x, BOSS_G);
      N.scale(-BS, BS);
    },
    () => {
      const up = j.up;
      const nn = j.n;
      const at = (base: Pt, along: number, side: number): Pt => add(add(base, up, along), nn, side);
      const rotH = Math.atan2(up[0], -up[1]) + o.p.head * 0.3;
      const hc = at(j.hip, 266, 0);
      const H = (q: Pt): Pt => {
        const cs = Math.cos(rotH);
        const sn = Math.sin(rotH);
        return [hc[0] + q[0] * cs - q[1] * sn, hc[1] + q[0] * sn + q[1] * cs];
      };
      // tattered cape behind
      const capePts: Pt[] = [at(j.hip, 214, 120)];
      for (let i = 0; i <= 8; i++) {
        const k = i / 8;
        const x = lerp(140, -210, k);
        const sway = noise1(t * 1.3 + k * 2, 3) * 26 + Math.sin(t * 2.2 + k * 4) * 14;
        const drop = 30 + 260 + (i % 2 ? -46 : 0) + 30 * Math.sin(k * 3);
        capePts.push([j.shoulder[0] + x * 0.8 - 90 + sway, j.shoulder[1] + drop + sway * 0.3]);
      }
      capePts.push(at(j.hip, 214, -130));
      const cape = poly(capePts);

      const torso = poly([
        at(j.hip, 0, 78),
        at(j.hip, 70, 96),
        at(j.hip, 150, 150),
        at(j.hip, 212, 130),
        at(j.hip, 232, 44),
        at(j.hip, 232, -44),
        at(j.hip, 212, -130),
        at(j.hip, 150, -150),
        at(j.hip, 70, -96),
        at(j.hip, 0, -78),
      ]);
      // armoured shoulders: three stacked plates and a spike each side
      const pauls: Path2D[] = [];
      for (const s of [1, -1]) {
        const p = new Path2D();
        for (let i = 0; i < 3; i++) {
          const cc = at(j.hip, 214 - i * 34, (126 + i * 14) * s);
          p.moveTo(cc[0] + (86 - i * 10), cc[1]);
          p.ellipse(cc[0], cc[1], 86 - i * 10, 46 - i * 6, Math.atan2(up[1], up[0]) + Math.PI / 2, 0, TAU);
        }
        const b0 = at(j.hip, 252, 96 * s);
        const b1 = at(j.hip, 240, 160 * s);
        const tip = at(j.hip, 336, 172 * s);
        poly([b0, tip, b1], p);
        pauls.push(p);
      }
      const helm = poly([H([-36, 30]), H([-44, -14]), H([-26, -50]), H([26, -50]), H([44, -14]), H([36, 30]), H([0, 44])]);
      // great curved horns
      const horns = new Path2D();
      for (const s of [1, -1]) {
        horns.moveTo(...H([28 * s, -30]));
        const c1 = H([118 * s, -40]);
        const tip = H([104 * s, -170]);
        const c2 = H([76 * s, -64]);
        const b = H([18 * s, -48]);
        horns.quadraticCurveTo(c1[0], c1[1], tip[0], tip[1]);
        horns.quadraticCurveTo(c2[0], c2[1], b[0], b[1]);
        horns.closePath();
      }
      // the big arm ends in a gauntlet
      const fistF = disc(j.handF, 68);
      const fistB = disc(j.handB, 44);
      const feet = new Path2D();
      for (const f of [j.footF, j.footB]) poly([[f[0] - 54, f[1] + 4], [f[0] - 36, f[1] - 34], [f[0] + 44, f[1] - 28], [f[0] + 80, f[1] + 4]], feet);
      const knees = new Path2D();
      disc(j.kneeF, 52, knees);
      disc(j.kneeB, 46, knees);
      const bodyG = c.createLinearGradient(0, -640, 0, 0);
      bodyG.addColorStop(0, rgba('#1c0c30', o.body));
      bodyG.addColorStop(1, rgba(NEON.ink, o.body));
      const rimCol = o.rimCol ?? NEON.magenta;
      N.rim([{ p: cape }], NEON.violet, 2, o.on * 0.8, rgba('#0b0616', o.body));
      N.rim(
        [
          { p: chain([j.hip, j.kneeB, j.footB]), w: 80 },
          { p: chain([j.shoulder, j.elbB, j.handB]), w: 58 },
          { p: fistB },
          { p: feet },
          { p: chain([j.hip, j.kneeF, j.footF]), w: 90 },
          { p: knees },
          { p: torso },
          { p: horns },
          { p: helm },
        ],
        rimCol,
        3,
        o.on,
        bodyG
      );
      N.rim([{ p: pauls[1] }, { p: pauls[0] }], rimCol, 2.6, o.on, bodyG);
      N.rim([{ p: chain([j.shoulder, j.elbF]), w: 76 }, { p: chain([j.elbF, j.handF]), w: 100 }, { p: fistF }], rimCol, 3, o.on, bodyG);
      if (o.on > 0.02) {
        // plate seams, abs, the pauldron layers and the gauntlet knuckles
        const acc = new Path2D();
        const a0 = at(j.hip, 196, -110);
        const a1 = at(j.hip, 112, 0);
        const a2 = at(j.hip, 196, 110);
        acc.moveTo(...a0);
        acc.lineTo(...a1);
        acc.lineTo(...a2);
        for (const k of [-1, 1]) {
          acc.moveTo(...at(j.hip, 40, 32 * k));
          acc.lineTo(...at(j.hip, 96, 32 * k));
        }
        acc.moveTo(...at(j.hip, 14, -84));
        acc.lineTo(...at(j.hip, 14, 84));
        N.tube(acc, rimCol, 1.6, 0.55 * o.on, 0.4);
        const kn = new Path2D();
        const fd = unit(sub(j.handF, j.elbF));
        const fn: Pt = [-fd[1], fd[0]];
        for (let i = -1; i <= 1; i++) {
          const base = add(add(j.handF, fn, i * 26), fd, 30);
          kn.moveTo(...add(base, fd, -12));
          kn.lineTo(...add(base, fd, 18));
        }
        for (let i = 0; i < 3; i++) {
          const q0 = add(add(j.elbF, fd, 40 + i * 30), fn, -40);
          const q1 = add(add(j.elbF, fd, 40 + i * 30), fn, 40);
          kn.moveTo(...q0);
          kn.lineTo(...q1);
        }
        N.tube(kn, NEON.amber, 2.2, (0.35 + 0.65 * o.charge) * o.on, 0.5 + o.charge);
        // tusks under the visor
        const tusk = new Path2D();
        for (const s of [1, -1]) poly([H([10 * s, 28]), H([22 * s, 58]), H([24 * s, 26])], tusk);
        N.tube(tusk, rimCol, 1.4, o.on * 0.8);
      }
      if (o.eyes > 0.01) {
        const eyes = new Path2D();
        for (const s of [1, -1]) {
          eyes.moveTo(...H([6 * s, -8]));
          eyes.lineTo(...H([30 * s, -16]));
        }
        N.tube(eyes, NEON.amber, 3.6, Math.min(1, o.eyes), 1.4 * o.eyes);
      }
      if (o.core > 0.01) {
        const k = at(j.hip, 150, 0);
        const Rr = 22 + 3 * Math.sin(t * 6) + 10 * o.charge;
        const d = poly([
          [k[0], k[1] - Rr],
          [k[0] + Rr * 0.7, k[1]],
          [k[0], k[1] + Rr],
          [k[0] - Rr * 0.7, k[1]],
        ]);
        N.fill(d, rgba(NEON.pink, 0.85 * o.core), NEON.magenta, o.core * (1 + o.charge));
        N.tube(d, NEON.magenta, 2.2, o.core);
        if (o.charge > 0.02) {
          const rays = new Path2D();
          for (let i = 0; i < 10; i++) {
            const an = (i / 10) * TAU + t * 1.5;
            const r0 = Rr * 1.3;
            const r1 = Rr * (1.9 + 1.2 * o.charge * (0.6 + 0.4 * Math.sin(t * 20 + i)));
            rays.moveTo(k[0] + Math.cos(an) * r0, k[1] + Math.sin(an) * r0);
            rays.lineTo(k[0] + Math.cos(an) * r1, k[1] + Math.sin(an) * r1);
          }
          N.tube(rays, NEON.pink, 1.8, o.charge * o.core);
        }
      }
    }
  );
  return j;
};

/** World position of a point in the boss rig */
const bossW = (x: number, q: Pt): Pt => [x - q[0] * BS, BOSS_G + q[1] * BS];

/* ---------- effects ---------- */

/** Anime impact star: a long four-point flash that pops and fades */
const impactStar = (N: Neon, x: number, y: number, k: number, R: number, rot: number, col: string) => {
  if (k <= 0 || k >= 1) return;
  const s = k < 0.25 ? ease.outBack(k / 0.25) : 1 - ease.inCubic((k - 0.25) / 0.75) * 0.6;
  const a = 1 - seg(k, 0.4, 1);
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const an = rot + (i * Math.PI) / 4;
    const rr = i % 2 ? R * 0.12 : R * (i % 4 ? 0.55 : 1);
    pts.push([x + Math.cos(an) * rr * s, y + Math.sin(an) * rr * s]);
  }
  const p = poly(pts);
  N.fill(p, rgba('#ffffff', 0.95 * a), col, a);
  N.tube(p, col, 2, a);
};

/* ---------- HUD ---------- */

const heroHP = (t: number) => {
  if (t < SLAM + 0.05) return 1;
  if (t > 16.4) return lerp(SLIVER, 1, ease.inOutCubic(seg(t, 16.4, 17.3)));
  return lerp(1, SLIVER, ease.outCubic(seg(t, SLAM + 0.05, SLAM + 0.4)));
};
const bossHP = (t: number) => {
  const steps = [0.88, 0.77, 0.65, 0.53, 0.34];
  let hp = 1;
  HITS.forEach((h, i) => {
    if (t > h) hp = lerp(i ? steps[i - 1] : 1, steps[i], ease.outCubic(seg(t, h, h + 0.12)));
  });
  if (t > 11.9) hp = lerp(0.34, 0, ease.inOutCubic(seg(t, 11.9, 12.4)));
  return hp;
};
const lagged = (f: (t: number) => number, t: number, lag = 0.35) => Math.max(f(t), f(t - lag));

const drawBar = (N: Neon, x0: number, x1: number, hp: number, lag: number, col: string, fromRight: boolean, a: number, sliver = 1) => {
  const { y, h } = BAR;
  const w = x1 - x0;
  N.tube(rect(x0 - 6, y - 6, w + 12, h + 12), col, 1.4, a * 0.9);
  // tick marks along the frame
  const ticks = new Path2D();
  for (let i = 1; i < 10; i++) {
    ticks.moveTo(x0 + (w * i) / 10, y + h + 6);
    ticks.lineTo(x0 + (w * i) / 10, y + h + 11);
  }
  N.tube(ticks, col, 0.8, a * 0.6, 0.3);
  const span = (k0: number, k1: number) => (fromRight ? rect(x1 - w * k1, y, w * (k1 - k0), h) : rect(x0 + w * k0, y, w * (k1 - k0), h));
  if (lag > hp) N.fill(span(hp, lag), rgba('#fff4f8', 0.85 * a), '#ffffff', 0.5 * a);
  if (hp > 0.002) {
    const gr = N.c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, rgba(col, 0.95 * a * sliver));
    gr.addColorStop(0.5, rgba('#ffffff', 0.85 * a * sliver));
    gr.addColorStop(1, rgba(col, 0.95 * a * sliver));
    N.fill(span(0, hp), gr, col, 0.8 * a * sliver);
  }
};

/* ---------- camera ---------- */

interface Shot {
  t: number;
  x: number;
  y: number;
  z: number;
  r: number;
}

const SHOTS: Shot[] = [
  { t: 0, x: 1080, y: 150, z: 2.4, r: -0.07 }, // low angle up at the boss's face
  { t: 1.1, x: 1075, y: 190, z: 2.15, r: -0.06 },
  { t: 2.9, x: 820, y: 455, z: 1.0, r: 0 },
  { t: 3.62, x: 800, y: 450, z: 1.0, r: 0 },
  { t: 3.95, x: 880, y: 430, z: 1.12, r: 0 },
  { t: 5.05, x: 900, y: 380, z: 1.16, r: 0.02 },
  { t: 5.6, x: 920, y: 330, z: 1.24, r: 0.05 }, // dutch on the finisher
  { t: 6.6, x: 840, y: 430, z: 1.04, r: 0 },
  { t: 7.6, x: 860, y: 450, z: 1.0, r: 0 },
  { t: 8.35, x: 900, y: 470, z: 0.9, r: 0.03 }, // wind-up: wide and low
  { t: 8.6, x: 780, y: 500, z: 1.02, r: -0.03 },
  { t: 9.4, x: 700, y: 480, z: 1.0, r: 0 },
  { t: 10.2, x: 470, y: 560, z: 1.35, r: 0 },
  { t: 10.6, x: 450, y: 575, z: 2.0, r: -0.03 }, // slow-mo close-up on the draw
  { t: SLASH - 0.03, x: 480, y: 565, z: 2.25, r: -0.02 },
  { t: SLASH, x: 800, y: 450, z: 1.0, r: 0 },
  { t: 11.9, x: 800, y: 450, z: 1.0, r: 0 },
  { t: 12.6, x: 820, y: 440, z: 0.9, r: 0 }, // wide K.O.
  { t: 14.4, x: 820, y: 440, z: 0.93, r: 0 },
  { t: 15.8, x: 800, y: 450, z: 1.0, r: 0 },
  { t: 99, x: 800, y: 440, z: 1.06, r: 0 },
];

const shotAt = (t: number) => {
  let i = 0;
  while (i < SHOTS.length - 2 && SHOTS[i + 1].t <= t) i++;
  const a = SHOTS[i];
  const b = SHOTS[i + 1];
  const k = ease.inOutSine(seg(t, a.t, b.t));
  return {
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)),
    r: lerp(a.r, b.r, k),
  };
};

/* ---------- film ---------- */

interface Ember {
  x: number;
  y: number;
  v: number;
  s: number;
  ph: number;
  col: number;
}

interface State {
  fx: NeonFX;
  stars: Star[];
  hills: Path2D;
  embers: Ember[];
  debris: { a: number; v: number; s: number }[];
  ko: Baked;
  grid: Baked;
  fight: Baked;
  title: Baked;
  sub: Baked;
}

const slashAt = (k: number): [Pt, Pt] => {
  const e = ease.inOutCubic(k);
  return [
    [lerp(SL0[0], -300, e), lerp(SL0[1], HZ, e)],
    [lerp(SL1[0], 1900, e), lerp(SL1[1], HZ, e)],
  ];
};

export const neonFinalBossFilm: RisoFilm<State> = {
  id: 'neon-final-boss',
  title: 'Final Boss',
  caption: 'The last sliver of health becomes the blade, and the blade becomes the horizon.',
  theme: 'Games',
  motif: 'the health bar line',
  series: 'Neon',
  mode: 'direct',
  duration: 19,
  paper: NEON.bg,
  grain: 0,
  inks: [{ color: NEON.cyan }, { color: NEON.magenta }, { color: NEON.amber }, { color: NEON.violet }],
  scenes: [
    { at: 0, label: 'The boss' },
    { at: 3.6, label: 'Combo' },
    { at: 7.6, label: 'Last sliver' },
    { at: 10.2, label: 'The draw' },
    { at: 11.4, label: 'K.O.' },
    { at: 14.6, label: 'Stage clear' },
  ],
  posterTime: 12.9,

  setup(r: Riso): State {
    const rng = mulberry(5);
    const hills = new Path2D();
    const ridge = (x0: number, x1: number, peaks: number, hmax: number) => {
      const pts: Pt[] = [[x0, HZ]];
      for (let i = 1; i < peaks * 2; i++) {
        const x = lerp(x0, x1, i / (peaks * 2));
        pts.push([x, i % 2 ? HZ - hmax * (0.45 + rng() * 0.55) : HZ - hmax * 0.15 * rng()]);
      }
      pts.push([x1, HZ]);
      hills.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) hills.lineTo(q[0], q[1]);
      for (let i = 1; i < pts.length - 1; i += 2) {
        hills.moveTo(pts[i][0], pts[i][1]);
        hills.lineTo(lerp(pts[i - 1][0], pts[i + 1][0], 0.5) + (rng() - 0.5) * 30, HZ);
      }
    };
    ridge(-500, 640, 5, 150);
    ridge(1380, 2200, 4, 120);
    const embers = Array.from({ length: 150 }, () => ({
      x: BOSS_X - 200 + rng() * 400,
      y: 140 + rng() * 500,
      v: 60 + rng() * 160,
      s: 3 + rng() * 7,
      ph: rng() * TAU,
      col: rng() < 0.6 ? 0 : rng() < 0.6 ? 1 : 2,
    }));
    const debris = Array.from({ length: 26 }, () => ({ a: -Math.PI * (0.1 + rng() * 0.8), v: 300 + rng() * 500, s: 5 + rng() * 9 }));
    const font = (s: number) => `italic 900 ${s}px "Avenir Next", "Futura", "Trebuchet MS", system-ui, sans-serif`;
    const grid = Neon.bake(r, -1000, HZ - 2, 3600, 502, 1.5, (n) =>
      gridFloor(n, { hz: HZ, vx: 800, scroll: 0.3, col: NEON.violet, a: 0.9, bottom: 1100, x0: -1000, x1: 2600, colGap: 130 })
    );
    return {
      grid,
      fx: createNeonFX(r),
      stars: makeStars(90, 21, -400, 2000, -200, 520),
      hills,
      embers,
      debris,
      ko: Neon.bake(r, 360, 190, 880, 300, 1, (n) => n.text('K.O.', 800, 340, 230, NEON.magenta, { font: font(230), spacing: 20, w: 6 })),
      fight: Neon.bake(r, 450, 330, 700, 200, 1, (n) => n.text('FIGHT!', 800, 430, 130, NEON.amber, { font: font(130), spacing: 12, w: 4.5 })),
      title: Neon.bake(r, 260, 110, 1080, 160, 1, (n) => n.text('FINAL BOSS', 800, 186, 100, NEON.cyan, { font: font(100), spacing: 10 })),
      sub: Neon.bake(r, 450, 246, 700, 54, 1, (n) =>
        n.text('STAGE CLEAR', 800, 272, 30, NEON.amber, { font: `700 30px ui-monospace, "SF Mono", Menlo, monospace`, spacing: 14, w: 1.2 })
      ),
    };
  },

  draw(r, t, s) {
    const N = Neon.frame(r, s.fx);
    const c = N.c;
    const ta = act(t);
    const hitK = (i: number, dur = 0.45) => seg(t, HITS[i], HITS[i] + dur);

    /* ---- camera ---- */
    const shakeAt = (t0: number, amp: number, dur = 0.35) => {
      const k = seg(t, t0, t0 + dur);
      if (k <= 0 || k >= 1) return [0, 0];
      const d = amp * (1 - k) * (1 - k);
      return [noise1(t * 60, t0) * d, noise1(t * 60, t0 + 3) * d];
    };
    let sx = 0;
    let sy = 0;
    const shakes: [number, number, number][] = [
      ...HITS.map((h, i): [number, number, number] => [h, i === 4 ? 22 : 10, 0.35]),
      [1.7, 9, 0.8],
      [SLAM, 34, 0.6],
      [12.6, 16, 0.4],
    ];
    for (const [h, amp, d] of shakes) {
      const [a, b] = shakeAt(h, amp, d);
      sx += a;
      sy += b;
    }
    const sh = shotAt(t);
    // punch in a touch toward every contact
    let punch = 0;
    HITS.forEach((h, i) => {
      const k = seg(t, h, h + 0.3);
      if (k > 0 && k < 1) punch = Math.max(punch, (1 - k) * (i === 4 ? 0.12 : 0.06));
    });
    const z = sh.z * (1 + punch);
    const cx = sh.x + sx;
    const cy = sh.y + sy;
    N.cam(cx, cy, z, sh.r);

    /* ---- stage ---- */
    const stageOn = tween(t, 0.8, 2.0, ease.inOutSine);
    const sky = c.createLinearGradient(0, -300, 0, HZ);
    sky.addColorStop(0, NEON.bg);
    sky.addColorStop(1, '#190737');
    c.globalAlpha = stageOn;
    c.fillStyle = sky;
    c.fillRect(-1000, -800, 3600, HZ + 800);
    c.globalAlpha = 1;
    drawStars(N, s.stars, t, stageOn);
    const sunUp = tween(t, 0.9, 2.6, ease.outCubic) * (1 - tween(t, 12.9, 14.2, ease.inCubic));
    if (sunUp > 0.01) neonSun(N, BOSS_X - 30, lerp(HZ + 360, HZ - 10, sunUp), 330, { clipY: HZ, phase: t * 0.3, a: clamp(sunUp * 1.5) });
    const dawn = tween(t, 15.0, 17.0, ease.outCubic);
    if (dawn > 0.01) neonSun(N, 800, lerp(HZ + 280, HZ - 40, dawn), 250, { clipY: HZ, phase: t * 0.3, a: dawn, top: '#ffd36b', bottom: NEON.pink });
    N.tube(s.hills, NEON.violet, 1.6, stageOn * 0.75, 0.6);
    const floorG = c.createLinearGradient(0, HZ, 0, 1000);
    floorG.addColorStop(0, '#0f0526');
    floorG.addColorStop(1, NEON.bg);
    c.globalAlpha = stageOn;
    c.fillStyle = floorG;
    c.fillRect(-1000, HZ, 3600, 700);
    c.globalAlpha = 1;
    N.sprite(s.grid, stageOn);

    /* ---- boss ---- */
    const b = sample(BOSS_KEYS, ta);
    const lastHit = HITS.reduce((m, h, i) => (t >= h ? i : m), -1);
    const recoil = lastHit >= 0 ? Math.max(0, 1 - (ta - HIT_A[lastHit]) / 0.35) : 0;
    const frozen = HITS.some((h, i) => t >= h && t < h + FREEZE[i]);
    const breathe = Math.sin(ta * 2.1);
    const bp: Pose = {
      ...b.p,
      lean: b.p.lean - 0.2 * recoil + 0.03 * breathe,
      hy: b.p.hy + breathe * 6,
      head: b.p.head + 0.08 * Math.sin(ta * 1.3) + 0.3 * recoil,
      aF: [b.p.aF[0] + 0.06 * Math.sin(ta * 1.7), b.p.aF[1]],
      aB: [b.p.aB[0] - 0.05 * Math.sin(ta * 1.5), b.p.aB[1]],
    };
    const bossOn = flick(t, 0.75, 0.6, 2) * hum(t, 4);
    const charge = tween(t, 7.6, 8.4) * (1 - seg(t, SLAM, SLAM + 0.5)) + 0.8 * tween(t, 1.4, 1.7) * (1 - tween(t, 2.3, 2.8));
    const eyes = flick(t, 0.25, 0.4, 7) * (1 + 0.7 * charge);
    const split = tween(t, 12.2, 13.2, ease.inCubic);
    const gone = tween(t, 13.1, 14.3, ease.inOutSine);
    const bossFade = (1 - gone) * (t > 13.1 ? flick(t, 13.1, 1.2, 9) * 0.6 + 0.4 : 1);
    const bx = b.x + 26 * recoil;
    const bossBody = 1;
    let bj: Joints | null = null;
    const bossOpts = (o: Partial<BossOpts>): BossOpts => ({
      p: bp,
      x: bx,
      t: ta,
      on: bossOn,
      eyes,
      core: bossOn * (0.6 + 0.4 * Math.sin(t * 4)),
      charge,
      body: bossBody,
      rimCol: frozen ? NEON.white : undefined,
      ...o,
    });
    if (t < 12.2) {
      bj = drawBoss(N, bossOpts({}));
    } else if (gone < 1) {
      const d = unit(sub(SL1, SL0));
      const nrm: Pt = [d[1], -d[0]];
      const far = 4000;
      const A: Pt = add(SL0, d, -far);
      const B: Pt = add(SL1, d, far);
      const upper = poly([A, B, add(B, nrm, far), add(A, nrm, far)]);
      const lower = poly([A, B, add(B, nrm, -far), add(A, nrm, -far)]);
      const slide = 190 * split;
      const o = bossOpts({ on: bossOn * bossFade, body: 1 - gone, core: 0 });
      N.with(
        () => N.clip(lower),
        () => drawBoss(N, { ...o, eyes: 0, charge: 0 })
      );
      N.with(
        () => {
          N.translate(-d[0] * slide, -d[1] * slide + 80 * split * split);
          N.rotate(-0.06 * split);
          N.clip(upper);
        },
        () => drawBoss(N, { ...o, eyes: eyes * (1 - split) })
      );
    }
    // embers rising from the fallen boss
    const emK = seg(t, 12.4, 15.4);
    if (emK > 0 && emK < 1) {
      const groups = [new Path2D(), new Path2D(), new Path2D()];
      for (const e of s.embers) {
        const age = (t - 12.4) * (0.6 + e.v / 220);
        const a = 1 - age / 2.4;
        if (a <= 0) continue;
        const x = e.x + Math.sin(t * 2 + e.ph) * 14 * age;
        const y = e.y - e.v * age;
        const sz = e.s * a;
        groups[e.col].rect(x - sz / 2, y - sz / 2, sz, sz);
      }
      const fade = 1 - seg(emK, 0.5, 1);
      N.fill(groups[0], rgba(NEON.magenta, 0.9 * fade), NEON.magenta, 0.8 * fade);
      N.fill(groups[1], rgba(NEON.amber, 0.9 * fade), NEON.amber, 0.8 * fade);
      N.fill(groups[2], rgba(NEON.cyan, 0.9 * fade), NEON.cyan, 0.8 * fade);
    }

    // the roar: rings off the boss's head
    const roarK = seg(t, 1.6, 2.6);
    if (roarK > 0 && roarK < 1 && bj) {
      const hp = bossW(bx, add(bj.hip, bj.up, 266));
      for (let i = 0; i < 3; i++) {
        const k = clamp(roarK * 1.4 - i * 0.2);
        if (k <= 0 || k >= 1) continue;
        const rp = new Path2D();
        rp.arc(hp[0], hp[1], 60 + 520 * ease.outCubic(k), 0, TAU);
        N.tube(rp, NEON.magenta, 3 * (1 - k), (1 - k) * 0.7);
      }
    }

    // the slam: fist hits the floor, shockwave, debris and a light pillar
    const slamK = seg(t, SLAM, SLAM + 0.9);
    if (slamK > 0 && slamK < 1) {
      const fist: Pt = bj ? bossW(bx, bj.handF) : [850, HERO_G];
      const gx = fist[0];
      const e = ease.outCubic(slamK);
      for (let i = 0; i < 2; i++) {
        const k = clamp(slamK * 1.2 - i * 0.18);
        if (k <= 0 || k >= 1) continue;
        const rp = new Path2D();
        rp.ellipse(gx, HERO_G - 6, 60 + 700 * ease.outCubic(k), 16 + 120 * ease.outCubic(k), 0, 0, TAU);
        N.tube(rp, i ? NEON.magenta : NEON.amber, 5 * (1 - k), 1 - k, 1.4);
      }
      const pillar = new Path2D();
      pillar.rect(gx - 60 * (1 - e) - 8, -400, 2 * (60 * (1 - e) + 8), HERO_G + 400);
      const pg = c.createLinearGradient(gx - 70, 0, gx + 70, 0);
      pg.addColorStop(0, rgba(NEON.amber, 0));
      pg.addColorStop(0.5, rgba('#ffe2a8', 0.75 * (1 - slamK)));
      pg.addColorStop(1, rgba(NEON.amber, 0));
      N.light(pillar, pg);
      const deb = new Path2D();
      for (const d of s.debris) {
        const tt = (t - SLAM) * 1.1;
        const x = gx + Math.cos(d.a) * d.v * tt;
        const y = HERO_G + Math.sin(d.a) * d.v * tt + 900 * tt * tt;
        if (y > HERO_G + 10) continue;
        deb.rect(x - d.s / 2, y - d.s / 2, d.s, d.s);
      }
      N.fill(deb, rgba(NEON.amber, 1 - slamK), NEON.amber, 1 - slamK);
      impactStar(N, gx, HERO_G - 30, seg(t, SLAM, SLAM + 0.5), 320, 0.1, NEON.amber);
    }

    /* ---- hero ---- */
    const h = sample(HERO_KEYS, ta);
    const heroOn = flick(t, 2.3, 0.45, 11) * hum(t, 6);
    const vanish = t > SLASH - 0.02 && t < SLASH + 0.08;
    const sliverIn = seg(t, 9.75, 10.25);
    const bladeOn = t > 10.25 ? 1 : 0;
    if (t > 3.62 && t < 3.98) {
      for (let i = 1; i <= 3; i++) {
        const g = sample(HERO_KEYS, ta - i * 0.05);
        drawHero(N, { ...g, on: heroOn * (0.55 - i * 0.12), t, ghost: true, bladeOn: 0 });
      }
    }
    let hero: { j: Joints; mouth: Pt } | null = null;
    if (!vanish && t > 2.2) {
      hero = drawHero(N, {
        ...h,
        on: heroOn,
        t,
        bladeOn,
        sheathGlow: sliverIn >= 1 ? 0.5 + 0.5 * Math.sin(t * 8) * (1 - seg(t, 10.5, 11)) : 0,
      });
    }

    // combo contact frames: impact star, sparks and a ring at the striking fist or foot
    HITS.forEach((ht, i) => {
      const k = seg(t, ht - 0.01, ht + 0.5);
      if (k <= 0 || k >= 1) return;
      const g = sample(HERO_KEYS, HIT_A[i]);
      const j = rig(g.p, HD);
      const eff = i === 1 || i === 3 ? j.footF : j.handF;
      const px = g.x + eff[0] * HS + 18;
      const py = HERO_G + g.y + eff[1] * HS;
      const big = i === 4;
      impactStar(N, px, py, k, big ? 300 : 170, 0.3 + i * 0.7, big ? NEON.white : NEON.amber);
      sparks(N, px, py, seg(t, ht, ht + 0.42), i * 13 + 1, big ? NEON.cyan : NEON.amber, big ? 240 : 130, big ? 18 : 12);
    });
    // the hero takes the shockwave
    const hk = seg(t, SLAM + 0.04, SLAM + 0.5);
    if (hk > 0 && hk < 1) sparks(N, 700, HERO_G - 170, hk, 77, NEON.magenta, 200, 14);

    /* ---- the slash frame: the world drops to black and one clean line cuts it ---- */
    const blackout = tween(t, SLASH - 0.02, SLASH + 0.02) * (1 - tween(t, SLASH + 0.32, SLASH + 0.48));
    if (blackout > 0.01) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 0.9 * blackout;
      c.fillStyle = '#030108';
      c.fillRect(0, 0, c.canvas.width, c.canvas.height);
      c.restore();
      N.g.save();
      N.g.setTransform(1, 0, 0, 1, 0, 0);
      N.g.globalAlpha = 0.9 * blackout;
      N.g.fillStyle = '#000';
      N.g.fillRect(0, 0, N.g.canvas.width, N.g.canvas.height);
      N.g.restore();
      if (t < 12.2) drawBoss(N, bossOpts({ rimCol: NEON.white, on: blackout, body: 1, eyes: blackout * 1.5, core: 0, charge: 0 }));
      if (!vanish) drawHero(N, { ...h, on: blackout, t, bladeOn: 1, white: true });
    }
    const drawK = tween(t, SLASH + 0.02, SLASH + 0.12, ease.outCubic);
    const settle = seg(t, 14.4, 15.8);
    if (drawK > 0) {
      const [a, bb] = slashAt(settle);
      const e: Pt = [lerp(a[0], bb[0], drawK), lerp(a[1], bb[1], drawK)];
      const lp = line(a[0], a[1], e[0], e[1]);
      const fresh = 1 - ease.outCubic(seg(t, SLASH + 0.1, SLASH + 1.2));
      N.tube(lp, settle > 0.6 ? NEON.cyan : '#aef6ff', lerp(2.6, 2.6, settle) + 1.2 * fresh, 1, 1.2);
      N.tube(lp, NEON.white, 0.9, 0.9 * (1 - settle * 0.5), 0.2);
    }

    /* ---- HUD (its own camera so it can punch in on the sliver) ---- */
    const hudIn = tween(t, 9.25, 9.65, ease.inOutCubic) * (1 - tween(t, 9.8, 10.25, ease.inOutCubic));
    const hz = Math.exp(lerp(0, Math.log(4.6), hudIn));
    // keep the sliver's end of the bar gliding toward the middle of the screen as we push in
    const focus: Pt = [BAR.hx0 + 20, BAR.y + BAR.h / 2];
    const onScreen: Pt = [lerp(focus[0], 560, hudIn), lerp(focus[1], 360, hudIn)];
    const hcx = focus[0] - (onScreen[0] - 800) / hz;
    const hcy = focus[1] - (onScreen[1] - 450) / hz;
    if (hudIn > 0.01) {
      // dim the world so the HUD close-up reads
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 0.65 * hudIn;
      c.fillStyle = '#030108';
      c.fillRect(0, 0, c.canvas.width, c.canvas.height);
      c.restore();
    }
    N.cam(hcx, hcy, hz);
    const hudA = flick(t, 2.55, 0.4, 13) * (1 - 0.9 * tween(t, 10.25, 10.6)) * (1 - blackout);
    const hudBack = t > 11.8 ? tween(t, 11.8, 12.1) * (1 - tween(t, 14.2, 14.7)) : 0;
    const hudEnd = tween(t, 16.2, 16.6);
    const hud = Math.max(hudA, hudBack, hudEnd);
    const ign = flick(t, 2.3, 0.35, 1);
    const splitK = tween(t, 2.6, 3.2, ease.inOutCubic);
    if (ign > 0 && splitK < 1) {
      const half = 300 * tween(t, 2.3, 2.6, ease.outExpo);
      const y = lerp(450, BAR.y + BAR.h / 2, splitK);
      const gap = 18 * splitK;
      N.tube(line(lerp(800 - half, BAR.hx0, splitK), y, lerp(800 - gap, BAR.hx1, splitK), y), NEON.cyan, 3 + 3 * splitK, ign);
      N.tube(line(lerp(800 + gap, BAR.bx0, splitK), y, lerp(800 + half, BAR.bx1, splitK), y), splitK > 0.05 ? NEON.magenta : NEON.cyan, 3 + 3 * splitK, ign);
    }
    const sliverGone = t > 9.8 && t < 16.4;
    if (hud > 0.01 && splitK >= 1) {
      const low = t > SLAM + 0.4 && t < 16.4;
      const blink = low && !sliverGone ? (Math.sin(t * 22) > 0 ? 1 : 0.35) : 1;
      const hhp = sliverGone ? 0 : heroHP(t);
      drawBar(N, BAR.hx0, BAR.hx1, hhp, sliverGone ? 0 : lagged(heroHP, t), low ? NEON.red : NEON.cyan, false, hud, blink);
      drawBar(N, BAR.bx0, BAR.bx1, bossHP(t), lagged(bossHP, t), NEON.magenta, true, hud);
      const rl = new Path2D();
      disc([774, BAR.y + 9], 7, rl);
      disc([826, BAR.y + 9], 7, rl);
      N.tube(rl, NEON.amber, 1.4, hud);
      if (t > 12.5) N.fill(disc([774, BAR.y + 9], 4), NEON.amber, NEON.amber, hud);
    }
    N.cam(800, 450, 1);
    // combo counter
    const comboN = HITS.filter((ht) => t >= ht).length;
    const comboA = comboN >= 1 ? (1 - tween(t, 6.9, 7.4)) * hud : 0;
    if (comboA > 0.01) {
      const lastK = seg(t, HITS[comboN - 1], HITS[comboN - 1] + 0.15);
      const sz = 96 * (1 + 0.45 * (1 - lastK));
      N.text(String(comboN), 250, 290, sz, NEON.amber, { a: comboA, font: `italic 900 ${sz}px "Avenir Next", "Futura", system-ui, sans-serif`, w: 3.4 });
      N.text(comboN >= 5 ? 'HIT COMBO!' : 'HITS', 250, 360, 28, NEON.cyan, { a: comboA, spacing: 6, w: 1.4 });
    }
    const fa = flick(t, 3.15, 0.2, 4) * (1 - tween(t, 3.65, 3.85));
    if (fa > 0.01) {
      N.with(
        () => {
          const k = 1 + 0.3 * (1 - ease.outCubic(seg(t, 3.15, 3.4)));
          N.translate(800, 430);
          N.scale(k);
          N.translate(-800, -430);
        },
        () => N.sprite(s.fight, fa)
      );
    }
    // the sliver peels off the HUD and slides into the empty sheath
    const fly = seg(t, 9.75, 10.25);
    if (fly > 0 && fly < 1 && hero) {
      const k = ease.inOutCubic(fly);
      const swx = BAR.hx0 + (BAR.hx1 - BAR.hx0) * SLIVER;
      const hudS = (q: Pt): Pt => [(q[0] - hcx) * hz + 800, (q[1] - hcy) * hz + 450];
      const rp = ([
        [BAR.hx0, BAR.y],
        [swx, BAR.y],
        [swx, BAR.y + BAR.h],
        [BAR.hx0, BAR.y + BAR.h],
      ] as Pt[]).map(hudS);
      // the sheath line in screen space
      const toW = (q: Pt): Pt => [h.x + q[0] * HS, HERO_G + h.y + q[1] * HS];
      const cr = Math.cos(sh.r);
      const sr = Math.sin(sh.r);
      const toS = (q: Pt): Pt => {
        const dx = (q[0] - cx) * z;
        const dy = (q[1] - cy) * z;
        return [800 + dx * cr - dy * sr, 450 + dx * sr + dy * cr];
      };
      const m = hero.mouth;
      const tip = add(m, SHEATH_FWD, -BLADE);
      const nn: Pt = [-SHEATH_FWD[1], SHEATH_FWD[0]];
      const blade = [add(m, nn, -3), add(add(m, SHEATH_FWD, -BLADE * 0.5), nn, -4), tip, add(add(m, SHEATH_FWD, -BLADE * 0.5), nn, 2), add(m, nn, 3)].map((q) => toS(toW(q)));
      const [ra, rb] = morphPair(rp, blade, 64);
      const lift = Math.sin(k * Math.PI) * 140;
      const pts = morph(ra, rb, k).map(([x, y]): Pt => [x, y - lift]);
      const shape = poly(pts);
      N.fill(shape, rgba('#e2fbff', 0.95), NEON.cyan, 1);
      N.tube(shape, NEON.cyan, 2.2, 1, 1.4);
      const cen = pts.reduce((acc, q) => [acc[0] + q[0] / pts.length, acc[1] + q[1] / pts.length] as Pt, [0, 0] as Pt);
      // a comet tail behind it
      const prev = morph(ra, rb, Math.max(0, k - 0.15)).reduce((acc, q) => [acc[0] + q[0] / pts.length, acc[1] + q[1] / pts.length] as Pt, [0, 0] as Pt);
      N.tube(line(prev[0], prev[1] - Math.sin(Math.max(0, k - 0.15) * Math.PI) * 140, cen[0], cen[1]), NEON.cyan, 3, 0.8);
    }
    // K.O.
    const koK = seg(t, 12.6, 12.85);
    const koA = (t > 12.6 ? flick(t, 12.6, 0.25, 12) : 0) * (1 - tween(t, 14.3, 14.9));
    if (koA > 0.01) {
      N.with(
        () => {
          const k = lerp(1.9, 1, ease.outBack(koK));
          N.translate(800, 340);
          N.scale(k);
          N.translate(-800, -340);
        },
        () => N.sprite(s.ko, koA * hum(t, 3))
      );
    }
    const ti = flick(t, 17.1, 0.5, 5);
    if (ti > 0) {
      N.sprite(s.title, ti * hum(t, 8));
      N.sprite(s.sub, flick(t, 17.6, 0.4, 2));
    }

    /* ---- post ---- */
    const hitPulse = HITS.reduce((m, ht, i) => Math.max(m, t >= ht ? 1 - clamp((t - ht) / (0.12 + FREEZE[i])) : 0), 0);
    const slamPulse = t > SLAM ? Math.max(0, 1 - (t - SLAM) / 0.45) : 0;
    const cutPulse = t > SLASH + 0.45 ? Math.max(0, 1 - (t - SLASH - 0.45) / 0.4) : 0;
    const koPulse = t > 12.6 ? Math.max(0, 1 - (t - 12.6) / 0.45) : 0;
    const roarPulse = Math.max(0, 1 - Math.abs(t - 1.75) * 3);
    N.power = 1.05 + 0.4 * hitPulse + 0.7 * slamPulse + 0.4 * cutPulse + 0.5 * koPulse + 0.3 * roarPulse - 0.3 * blackout;
    N.ab = 1.5 + 5 * hitPulse + 9 * slamPulse + 3 * cutPulse + 6 * koPulse + 3 * roarPulse;
    N.end(t, {
      flash: 0.1 * hitPulse + 0.18 * (hitK(4, 0.2) > 0 && hitK(4, 0.2) < 1 ? 1 - hitK(4, 0.2) : 0) + 0.35 * slamPulse * slamPulse + 0.22 * cutPulse * cutPulse + 0.2 * koPulse,
      flashCol: slamPulse > 0.1 ? '#ffb05c' : cutPulse > 0.1 ? '#9ff4ff' : '#ff9ad8',
    });
  },
};
