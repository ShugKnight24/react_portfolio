import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { clamp, lerp, seg, ease, tween, type Pt } from '../riso/kit';
import {
  KIN,
  rgba,
  ktext,
  kwidth,
  CAP,
  masked,
  label,
  fmt,
  col,
  row,
  drawGrid,
  wipeBands,
  partialLine,
  pose,
  lerpPose,
  fk,
  ik2,
  ankleFromBall,
  angOf,
  dir,
  BODY,
  drawFigure,
  drawSilhouette,
  makeGait,
  runArm,
  type Pose,
  type Gait,
  type FigStyle,
} from '../styles/kinetic';

/**
 * Splits: a seamless loop of one 100 m. Set in the blocks, the gun, the drive phase, top speed
 * and the dip at the line, with the race clock, split ladder, stride and speed data as kinetic
 * type. The finish freezes on the time, and a banded wipe drops the sprinter back into the
 * blocks, so the last frame is the first.
 */

/* ---------- palette ---------- */

const BG = '#ece8de';
const RED = '#ff3b1f';
const COBALT = '#2a3ef0';
const BLACK = KIN.black;
const WHITE = KIN.white;

/* ---------- timing ---------- */

const LOOP = 15;
const GUN = 1.6;
const RACE = 9.79;
const FINISH_T = GUN + RACE;
const FREEZE_END = 12.75;
const WIPE_DUR = 0.62;

/* ---------- world ---------- */

const K = 230; // px per metre
const HB = 1.8 * K; // body height in px
const G = 700; // ground (the sprinter's lane) in world px
const M = (m: number) => m * K;

const TAU_V = 1.25;
const VMAX = 100 / (RACE - TAU_V * (1 - Math.exp(-RACE / TAU_V)));
const dist = (rt: number) => (rt <= 0 ? 0 : VMAX * (rt - TAU_V * (1 - Math.exp(-rt / TAU_V))));
const vel = (rt: number) => (rt <= 0 ? 0 : VMAX * (1 - Math.exp(-rt / TAU_V)));

/** Leg cycles per second ramps from 1.85 to 2.33 (step rate 3.7 to 4.65 Hz) */
const FA = 2.325;
const FB = 0.475;
const FC = 0.9;
const cycles = (rt: number) => (rt <= 0 ? 1.85 * rt : FA * rt - FB * FC * (1 - Math.exp(-rt / FC)));
const cadence = (rt: number) => 2 * (FA - FB * Math.exp(-Math.max(0, rt) / FC));

/* ---------- set position ---------- */

const HIP_SET: Pt = [M(-0.48), G - M(0.8)];
const HIP_MARKS: Pt = [M(-0.56), G - M(0.56)];
const BALL_FRONT: Pt = [M(-0.5), G - M(0.075)];
const BALL_REAR: Pt = [M(-0.86), G - M(0.075)];
const HANDS: Pt = [M(-0.04), G];
const P_FRONT = 52;
const P_REAR = 58;

const L1 = BODY.thigh * HB;
const L2 = BODY.shin * HB;
const LA = (BODY.ua + BODY.fa) * HB;

/** Crouch pose with both feet on the blocks and the hands on the line */
const blockPose = (hip: Pt, lean: number, head: number): Pose => {
  const front = ik2(hip, ankleFromBall(BALL_FRONT, 90 - P_FRONT, HB), L1, L2, 1);
  const rearBall: Pt = BALL_REAR;
  const rear = ik2([hip[0] - 0.01 * HB, hip[1]], ankleFromBall(rearBall, 90 - P_REAR, HB), L1, L2, 1);
  const up: Pt = [Math.sin((lean * Math.PI) / 180), -Math.cos((lean * Math.PI) / 180)];
  const sh: Pt = [hip[0] + up[0] * BODY.torso * HB, hip[1] + up[1] * BODY.torso * HB];
  const wrist: Pt = [HANDS[0], HANDS[1] - 0.075 * HB];
  const arm = angOf([wrist[0] - sh[0], wrist[1] - sh[1]]);
  const reach = Math.hypot(wrist[0] - sh[0], wrist[1] - sh[1]);
  const bend = clamp((LA - reach) / LA) * 60;
  return pose({
    lean,
    head,
    thN: front.a1,
    shN: front.a2,
    ftN: 90 - P_FRONT,
    thF: rear.a1,
    shF: rear.a2,
    ftF: 90 - P_REAR,
    uaN: arm - bend * 0.5,
    faN: arm + bend * 0.5,
    hdN: 6,
    uaF: arm - 2 - bend * 0.5,
    faF: arm - 2 + bend * 0.5,
    hdF: 4,
  });
};

