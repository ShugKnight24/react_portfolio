import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import { TAU, clamp, ease, hash, lerp, noise1, seg, tween, type Pt } from '../riso/kit';
import {
  SUMI,
  applyCam,
  bake,
  blotPts,
  bloom,
  drawPlate,
  ink,
  inscription,
  keys,
  makeSeal,
  mist,
  paperA,
  paperAge,
  spline,
  splatterPath,
  stampSeal,
  stroke,
  strokePath,
  verm,
  type Cam,
  type Plate,
} from '../styles/inkwash';

/*
 * Koi: the old legend in sumi ink, read as one tall hanging scroll.
 * Motif: the circle. Two koi chase each other round a pond (play); the red one breaks the
 * circle and climbs a waterfall in leaps (struggle) and bursts through the gate at the top,
 * where its body pours out into a dragon in the clouds (power). The dragon coils, and its
 * body becomes the enso (completion), with the seal pressed beside it.
 */

const DURATION = 18.5;
const T_EXIT = 3.7;
const T_GATE = 9.3;
const POND: Pt = [800, 480];
const FOOT_Y = 70;
const CREST_Y = -1330;
const WX0 = 700;
const WX1 = 900;
const CC: Pt = [800, -1950];
const CR = 330;
const KOI_L = 196;
const DRAGON_L = CR * TAU * 0.92;

/* ---------- paths ---------- */

const bez = (a: Pt, b: Pt, c: Pt, d: Pt, k: number): Pt => {
  const u = 1 - k;
  return [u * u * u * a[0] + 3 * u * u * k * b[0] + 3 * u * k * k * c[0] + k * k * k * d[0], u * u * u * a[1] + 3 * u * u * k * b[1] + 3 * u * k * k * c[1] + k * k * k * d[1]];
};

/** angle on the pond circle; the swirl tightens and speeds up before the break */
const circleTheta = (t: number, off: number) => {
  const raw = 1.25 * t + 0.8 * Math.max(0, t - 2.4) ** 2;
  const raw0 = 1.25 * T_EXIT + 0.8 * (T_EXIT - 2.4) ** 2;
  return Math.PI + raw - raw0 + off;
};
const circleR = (t: number) => 190 - 62 * ease.inOutSine(seg(t, 2.3, T_EXIT));
const onCircle = (t: number, off: number): Pt => {
  const a = circleTheta(t, off);
  const R = circleR(t);
  return [POND[0] + Math.cos(a) * R, POND[1] + Math.sin(a) * R];
};

/** The climb: leaps, and holds against the current between them */
const CLIMB: [number, number, (k: number) => number][] = [
  [4.6, FOOT_Y + 10, ease.linear],
  [5.05, FOOT_Y - 20, ease.inOutSine],
  [5.5, -300, ease.outCubic],
  [6.2, -335, ease.inOutSine],
  [6.7, -690, ease.outCubic],
  [7.35, -725, ease.inOutSine],
  [7.85, -1060, ease.outCubic],
  [8.55, -1100, ease.inOutSine],
  [T_GATE, -1440, ease.inCubic],
];
const climbY = (t: number) => {
  if (t <= CLIMB[0][0]) return CLIMB[0][1];
  for (let i = 1; i < CLIMB.length; i++) {
    if (t <= CLIMB[i][0]) return lerp(CLIMB[i - 1][1], CLIMB[i][1], CLIMB[i][2](seg(t, CLIMB[i - 1][0], CLIMB[i][0])));
  }
  return CLIMB[CLIMB.length - 1][1];
};

interface Track {
  t0: number;
  dt: number;
  x: Float64Array;
  y: Float64Array;
  s: Float64Array;
}

const makeTrack = (head: (t: number) => Pt, t0 = -4, t1 = DURATION + 0.1, dt = 1 / 240): Track => {
  const n = Math.ceil((t1 - t0) / dt) + 1;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = head(t0 + i * dt);
    x[i] = p[0];
    y[i] = p[1];
    s[i] = i ? s[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]) : 0;
  }
  return { t0, dt, x, y, s };
};

const trackS = (tr: Track, t: number) => {
  const f = (t - tr.t0) / tr.dt;
  const i = Math.max(0, Math.min(tr.s.length - 2, Math.floor(f)));
  return lerp(tr.s[i], tr.s[i + 1], clamp(f - i));
};

const atS = (tr: Track, s: number): Pt => {
  let lo = 0;
  let hi = tr.s.length - 1;
  if (s <= tr.s[0]) return [tr.x[0], tr.y[0]];
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (tr.s[m] < s) lo = m;
    else hi = m;
  }
  const k = (s - tr.s[lo]) / (tr.s[hi] - tr.s[lo] || 1);
  return [lerp(tr.x[lo], tr.x[hi], k), lerp(tr.y[lo], tr.y[hi], k)];
};

