import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, mulberry, smoothPath, polyPath, DISPLAY, MONO, type Pt } from '../riso/kit';

/**
 * Iron Hours: a wall clock hits 5:00, drops off the gym wall as a weight plate, rolls out of the
 * open garage door and up a hill where it rises as the sun. A runner follows it to the crest,
 * lifts the sun down into his hands as a plate again and presses it overhead. The plate settles
 * into a dial with its rim reading "one more rep".
 */

interface Chalk {
  a: number;
  sp: number;
  r: number;
  life: number;
  lvl: number;
}

interface State {
  chalk: Chalk[];
  hill: Path2D;
  farHill: Path2D;
  wall: Path2D;
  floor: Path2D;
  grass: Path2D;
}

/* ---------- world ---------- */

const FLOOR = 960;
const WALL_END = 3300;
const DOOR: [number, number, number, number] = [2480, 170, 720, 790];
const WIN: [number, number, number, number] = [1660, 300, 440, 400];

const smoothstep = (k: number) => {
  const c = clamp(k);
  return c * c * (3 - 2 * c);
};

const ground = (x: number) => {
  if (x <= 3000) return FLOOR;
  if (x <= 4300) return FLOOR - 380 * smoothstep((x - 3000) / 1300);
  if (x <= 5700) return 580 + 280 * smoothstep((x - 4300) / 1400);
  return 860;
};

const PR = 150; // plate radius in the gym
const LIFT_R = 66; // plate radius in the lifter's hands
const HIP_X = 4250;

/* ---------- small helpers ---------- */

const D = Math.PI / 180;
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const lerpPt = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

const circle = (cx: number, cy: number, r: number, path = new Path2D()) => {
  path.moveTo(cx + r, cy);
  path.arc(cx, cy, Math.max(0.1, r), 0, TAU);
  return path;
};
/** Annulus (fill with nonzero) */
const ring = (cx: number, cy: number, r0: number, r1: number) => {
  const p = new Path2D();
  p.moveTo(cx + r1, cy);
  p.arc(cx, cy, r1, 0, TAU);
  p.moveTo(cx + r0, cy);
  p.arc(cx, cy, Math.max(0.1, r0), 0, TAU, true);
  return p;
};

const fillTone = (r: Riso, ctx: Ctx, path: Path2D, d: number, rule: CanvasFillRule = 'nonzero') => {
  if (d <= 0.012) return;
  ctx.fillStyle = r.tone(ctx, d);
  ctx.fill(path, rule);
};

const knock = (r: Riso, path: Path2D, rule: CanvasFillRule = 'nonzero') => {
  r.all((ctx) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.fill(path, rule);
  });
};

const area = (pts: Pt[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
};
const cw = (pts: Pt[]) => (area(pts) < 0 ? pts.slice().reverse() : pts);

/* ---------- the body ---------- */

interface Pose {
  lean: number;
  neck: number;
  tN: number;
  sN: number;
  fN: number;
  tF: number;
  sF: number;
  fF: number;
  uN: number;
  aN: number;
  uF: number;
  aF: number;
}
const POSE_KEYS: (keyof Pose)[] = ['lean', 'neck', 'tN', 'sN', 'fN', 'tF', 'sF', 'fF', 'uN', 'aN', 'uF', 'aF'];
const lerpPose = (a: Pose, b: Pose, k: number): Pose => {
  const o = { ...a };
  for (const key of POSE_KEYS) o[key] = lerp(a[key], b[key], k);
  return o;
};

const STAND: Pose = { lean: 2, neck: -2, tN: 3, sN: 1, fN: 0, tF: -3, sF: -4, fF: 0, uN: 6, aN: 14, uF: -4, aF: 4 };
const ARMS_UP: Pose = { lean: -4, neck: 6, tN: 2, sN: 0, fN: 0, tF: -3, sF: -3, fF: 0, uN: 170, aN: 175, uF: 166, aF: 172 };
const RACK: Pose = { lean: -6, neck: 2, tN: 3, sN: 1, fN: 0, tF: -3, sF: -3, fF: 0, uN: 28, aN: 186, uF: 22, aF: 182 };
const DIP: Pose = { lean: -4, neck: 2, tN: 30, sN: -22, fN: 0, tF: 26, sF: -26, fF: 0, uN: 30, aN: 186, uF: 24, aF: 182 };
const LOCK: Pose = { lean: 2, neck: 8, tN: 2, sN: 0, fN: 0, tF: -3, sF: -3, fF: 0, uN: 178, aN: 180, uF: 174, aF: 177 };

const runPose = (ph: number): Pose => {
  const leg = (p: number) => {
    const th = 16 + 40 * Math.sin(p);
    const flex = 14 + 88 * Math.pow(Math.max(0, Math.cos(p + 0.3)), 1.4);
    return { th, sh: th - flex, f: 6 + 0.3 * (flex - 14) };
  };
  const n = leg(ph);
  const f = leg(ph + Math.PI);
  const uN = -38 * Math.sin(ph) + 6;
  const uF = 38 * Math.sin(ph) + 6;
  return { lean: 15, neck: -8, tN: n.th, sN: n.sh, fN: n.f, tF: f.th, sF: f.sh, fF: f.f, uN, aN: uN + 88, uF, aF: uF + 88 };
};

const L = { torso: 142, sh: 126, neck: 20, head: 25, thigh: 108, shin: 104, ua: 78, fa: 72 };
const dn = (a: number): Pt => [Math.sin(a * D), Math.cos(a * D)];
const up = (a: number): Pt => [Math.sin(a * D), -Math.cos(a * D)];

interface Joints {
  hip: Pt;
  tu: Pt;
  sh: Pt;
  nb: Pt;
  hd: Pt;
  head: Pt;
  kN: Pt;
  aN: Pt;
  kF: Pt;
  aF: Pt;
  eN: Pt;
  wN: Pt;
  eF: Pt;
  wF: Pt;
  p: Pose;
}

const fk = (p: Pose, hip: Pt): Joints => {
  const tu = up(p.lean);
  const sh = add(hip, tu, L.sh);
  const nb = add(hip, tu, L.torso);
  const hd = up(p.lean + p.neck);
  const head = add(nb, hd, L.neck + L.head * 0.85);
  const kN = add(hip, dn(p.tN), L.thigh);
  const aN = add(kN, dn(p.sN), L.shin);
  const hipF = add(hip, [-1, 0], 5);
  const kF = add(hipF, dn(p.tF), L.thigh);
  const aF = add(kF, dn(p.sF), L.shin);
  const eN = add(sh, dn(p.uN), L.ua);
  const wN = add(eN, dn(p.aN), L.fa);
  const shF = add(sh, [-1, 0], 6);
  const eF = add(shF, dn(p.uF), L.ua);
  const wF = add(eF, dn(p.aF), L.fa);
  return { hip, tu, sh, nb, hd, head, kN, aN, kF, aF, eN, wN, eF, wF, p };
};

/** Pose with the lower foot standing on the ground */
const place = (p: Pose, hx: number): Joints => {
  const j = fk(p, [0, 0]);
  const solN = j.aN[1] + 11;
  const solF = j.aF[1] + 11;
  const foot = solN >= solF ? j.aN : j.aF;
  const sole = Math.max(solN, solF);
  const gy = ground(hx + foot[0]);
  return fk(p, [hx, gy - sole]);
};

/** Tapered, muscled limb outline. plus/minus offsets at s = 0, .25, .5, .75, 1 */
const limb = (a: Pt, b: Pt, plus: number[], minus: number[]): Pt[] => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const u: Pt = [dx / len, dy / len];
  const n: Pt = [-u[1], u[0]];
  const pts: Pt[] = [];
  for (let i = 0; i < 5; i++) pts.push(add(add(a, u, (len * i) / 4), n, plus[i] * BW));
  pts.push(add(b, u, (plus[4] + minus[4]) * 0.42 * BW));
  for (let i = 4; i >= 0; i--) pts.push(add(add(a, u, (len * i) / 4), n, -minus[i] * BW));
  pts.push(add(a, u, -(plus[0] + minus[0]) * 0.42 * BW));
  return pts;
};