/** Set scene clock tau: -2.3 .. 1.6 (0 = the loop seam) */
const setState = (tau: number): { p: Pose; hip: Pt } => {
  const rise = tween(tau, -1.05, -0.2, ease.inOutCubic);
  const breath = Math.sin(tau * 3.1) * (1 - rise) * 0.006 * HB;
  const hip: Pt = [lerp(HIP_MARKS[0], HIP_SET[0], rise), lerp(HIP_MARKS[1], HIP_SET[1], rise) + breath];
  // shoulders sit over the hands: solve lean from the shoulder target
  const shT: Pt = [lerp(M(0.0), M(0.04), rise), G - M(0.71) + lerp(0, M(0.01), rise)];
  const v: Pt = [shT[0] - hip[0], shT[1] - hip[1]];
  const lean = Math.atan2(v[0], -v[1]) * (180 / Math.PI);
  const head = lean + lerp(28, 16, rise);
  return { p: blockPose(hip, lean, head), hip };
};

/* ---------- race ---------- */

const raceLean = (rt: number) => {
  const d = dist(rt);
  const base = lerp(46, 9, ease.outCubic(clamp(d / 32)));
  const dip = rt > RACE - 0.26 ? 30 * ease.inOutCubic(seg(rt, RACE - 0.26, RACE)) : 0;
  return base + dip;
};

const makeRaceGait = (): Gait =>
  makeGait({
    H: HB,
    t0: -0.5,
    t1: RACE + 0.2,
    phase: (rt) => 0.1 + cycles(rt),
    hip: (rt, uN) => {
      const hh = lerp(0.445, 0.5, 1 - Math.exp(-Math.max(0, rt) / 0.6));
      const c = contactAt(rt);
      const bob = 0.011 * HB * Math.cos(2 * Math.PI * 2 * (uN - c / 2));
      const dip = rt > RACE - 0.26 ? 0.03 * HB * ease.inOutCubic(seg(rt, RACE - 0.26, RACE)) : 0;
      return [HIP_SET[0] + M(dist(rt)), G - hh * HB + bob + dip];
    },
    ground: () => G,
    contact: (rt) => contactAt(rt),
    sprint: () => 1,
    thighBias: (rt) => (raceLean(rt) - 9) * 0.3,
    override: (leg, k) => (leg === 0 && k === 0 ? { ball: BALL_FRONT, p0: P_FRONT, p1: P_FRONT + 10 } : null),
  });

const contactAt = (rt: number) => lerp(0.5, 0.21, 1 - Math.exp(-Math.max(0, rt) / 0.8));

const raceState = (gait: Gait, rt: number): { p: Pose; hip: Pt } => {
  const L = gait.legs(rt);
  const lean = raceLean(rt);
  const sp = clamp(dist(rt) / 25);
  const [uaN, faN] = runArm(L.uF, lerp(0.85, 1, sp));
  const [uaF, faF] = runArm(L.uN, lerp(0.85, 1, sp));
  const tilt = (lean - 9) * 0.75;
  const dipK = rt > RACE - 0.26 ? ease.inOutCubic(seg(rt, RACE - 0.26, RACE)) : 0;
  const p = pose({
    lean,
    head: lean * 0.7 + 3 - dipK * 14,
    thN: L.thN,
    shN: L.shN,
    ftN: L.ftN,
    thF: L.thF,
    shF: L.shF,
    ftF: L.ftF,
    uaN: uaN + tilt - dipK * 50,
    faN: faN + tilt - dipK * 70,
    hdN: faN + tilt - dipK * 70 - 6,
    uaF: uaF + tilt - dipK * 50,
    faF: faF + tilt - dipK * 70,
    hdF: faF + tilt - dipK * 70 - 6,
  });
  let { hip } = L;
  let out = p;
  if (rt < 0.3) {
    const k = ease.inOutSine(seg(rt, 0, 0.3));
    const s = setState(GUN);
    out = lerpPose(s.p, p, k);
    // legs: the near leg stays planted on the block through the blend
    out.thN = p.thN;
    out.shN = p.shN;
    out.ftN = p.ftN;
    hip = [lerp(s.hip[0], hip[0], k), lerp(s.hip[1], hip[1], k)];
    // recompute the planted near leg from the blended hip
    const ank = ankleFromBall(BALL_FRONT, p.ftN, HB);
    const q = ik2(hip, ank, L1, L2, 1);
    out.thN = q.a1;
    out.shN = q.a2;
  }
  return { p: out, hip };
};

/* ---------- camera ---------- */

type Cam = { x: number; y: number; z: number; r: number };

const setCam = (tau: number, hip: Pt): Cam => {
  const k = ease.inOutSine(seg(tau, -2.3, 1.6));
  return { x: hip[0] + M(0.62) - k * M(0.1), y: G - M(0.62) + k * M(0.05), z: lerp(1.02, 1.32, k), r: lerp(-0.012, 0.018, k) };
};