/** Spine head-to-tail along the track behind the head, with a lateral swim wave */
const spineAt = (tr: Track, t: number, L: number, n: number, wave: (u: number) => number): Pt[] => {
  const sh = trackS(tr, t);
  const raw: Pt[] = [];
  for (let i = 0; i <= n; i++) raw.push(atS(tr, sh - (i / n) * L));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = raw[Math.max(0, i - 1)];
    const b = raw[Math.min(n, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const w = wave(i / n);
    out.push([raw[i][0] - ((b[1] - a[1]) / l) * w, raw[i][1] + ((b[0] - a[0]) / l) * w]);
  }
  return out;
};

/* ---------- camera ---------- */

const logKeys = (t: number, ks: [number, number][], fn: (k: number) => number) => Math.exp(keys(t, ks.map(([a, b]) => [a, Math.log(b)] as [number, number]), fn));

const camAt = (t: number): Cam => {
  const fn = ease.inOutSine;
  const x = keys(t, [[0, 800], [4.0, 790], [5.0, 800], [8.6, 805], [T_GATE, 800], [11.6, 820], [13.4, 800], [DURATION, 800]], fn);
  const y = keys(t, [[0, 482], [3.9, 470], [5.1, 60], [5.8, -170], [6.9, -520], [8.0, -880], [8.7, -1180], [T_GATE, -1350], [9.75, -1400], [11.6, -1840], [13.4, -1950], [DURATION, -1950]], fn);
  let z = logKeys(t, [[0, 1.08], [3.9, 1.0], [5.1, 1.06], [8.0, 1.1], [8.7, 1.25], [T_GATE, 1.75], [9.75, 1.6], [11.6, 0.68], [13.4, 0.72], [15.4, 0.84], [DURATION, 1.0]], fn);
  let rot = keys(t, [[0, 0.06], [3.9, -0.05], [5.1, 0], [8.7, 0.0], [T_GATE, 0.05], [9.75, 0.03], [11.6, -0.03], [13.4, 0.02], [15.4, 0], [DURATION, 0]], fn);
  let xx = x;
  let yy = y;
  if (t > T_GATE) {
    const d = t - T_GATE;
    const e = Math.exp(-d * 7);
    z *= 1 + 0.1 * e;
    xx += (8 * e * Math.sin(d * 87)) / z;
    yy += (7 * e * Math.cos(d * 73)) / z;
    rot += 0.008 * e * Math.sin(d * 61);
  }
  return { x: xx, y: yy, z, rot };
};

/* ---------- fish and dragon drawing ---------- */

const KOI_W: [number, number][] = [[0, 0.52], [0.07, 0.86], [0.2, 1], [0.48, 0.74], [0.8, 0.3], [1, 0.16]];
const DRAGON_W: [number, number][] = [[0, 0.7], [0.05, 0.5], [0.12, 0.78], [0.3, 1], [0.62, 0.86], [0.86, 0.45], [1, 0.1]];
const ENSO_W: [number, number][] = [[0, 0.7], [0.05, 1.05], [0.3, 0.95], [0.7, 0.75], [1, 0.4]];
const prof = (ks: [number, number][], u: number) => keys(u, ks, (k) => k * k * (3 - 2 * k));

const frame = (pts: Pt[], i: number) => {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  // tangent points from head toward tail
  return { tx: (b[0] - a[0]) / l, ty: (b[1] - a[1]) / l, nx: -(b[1] - a[1]) / l, ny: (b[0] - a[0]) / l };
};

/** A koi seen from above: brush body, eyes, pectoral fins, a tail fin that splits into rays */
const drawKoi = (c: Ctx, sp: Pt[], red: boolean, t: number, alpha: number, paint: number, step: number) => {
  if (alpha <= 0 || paint <= 0) return;
  const W = 52;
  c.save();
  c.globalAlpha = alpha;
  const n = sp.length - 1;
  const hw = (u: number) => 0.5 * W * prof(KOI_W, u);
  // fins under the body
  const fins = new Path2D();
  const finP = clamp(paint * 1.6 - 0.4);
  if (finP > 0) {
    const i = Math.round(n * 0.2);
    const f = frame(sp, i);
    for (const side of [-1, 1]) {
      const flap = 0.35 * Math.sin(t * 6.5 + side);
      const base: Pt = [sp[i][0] + f.nx * hw(0.2) * side * 0.85, sp[i][1] + f.ny * hw(0.2) * side * 0.85];
      const ang = Math.atan2(f.ty, f.tx) - side * (1.05 + flap);
      for (let j = 0; j < 3; j++) {
        const a = ang + side * (j - 1) * 0.22;
        const len = (30 - j * 4) * finP;
        strokePath([base, [base[0] + Math.cos(a) * len * 0.5, base[1] + Math.sin(a) * len * 0.5], [base[0] + Math.cos(a) * len, base[1] + Math.sin(a) * len]], { w: 9, outT: 0.6, inT: 0.1, dry: 0.4, seed: j + side * 3, step }, fins);
      }
    }
    // tail fin: two lobes, wagging, dry so the bristles read as rays
    const e = sp[n];
    const f2 = frame(sp, n);
    const wag = 0.35 * Math.sin(t * 8 - 2.6);
    const back = Math.atan2(f2.ty, f2.tx);
    for (const side of [-1, 1]) {
      const a = back + side * 0.5 + wag;
      const len = 46 * finP;
      strokePath([[e[0] - f2.tx * 6, e[1] - f2.ty * 6], [e[0] + Math.cos(a - side * 0.15) * len * 0.5, e[1] + Math.sin(a - side * 0.15) * len * 0.5], [e[0] + Math.cos(a) * len, e[1] + Math.sin(a) * len]], { w: 17, outT: 0.5, inT: 0.08, startW: 0.6, dry: 0.85, bristles: 9, seed: 5 + side, step }, fins);
    }
  }
  c.fillStyle = red ? ink(0.32) : ink(0.62);
  c.fill(fins);
  // the body: one stroke, nose first
  const body = strokePath(sp, { w: W, p: paint, inT: 0.01, outT: 0.01, startW: 1, minW: 0.12, press: (u) => prof(KOI_W, u), jitter: 0.03, rough: 0.025, dry: red ? 0 : 0.3, seed: red ? 21 : 22, step });
  if (red) {
    c.fillStyle = SUMI.paper;
    c.fill(body);
    c.fillStyle = ink(0.05);
    c.fill(body);
    c.save();
    c.clip(body);
    for (const [u, R, sd] of [[0.06, 17, 1], [0.34, 22, 2], [0.62, 14, 3]] as [number, number, number][]) {
      const i = Math.round(n * u);
      const f = frame(sp, i);
      const off = (hash(sd) - 0.5) * 12;
      bloom(c, sp[i][0] + f.nx * off, sp[i][1] + f.ny * off, R, clamp(paint * 1.4 - u), { seed: 30 + sd, rgb: [194, 58, 34], alpha: 0.92, ring: 0.5, irr: 0.22, feather: 0.6, sy: 1 });
    }
    c.restore();
    c.lineWidth = 1.5;
    c.strokeStyle = ink(0.45);
    c.stroke(body);
  } else {
    c.fillStyle = ink(0.86);
    c.fill(body);
    // light along the back
    const hi: Pt[] = sp.slice(Math.round(n * 0.08), Math.round(n * 0.55));
    if (hi.length > 2 && paint > 0.5) stroke(c, hi, { w: 4, outT: 0.6, inT: 0.3, seed: 9, step }, paperA(0.28));
  }
  // eyes
  if (paint > 0.1) {
    const i = Math.round(n * 0.07);
    const f = frame(sp, i);
    const eyes = new Path2D();
    for (const side of [-1, 1]) {
      const ex = sp[i][0] + f.nx * hw(0.07) * 0.62 * side;
      const ey = sp[i][1] + f.ny * hw(0.07) * 0.62 * side;
      eyes.moveTo(ex + 2.6, ey);
      eyes.arc(ex, ey, 2.6, 0, TAU);
    }
    c.fillStyle = red ? ink(0.92) : paperA(0.8);
    c.fill(eyes);
  }
  c.restore();
};

interface DragonLook {
  /** 0 koi .. 1 dragon */
  mk: number;
  /** 0 flying .. 1 settled into the enso */
  ek: number;
  /** how far the black has filled the body, head to tail */
  fill: number;
}

/** The dragon: one long brush stroke for the body with scales, a red crest, legs and head */
const drawDragon = (c: Ctx, sp: Pt[], t: number, L: DragonLook, step: number) => {
  const n = sp.length - 1;
  const W = lerp(52, 66, L.mk);
  const press = (u: number) => {
    const a = lerp(prof(KOI_W, u), prof(DRAGON_W, u), L.mk);
    return lerp(a, prof(ENSO_W, u), L.ek);
  };
  const hw = (u: number) => 0.5 * W * press(u);
  // the head's top faces up the screen in flight and out of the circle once coiled
  const f0 = frame(sp, 1);
  const fx = -f0.tx;
  const fy = -f0.ty;
  const outward: Pt = [sp[0][0] - CC[0], sp[0][1] - CC[1]];
  const ol = Math.hypot(outward[0], outward[1]) || 1;
  const bx0 = lerp(-0.3, outward[0] / ol, L.ek);
  const by0 = lerp(-1, outward[1] / ol, L.ek);
  let ux = bx0 - (bx0 * fx + by0 * fy) * fx;
  let uy = by0 - (bx0 * fx + by0 * fy) * fy;
  let ul = Math.hypot(ux, uy);
  if (ul < 0.05) {
    ux = fy;
    uy = -fx;
    ul = 1;
  }
  ux /= ul;
  uy /= ul;
  const backSide = f0.nx * ux + f0.ny * uy >= 0 ? 1 : -1;
  const detail = L.mk * (1 - L.ek);

  // legs behind the body
  if (detail > 0.02) {
    const legs = new Path2D();
    const claws = new Path2D();
    for (const [u, ph] of [[0.17, 0], [0.21, 1.6], [0.58, 2.4], [0.62, 4]] as [number, number][]) {
      const i = Math.round(n * u);
      const f = frame(sp, i);
      const base: Pt = [sp[i][0] - f.nx * hw(u) * 0.6 * backSide, sp[i][1] - f.ny * hw(u) * 0.6 * backSide];
      const sw = 0.35 * Math.sin(t * 3.2 + ph);
      const dnx = -backSide * f.nx;
      const dny = -backSide * f.ny;
      const a1 = 0.55 + sw;
      const l1 = 46 * detail;
      const knee: Pt = [base[0] + (dnx * Math.cos(a1) + f.tx * Math.sin(a1)) * l1, base[1] + (dny * Math.cos(a1) + f.ty * Math.sin(a1)) * l1];
      const a2 = 0.95 - sw * 0.6;
      const l2 = 40 * detail;
      const sx = dnx * Math.cos(a2) - f.tx * Math.sin(a2);
      const sy = dny * Math.cos(a2) - f.ty * Math.sin(a2);
      const paw: Pt = [knee[0] + sx * l2, knee[1] + sy * l2];
      const aS = Math.atan2(sy, sx);
      strokePath(spline([base, lp(base, knee, 0.5), knee, paw], 6), { w: 15 * detail, outT: 0.35, inT: 0.05, startW: 1, minW: 0.4, seed: u * 100, step }, legs);
      for (let j = 0; j < 4; j++) {
        const ca = aS + (j - 1.5) * 0.45;
        const cl = 20 * detail;
        strokePath([paw, [paw[0] + Math.cos(ca) * cl * 0.6, paw[1] + Math.sin(ca) * cl * 0.6], [paw[0] + Math.cos(ca + 0.6) * cl, paw[1] + Math.sin(ca + 0.6) * cl]], { w: 4.5 * detail, outT: 0.8, seed: j + u * 50, step }, claws);
      }
    }
    c.fillStyle = ink(0.88);
    c.fill(legs);
    c.fillStyle = ink(0.95);
    c.fill(claws);
  }

  // the body fills with ink from the head toward the tail
  if (L.fill > 0) {
    const inkBody = strokePath(sp, { w: W, p: L.fill, inT: 0.01, outT: 0.02, startW: 1, minW: 0.08, press, jitter: 0.06, rough: 0.035, dry: lerp(0.45, 0.62, L.ek), bristles: 16, seed: 41, step });
    c.fillStyle = SUMI.paper;
    c.fill(inkBody);
    c.fillStyle = ink(0.9);
    c.fill(inkBody);
  }

  if (detail > 0.02) {
    // scales and belly plates in paper, the red crest along the back
    const scales = new Path2D();
    const belly = new Path2D();
    const crest = new Path2D();
    for (let u = 0.1; u < 0.9 * L.fill; u += 0.022) {
      const i = Math.round(n * u);
      const f = frame(sp, i);
      const h = hw(u);
      for (const row of [-0.25, 0.25]) {
        const cx = sp[i][0] + f.nx * h * row * backSide + f.tx * (row > 0 ? 0 : h * 0.3);
        const cy = sp[i][1] + f.ny * h * row * backSide + f.ty * (row > 0 ? 0 : h * 0.3);
        const s = h * 0.36;
        strokePath([[cx + f.nx * s, cy + f.ny * s], [cx + f.tx * s * 0.8, cy + f.ty * s * 0.8], [cx - f.nx * s, cy - f.ny * s]], { w: Math.max(1.2, h * 0.09), outT: 0.4, inT: 0.4, seed: u * 300 + row, step: Math.max(step, 1.5) }, scales);
      }
      const bx = sp[i][0] - f.nx * h * 0.62 * backSide;
      const by = sp[i][1] - f.ny * h * 0.62 * backSide;
      strokePath([[bx + f.nx * h * 0.3 * backSide, by + f.ny * h * 0.3 * backSide], [bx - f.nx * h * 0.25 * backSide, by - f.ny * h * 0.25 * backSide]], { w: Math.max(1, h * 0.07), outT: 0.4, seed: u * 200, step: Math.max(step, 1.5) }, belly);
      if ((Math.round(u / 0.022) & 1) === 0 && u < 0.84) {
        const bx2 = sp[i][0] + f.nx * h * 0.86 * backSide;
        const by2 = sp[i][1] + f.ny * h * 0.86 * backSide;
        const fl = h * (0.8 + 0.25 * Math.sin(u * 40 + t * 3));
        const tipx = bx2 + (f.nx * backSide * 0.6 + f.tx * 0.7) * fl;
        const tipy = by2 + (f.ny * backSide * 0.6 + f.ty * 0.7) * fl;
        strokePath([[bx2 - f.tx * h * 0.25, by2 - f.ty * h * 0.25], [lerp(bx2, tipx, 0.5) + f.tx * 2, lerp(by2, tipy, 0.5) + f.ty * 2], [tipx, tipy]], { w: h * 0.42, outT: 0.75, inT: 0.05, startW: 1, seed: u * 77, step: Math.max(step, 1.5) }, crest);
      }
    }
    c.save();
    c.globalAlpha = detail;
    c.fillStyle = paperA(0.42);
    c.fill(scales);
    c.fillStyle = paperA(0.5);
    c.fill(belly);
    c.fillStyle = verm(0.92);
    c.fill(crest);
    // a red flame at the tip of the tail
    const e = sp[n];
    const ft = frame(sp, n);
    const fl = new Path2D();
    for (let j = 0; j < 4; j++) {
      const a = Math.atan2(ft.ty, ft.tx) + (j - 1.5) * 0.32 + 0.25 * Math.sin(t * 5 + j);
      const len = (52 - Math.abs(j - 1.5) * 10) * L.mk;
      strokePath([[e[0] - ft.tx * 20, e[1] - ft.ty * 20], [e[0] + Math.cos(a) * len * 0.5, e[1] + Math.sin(a) * len * 0.5], [e[0] + Math.cos(a + 0.3) * len, e[1] + Math.sin(a + 0.3) * len]], { w: 10, outT: 0.7, dry: 0.6, seed: 90 + j, step }, fl);
    }
    c.fill(fl);
    c.restore();
  }

  // the head
  const hk = clamp(L.mk * 1.3 - 0.15);
  if (hk > 0) {
    c.save();
    c.translate(sp[0][0] + fx * 4, sp[0][1] + fy * 4);
    const hs = lerp(0.4, 1, hk) * (W / 66) * 1.45;
    // local x forward, local +y toward the jaw (away from the top of the head)
    c.transform(fx * hs, fy * hs, -ux * hs, -uy * hs, 0, 0);
    c.globalAlpha = hk;
    drawHead(c, t);
    c.restore();
  }
};

const lp = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

/** Dragon head in its own frame: snout along +x, the top of the head toward -y */
const drawHead = (c: Ctx, t: number) => {
  const st = 1;
  // mane: red flames streaming back
  const mane = new Path2D();
  for (let j = 0; j < 6; j++) {
    const y0 = -18 + j * 7;
    const wv = 9 * Math.sin(t * 4 + j * 0.9);
    strokePath(spline([[-22, y0], [-52, y0 - 6 + wv * 0.5], [-86, y0 - 14 + wv], [-112, y0 - 30 + wv * 1.4]], 6), { w: 11 - j * 0.6, outT: 0.75, inT: 0.05, dry: 0.65, seed: 60 + j, step: st }, mane);
  }
  c.fillStyle = verm(0.9);
  c.fill(mane);
  // horns
  const horns = new Path2D();
  strokePath(spline([[-8, -20], [-30, -36], [-58, -46], [-78, -44]], 6), { w: 8, outT: 0.7, inT: 0.05, startW: 1, seed: 71, step: st }, horns);
  strokePath(spline([[-36, -38], [-40, -54], [-36, -64]], 5), { w: 4.5, outT: 0.7, seed: 72, step: st }, horns);
  strokePath(spline([[-2, -18], [-20, -42], [-40, -58], [-50, -70]], 6), { w: 6, outT: 0.7, inT: 0.05, startW: 1, seed: 73, step: st }, horns);
  c.fillStyle = ink(0.85);
  c.fill(horns);
  // skull and snout
  const skull = new Path2D();
  const sk: Pt[] = [[-36, -14], [-20, -22], [0, -22], [14, -16], [34, -12], [48, -8], [52, -1], [46, 3], [8, 4], [-14, 10], [-34, 12]];
  skull.moveTo(sk[0][0], sk[0][1]);
  for (const q of spline(sk, 5)) skull.lineTo(q[0], q[1]);
  skull.closePath();
  c.fillStyle = SUMI.paper;
  c.fill(skull);
  c.fillStyle = ink(0.92);
  c.fill(skull);
  // open jaw, and teeth in the gap
  const open = 0.12 + 0.08 * Math.sin(t * 2.2);
  c.save();
  c.translate(-8, 8);
  c.rotate(open);
  const jaw = new Path2D();
  const jw: Pt[] = [[-6, -2], [20, -1], [44, -2], [46, 4], [24, 9], [0, 11], [-12, 6]];
  jaw.moveTo(jw[0][0], jw[0][1]);
  for (const q of spline(jw, 5)) jaw.lineTo(q[0], q[1]);
  jaw.closePath();
  c.fillStyle = ink(0.88);
  c.fill(jaw);
  const beard = new Path2D();
  for (let j = 0; j < 3; j++) strokePath([[4 + j * 9, 9], [0 + j * 8, 22 + j * 2], [-8 + j * 7, 30]], { w: 3.4, outT: 0.8, seed: 80 + j, step: st }, beard);
  c.fill(beard);
  c.restore();
  const teeth = new Path2D();
  for (let j = 0; j < 4; j++) {
    const x = 14 + j * 8;
    teeth.moveTo(x, 4);
    teeth.lineTo(x + 3, 9);
    teeth.lineTo(x + 6, 4);
    teeth.closePath();
  }
  c.fillStyle = paperA(0.9);
  c.fill(teeth);
  // eye: paper white, a red iris, black pupil, a heavy brow
  const eye = new Path2D();
  eye.ellipse(6, -11, 7, 5, -0.15, 0, TAU);
  c.fillStyle = paperA(0.95);
  c.fill(eye);
  c.fillStyle = verm(0.95);
  c.beginPath();
  c.arc(8, -11, 3.6, 0, TAU);
  c.fill();
  c.fillStyle = ink(0.98);
  c.beginPath();
  c.arc(8.6, -11, 1.8, 0, TAU);
  c.fill();
  stroke(c, spline([[-6, -17], [6, -21], [18, -16]], 4), { w: 4.2, outT: 0.5, inT: 0.3, seed: 85, step: st }, ink(0.98));
  // nostril and the paper line of the mouth
  c.fillStyle = paperA(0.85);
  c.beginPath();
  c.ellipse(44, -5, 2.4, 1.6, 0.3, 0, TAU);
  c.fill();
  stroke(c, [[-8, 5], [20, 4.5], [46, 2]], { w: 1.6, outT: 0.4, inT: 0.4, seed: 86, step: st }, paperA(0.7));
  // whiskers: long, thin, whipping back
  const wh = new Path2D();
  const w1 = 14 * Math.sin(t * 2.6);
  const w2 = 14 * Math.sin(t * 2.6 + 1.4);
  strokePath(spline([[46, 0], [74, 16], [70, 52 + w1 * 0.5], [30, 74 + w1], [-30, 82 + w1 * 1.3], [-80, 70 + w1]], 8), { w: 3.6, outT: 0.8, inT: 0.05, startW: 1, seed: 87, step: st }, wh);
  strokePath(spline([[46, -6], [76, -24], [64, -58 + w2 * 0.5], [24, -78 + w2], [-30, -88 + w2 * 1.2]], 8), { w: 3.2, outT: 0.8, inT: 0.05, startW: 1, seed: 88, step: st }, wh);
  c.fillStyle = ink(0.9);
  c.fill(wh);
};

/* ---------- state ---------- */

interface State {
  red: Track;
  black: Track;
  pond: Plate;
  cliffs: Plate;
  clouds: Plate;
  seal: HTMLCanvasElement;
}

/** Dragon path from the gate through the clouds into the coil */
const buildDragonPath = (): { pts: Pt[]; cum: number[] } => {
  const ctrl: Pt[] = [[800, -1440], [826, -1600], [950, -1770], [1150, -1880], [1200, -2070], [1060, -2240], [820, -2290], [600, -2230], [482, -2105], [CC[0] - CR, CC[1]]];
  const pts = spline(ctrl, 14);
  pts.pop();
  for (let a = Math.PI; a >= Math.PI - TAU - 0.62; a -= 0.03) pts.push([CC[0] + Math.cos(a) * CR, CC[1] + Math.sin(a) * CR]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum };
};

const alongCum = (pts: Pt[], cum: number[], s: number): Pt => {
  if (s <= 0) return pts[0];
  const L = cum[cum.length - 1];
  if (s >= L) return pts[pts.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] < s) lo = m;
    else hi = m;
  }
  return lp(pts[lo], pts[hi], (s - cum[lo]) / (cum[hi] - cum[lo] || 1));
};