const TORSO_S = [-0.12, 0, 0.15, 0.35, 0.5, 0.66, 0.8, 0.92, 1.0];
const TORSO_F = [16, 25, 27, 25, 25, 31, 36, 28, 12];
const TORSO_B = [20, 31, 36, 27, 23, 26, 31, 30, 14];

const torso = (j: Joints): Pt[] => {
  const u = j.tu;
  const n: Pt = [-u[1], u[0]];
  const pts: Pt[] = [];
  for (let i = 0; i < TORSO_S.length; i++) pts.push(add(add(j.hip, u, TORSO_S[i] * L.torso), n, TORSO_F[i] * 1.12));
  for (let i = TORSO_S.length - 1; i >= 0; i--) pts.push(add(add(j.hip, u, TORSO_S[i] * L.torso), n, -TORSO_B[i] * 1.12));
  return pts;
};

const headPts = (j: Joints): Pt[] => {
  const u = j.hd;
  const f: Pt = [-u[1], u[0]];
  const dnv: Pt = [-u[0], -u[1]];
  const out: Pt[] = [];
  const bump = (a: number, c: number, w: number, amp: number) => {
    let d = a - c;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return amp * Math.exp(-(d * d) / (w * w));
  };
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    // local: x forward, y down
    let rx = 21;
    let ry = L.head;
    const nose = bump(a, 0.25, 0.16, 5);
    const chin = bump(a, 0.95, 0.3, 5);
    const skull = bump(a, Math.PI + 0.7, 0.6, 3);
    const k = 1 + (nose + chin + skull) / 22;
    rx *= k;
    ry *= k;
    const lx = Math.cos(a) * rx;
    const ly = Math.sin(a) * ry;
    out.push(add(add(j.head, f, lx), dnv, ly));
  }
  return out;
};

const footPts = (ank: Pt, ang: number): Pt[] => {
  const c = Math.cos(ang * D);
  const s = Math.sin(ang * D);
  const local: Pt[] = [
    [-9, -12],
    [-15, -2],
    [-15, 9],
    [10, 11],
    [40, 11],
    [47, 6],
    [42, -1],
    [22, -6],
    [8, -12],
  ];
  return local.map(([x, y]) => [ank[0] + x * c - y * s, ank[1] + x * s + y * c]);
};

const THIGH_P = [22, 22, 19, 15, 12];
const THIGH_M = [21, 23, 21, 17, 12];
const SHIN_P = [12, 17, 13, 8, 6];
const SHIN_M = [11, 10, 8, 6, 5];
const UA_P = [14, 13, 12, 10, 8];
const UA_M = [14, 14, 13, 10, 8];
const FA_P = [9, 10, 8, 6, 5];
const FA_M = [8, 9, 7, 6, 5];

const addShape = (path: Path2D, pts: Pt[]) => smoothPath(cw(pts), true, 0.5, path);