/** Race camera segments; wipes cut between some of them */
const raceCam = (rt: number, hip: Pt): { cam: Cam; seg: number } => {
  if (rt < 2.3) {
    const s = setCam(GUN, HIP_SET);
    const k = ease.outCubic(seg(rt, 0, 1.4));
    const lead = lerp(s.x - HIP_SET[0], M(1.0), k);
    return {
      cam: { x: hip[0] + lead, y: lerp(s.y, G - M(0.78), k), z: lerp(s.z, 0.92, k) - seg(rt, 1.4, 2.3) * 0.05, r: lerp(s.r, 0, k) },
      seg: 0,
    };
  }
  if (rt < 4.6) {
    const k = seg(rt, 2.3, 4.6);
    return { cam: { x: hip[0] + M(0.5) - k * M(0.25), y: G - M(0.84) + k * M(0.04), z: lerp(1.5, 1.4, k), r: lerp(0.01, -0.01, k) }, seg: 1 };
  }
  if (rt < 6.8) {
    const k = ease.inOutSine(seg(rt, 4.6, 6.8));
    return { cam: { x: hip[0] + M(2.2) - k * M(0.6), y: G - M(1.3), z: lerp(0.5, 0.56, k), r: lerp(-0.03, -0.015, k) }, seg: 2 };
  }
  const k1 = ease.inOutCubic(seg(rt, 6.8, 7.7));
  const k2 = ease.inOutCubic(seg(rt, 8.7, RACE));
  const k3 = ease.outCubic(seg(rt, RACE, RACE + 1.4));
  const z = lerp(lerp(0.56, 1.06, k1), 1.32, k2) + k3 * 0.1;
  const r = lerp(lerp(-0.015, 0.055, k1), 0.0, k2);
  const lead = lerp(lerp(M(1.6), M(0.7), k1), M(0.15), k2);
  const y = lerp(lerp(G - M(1.3), G - M(0.62), k1), G - M(0.84), k2);
  return { cam: { x: hip[0] + lead, y, z, r }, seg: 2 };
};

/* ---------- state ---------- */

interface State {
  gait: Gait;
  splits: number[];
  speedPts: Pt[];
}

const solveSplit = (d: number) => {
  let a = 0;
  let b = RACE + 1;
  for (let i = 0; i < 50; i++) {
    const m = (a + b) / 2;
    if (dist(m) < d) a = m;
    else b = m;
  }
  return (a + b) / 2;
};

/* ---------- drawing: world ---------- */

const applyCam = (r: Riso, c: Cam) => r.camera(c.x, c.y, c.z, c.r);
const screen = (r: Riso) => r.camera(800, 450, 1, 0);

const FIG: FigStyle = {
  skin: '#141415',
  far: '#3b3b40',
  cut: BG,
  top: COBALT,
  shorts: COBALT,
  shoe: WHITE,
  bib: WHITE,
  bibText: '4',
};

const drawTrack = (c: Ctx, cam: Cam, rtNow: number, broken: number) => {
  const half = 1000 / cam.z;
  const x0 = cam.x - half - 300;
  const x1 = cam.x + half + 300;
  // stand / sky band with a metre ruler (parallax)
  c.fillStyle = BG;
  c.fillRect(x0, G - 3000, x1 - x0, 3000);
  // far lanes and the near lanes
  c.fillStyle = RED;
  c.fillRect(x0, G - 92, x1 - x0, 1400);
  c.fillStyle = '#e8331a';
  c.fillRect(x0, G - 92, x1 - x0, 26);
  c.fillStyle = WHITE;
  for (const [y, h] of [
    [G - 96, 5],
    [G - 30, 6],
    [G + 60, 9],
    [G + 210, 14],
    [G + 470, 22],
  ] as const)
    c.fillRect(x0, y, x1 - x0, h);
  // distance marks every 10 m and hash ticks every metre
  const m0 = Math.floor(x0 / K) - 1;
  const m1 = Math.ceil(x1 / K) + 1;
  const ticks = new Path2D();
  for (let m = m0; m <= m1; m++) {
    if (m < -3 || m > 106) continue;
    const x = M(m);
    ticks.rect(x - 1.5, G - 92, 3, m % 5 === 0 ? 24 : 12);
  }
  c.fill(ticks);
  for (let m = 10; m <= 90; m += 10) {
    const x = M(m);
    if (x < x0 - 400 || x > x1 + 400) continue;
    c.fillStyle = WHITE;
    c.beginPath();
    c.moveTo(x - 4, G - 30);
    c.lineTo(x + 4, G - 30);
    c.lineTo(x + 26, G + 69);
    c.lineTo(x + 14, G + 69);
    c.fill();
    c.save();
    c.translate(x + 60, G + 190);
    c.transform(1, 0, -0.5, 0.5, 0, 0);
    ktext(c, String(m), 0, 0, 230, { color: rgba(WHITE, 0.92), nw: 0.5 });
    c.restore();
  }
  // start and finish lines
  for (const m of [0, 100]) {
    const x = M(m);
    c.fillStyle = WHITE;
    c.beginPath();
    c.moveTo(x - (m ? 10 : 6), G - 92);
    c.lineTo(x + (m ? 10 : 6), G - 92);
    c.lineTo(x + (m ? 110 : 70), G + 1000);
    c.lineTo(x + (m ? 70 : 50), G + 1000);
    c.closePath();
    c.fill();
  }
  // finish post: a striped timing pole with the tape
  const fx = M(100);
  if (fx > x0 - 200 && fx < x1 + 200) {
    for (let i = 0; i < 12; i++) {
      c.fillStyle = i % 2 ? BLACK : WHITE;
      c.fillRect(fx - 160, G - 92 - 760 + i * 60, 22, 60);
    }
    c.fillStyle = BLACK;
    c.fillRect(fx - 172, G - 96 - 760, 46, 22);
    // tape: stretched to the near post until the chest breaks it, then trailing
    const tapeY = G - M(1.28);
    c.strokeStyle = RED;
    c.lineWidth = 9;
    c.beginPath();
    if (broken <= 0) {
      c.moveTo(fx - 138, tapeY);
      c.lineTo(fx + 4, tapeY + 2);
    } else {
      const w = broken;
      c.moveTo(fx - 138, tapeY);
      for (let i = 1; i <= 8; i++) {
        const u = i / 8;
        c.lineTo(fx - 138 - u * 170 * (0.4 + w), tapeY + u * 60 * w + Math.sin(u * 9 + rtNow * 30) * 10 * u);
      }
    }
    c.stroke();
  }
};