/** Dragon time: the burst through the gate hangs for a beat */
const dragonT = (t: number) => (t < T_GATE ? t : t < T_GATE + 0.38 ? T_GATE + (t - T_GATE) * 0.12 : T_GATE + 0.0456 + (t - T_GATE - 0.38));
const T_COILED = 16.1;

const redHeadFn = (dp: { pts: Pt[]; cum: number[] }) => (t: number): Pt => {
  if (t < T_EXIT) return onCircle(t, 0);
  if (t < 4.6) {
    const P0 = onCircle(T_EXIT, 0);
    return bez(P0, [P0[0], P0[1] - 200], [800, FOOT_Y + 230], [800, FOOT_Y + 10], ease.inOutSine(seg(t, T_EXIT, 4.6)) * 0.15 + seg(t, T_EXIT, 4.6) * 0.85);
  }
  if (t < T_GATE) {
    const y = climbY(t);
    const sway = 18 * Math.sin(t * 2.1) * (1 - seg(t, 8.6, T_GATE));
    return [800 + sway, y];
  }
  const tw = dragonT(t);
  const total = dp.cum[dp.cum.length - 1];
  const k = seg(tw, T_GATE, T_COILED);
  // leave the gate fast, glide, and come to rest in the coil
  const s = total * (0.08 * Math.min(1, (tw - T_GATE) * 4) + 0.92 * ease.inOutSine(k));
  return alongCum(dp.pts, dp.cum, s);
};