const bodyPaths = (j: Joints) => {
  const near = new Path2D();
  const far = new Path2D();
  const hipF = add(j.hip, [-1, 0], 5);
  const shF = add(j.sh, [-1, 0], 6);
  addShape(far, limb(hipF, j.kF, THIGH_P, THIGH_M));
  addShape(far, limb(j.kF, j.aF, SHIN_P, SHIN_M));
  addShape(far, footPts(j.aF, j.p.fF));
  addShape(far, limb(shF, j.eF, UA_P, UA_M));
  addShape(far, limb(j.eF, j.wF, FA_P, FA_M));
  circle(j.wF[0] + dn(j.p.aF)[0] * 7, j.wF[1] + dn(j.p.aF)[1] * 7, 10, far);

  addShape(near, torso(j));
  addShape(near, limb(j.nb, add(j.nb, j.hd, L.neck + 6), [12, 12, 11, 11, 11], [12, 11, 10, 10, 10]));
  addShape(near, headPts(j));
  addShape(near, limb(j.hip, j.kN, THIGH_P, THIGH_M));
  addShape(near, limb(j.kN, j.aN, SHIN_P, SHIN_M));
  addShape(near, footPts(j.aN, j.p.fN));
  addShape(near, limb(add(j.sh, j.tu, -6), j.eN, [17, 14, 12, 10, 8], [16, 15, 13, 10, 8]));
  addShape(near, limb(j.eN, j.wN, FA_P, FA_M));
  circle(j.wN[0] + dn(j.p.aN)[0] * 7, j.wN[1] + dn(j.p.aN)[1] * 7, 11, near);
  return { near, far };
};

/* ---------- the disc: clock, plate, sun ---------- */

interface DiscOpts {
  clock: number;
  sun: number;
  dial: number;
  hands: [number, number, number];
}

const drawDisc = (r: Riso, cx: number, cy: number, R: number, rot: number, o: DiscOpts) => {
  const [red, blk, yel] = r.layers;
  const plateK = 1 - o.clock;
  const ink = 1 - o.sun;
  knock(r, circle(cx, cy, R));

  // yellow: clock glow, sun body
  const yd = clamp(0.13 * o.clock + o.sun * 1.02);
  if (yd > 0.012) fillTone(r, yel, circle(cx, cy, R), yd);
  if (o.sun > 0.02) {
    r.gradient(red, circle(cx, cy, R), { kind: 'radial', cx, cy, r0: 0, r1: R, from: 0.04 * o.sun, to: 0.62 * o.sun }, 9);
  }

  // rim
  const rimIn = R * lerp(0.92, 0.88, plateK);
  fillTone(r, blk, ring(cx, cy, rimIn, R), ink >= 0.98 ? 1 : ink * 0.9);
  // face floods in from the rim
  const ri = R * lerp(0.88, 0.3, ease.inOutCubic(plateK));
  if (ri < rimIn - 0.5) fillTone(r, blk, ring(cx, cy, ri, rimIn), 0.72 * ink);
  // red colour band
  if (ri < R * 0.7) {
    const band = ring(cx, cy, R * 0.69, R * 0.765);
    fillTone(r, red, band, o.sun > 0 ? lerp(1, 0.75, o.sun) : 1);
    if (o.sun > 0.01) knock(r, ring(cx, cy, R * 0.765, R * 0.775));
  }
  // grooves
  if (ri < R * 0.6) fillTone(r, blk, ring(cx, cy, R * 0.6, R * 0.625), ink);
  // hub
  const hubK = seg(plateK, 0.72, 1);
  if (hubK > 0) {
    const hr = R * 0.3 * ease.outBack(hubK);
    fillTone(r, red, circle(cx, cy, hr), 0.5 * ink + 0.0);
    fillTone(r, blk, ring(cx, cy, hr * 0.86, hr), ink);
    fillTone(r, blk, circle(cx, cy, hr * 0.3), ink);
    // sleeve hole highlight
    blk.save();
    blk.globalCompositeOperation = 'destination-out';
    blk.strokeStyle = '#000';
    blk.lineWidth = R * 0.018;
    blk.beginPath();
    blk.arc(cx, cy, hr * 0.22, -2.6, -1.4);
    blk.stroke();
    blk.restore();
  }
  // embossed numbers + specular, cut out of the black
  if (ink > 0.4 && plateK > 0.6) {
    blk.save();
    blk.globalCompositeOperation = 'destination-out';
    blk.fillStyle = '#000';
    blk.globalAlpha = clamp((ink - 0.4) / 0.4) * seg(plateK, 0.8, 1) * (1 - o.dial);
    blk.translate(cx, cy);
    blk.font = `900 ${R * 0.15}px ${DISPLAY}`;
    blk.textAlign = 'center';
    blk.textBaseline = 'middle';
    for (let k = 0; k < 2; k++) {
      blk.save();
      blk.rotate(rot + k * Math.PI);
      blk.fillText(k === 0 ? '20' : 'KG', 0, -R * 0.465);
      blk.restore();
    }
    blk.restore();
  }
  if (ink > 0.3) {
    blk.save();
    blk.globalCompositeOperation = 'destination-out';
    blk.strokeStyle = '#000';
    blk.lineCap = 'round';
    blk.lineWidth = R * 0.028;
    blk.globalAlpha = ink;
    blk.beginPath();
    blk.arc(cx, cy, R * 0.945, -2.7, -1.75);
    blk.stroke();
    blk.lineWidth = R * 0.012;
    blk.beginPath();
    blk.arc(cx, cy, R * 0.945, -1.6, -1.35);
    blk.stroke();
    blk.restore();
  }

  // final dial: ticks + rim lettering cut into the plate
  if (o.dial > 0) {
    blk.save();
    blk.globalCompositeOperation = 'destination-out';
    blk.strokeStyle = '#000';
    blk.fillStyle = '#000';
    blk.translate(cx, cy);
    blk.rotate(rot);
    const count = Math.floor(o.dial * 60.99);
    blk.lineCap = 'butt';
    for (let i = 0; i < count; i++) {
      const a = (i / 60) * TAU - Math.PI / 2;
      const big = i % 5 === 0;
      blk.lineWidth = big ? R * 0.022 : R * 0.009;
      const r0 = big ? R * 0.43 : R * 0.5;
      blk.beginPath();
      blk.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      blk.lineTo(Math.cos(a) * R * 0.565, Math.sin(a) * R * 0.565);
      blk.stroke();
    }
    const text = 'ONE MORE REP  •  ONE MORE REP  •  ';
    const chars = Array.from(text);
    blk.font = `900 ${R * 0.072}px ${DISPLAY}`;
    blk.textAlign = 'center';
    blk.textBaseline = 'middle';
    const shown = Math.floor(seg(o.dial, 0.25, 1) * chars.length);
    for (let i = 0; i < shown; i++) {
      blk.save();
      blk.rotate((i / chars.length) * TAU);
      blk.fillText(chars[i], 0, -R * 0.82);
      blk.restore();
    }
    blk.restore();
  }

  // clock face
  if (o.clock > 0.01) {
    const c = o.clock;
    const tickIn = (big: boolean) => R * (0.86 - (big ? 0.1 : 0.045) * c);
    const thin = new Path2D();
    const bold = new Path2D();
    const reds = new Path2D();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2 + rot;
      const big = i % 5 === 0;
      const p = i % 15 === 0 ? reds : big ? bold : thin;
      const r0 = tickIn(big);
      p.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      p.lineTo(cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88);
    }
    blk.save();
    blk.strokeStyle = '#000';
    blk.lineWidth = R * 0.01;
    blk.stroke(thin);
    blk.lineWidth = R * 0.024;
    blk.stroke(bold);
    blk.restore();
    red.save();
    red.strokeStyle = '#000';
    red.lineWidth = R * 0.034;
    red.stroke(reds);
    red.restore();
    // hands: retract and spin into the hub as the plate forms
    const spin = (1 - c) * 9;
    const hand = (ang: number, len: number, w: number, tail: number) => {
      const a = ang - Math.PI / 2 + rot;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const nx = -uy;
      const ny = ux;
      const p = new Path2D();
      p.moveTo(cx - ux * tail + nx * w, cy - uy * tail + ny * w);
      p.lineTo(cx + ux * len + nx * w * 0.35, cy + uy * len + ny * w * 0.35);
      p.lineTo(cx + ux * (len + w), cy + uy * (len + w));
      p.lineTo(cx + ux * len - nx * w * 0.35, cy + uy * len - ny * w * 0.35);
      p.lineTo(cx - ux * tail - nx * w, cy - uy * tail - ny * w);
      p.closePath();
      return p;
    };
    const hk = lerp(0.12, 1, c);
    blk.fillStyle = '#000';
    blk.fill(hand(o.hands[0] + spin * 0.4, R * 0.46 * hk, R * 0.05, R * 0.1 * hk));
    blk.fill(hand(o.hands[1] + spin, R * 0.72 * hk, R * 0.035, R * 0.12 * hk));
    red.fillStyle = '#000';
    red.fill(hand(o.hands[2] + spin * 1.6, R * 0.8 * hk, R * 0.012, R * 0.2 * hk));
    red.fill(circle(cx, cy, R * 0.055));
    blk.fill(circle(cx, cy, R * 0.035));
  }
};