const drawBlocks = (c: Ctx, alpha: number) => {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = BLACK;
  c.fillRect(M(-1.12), G - 8, M(0.78), 12);
  const pad = (b: Pt, p: number) => {
    // a plate under the sole, propped on a strut from the rail
    const d = dir(90 - p);
    const n: Pt = [-d[1], d[0]];
    const toe: Pt = [b[0] + d[0] * 0.03 * HB, b[1] + d[1] * 0.03 * HB];
    const heel: Pt = [b[0] - d[0] * 0.13 * HB, b[1] - d[1] * 0.13 * HB];
    const o = 0.004 * HB;
    const th = 0.028 * HB;
    c.fillStyle = BLACK;
    c.beginPath();
    c.moveTo(heel[0] + n[0] * th, heel[1] + n[1] * th);
    c.lineTo(heel[0] - 10, G);
    c.lineTo(toe[0] + 6, G);
    c.closePath();
    c.fill();
    c.fillStyle = COBALT;
    c.beginPath();
    c.moveTo(heel[0] + n[0] * o, heel[1] + n[1] * o);
    c.lineTo(toe[0] + n[0] * o, toe[1] + n[1] * o);
    c.lineTo(toe[0] + n[0] * th, toe[1] + n[1] * th);
    c.lineTo(heel[0] + n[0] * th, heel[1] + n[1] * th);
    c.closePath();
    c.fill();
  };
  pad(BALL_FRONT, P_FRONT);
  pad(BALL_REAR, P_REAR);
  c.restore();
};

const drawRunner = (c: Ctx, s: State, figT: number, trail: number) => {
  // onion-skin trail
  if (trail > 0.01) {
    const lags = [0.105, 0.07, 0.035];
    lags.forEach((lag, i) => {
      const rt = figT - lag;
      if (rt < 0) return;
      const st = raceState(s.gait, rt);
      c.globalAlpha = trail * (0.16 + i * 0.12);
      drawSilhouette(c, fk(st.p, st.hip, HB), COBALT);
    });
    c.globalAlpha = 1;
  }
  const st = figT < 0 ? setState(figT) : raceState(s.gait, figT);
  drawFigure(c, fk(st.p, st.hip, HB), FIG);
  return st;
};

/* ---------- drawing: type and data ---------- */

const clockBox = (c: Ctx, v: number, x: number, y: number, size: number, bg: string, fg: string) => {
  const txt = fmt(v, 2);
  const w = kwidth(c, '00.00', size, { nw: 0.52 });
  c.fillStyle = bg;
  c.fillRect(x - w - size * 0.18, y - size * CAP - size * 0.16, w + size * 0.36, size * CAP + size * 0.32);
  ktext(c, txt, x, y, size, { align: 'right', nw: 0.52, color: fg });
};

const drawSplitsLadder = (c: Ctx, s: State, rt: number, x: number, y: number, color: string, accent: string, alpha = 1) => {
  for (let i = 0; i < 10; i++) {
    const tS = s.splits[i];
    const k = ease.outCubic(seg(rt, tS + 0.55, tS + 0.85));
    if (k <= 0) continue;
    const yy = y + i * 36;
    c.globalAlpha = alpha;
    masked(c, x - 6, yy - 30, 300 * k, 38, () => {
      c.fillStyle = accent;
      c.fillRect(x, yy - 26, 58, 32);
      ktext(c, `${(i + 1) * 10}`, x + 29, yy, 28, { align: 'center', color: WHITE, nw: 0.48 });
      ktext(c, fmt(tS, 2), x + 70, yy, 30, { color, nw: 0.5 });
      label(c, i ? `+${fmt(tS - s.splits[i - 1], 2)}` : 'R 0.142', x + 168, yy - 4, 14, color);
    });
    c.globalAlpha = 1;
  }
};