const blackHead = (t: number): Pt => {
  if (t < 3.9) return onCircle(t, Math.PI);
  if (t < 4.9) {
    const P0 = onCircle(3.9, Math.PI);
    return bez(P0, [P0[0] + 160, P0[1] - 120], [720, FOOT_Y + 220], [735, FOOT_Y + 20], seg(t, 3.9, 4.9));
  }
  if (t < 6.5) {
    // it tries the falls, is thrown back, and drops into the pool
    const k = seg(t, 4.9, 6.5);
    return bez([735, FOOT_Y + 20], [720, -330], [560, -300], [600, FOOT_Y + 160], ease.inOutSine(k));
  }
  const a = (t - 6.5) * 1.1;
  return [640 + Math.sin(a) * 60, FOOT_Y + 260 + (1 - Math.cos(a)) * 60];
};

const build = (r: Riso): State => {
  const dp = buildDragonPath();
  const red = makeTrack(redHeadFn(dp));
  const black = makeTrack(blackHead);

  /* the pond: lotus leaves, reeds, faint currents */
  const pond = bake(r, -400, -100, 2400, 1200, 0.9, (g) => {
    const leaf = (x: number, y: number, R: number, rot: number, seed: number) => {
      bloom(g, x, y, R, 1, { seed, alpha: 0.3, ring: 0.35, irr: 0.06, feather: 0.5 });
      const veins = new Path2D();
      for (let i = 0; i < 13; i++) {
        const a = rot + (i / 13) * TAU;
        strokePath([[x + Math.cos(a) * R * 0.08, y + Math.sin(a) * R * 0.08], [x + Math.cos(a + 0.05) * R * 0.6, y + Math.sin(a + 0.05) * R * 0.6], [x + Math.cos(a + 0.1) * R * 0.92, y + Math.sin(a + 0.1) * R * 0.92]], { w: 3, outT: 0.6, seed: seed + i, step: 3 }, veins);
      }
      g.fillStyle = ink(0.32);
      g.fill(veins);
      // the notch to the centre
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, R * 1.2, rot - 0.12, rot + 0.12);
      g.closePath();
      g.fill();
      g.restore();
      stroke(g, Array.from({ length: 40 }, (_, i) => {
        const a = rot + 0.2 + (i / 39) * (TAU * 0.55);
        return [x + Math.cos(a) * R * 0.98, y + Math.sin(a) * R * 0.98] as Pt;
      }), { w: 5, dry: 0.7, outT: 0.5, seed: seed + 50, step: 3 }, ink(0.55));
    };
    leaf(180, 700, 130, 0.6, 11);
    leaf(1430, 300, 105, 2.4, 12);
    leaf(1340, 790, 150, 4.2, 13);
    leaf(320, 260, 70, 5.4, 14);
    // a lotus bud on a stem
    stroke(g, spline([[1460, 760], [1490, 640], [1500, 560]], 8), { w: 5, outT: 0.2, seed: 15, step: 3 }, ink(0.6));
    const bud = blotPts(1500, 540, 22, 16, 0.08, 30, 1.25);
    const bp = new Path2D();
    bp.moveTo(bud[0][0], bud[0][1]);
    for (const q of bud) bp.lineTo(q[0], q[1]);
    bp.closePath();
    g.fillStyle = verm(0.18);
    g.fill(bp);
    stroke(g, spline([[1488, 556], [1494, 530], [1502, 514]], 4), { w: 4, outT: 0.5, seed: 16, step: 2 }, ink(0.6));
    stroke(g, spline([[1512, 556], [1508, 532], [1502, 514]], 4), { w: 4, outT: 0.5, seed: 17, step: 2 }, ink(0.6));
    // reeds from the corner
    const reeds = new Path2D();
    for (let i = 0; i < 9; i++) {
      const x = -20 + i * 26 + hash(i) * 14;
      const h = 220 + hash(i * 3) * 220;
      const lean = 0.25 + hash(i * 5) * 0.35;
      strokePath(spline([[x, 960], [x + h * lean * 0.3, 960 - h * 0.5], [x + h * lean, 960 - h]], 8), { w: 7 + hash(i * 7) * 5, outT: 0.6, inT: 0.05, startW: 1, dry: 0.4, seed: 40 + i, step: 3 }, reeds);
    }
    g.fillStyle = ink(0.72);
    g.fill(reeds);
    // currents: faint dry strokes on the water
    const cur = new Path2D();
    for (let i = 0; i < 22; i++) {
      const x = 100 + hash(i * 1.7) * 1400;
      const y = 120 + hash(i * 2.9) * 760;
      if (Math.hypot(x - POND[0], y - POND[1]) < 240) continue;
      strokePath([[x, y], [x + 50, y - 3], [x + 110, y + 1]], { w: 3, outT: 0.6, dry: 0.7, seed: 60 + i, step: 3 }, cur);
    }
    g.fillStyle = ink(0.16);
    g.fill(cur);
  });

  /* the falls: stacked boulders either side, the water reserved as paper between them */
  const cliffs = bake(r, -300, -1800, 2200, 1980, 0.9, (g) => {
    // far peaks behind, faint, dissolving downward
    const far = new Path2D();
    const fy = (x: number) => -1330 - 260 * Math.exp(-(((x - 230) / 170) ** 2)) - 200 * Math.exp(-(((x - 1380) / 200) ** 2)) - 120 * Math.exp(-(((x - 1650) / 120) ** 2)) - 90 * Math.exp(-(((x + 20) / 140) ** 2)) + 10 * noise1(x / 40, 3);
    far.moveTo(-300, 200);
    for (let x = -300; x <= 1900; x += 8) far.lineTo(x, fy(x));
    far.lineTo(1900, 200);
    far.closePath();
    const fg = g.createLinearGradient(0, -1600, 0, -900);
    fg.addColorStop(0, ink(0.2));
    fg.addColorStop(0.5, ink(0.08));
    fg.addColorStop(1, ink(0));
    g.fillStyle = fg;
    g.fill(far);
    stroke(g, Array.from({ length: 276 }, (_, i) => [-300 + i * 8, fy(-300 + i * 8)] as Pt), { w: 4, dry: 0.75, outT: 0.3, seed: 2, step: 3 }, ink(0.3));

    const boulder = (cx: number, cy: number, rx: number, ry: number, seed: number, side: number) => {
      // an angular stone: a few facets, a flat seat, edges dragged by the brush
      const m = 7 + Math.floor(hash(seed * 1.7) * 3);
      const verts: Pt[] = [];
      for (let k = 0; k < m; k++) {
        const a = -Math.PI / 2 + (k / m) * TAU + (hash(seed + k * 3) - 0.5) * 0.4;
        const rr = 0.8 + hash(seed * 5 + k) * 0.3;
        verts.push([cx + Math.cos(a) * rx * rr, Math.min(cy + ry * 0.72, cy + Math.sin(a) * ry * rr)]);
      }
      const pts: Pt[] = [];
      verts.forEach((v, k) => {
        const w = verts[(k + 1) % m];
        for (let j = 0; j < 8; j++) {
          const f = j / 8;
          const bow = Math.sin(f * Math.PI) * 0.06;
          pts.push([lerp(v[0], w[0], f) + (cy - lerp(v[1], w[1], f)) * bow * 0.3 + noise1(k * 8 + j, seed) * 2.5, lerp(v[1], w[1], f) + (lerp(v[0], w[0], f) - cx) * bow * 0.1 + noise1(k * 8 + j, seed + 9) * 2.5]);
        }
      });
      const p = new Path2D();
      p.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts) p.lineTo(q[0], q[1]);
      p.closePath();
      g.fillStyle = paperA(0.85);
      g.fill(p);
      g.save();
      g.clip(p);
      const lg = g.createLinearGradient(cx + side * rx, 0, cx - side * rx, 0);
      lg.addColorStop(0, ink(0.42));
      lg.addColorStop(0.45, ink(0.14));
      lg.addColorStop(1, ink(0));
      g.fillStyle = lg;
      g.fillRect(cx - rx * 1.3, cy - ry * 1.3, rx * 2.6, ry * 2.6);
      // the shadowed face toward the water, split off by a facet line
      const top = verts[0];
      const fx = cx + side * rx * (0.1 + hash(seed * 9) * 0.2);
      const face = new Path2D();
      face.moveTo(top[0], top[1] - 10);
      face.lineTo(fx, cy + ry);
      face.lineTo(cx + side * rx * 1.4, cy + ry * 1.2);
      face.lineTo(cx + side * rx * 1.4, top[1] - 20);
      face.closePath();
      g.fillStyle = ink(0.2);
      g.fill(face);
      const cun = new Path2D();
      for (let i = 0; i < 18; i++) {
        const x = cx + (hash(seed * 7 + i) - 0.5) * rx * 1.4 + side * rx * 0.3;
        const y = cy - ry * 0.55 + hash(seed * 3 + i) * ry * 1.1;
        const len = ry * (0.25 + hash(i * 5 + seed) * 0.45);
        const a = Math.PI / 2 - side * (0.25 + hash(i + seed) * 0.3);
        strokePath(spline([[x, y], [x + Math.cos(a) * len * 0.5 + side * 3, y + Math.sin(a) * len * 0.5], [x + Math.cos(a) * len, y + Math.sin(a) * len]], 5), { w: 2.5 + hash(i * 3 + seed) * 5, dry: 0.85, outT: 0.6, seed: seed * 20 + i, step: 3 }, cun);
      }
      g.fillStyle = ink(0.5);
      g.fill(cun);
      g.restore();
      // contour: the stone's top and its water side in one dry stroke; the facet line
      const arc: Pt[] = [];
      const start = side < 0 ? Math.round(m * 0.62) * 8 : Math.round(m * 0.1) * 8;
      const n = pts.length;
      for (let k = 0; k < Math.round(n * 0.55); k++) arc.push(pts[(start + (side < 0 ? k : -k) + n * 2) % n]);
      stroke(g, arc, { w: 6 + hash(seed) * 5, dry: 0.75, outT: 0.4, inT: 0.04, startW: 0.9, seed: seed + 5, step: 3, press: (u) => 0.75 + 0.45 * Math.abs(Math.sin(u * 6 + seed)) }, ink(0.86));
      stroke(g, spline([[top[0], top[1] + 4], [lerp(top[0], fx, 0.5) - side * 6, lerp(top[1], cy + ry, 0.45)], [fx, cy + ry * 0.7]], 6), { w: 4, dry: 0.8, outT: 0.6, seed: seed + 6, step: 3 }, ink(0.7));
      const dots = new Path2D();
      for (let i = 0; i < 8; i++) {
        const q = pts[Math.floor(hash(seed + i * 3) * n)];
        if (q[1] > cy) continue;
        const rr = 2 + hash(i * 1.9 + seed) * 3;
        dots.moveTo(q[0] + rr * 1.3, q[1] + 2);
        dots.ellipse(q[0], q[1] + 2, rr * 1.3, rr, 0.3, 0, TAU);
      }
      g.fillStyle = ink(0.88);
      g.fill(dots);
    };
    const L: [number, number, number, number][] = [
      [540, -1440, 260, 170],
      [650, -1250, 140, 90],
      [500, -1060, 220, 190],
      [640, -850, 120, 110],
      [560, -640, 270, 150],
      [470, -420, 170, 130],
      [640, -300, 130, 140],
      [540, -100, 250, 120],
      [650, 70, 140, 70],
    ];
    const R: [number, number, number, number][] = [
      [1060, -1460, 240, 180],
      [960, -1270, 130, 100],
      [1110, -1110, 230, 140],
      [970, -930, 150, 160],
      [1070, -700, 200, 120],
      [1150, -520, 180, 150],
      [970, -430, 140, 120],
      [1080, -190, 260, 150],
      [950, 60, 140, 70],
    ];
    // back to front, top to bottom so each lower stone overlaps the one above
    L.forEach((b, i) => boulder(b[0], b[1], b[2], b[3], 10 + i, -1));
    R.forEach((b, i) => boulder(b[0], b[1], b[2], b[3], 40 + i, 1));
    // pines clinging to the rock
    for (const [px, py, side] of [[520, -1520, -1], [1100, -1100, 1], [470, -640, -1]] as [number, number, number][]) {
      stroke(g, spline([[px, py], [px + side * 40, py - 30], [px + side * 60, py - 80], [px + side * 30, py - 120]], 8), { w: 10, dry: 0.6, outT: 0.5, startW: 1, seed: px, step: 2 }, ink(0.85));
      const nd = new Path2D();
      for (const [ox, oy] of [[side * 30, -124], [side * 64, -84], [side * 84, -112]] as Pt[]) {
        g.fillStyle = ink(0.14);
        g.beginPath();
        g.ellipse(px + ox, py + oy - 6, 34, 11, 0, 0, TAU);
        g.fill();
        for (let j = 0; j < 12; j++) {
          const a = -Math.PI + 0.3 + (j / 11) * (Math.PI - 0.6);
          strokePath([[px + ox, py + oy], [px + ox + Math.cos(a) * 22, py + oy + Math.sin(a) * 22]], { w: 2.2, outT: 0.8, seed: j, step: 2 }, nd);
        }
      }
      g.fillStyle = ink(0.88);
      g.fill(nd);
    }
    // reserve the water
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    const water = new Path2D();
    const eL = (y: number) => WX0 + 5 * noise1(y / 60, 3);
    const eR = (y: number) => WX1 + 5 * noise1(y / 60, 5);
    water.moveTo(eL(CREST_Y), CREST_Y);
    for (let y = CREST_Y; y <= 160; y += 10) water.lineTo(eL(y) - Math.max(0, y - 20) * 0.9, y);
    for (let y = 160; y >= CREST_Y; y -= 10) water.lineTo(eR(y) + Math.max(0, y - 20) * 0.9, y);
    water.closePath();
    g.fill(water);
    g.restore();
    // the wet edges either side of the falls
    for (const side of [-1, 1]) {
      const edge: Pt[] = [];
      for (let y = CREST_Y - 10; y <= 40; y += 20) edge.push([side < 0 ? eL(y) - 4 : eR(y) + 4, y]);
      stroke(g, edge, { w: 13, dry: 0.6, outT: 0.12, inT: 0.02, startW: 1, seed: 7 + side, step: 3, press: (u) => 0.7 + 0.5 * Math.abs(Math.sin(u * 23 + side)) }, ink(0.9));
    }
    // mist laid over the outer shoulders so the stacks dissolve
    g.save();
    g.filter = `blur(${Math.round(26 * r.scale * 0.9)}px)`;
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1;
      const y = -1500 + (i / 22) * 1600 + hash(i) * 60;
      const x = 800 + side * (330 + hash(i * 3) * 200);
      g.fillStyle = paperA(0.75);
      g.beginPath();
      g.ellipse(x, y, 160 + hash(i * 5) * 120, 40 + hash(i * 7) * 30, 0, 0, TAU);
      g.fill();
    }
    g.restore();
    // the tops dissolve into cloud
    g.globalCompositeOperation = 'destination-in';
    const tg = g.createLinearGradient(0, -1800, 0, -1300);
    tg.addColorStop(0, 'rgba(0,0,0,0)');
    tg.addColorStop(0.6, 'rgba(0,0,0,0.85)');
    tg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = tg;
    g.fillRect(-300, -1800, 2200, 1980);
    g.globalCompositeOperation = 'source-over';
  });

  /* clouds: pale washes with curling heads and long tails */
  const clouds = bake(r, -900, -3200, 3400, 2100, 0.7, (g) => {
    const cloud = (x: number, y: number, s: number, seed: number, flip: number) => {
      g.save();
      g.filter = `blur(${Math.round(14 * r.scale * 0.7)}px)`;
      for (let i = 0; i < 5; i++) {
        const bx = x + flip * (i * 70 - 60) * s + (hash(seed + i) - 0.5) * 40 * s;
        const by = y + (hash(seed * 3 + i) - 0.5) * 30 * s + 10 * s;
        g.fillStyle = ink(0.05 + hash(i * 7 + seed) * 0.05);
        g.beginPath();
        g.ellipse(bx, by, (80 + hash(i + seed) * 60) * s, (26 + hash(i * 5 + seed) * 16) * s, 0, 0, TAU);
        g.fill();
      }
      g.restore();
      const curls = new Path2D();
      for (let j = 0; j < 3; j++) {
        const cx = x - flip * (j * 62 - 20) * s;
        const cy = y - (j === 1 ? 26 : 6) * s;
        const R = (34 - j * 6) * s;
        const pts: Pt[] = [];
        // a tail running off, then the spiral winding in
        if (j === 0) for (let k = 0; k <= 10; k++) pts.push([cx + flip * (220 - k * 22) * s, cy + R + Math.sin(k * 0.6) * 4 * s]);
        for (let k = 0; k <= 50; k++) {
          const u = k / 50;
          const a = Math.PI / 2 + flip * u * TAU * 1.3;
          const rr = R * (1 - u * 0.8);
          pts.push([cx + Math.cos(a) * rr * flip, cy + Math.sin(a) * rr]);
        }
        strokePath(pts, { w: 6 * s, dry: 0.4, outT: 0.35, inT: 0.05, seed: seed * 10 + j, step: 3 }, curls);
      }
      g.fillStyle = ink(0.38);
      g.fill(curls);
    };
    cloud(250, -1640, 1.2, 1, 1);
    cloud(1380, -1560, 1.1, 2, -1);
    cloud(150, -2260, 1.0, 3, 1);
    cloud(1460, -2380, 1.2, 4, -1);
    cloud(760, -2620, 0.9, 5, 1);
    cloud(-260, -1920, 1.1, 6, -1);
    cloud(1880, -1980, 1.0, 7, 1);
    cloud(360, -2800, 1.1, 8, -1);
    cloud(1240, -2880, 1.0, 9, 1);
    cloud(1260, -1840, 0.7, 10, 1);
  });

  return { red, black, pond, cliffs, clouds, seal: makeSeal(r, 120, carveKoi, 9) };
};