/* ---------- scenery ---------- */

const sky = (r: Riso, dawn: number) => {
  const [red, blk, yel] = r.layers;
  r.gradient(yel, null, { kind: 'linear', x0: 0, y0: -700, x1: 0, y1: 900, from: 0.06 + 0.12 * dawn, to: 0.4 + 0.5 * dawn }, 12);
  r.gradient(red, null, { kind: 'linear', x0: 0, y0: 150, x1: 0, y1: 950, from: 0, to: 0.22 + 0.33 * dawn }, 10);
  if (dawn < 0.98) {
    r.gradient(blk, null, { kind: 'linear', x0: 0, y0: -600, x1: 0, y1: 700, from: 0.55 * (1 - dawn), to: 0.05 * (1 - dawn) }, 10);
  }
};

const drawChalk = (r: Riso, s: State, x: number, y: number, t0: number, t: number, scale: number, upward: boolean) => {
  const age = t - t0;
  if (age < 0 || age > 1.8) return;
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  for (const p of s.chalk) {
    if (age > p.life) continue;
    const k = age / p.life;
    const dist = p.sp * (1 - Math.exp(-age * 4)) * scale;
    let a = p.a;
    if (upward) a = -Math.PI / 2 + (p.a / TAU - 0.5) * 2.9;
    const px = x + Math.cos(a) * dist;
    const py = y + Math.sin(a) * dist * (upward ? 0.55 : 1) - age * 40 * scale;
    const rr = p.r * scale * (0.5 + k * 1.4);
    const lvl = Math.min(2, p.lvl + Math.floor(k * 2));
    circle(px, py, rr, paths[lvl]);
  }
  const fade = 1 - seg(age, 0.6, 1.8);
  const dens = [0.55, 0.32, 0.15];
  r.all((ctx) => {
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i++) {
      const d = dens[i] * fade;
      if (d < 0.02) continue;
      ctx.fillStyle = r.tone(ctx, d);
      ctx.fill(paths[i]);
    }
  });
};