/** Big split tag that punches in at each 10 m mark */
const drawSplitTag = (c: Ctx, s: State, rt: number) => {
  for (let i = 0; i < 9; i++) {
    const tS = s.splits[i];
    const a = seg(rt, tS, tS + 0.18);
    const b = seg(rt, tS + 0.62, tS + 0.82);
    if (a <= 0 || b >= 1) continue;
    const x = col(0.3);
    const y = row(1.45);
    const inK = ease.outExpo(a);
    const outK = ease.inCubic(b);
    const m = `${(i + 1) * 10}M`;
    c.save();
    const dx = -(1 - inK) * 420 + outK * 60;
    masked(c, x - 10, y - 150, 760 * (1 - outK), 190, () => {
      c.fillStyle = RED;
      const w1 = kwidth(c, m, 120, { nw: 0.5 }) + 34;
      c.fillRect(x + dx, y - 108, w1, 128);
      ktext(c, m, x + dx + 17, y, 120, { color: WHITE, nw: 0.5 });
      ktext(c, fmt(tS, 2), x + dx + w1 + 18, y, 120, { color: BLACK, nw: 0.5 }, (ci) => ({ dy: (1 - ease.outBack(seg(rt, tS + 0.03 * ci, tS + 0.03 * ci + 0.22))) * 70 }));
    });
    c.restore();
  }
};

const drawSetType = (c: Ctx, tau: number) => {
  // "ON YOUR MARKS", letter by letter, then wiped up as "SET" punches in
  const marksIn = (i: number) => ease.outCubic(seg(tau, -2.25 + i * 0.035, -1.95 + i * 0.035));
  const marksOut = ease.inCubic(seg(tau, -0.75, -0.45));
  const x = col(0.5);
  if (marksOut < 1) {
    const up = (i: number) => -ease.inCubic(seg(tau, -0.8 + i * 0.02, -0.5 + i * 0.02)) * 170;
    masked(c, x - 20, row(1.55) - 130, 1300, 150, () => {
      ktext(c, 'ON YOUR', x, row(1.55), 150, { color: BLACK }, (i) => ({ dy: (1 - marksIn(i)) * 160 + up(i), hide: marksIn(i) <= 0 }));
    });
    masked(c, x - 20, row(2.75) - 130, 1300, 150, () => {
      ktext(c, 'MARKS', x, row(2.75), 150, { color: BLACK }, (i) => ({ dy: (1 - marksIn(i + 7)) * 160 + up(i + 7), hide: marksIn(i + 7) <= 0 }));
    });
  }
  const setIn = seg(tau, -0.5, -0.12);
  if (setIn > 0) {
    const punch = 1 + (1 - ease.outBack(setIn)) * 0.25;
    const out = ease.inExpo(seg(tau, GUN, GUN + 0.22));
    c.save();
    c.translate(x, row(2.9));
    c.scale(punch, punch);
    masked(c, -20, -400, 1400 * (1 - out), 440, () => {
      ktext(c, 'SET', 0, 0, 410, { color: RED, nw: 0.5 }, (i) => ({ dx: out * (180 + i * 160), dy: (1 - ease.outExpo(seg(setIn, i * 0.12, i * 0.12 + 0.55))) * 300 }));
    });
    c.restore();
  }
};

const drawFurniture = (c: Ctx, onDark: boolean) => {
  const ink = onDark ? WHITE : BLACK;
  drawGrid(c, ink, onDark ? 0.12 : 0.1);
  label(c, 'MEN 100 M · FINAL', col(0), 46, 14, ink);
  label(c, 'LANE 4', col(3), 46, 14, ink);
  label(c, 'WIND +0.6 M/S', col(5), 46, 14, ink);
};

/* ---------- the frame ---------- */

/** Draws the whole scene for "film time" t (no wipes) */
const scene = (r: Riso, s: State, t: number, wipeMask: Path2D | null) => {
  const c = r.layers[0];
  const inSet = t < GUN || t > FREEZE_END;
  const tau = t > FREEZE_END ? t - LOOP : t;
  c.save();
  if (wipeMask) {
    screen(r);
    c.clip(wipeMask);
  }
  if (inSet) {
    const st = setState(tau);
    const cam = setCam(tau, HIP_SET);
    screen(r);
    c.fillStyle = BG;
    c.fillRect(-10, -10, 1620, 920);
    applyCam(r, cam);
    drawTrack(c, cam, 0, 0);
    drawBlocks(c, 1);
    drawFigure(c, fk(st.p, st.hip, HB), FIG);
    screen(r);
    drawFurniture(c, false);
    drawSetType(c, tau);
    clockBox(c, 0, col(12), row(0.9), 92, BLACK, WHITE);
    label(c, 'REACTION', col(10), row(1.2), 14, BLACK);
    label(c, '0.000', col(10), row(1.2) + 20, 14, BLACK);
    c.restore();
    return;
  }

  const rtReal = t - GUN;
  const rt = Math.min(rtReal, RACE);
  const frozen = rtReal >= RACE;
  const hip = raceState(s.gait, rt).hip;
  // cuts between camera segments happen under band wipes
  const cuts = [2.3, 4.6];
  let camRt = rt;
  let mask: Path2D | null = null;
  let bars: Path2D | null = null;
  for (const cT of cuts) {
    if (rt >= cT - 0.22 && rt < cT + 0.3) {
      const w = wipeBands(seg(rt, cT - 0.22, cT + 0.3), { n: 4, slant: 300, stagger: 0.06, lag: 0.2 });
      mask = w.revealed;
      bars = w.covered;
      camRt = cT - 0.001;
      const camA = raceCam(camRt, hip).cam;
      drawRace(r, s, rt, frozen, camA, rtReal);
      const camB = raceCam(cT + 0.001 + (rt - (cT - 0.22)) * 0.0, hip).cam;
      c.save();
      screen(r);
      c.clip(mask);
      drawRace(r, s, rt, frozen, camB, rtReal);
      c.restore();
      screen(r);
      c.fillStyle = COBALT;
      c.fill(bars);
      break;
    }
  }
  if (!mask) drawRace(r, s, rt, frozen, raceCam(rt, hip).cam, rtReal);
  overlays(r, s, rt, rtReal);
  c.restore();
};