/** A koi curling round, carved into the seal */
const carveKoi = (g: Ctx, s: number) => {
  const pts: Pt[] = [];
  for (let i = 0; i <= 30; i++) {
    const a = -2.4 + (i / 30) * 4.2;
    pts.push([Math.cos(a) * s * 0.26, Math.sin(a) * s * 0.24]);
  }
  g.fill(strokePath(pts, { w: s * 0.17, inT: 0.02, outT: 0.6, startW: 1, minW: 0.25, press: (u) => prof(KOI_W, u) * 1.2, seed: 3, step: 1 }));
  const e = pts[pts.length - 1];
  for (const side of [-1, 1]) g.fill(strokePath([e, [e[0] + s * 0.06 + side * s * 0.02, e[1] - s * 0.08 * side - s * 0.05]], { w: s * 0.07, outT: 0.6, seed: 5 + side, step: 1 }));
  // the eye stays red
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = SUMI.verm;
  g.beginPath();
  g.arc(pts[2][0], pts[2][1], s * 0.022, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  // ripples round it
  g.fill(strokePath(Array.from({ length: 30 }, (_, i) => [Math.cos(0.4 + i * 0.1) * s * 0.4, Math.sin(0.4 + i * 0.1) * s * 0.38] as Pt), { w: s * 0.035, outT: 0.4, inT: 0.3, seed: 7, step: 1 }));
};

/* ---------- film ---------- */

export const inkKoiFilm: RisoFilm<State> = {
  id: 'ink-koi',
  title: 'Koi',
  caption: 'Two koi circle a pond; the red one climbs the falls, bursts through the gate and pours out into a dragon that coils into an enso.',
  theme: 'Anime',
  motif: 'The circle: a chase, a whirlpool, a coil, the enso',
  duration: DURATION,
  series: 'Ink wash',
  mode: 'direct',
  paper: SUMI.paper,
  paperTexture: true,
  grain: 0.1,
  inks: [{ color: SUMI.ink }, { color: '#5d5853' }, { color: '#a49d92' }, { color: SUMI.verm }],
  scenes: [
    { at: 0, label: 'Pond' },
    { at: T_EXIT, label: 'The falls' },
    { at: T_GATE - 0.6, label: 'The gate' },
    { at: 10.2, label: 'Dragon' },
    { at: 14.2, label: 'Enso' },
  ],
  posterTime: 17.8,

  setup(r) {
    return build(r);
  },

  draw(r, t, s) {
    const c = r.layers[0];
    const C = camAt(t);
    const step = clamp(2.4 / C.z, 0.6, 3.4);
    applyCam(r, C);
    const viewTop = C.y - 520 / C.z;
    const viewBot = C.y + 520 / C.z;

    /* ----- sky and clouds above the falls ----- */
    if (viewTop < -1200) {
      c.save();
      c.translate(Math.sin(t * 0.25) * 30, 0);
      drawPlate(c, s.clouds);
      c.restore();
    }

    /* ----- the pond ----- */
    if (viewBot > -100) {
      drawPlate(c, s.pond);
      // ripples behind each fish
      const rip = new Path2D();
      for (const tr of [s.red, s.black]) {
        for (let k = 0; k < 8; k++) {
          const t0 = Math.floor(t / 0.55) * 0.55 - k * 0.55;
          if (t0 < -0.5 || t0 > 4.4) continue;
          const age = t - t0;
          if (age < 0 || age > 2.2) continue;
          const p = atS(tr, trackS(tr, t0) - 30);
          const R = 14 + age * 46;
          const pts: Pt[] = [];
          for (let i = 0; i <= 40; i++) {
            const a = (i / 40) * TAU * 0.85 + k;
            pts.push([p[0] + Math.cos(a) * R, p[1] + Math.sin(a) * R * 0.92]);
          }
          strokePath(pts, { w: 2.6 * (1 - age / 2.2), outT: 0.4, inT: 0.3, dry: 0.5, seed: k, step: 3 }, rip);
        }
      }
      c.fillStyle = ink(0.28);
      c.fill(rip);
      // the swirl: each fish trails a fading arc of the circle
      if (t < 4.3) {
        const sw = new Path2D();
        for (const off of [0, Math.PI]) {
          const ext = off === 0 ? 1 - seg(t, T_EXIT, 4.2) : 1 - seg(t, 3.9, 4.3);
          if (ext <= 0) continue;
          const pts: Pt[] = [];
          const t1 = Math.min(t, off === 0 ? T_EXIT : 3.9);
          for (let i = 0; i <= 50; i++) {
            const tt = t1 - 0.25 - (i / 50) * 1.6 * ext;
            const a = circleTheta(tt, off);
            const R = circleR(tt) + 10 + i * 0.6;
            pts.push([POND[0] + Math.cos(a) * R, POND[1] + Math.sin(a) * R]);
          }
          strokePath(pts, { w: 5, outT: 0.8, inT: 0.05, dry: 0.7, seed: off * 3 + 1, step: 3, p: tween(t, 0.4, 1.6) }, sw);
        }
        c.fillStyle = ink(0.34);
        c.fill(sw);
      }
    }

    /* ----- the falls ----- */
    if (viewTop < 200) {
      // falling water: long dry streaks in the reserved paper
      const streaks = new Path2D();
      const y0 = CREST_Y;
      const y1 = FOOT_Y + 20;
      for (let i = 0; i < 26; i++) {
        const len = 140 + hash(i * 3.1) * 260;
        const sp = 620 + hash(i * 5.3) * 380;
        const span = y1 - y0 + len;
        const y = y0 - len + ((hash(i * 7.7) * span + t * sp) % span);
        const x = WX0 + 14 + hash(i * 9.9) * (WX1 - WX0 - 28);
        const a = Math.max(y0, y);
        const b = Math.min(y1, y + len);
        if (b - a < 10 || b < viewTop || a > viewBot) continue;
        strokePath([[x, a], [x + 2, (a + b) / 2], [x, b]], { w: 1.4 + hash(i) * 2.2, inT: 0.2, outT: 0.5, dry: 0.5, seed: i, step: 4 }, streaks);
      }
      c.fillStyle = ink(0.26);
      c.fill(streaks);
      drawPlate(c, s.cliffs);
      // the crest: water rolling over the lip
      stroke(c, spline([[WX0 - 10, CREST_Y + 6], [800, CREST_Y - 14], [WX1 + 10, CREST_Y + 6]], 10), { w: 6, dry: 0.6, outT: 0.4, seed: 3, step }, ink(0.55));
      // the whirlpool at the foot: churning rings and spray
      const foam = new Path2D();
      for (let i = 0; i < 5; i++) {
        const R = 70 + i * 34;
        const a0 = t * (2.4 - i * 0.3) + i * 1.3;
        const pts: Pt[] = [];
        for (let j = 0; j <= 30; j++) {
          const a = a0 + (j / 30) * 2.4;
          pts.push([800 + Math.cos(a) * R * 1.4, FOOT_Y + 70 + Math.sin(a) * R * 0.45]);
        }
        strokePath(pts, { w: 5 - i * 0.6, outT: 0.6, inT: 0.2, dry: 0.6, seed: 70 + i, step: 3 }, foam);
      }
      c.fillStyle = ink(0.3);
      c.fill(foam);
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.7 + i / 6) % 1;
        bloom(c, 800 + (hash(i) - 0.5) * 200, FOOT_Y + 20 - ph * 60, 50 + ph * 50, 1, { seed: 90 + i, rgb: [236, 228, 209], alpha: 0.85 * (1 - ph), ring: 0, feather: 0 });
      }
      for (let i = 0; i < 4; i++) bloom(c, 800 + (i - 1.5) * 170, FOOT_Y + 60, 150, 1, { seed: 120 + i, rgb: [236, 228, 209], alpha: 0.6, ring: 0, feather: 0, sy: 0.32 });
    }

    /* ----- the black koi ----- */
    if (t < 7.2) {
      const sp = spineAt(s.black, t, KOI_L, 26, (u) => 8 * Math.pow(u, 1.4) * Math.sin(u * 4.5 - t * 8.5));
      drawKoi(c, sp, false, t, 1 - seg(t, 6.3, 6.9), tween(t, 0.5, 1.6, ease.inOutSine), step);
    }

    /* ----- the red koi becomes the dragon ----- */
    const tf = dragonT(t);
    const mk = ease.inOutSine(seg(tf, T_GATE + 0.1, 11.2));
    const ek = ease.inOutSine(seg(t, 14.4, 16.4));
    const L = lerp(KOI_L, DRAGON_L, ease.inOutSine(seg(tf, T_GATE + 0.05, 11.6)));
    const flyA = 42 * mk * (1 - seg(t, 13.6, 15.6));
    const n = Math.round(lerp(26, 110, mk));
    const arch = Math.sin(Math.PI * seg(t, 8.75, 9.75)) * (1 - mk);
    const wave = (u: number) => 8 * Math.pow(u, 1.4) * (1 - mk) * Math.sin(u * 4.5 - t * 8.5) + 26 * arch * Math.sin(Math.PI * u) + flyA * Math.sin(u * TAU * 1.4 - tf * 3.6) * Math.sin(Math.PI * Math.min(1, u * 1.6));
    const sp = spineAt(s.red, tf, L, n, wave);

    /* ----- the gate: a burst of ink behind the fish ----- */
    if (t > T_GATE - 0.05 && t < 12) {
      const k = ease.outCubic(seg(t, T_GATE - 0.05, T_GATE + 0.9));
      const fade = 1 - seg(t, 9.95, 11.0);
      c.save();
      c.filter = `blur(${Math.round(5 * r.scale * C.z)}px)`;
      bloom(c, 800, CREST_Y - 110, 380, k, { seed: 44, alpha: 0.55 * fade, ring: 0.7, irr: 0.3, feather: 1.4 });
      c.restore();
      // the whirl: curved strokes spinning out from the gate
      const wl = new Path2D();
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * TAU + k * 0.9;
        const r0 = 130 + k * 160;
        const pts: Pt[] = [];
        for (let j = 0; j <= 10; j++) {
          const a = a0 + j * 0.06;
          const rr = r0 + j * (16 + k * 26);
          pts.push([800 + Math.cos(a) * rr, CREST_Y - 90 + Math.sin(a) * rr * 0.85]);
        }
        strokePath(pts, { w: 14 + hash(i) * 12, p: clamp(k * 1.6), outT: 0.75, dry: 0.9, seed: 200 + i, step: 4 }, wl);
      }
      c.fillStyle = ink(0.78 * fade);
      c.fill(wl);
      const sp2 = splatterPath(800, CREST_Y - 40, -Math.PI / 2, 3.4, 420, 46, 6, k, 31);
      c.fill(sp2);
      // white spray thrown off the crest
      c.fillStyle = paperA(0.95 * fade);
      c.fill(splatterPath(800, CREST_Y - 10, -Math.PI / 2, 2.2, 260, 40, 5, k, 57));
    }

    if (mk <= 0.001) {
      drawKoi(c, sp, true, t, 1, tween(t, 0.3, 1.4, ease.inOutSine), step);
    } else {
      // the koi fades as the ink fills the body behind its head
      if (mk < 0.6) drawKoi(c, spineAt(s.red, tf, KOI_L, 26, wave), true, t, 1 - mk / 0.6, 1, step);
      drawDragon(c, sp, t, { mk, ek, fill: ease.inOutSine(seg(tf, T_GATE + 0.05, 10.9)) }, step);
    }

    /* ----- cloud wisps drifting in front ----- */
    const wisp = 1 - seg(t, 13.2, 14.4);
    if (viewTop < -1300 && wisp > 0) {
      for (let i = 0; i < 4; i++) {
        const x = ((hash(i * 3) * 2400 + t * (40 + i * 12)) % 2400) - 400;
        const y = -1700 - i * 210 - hash(i) * 60;
        bloom(c, x, y, 120 + hash(i * 5) * 70, 1, { seed: 300 + i, rgb: [236, 228, 209], alpha: 0.55 * wisp, ring: 0, feather: 0, sy: 0.35 });
      }
    }

    /* ----- gate flash ----- */
    r.camera(800, 450, 1);
    if (t > T_GATE - 0.01 && t < T_GATE + 0.22) {
      c.fillStyle = paperA(0.6 * (1 - seg(t, T_GATE, T_GATE + 0.22)));
      c.fillRect(0, 0, 1600, 900);
    }

    /* ----- seal and title ----- */
    const tk = seg(t, 16.6, 17.4);
    if (tk > 0) inscription(c, 'Koi', 1214, 520, 104, tk, 8, 500);
    stampSeal(c, s.seal, 1262, 612, 78, seg(t, 16.3, 17.0), 0.04);
    paperAge(c, 1);
  },
};