const drawGym = (r: Riso, s: State, t: number) => {
  const [red, blk, yel] = r.layers;
  knock(r, s.wall, 'evenodd');
  fillTone(r, blk, s.wall, 0.64, 'evenodd');
  fillTone(r, red, s.wall, 0.28, 'evenodd');
  // a warm pool of lamp light on the wall around the clock
  yel.save();
  yel.clip(s.wall, 'evenodd');
  r.gradient(yel, null, { kind: 'radial', cx: 800, cy: 450, r0: 180, r1: 620, from: 0.24, to: 0 }, 8);
  yel.restore();
  // painted stripe along the wall
  const stripe = new Path2D();
  stripe.rect(-3000, 690, DOOR[0] + 3000, 36);
  stripe.rect(DOOR[0] + DOOR[2], 690, WALL_END - DOOR[0] - DOOR[2], 36);
  red.fillStyle = '#000';
  red.fill(stripe);
  // window light on the wall + floor
  const dawn = seg(t, 2.5, 8);
  const shaft = new Path2D();
  shaft.moveTo(WIN[0], WIN[1] + WIN[3]);
  shaft.lineTo(WIN[0] + WIN[2], WIN[1] + WIN[3]);
  shaft.lineTo(WIN[0] + WIN[2] - 260, FLOOR + 200);
  shaft.lineTo(WIN[0] - 520, FLOOR + 200);
  shaft.closePath();
  fillTone(r, yel, shaft, 0.18 + 0.25 * dawn);
  // window frame
  const frame = new Path2D();
  const [wx, wy, ww, wh] = WIN;
  frame.rect(wx - 18, wy - 18, ww + 36, wh + 36);
  frame.rect(wx, wy, ww, wh);
  blk.fillStyle = '#000';
  blk.fill(frame, 'evenodd');
  const mull = new Path2D();
  mull.rect(wx + ww / 2 - 6, wy, 12, wh);
  mull.rect(wx, wy + wh / 2 - 6, ww, 12);
  blk.fill(mull);
  // garage door frame + rolled-up door
  const [dx, dy, dw] = DOOR;
  const df = new Path2D();
  df.rect(dx - 22, dy - 22, dw + 44, 22);
  df.rect(dx - 22, dy, 22, FLOOR - dy);
  df.rect(dx + dw, dy, 22, FLOOR - dy);
  blk.fill(df);
  const slats = new Path2D();
  for (let i = 0; i < 4; i++) slats.rect(dx, dy + i * 30, dw, 22);
  fillTone(r, blk, slats, 0.85);
  // floor
  knock(r, s.floor);
  fillTone(r, blk, s.floor, 0.8);
  fillTone(r, red, s.floor, 0.14);
  fillTone(r, yel, shaft, 0.12 + 0.2 * dawn);
  const plat = new Path2D();
  plat.moveTo(380, FLOOR);
  plat.lineTo(1240, FLOOR);
  plat.lineTo(1300, FLOOR + 90);
  plat.lineTo(320, FLOOR + 90);
  plat.closePath();
  fillTone(r, red, plat, 0.55);
  blk.save();
  blk.globalCompositeOperation = 'destination-out';
  blk.strokeStyle = '#000';
  blk.lineWidth = 3;
  blk.beginPath();
  blk.moveTo(-3000, FLOOR + 2);
  blk.lineTo(DOOR[0], FLOOR + 2);
  for (let i = 0; i < 12; i++) {
    const x0 = -600 + i * 340;
    blk.moveTo(x0, FLOOR + 8);
    blk.lineTo(x0 + (x0 - 1200) * 0.35, FLOOR + 600);
  }
  blk.stroke();
  blk.restore();

  // squat rack with a loaded bar (front view), behind the drop zone
  const rack = new Path2D();
  const ux = [1300, 1600];
  for (const x of ux) rack.rect(x - 17, -400, 34, FLOOR + 400);
  rack.rect(ux[0] - 70, FLOOR - 16, 410, 16);
  blk.fillStyle = '#000';
  blk.fill(rack);
  // holes
  blk.save();
  blk.globalCompositeOperation = 'destination-out';
  blk.fillStyle = '#000';
  const holes = new Path2D();
  for (const x of ux) for (let y = -360; y < FLOOR - 60; y += 44) circle(x, y, 4.5, holes);
  blk.fill(holes);
  blk.restore();
  const bar = new Path2D();
  bar.rect(1110, 452, 680, 12);
  blk.fill(bar);
  const hooks = new Path2D();
  for (const x of ux) hooks.rect(x - 24, 462, 48, 16);
  red.fillStyle = '#000';
  red.fill(hooks);
  for (const x of [1190, 1710]) {
    const p = new Path2D();
    p.roundRect(x - 24, 458 - 150, 48, 300, 14);
    knock(r, p);
    blk.fillStyle = '#000';
    blk.fill(p);
    const b = new Path2D();
    b.rect(x - 24, 458 - 150 + 34, 48, 16);
    b.rect(x - 24, 458 + 150 - 50, 48, 16);
    red.fillStyle = '#000';
    red.fill(b);
  }
  // kettlebells
  for (const [kx, kr, rd] of [
    [2060, 62, 0],
    [2210, 50, 1],
    [2330, 42, 0],
  ] as const) {
    const cy = FLOOR - kr * 0.92;
    const kb = new Path2D();
    kb.arc(kx, cy, kr, -Math.PI * 1.25 + Math.PI / 2 + 0.1, Math.PI * 0.25 + Math.PI / 2 - 0.1);
    kb.closePath();
    circle(kx, cy, kr, kb);
    const flat = new Path2D();
    flat.rect(kx - kr * 0.7, FLOOR - 6, kr * 1.4, 6);
    knock(r, kb);
    blk.fillStyle = '#000';
    blk.fill(kb);
    blk.fill(flat);
    blk.save();
    blk.strokeStyle = '#000';
    blk.lineWidth = kr * 0.24;
    blk.beginPath();
    blk.ellipse(kx, cy - kr * 0.95, kr * 0.62, kr * 0.62, 0, Math.PI * 1.05, Math.PI * 1.95);
    blk.stroke();
    blk.restore();
    if (rd) {
      red.fillStyle = r.tone(red, 0.6);
      red.fill(kb);
    }
  }
};