const drawRace = (r: Riso, s: State, rt: number, frozen: boolean, cam: Cam, rtReal: number) => {
  const c = r.layers[0];
  screen(r);
  c.fillStyle = BG;
  c.fillRect(-10, -10, 1620, 920);
  applyCam(r, cam);
  drawTrackNoSky(c, cam, rt, frozen);
  drawBlocks(c, 1);
  // giant type, screen space, between the track and the sprinter
  screen(r);
  bgType(r, s, rt, rtReal);
  applyCam(r, cam);
  const trail = clamp(seg(rt, 0.05, 0.4)) * (cam.z > 1.35 ? 0.4 : 1);
  drawRunner(c, s, rt, trail);
};

const drawTrackNoSky = (c: Ctx, cam: Cam, rt: number, frozen: boolean) => {
  const broken = rt > RACE - 0.02 ? clamp((rt - RACE + 0.02) / 0.1) : 0;
  c.save();
  // clip away the sky band so the big type behind shows
  const half = 1200 / cam.z;
  c.beginPath();
  c.rect(cam.x - half - 400, G - 96, half * 2 + 800, 3000);
  c.rect(M(100) - 180, G - 900, 200, 820);
  c.clip();
  drawTrack(c, cam, rt, broken + (frozen ? 0.6 : 0));
  c.restore();
  // ruler line above the stands
  const x0 = cam.x - half - 300;
  const x1 = cam.x + half + 300;
  c.fillStyle = rgba(BLACK, 0.55);
  c.fillRect(x0, G - 96 - 2, x1 - x0, 2);
};

const bgType = (r: Riso, s: State, rt: number, rtReal: number) => {
  const c = r.layers[0];
  // gun flash marker
  const g = seg(rt, 0, 0.5);
  if (g > 0 && g < 1) {
    c.save();
    c.globalAlpha = 1 - ease.outCubic(g);
    ktext(c, 'GO', 800, 640, 700 * (0.8 + g * 0.5), { align: 'center', color: COBALT, nw: 0.5 });
    c.restore();
  }
  // wide shot: giant halfway number slides through
  if (rt > 4.5 && rt < 6.9) {
    const k = seg(rt, 4.6, 7.0);
    const x = lerp(1450, -500, ease.inOutSine(k));
    const o = ease.inCubic(seg(rt, 6.55, 6.85));
    masked(c, 0, 600 - 380 + o * 380, 1600, 384, () => ktext(c, '50M', x, 600, 520, { color: COBALT, nw: 0.48 }));
  }
  // drive phase: reaction time spelled out
  if (rt > 0.15 && rt < 1.75) {
    const o = ease.inExpo(seg(rt, 1.45, 1.7));
    const x = col(0.3);
    masked(c, x - 10, row(1.0) - 10, 1400, 330 * (1 - o), () => {
      ktext(c, 'REACTION', x, row(1.9), 120, { color: BLACK, nw: 0.48 }, (i) => {
        const k = ease.outExpo(seg(rt, 0.15 + i * 0.03, 0.5 + i * 0.03));
        return { dy: (1 - k) * 140, hide: k <= 0 };
      });
      ktext(c, '0.142', x, row(3.25), 170, { color: RED, nw: 0.5 }, (i) => {
        const k = ease.outBack(seg(rt, 0.45 + i * 0.05, 0.75 + i * 0.05));
        return { dy: (1 - k) * 200, hide: k <= 0 };
      });
    });
  }
  // low angle: top speed, huge
  if (rt > 6.9 && rt < 9.1) {
    const k = ease.outExpo(seg(rt, 6.95, 7.5));
    const o = ease.inCubic(seg(rt, 8.75, 9.05));
    const v = vel(rt);
    masked(c, 0, row(0.5), 1600 * (1 - o), 420, () => {
      ktext(c, fmt(v, 1), col(0.3) - (1 - k) * 500, row(4.0), 400, { color: RED, nw: 0.5 });
      ktext(c, 'M/S', col(0.3) + kwidth(c, fmt(v, 1), 400, { nw: 0.5 }) + 24 - (1 - k) * 700, row(4.0), 130, { color: BLACK, nw: 0.5 });
    });
  }
  void rtReal;
};

const overlays = (r: Riso, s: State, rt: number, rtReal: number) => {
  const c = r.layers[0];
  screen(r);
  const frozen = rtReal >= RACE;
  const fz = seg(rtReal, RACE, RACE + 0.35);
  drawFurniture(c, false);
  // gun flash
  if (rtReal < 0.12) {
    c.fillStyle = rgba(WHITE, 1 - rtReal / 0.12);
    c.fillRect(0, 0, 1600, 900);
  }
  // the race clock (motif)
  if (!frozen) {
    clockBox(c, rt, col(12), row(0.9), 92, BLACK, WHITE);
    label(c, 'REACTION', col(10), row(1.2), 14, BLACK);
    label(c, '0.142', col(10), row(1.2) + 20, 14, BLACK);
  }
  drawSplitTag(c, s, rt);
  if (!frozen) drawSplitsLadder(c, s, rt, col(10), row(1.75), BLACK, BLACK);

  // stride metrics in the close-up
  if (rt > 2.3 && rt < 4.62) {
    stride(r, s, rt);
  }
  // speed trace in the low angle shot
  if (rt > 6.8 && rt < 9.6) {
    const k = ease.outCubic(seg(rt, 6.8, 7.3));
    const o = ease.inCubic(seg(rt, 9.2, 9.6));
    const pts = s.speedPts;
    const x0 = col(1);
    const x1 = col(9);
    const y0 = row(5.6);
    const yS = 170;
    const map = (p: Pt): Pt => [lerp(x0, x1, p[0] / RACE), y0 - (p[1] / 12) * yS];
    const mapped = pts.map(map);
    c.save();
    c.globalAlpha = 1 - o;
    masked(c, x0 - 20, y0 - yS - 40, (x1 - x0 + 60) * k, yS + 70, () => {
      c.strokeStyle = rgba(WHITE, 0.6);
      c.lineWidth = 1.5;
      for (let v = 0; v <= 12; v += 4) {
        c.beginPath();
        c.moveTo(x0, y0 - (v / 12) * yS + 0.5);
        c.lineTo(x1, y0 - (v / 12) * yS + 0.5);
        c.stroke();
      }
      c.strokeStyle = WHITE;
      c.lineWidth = 7;
      c.lineJoin = 'round';
      c.stroke(partialLine(mapped, rt / RACE));
      const p = map([rt, vel(rt)]);
      c.fillStyle = BLACK;
      c.fillRect(p[0] - 9, p[1] - 9, 18, 18);
      label(c, 'VELOCITY M/S', x0, y0 + 26, 15, WHITE);
      label(c, `${fmt(dist(rt), 1)} M`, p[0] + 16, p[1] - 14, 17, WHITE);
    });
    c.restore();
  }

  // finish: the freeze, the time
  if (frozen) {
    finale(r, s, fz, rtReal);
  }
};

const stride = (r: Riso, s: State, rt: number) => {
  const c = r.layers[0];
  const hip = raceState(s.gait, rt).hip;
  const cam = raceCam(rt, hip).cam;
  const steps = [...s.gait.steps[0], ...s.gait.steps[1]].filter((st) => st.t <= rt).sort((a, b) => a.t - b.t);
  if (steps.length < 3) return;
  const a = steps[steps.length - 2];
  const b = steps[steps.length - 1];
  const toS = (p: Pt): Pt => [(p[0] - cam.x) * cam.z + 800, (p[1] - cam.y) * cam.z + 450];
  const pa = toS(a.ball);
  const pb = toS(b.ball);
  const y = Math.min(pa[1] + 50, 800);
  const k = ease.outExpo(seg(rt, b.t, b.t + 0.12));
  const len = (b.ball[0] - a.ball[0]) / K;
  const appear = ease.outCubic(seg(rt, 2.45, 2.75));
  c.save();
  c.globalAlpha = appear;
  c.fillStyle = WHITE;
  c.strokeStyle = WHITE;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(pa[0], y - 22);
  c.lineTo(pa[0], y);
  c.lineTo(lerp(pa[0], pb[0], k), y);
  if (k > 0.98) c.lineTo(pb[0], y - 22);
  c.stroke();
  ktext(c, `STRIDE ${fmt(len, 2)} M`, clamp((pa[0] + pb[0]) / 2, 260, 1100), y - 40, 54, { align: 'center', color: WHITE, nw: 0.48 });
  // contact and cadence chips
  const ct = contactAt(rt) / (cadence(rt) / 2);
  const chips: [string, string][] = [
    ['CONTACT', `${fmt(ct, 3)} S`],
    ['CADENCE', `${fmt(cadence(rt), 2)} HZ`],
    ['STEP', `${steps.length - 1}`],
  ];
  chips.forEach(([l, v], i) => {
    const x = col(10) - 12;
    const yy = row(3.1) + i * 86;
    c.fillStyle = BLACK;
    c.fillRect(x, yy - 52, col(12) - x, 70);
    label(c, l, x + 12, yy - 32, 13, WHITE);
    ktext(c, v, x + 12, yy + 8, 40, { color: i === 0 ? RED : WHITE, nw: 0.48 });
  });
  c.restore();
};