const drawHills = (r: Riso, s: State) => {
  const [red, blk, yel] = r.layers;
  knock(r, s.farHill);
  fillTone(r, red, s.farHill, 0.5);
  fillTone(r, yel, s.farHill, 0.6);
  fillTone(r, blk, s.farHill, 0.18);
  knock(r, s.hill);
  red.fillStyle = '#000';
  red.fill(s.hill);
  fillTone(r, blk, s.hill, 0.62);
  blk.fillStyle = '#000';
  blk.fill(s.grass);
};

/* ---------- the film ---------- */

const plateTraj = (t: number) => {
  const morphK = tween(t, 3.0, 3.9, ease.inOutCubic);
  let R = lerp(200, PR, morphK);
  let x = 800;
  let y = 450;
  let rot = 0;
  let sun = 0;
  // alarm shake
  const shake = seg(t, 2.25, 3.1);
  if (shake > 0 && shake < 1) rot = Math.sin(t * 70) * 0.05 * (1 - shake);
  const fall = seg(t, 3.35, 3.95);
  if (fall > 0) {
    y = lerp(450, FLOOR - R, fall * fall);
    rot += 0.6 * ease.outCubic(fall);
  }
  if (t > 3.95) y = FLOOR - PR - 30 * Math.sin(Math.PI * seg(t, 3.95, 4.3)) - 8 * Math.sin(Math.PI * seg(t, 4.3, 4.45));
  if (t > 4.45) {
    const k = seg(t, 4.45, 8.5);
    x = 800 + 3480 * ease.inOutSine(k);
    y = ground(x) - PR;
    rot = 0.6 + (x - 800) / PR;
  }
  if (t > 8.5) {
    const kc = seg(t, 8.5, 10.8);
    const dx = 170 * ease.outSine(kc);
    x = 4280 + dx;
    rot = 0.6 + (4280 + dx - 800) / PR;
    R = PR + 180 * tween(t, 8.8, 10.6, ease.inOutSine);
    const sink = 110 * Math.sin(Math.PI * seg(t, 8.5, 9.7));
    y = lerp(430 + sink, 250, tween(t, 9.0, 10.8, ease.inOutSine)) - 18 * seg(t, 10.8, 12);
    sun = tween(t, 9.0, 10.4, ease.inOutSine);
  }
  return { x, y, R, rot, clock: 1 - morphK, sun };
};

/** Runner / lifter pose and position */
const person = (t: number): Joints | null => {
  if (t < 7.4) return null;
  // constant speed, then ease to a stop at the crest
  const t0 = 7.4;
  const t1 = 10.6;
  const T = 0.8;
  const v = 1400 / (t1 - t0 + T / 2);
  const tc = Math.min(t, t1 + T);
  const tau = Math.max(0, tc - t1);
  const dist = v * (Math.min(tc, t1) - t0) + v * (tau - (tau * tau) / (2 * T));
  const hx = 2850 + dist;
  let p = runPose((dist / 250) * TAU);
  p = lerpPose(p, STAND, tween(t, 10.75, 11.45, ease.inOutSine));
  p = lerpPose(p, ARMS_UP, tween(t, 11.55, 12.3, ease.inOutCubic));
  p = lerpPose(p, RACK, tween(t, 13.15, 13.8, ease.inOutCubic));
  p = lerpPose(p, DIP, tween(t, 13.85, 14.05, ease.inOutSine));
  p = lerpPose(p, LOCK, tween(t, 14.05, 14.32, ease.outCubic));
  return place(p, hx);
};

const BAR_V: Pt = [0.99, -0.12];
const BW = 1.28;

const droopAt = (t: number) => {
  let d = 5 * seg(t, 12.7, 13.2);
  if (t > 13.8) {
    const k = t - 13.8;
    d += 9 * Math.exp(-k * 7) * Math.sin(k * 30);
  }
  if (t > 14.3) {
    const k = t - 14.3;
    d += 24 * Math.exp(-k * 3.6) * Math.sin(k * 19 + 0.4) + 6 * (1 - Math.exp(-k * 5));
  }
  return d;
};