const finale = (r: Riso, s: State, fz: number, rtReal: number) => {
  const c = r.layers[0];
  // red panel rises behind the frozen sprinter, time in white
  const k = ease.outExpo(fz);
  const panelTop = lerp(900, 0, k);
  c.save();
  c.beginPath();
  c.rect(0, panelTop, 1600, 900 - panelTop);
  c.clip();
  c.fillStyle = RED;
  c.fillRect(0, 0, 1600, 900);
  drawGrid(c, WHITE, 0.16);
  ktext(c, '9.79', 800, 640, 700, { align: 'center', color: WHITE, nw: 0.5 }, (i) => ({ dy: (1 - ease.outExpo(seg(rtReal, RACE + 0.08 + i * 0.05, RACE + 0.5 + i * 0.05))) * 500 }));
  // re-draw the frozen sprinter on the panel, black with a cobalt trail
  const st = raceState(s.gait, RACE);
  const cam = finaleCam(st.hip, seg(rtReal, RACE, RACE + 1.6));
  applyCam(r, cam);
  [0.18, 0.12, 0.06].forEach((lag, i) => {
    const o = raceState(s.gait, RACE - lag);
    c.globalAlpha = 0.3 + i * 0.18;
    drawSilhouette(c, fk(o.p, o.hip, HB), COBALT);
  });
  c.globalAlpha = 1;
  drawFigure(c, fk(st.p, st.hip, HB), { ...FIG, cut: RED });
  screen(r);
  label(c, 'MEN 100 M · FINAL', col(0), 46, 14, WHITE);
  label(c, 'LANE 4', col(3), 46, 14, WHITE);
  label(c, 'WIND +0.6 M/S', col(5), 46, 14, WHITE);
  label(c, 'TOP SPEED 11.71 M/S', col(9), 46, 14, WHITE);
  // the split bar along the bottom
  const cw = (col(12) - col(0)) / 10;
  for (let i = 0; i < 10; i++) {
    const kk = ease.outExpo(seg(rtReal, RACE + 0.3 + i * 0.04, RACE + 0.6 + i * 0.04));
    if (kk <= 0) continue;
    const x = col(0) + i * cw;
    const y = row(6) - 4;
    masked(c, x, y - 76 * kk, cw - 6, 80, () => {
      c.fillStyle = i === 9 ? WHITE : BLACK;
      c.fillRect(x, y - 76, cw - 6, 76);
      label(c, `${(i + 1) * 10} M`, x + 10, y - 54, 13, i === 9 ? BLACK : WHITE);
      ktext(c, fmt(s.splits[i], 2), x + 10, y - 12, 40, { color: i === 9 ? RED : WHITE, nw: 0.48 });
    });
  }
  c.restore();
};

const finaleCam = (hip: Pt, k: number): Cam => ({
  x: hip[0] - M(0.5),
  y: G - M(1.12),
  z: 1.02 + ease.outCubic(k) * 0.08,
  r: -0.02 * ease.outCubic(k),
});

/* ---------- film ---------- */

export const kineticSplitsFilm: RisoFilm<State> = {
  id: 'kinetic-splits',
  title: 'Splits',
  caption: 'One hundred metres, from the blocks to the tape and back into the blocks.',
  theme: 'Athletic',
  category: 'Athletic',
  motif: 'the race clock',
  duration: LOOP,
  series: 'Kinetic',
  mode: 'direct',
  paper: BG,
  grain: 0.06,
  inks: [{ color: RED }, { color: COBALT }, { color: BLACK }, { color: WHITE }],
  scenes: [
    { at: 0, label: 'Set' },
    { at: GUN, label: 'Gun' },
    { at: GUN + 2.3, label: 'Stride' },
    { at: GUN + 4.6, label: 'Halfway' },
    { at: GUN + 6.8, label: 'Top speed' },
    { at: FINISH_T, label: 'Tape' },
    { at: FREEZE_END, label: 'Back to the blocks' },
  ],
  posterTime: FINISH_T + 0.9,
  setup() {
    const splits = Array.from({ length: 10 }, (_, i) => solveSplit((i + 1) * 10));
    const speedPts: Pt[] = Array.from({ length: 80 }, (_, i) => {
      const rt = (i / 79) * RACE;
      return [rt, vel(rt)];
    });
    return { gait: makeRaceGait(), splits, speedPts };
  },
  draw(r, t, s) {
    const c = r.layers[0];
    const wk = seg(t, FREEZE_END, FREEZE_END + WIPE_DUR);
    if (wk > 0 && wk < 1) {
      scene(r, s, FREEZE_END - 0.001, null);
      const w = wipeBands(wk, { n: 5, slant: 340, stagger: 0.06, lag: 0.24 });
      scene(r, s, t, w.revealed);
      screen(r);
      c.fillStyle = BLACK;
      c.fill(w.covered);
      return;
    }
    scene(r, s, t, null);
  },
};