export const ironHoursFilm: RisoFilm<State> = {
  id: 'iron-hours',
  title: 'Iron Hours',
  caption: 'Five a.m., a plate, a hill. The best ideas come between sets.',
  theme: 'Fitness',
  motif: 'The round weight plate',
  duration: 19.5,
  paper: '#f4e9d4',
  inks: [
    { color: '#f15060', offset: [1.4, -1], angle: 15 },
    { color: '#2b2b30', offset: [-1, 0.8], angle: 45 },
    { color: '#ffe800', offset: [0, 0], angle: 75 },
  ],
  scenes: [
    { at: 0, label: '5:00' },
    { at: 3.0, label: 'Plate drop' },
    { at: 7.4, label: 'Sunrise' },
    { at: 11.2, label: 'The press' },
    { at: 15.2, label: 'One more rep' },
  ],
  posterTime: 14.7,

  setup() {
    const rng = mulberry(51);
    const chalk: Chalk[] = Array.from({ length: 46 }, () => ({
      a: rng() * TAU,
      sp: 40 + rng() * rng() * 260,
      r: 8 + rng() * 26,
      life: 0.7 + rng() * 1.1,
      lvl: Math.floor(rng() * 2),
    }));
    const hillPts: Pt[] = [];
    for (let x = 2400; x <= 8000; x += 30) hillPts.push([x, ground(x)]);
    hillPts.push([8000, 3000], [2400, 3000]);
    const hill = polyPath(hillPts);
    const farPts: Pt[] = [];
    for (let x = 2400; x <= 8000; x += 40) {
      const y = 720 - 90 * Math.exp(-(((x - 5300) / 700) ** 2)) - 40 * Math.sin(x / 260) * 0.4;
      farPts.push([x, y]);
    }
    farPts.push([8000, 3000], [2400, 3000]);
    const farHill = smoothPath(farPts, true, 0.4);
    const wall = new Path2D();
    wall.rect(-3000, -2000, WALL_END + 3000, FLOOR + 2000);
    wall.rect(WIN[0], WIN[1], WIN[2], WIN[3]);
    wall.rect(DOOR[0], DOOR[1], DOOR[2], DOOR[3]);
    const floor = new Path2D();
    floor.rect(-3000, FLOOR, DOOR[0] + 3000, 2000);
    floor.rect(DOOR[0] - 1, FLOOR, WALL_END - DOOR[0] + 1, 2000);
    // grass tufts along the crest
    const grass = new Path2D();
    const g = mulberry(9);
    for (let x = 3150; x < 6200; x += 14 + g() * 22) {
      const y = ground(x) + 2;
      const h = 8 + g() * 22;
      const lean = (g() - 0.5) * 10;
      grass.moveTo(x - 3, y);
      grass.quadraticCurveTo(x + lean * 0.4, y - h * 0.6, x + lean, y - h);
      grass.quadraticCurveTo(x + 1, y - h * 0.4, x + 3, y);
      grass.closePath();
    }
    return { chalk, hill, farHill, wall, floor, grass };
  },

  draw(r, t, s) {
    const [red, blk, yel] = r.layers;
    const pl = plateTraj(t);
    const j = person(t);

    /* --- lifter's plate (S4/S5) --- */
    let px = pl.x;
    let py = pl.y;
    let pR = pl.R;
    let sun = pl.sun;
    let rot = pl.rot;
    let near: Pt = [0, 0];
    let far: Pt = [0, 0];
    let barK = 0;
    let dial = 0;
    const droop = droopAt(t);
    if (j && t > 11.9) {
      const g = add(j.wN, [0, 0]);
      near = add(add(g, BAR_V, 96), [0, droop]);
      far = add(add(g, BAR_V, -160), [0, droop * 0.7]);
      const dock = tween(t, 11.9, 12.8, ease.inOutCubic);
      px = lerp(pl.x, near[0], dock);
      py = lerp(pl.y, near[1], dock);
      pR = lerp(pl.R, LIFT_R, dock);
      sun = 1 - tween(t, 12.2, 12.9, ease.inOutSine);
      barK = tween(t, 12.6, 13.1, ease.inOutCubic);
      const settle = tween(t, 15.6, 17.0, ease.outBack);
      rot = lerp(pl.rot % TAU, 0, settle) - 0.35 * (1 - settle) * seg(t, 12.6, 15.6);
      dial = tween(t, 16.3, 18.0, ease.inOutSine);
    }

    /* --- camera --- */
    let cx = 800;
    let cy = 450;
    let zoom = 1 + 0.07 * tween(t, 0, 3.0, ease.inOutSine);
    const k1 = tween(t, 3.1, 4.3, ease.inOutCubic);
    cx = lerp(cx, 900, k1);
    cy = lerp(cy, 620, k1);
    zoom = lerp(zoom, 0.7, k1);
    const follow = tween(t, 4.3, 5.4, ease.inOutSine);
    cx = lerp(cx, pl.x + 200, follow);
    cy = lerp(cy, Math.min(620, pl.y - 190), follow);
    const k3 = tween(t, 7.9, 10.0, ease.inOutSine);
    cx = lerp(cx, 4330, k3);
    cy = lerp(cy, 470, k3);
    zoom = lerp(zoom, 0.5, k3);
    const k4 = tween(t, 11.0, 12.6, ease.inOutCubic);
    cx = lerp(cx, 4265, k4);
    cy = lerp(cy, 300, k4);
    zoom = lerp(zoom, 1.15, k4);
    if (j && t > 15.0) {
      const k5 = tween(t, 15.2, 17.0, ease.inOutCubic);
      const zf = lerp(zoom, 3.5, k5);
      cx = lerp(cx, px + 250 / 3.5, k5);
      cy = lerp(cy, py + 10 / 3.5, k5);
      zoom = zf;
    }
    r.camera(cx, cy, zoom);

    /* --- background --- */
    const dawn = seg(t, 2.5, 10);
    sky(r, dawn);
    const sunBehind = t > 8.5;
    const discOpts = (): DiscOpts => ({ clock: pl.clock, sun, dial, hands: clockHands(t) });
    if (sunBehind) {
      // halo
      if (sun > 0.05) {
        r.gradient(yel, null, { kind: 'radial', cx: px, cy: py, r0: pR, r1: pR * 2.4, from: 0.75 * sun, to: 0 }, 8);
        r.gradient(red, null, { kind: 'radial', cx: px, cy: py, r0: pR, r1: pR * 1.6, from: 0.3 * sun, to: 0 }, 6);
        // rays
        const rays = new Path2D();
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * TAU + t * 0.08;
          const w = 0.05;
          rays.moveTo(px + Math.cos(a - w) * pR * 1.12, py + Math.sin(a - w) * pR * 1.12);
          rays.lineTo(px + Math.cos(a) * pR * 2.6, py + Math.sin(a) * pR * 2.6);
          rays.lineTo(px + Math.cos(a + w) * pR * 1.12, py + Math.sin(a + w) * pR * 1.12);
          rays.closePath();
        }
        fillTone(r, red, rays, 0.35 * sun);
      }
      if (t < 11.9) drawDisc(r, px, py, pR, rot, discOpts());
    }
    drawHills(r, s);
    if (t < 7.9 + 1.5) drawGym(r, s, t);

    /* --- gym-time plate in front --- */
    if (!sunBehind) {
      drawDisc(r, px, py, pR, rot, discOpts());
      if (t < 3.2) {
        // alarm rings
        const env = seg(t, 2.2, 2.3) * (1 - seg(t, 3.0, 3.3));
        for (let i = 0; i < 3; i++) {
          const k = ((t - 2.2) * 1.6 + i / 3) % 1;
          if (t < 2.2 || env <= 0) break;
          const rr = pR * (1.06 + k * 0.9);
          fillTone(r, red, ring(px, py, rr, rr + 14 * (1 - k) + 3), (1 - k) * env);
        }
      }
      drawChalk(r, s, px, FLOOR, 3.95, t, 1.4, true);
      if (t > 4.45 && t < 8.5) {
        // dust kicked up behind the rolling plate
        const speed = seg(t, 4.5, 5.0) * (1 - seg(t, 7.6, 8.5));
        for (let i = 0; i < 4; i++) {
          const tt = 4.6 + i * 0.75;
          if (t > tt) {
            const xb = 800 + 3480 * ease.inOutSine(seg(tt, 4.45, 8.5));
            if (speed > 0.1) drawChalk(r, s, xb - 40, ground(xb), tt, t, 0.55, true);
          }
        }
      }
      // time stamp
      if (t < 3.4) {
        const a = 1 - seg(t, 2.9, 3.3);
        blk.save();
        blk.globalCompositeOperation = 'destination-out';
        blk.globalAlpha = a;
        blk.fillStyle = '#000';
        blk.font = `700 40px ${MONO}`;
        blk.textAlign = 'center';
        const txt = t < 2.2 ? '04:59' : '05:00';
        blk.fillText(txt, 800, 760);
        blk.restore();
        red.save();
        red.globalAlpha = a;
        red.fillStyle = '#000';
        red.font = `700 40px ${MONO}`;
        red.textAlign = 'center';
        red.fillText(txt, 800, 760);
        red.restore();
      }
    }

    /* --- the person --- */
    if (j) {
      if (barK > 0) {
        const fp = lerpPt(near, far, barK);
        // far plate behind the body
        drawDisc(r, fp[0], fp[1], LIFT_R * 0.84, rot + 0.4, { clock: 0, sun: 0, dial: 0, hands: [0, 0, 0] });
      }
      if (t > 11.9 && t < 12.85) drawDisc(r, px, py, pR, rot, { clock: 0, sun, dial, hands: [0, 0, 0] });
      const body = bodyPaths(j);
      knock(r, body.far);
      blk.fillStyle = r.tone(blk, 0.82);
      blk.fill(body.far);
      knock(r, body.near);
      blk.fillStyle = '#000';
      blk.fill(body.near);
      // warm rim light from the sun on the back of the figure
      if (t > 9 && t < 12.6) {
        red.save();
        red.clip(body.near);
        red.fillStyle = r.tone(red, 0.6);
        red.translate(-9, 0);
        red.fill(body.near);
        red.restore();
      }
      if (barK > 0) {
        const fp = lerpPt(near, far, barK);
        const g = j.wN;
        const c: Pt = [2 * g[0] - (near[0] + fp[0]) / 2, 2 * g[1] - (near[1] + fp[1]) / 2];
        blk.save();
        blk.strokeStyle = '#000';
        blk.lineCap = 'round';
        blk.lineWidth = 9;
        blk.beginPath();
        blk.moveTo(fp[0], fp[1]);
        blk.quadraticCurveTo(c[0], c[1], near[0], near[1]);
        blk.stroke();
        blk.restore();
      }
      drawChalk(r, s, j.wN[0] + 10, j.wN[1], 14.3, t, 0.45, false);
      if (t >= 12.85) drawDisc(r, px, py, pR, rot, { clock: 0, sun, dial, hands: [0, 0, 0] });
      drawChalk(r, s, j.wN[0], j.wN[1], 12.85, t, 0.4, false);
    }

    /* --- end title --- */
    if (t > 17.4) {
      r.camera(800, 450, 1);
      const a = tween(t, 17.4, 18.3, ease.outCubic);
      const b = tween(t, 17.9, 18.7, ease.outCubic);
      blk.save();
      blk.globalAlpha = a;
      blk.fillStyle = '#000';
      blk.font = `900 78px ${DISPLAY}`;
      blk.textAlign = 'left';
      blk.fillText('IRON', 1120, 400 + (1 - a) * 20);
      blk.fillText('HOURS', 1120, 480 + (1 - a) * 20);
      blk.restore();
      red.save();
      red.globalAlpha = b;
      red.fillStyle = '#000';
      red.fillRect(1124, 512, 300 * b, 6);
      red.font = `700 30px ${MONO}`;
      red.fillText('05:00 \u00b7 one more rep.', 1122, 556);
      red.restore();
    }
  },
};

/** Clock hands (radians, clockwise from 12): ticking toward 5:00 */
function clockHands(t: number): [number, number, number] {
  const ticks = 52 + 8 * clamp(t / 2.2);
  const whole = Math.floor(ticks);
  const frac = ticks - whole;
  const sec = whole + ease.outBack(clamp(frac * 3.5));
  const s = (sec / 60) * TAU;
  const min = t < 2.2 ? (59 / 60) * TAU : TAU + Math.min(0, ease.outBack(seg(t, 2.2, 2.35)) - 1) * (TAU / 60);
  const hour = (4 / 12) * TAU + (min / TAU) * (TAU / 12);
  return [hour, min, s];
}
