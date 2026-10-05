import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { clamp, lerp, seg, tween, ease, morphPair, TAU, type Pt } from '../riso/kit';
import {
  BP,
  BP_INKS,
  DASH,
  pen,
  px,
  stroke,
  drawOn,
  circle,
  line,
  wash,
  hatch,
  dim,
  callout,
  centreMark,
  arrowHead,
  letter,
  makeSheet,
  sheetUnder,
  sheetOver,
  grid,
  border,
  flare,
  partial,
  tipAt,
  splinePts,
  arcPts,
  TECH,
  type Sheet,
} from '../styles/blueprint';

/*
 * Spec Sheet. A small mechanical keyboard is drawn in exploded isometric view (keycaps,
 * switches, plate, PCB, case) and assembles. The projection swings round to a front section of
 * the Return key: it is pressed, the stem travels, the spring squeezes, the contacts close and
 * a signal leaves through the PCB. The signal draws the wiring, climbs a monitor stand and traces
 * the screen; the keycap lifts off and becomes an app tile, the tile opens into a window.
 * Motif: the square key (keycap, app tile, window).
 */

const DURATION = 18.6;
const COLS = 4;
const ROWS = 3;
const U = 100;
const TR = 2; // target row (front)
const TC = 3; // target col (right)
const KX = TC * U + 50;
const KY = TR * U + 50;

/* z levels (rest) */
const Z_CASE = 36;
const Z_PCB0 = 14;
const Z_PCB1 = 20;
const Z_PL0 = 40;
const Z_PL1 = 44;
const Z_HB = 20; // switch bottom housing
const Z_HT = 60; // switch top housing
const Z_CAP0 = 64;
const Z_CAP1 = 110;

/* monitor (front elevation world, Y = -z) */
const SCR = { x0: 130, x1: 1330, y0: -900, y1: -225 };
const NECK_X = 730;
const TILE = 200;
const TILES: Pt[] = [
  [370, -790],
  [630, -790],
  [890, -790],
  [370, -530],
  [630, -530],
  [890, -530],
];
const HERO = 3; // the tile the keycap becomes
const WIN = { x0: 172, x1: 1288, y0: -868, y1: -257 };

const T_COLLAPSE = 3.7;
const T_TURN = 6.4;
const T_PRESS = 8.0;
const T_SIGNAL = 8.4;
const T_TRACE = 10.9;
const T_LIFT = 12.4;
const T_WINDOW = 14.1;
const T_TITLE = 15.6;

interface State {
  sheet: Sheet;
  wireA: Pt[];
  wireB: Pt[];
  capProfile: Pt[];
  tileShape: Pt[];
}

/* ---------- projection: isometric blending to front elevation ---------- */

let P = 0;
const COS30 = Math.cos(Math.PI / 6);
const proj = (x: number, y: number, z: number): Pt => [
  lerp((x - y) * COS30, x, P),
  lerp((x + y) * 0.5 - z, -z, P),
];
const polyP = (pts: Pt[], closed = true, p: Path2D = new Path2D()) => {
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (closed) p.closePath();
  return p;
};

/** Faces of a (possibly tapered) box: top, front (y max), right (x max) */
const boxFaces = (x0: number, y0: number, z0: number, w: number, d: number, h: number, inset = 0, back = 0) => {
  const b = (x: number, y: number) => proj(x, y, z0);
  const tx0 = x0 + inset;
  const tx1 = x0 + w - inset;
  const ty0 = y0 + inset - back;
  const ty1 = y0 + d - inset - back;
  const tz = z0 + h;
  const T = (x: number, y: number) => proj(x, y, tz);
  const top = [T(tx0, ty0), T(tx1, ty0), T(tx1, ty1), T(tx0, ty1)];
  const front = [b(x0, y0 + d), b(x0 + w, y0 + d), T(tx1, ty1), T(tx0, ty1)];
  const right = [b(x0 + w, y0), b(x0 + w, y0 + d), T(tx1, ty1), T(tx1, ty0)];
  return { top, front, right };
};

const solidBox = (
  c: Ctx,
  f: { top: Pt[]; front: Pt[]; right: Pt[] },
  k: number,
  a: number,
  o: { w?: number; washA?: number; glow?: number } = {}
) => {
  if (k <= 0 || a <= 0.01) return;
  const all = new Path2D();
  polyP(f.top, true, all);
  polyP(f.front, true, all);
  polyP(f.right, true, all);
  c.save();
  c.globalAlpha = a * clamp(k * 2.5);
  c.fillStyle = BP.paper;
  c.fill(all, 'nonzero');
  c.restore();
  wash(c, polyP(f.top), (o.washA ?? 0.1) * a * k);
  wash(c, polyP(f.right), (o.washA ?? 0.1) * 1.8 * a * k);
  wash(c, polyP(f.front), (o.washA ?? 0.1) * 0.6 * a * k);
  // Silhouette first, then the inner edges
  const sil: Pt[] = [f.top[0], f.top[1], f.right[0], f.right[1], f.front[0], f.top[3]];
  drawOn(c, sil, k, { closed: true, w: o.w ?? 2, glow: o.glow ?? 0.8, alpha: a, nib: k < 1 });
  if (k > 0.5) {
    const inner = new Path2D();
    inner.moveTo(f.top[3][0], f.top[3][1]);
    inner.lineTo(f.top[2][0], f.top[2][1]);
    inner.lineTo(f.top[1][0], f.top[1][1]);
    inner.moveTo(f.top[2][0], f.top[2][1]);
    inner.lineTo(f.front[1][0], f.front[1][1]);
    stroke(c, inner, { w: (o.w ?? 2) * 0.7, alpha: a * (k - 0.5) * 2 });
  }
};

/** Map (x, y) on the plane z to the current projection, as a canvas transform */
const planeTransform = (c: Ctx, z: number) => {
  const o = proj(0, 0, z);
  const ax = proj(1, 0, z);
  const ay = proj(0, 1, z);
  c.transform(ax[0] - o[0], ax[1] - o[1], ay[0] - o[0], ay[1] - o[1], o[0], o[1]);
};

/* ---------- motion ---------- */

/** Key travel (0 rest .. 1 bottomed out) */
const press = (t: number) => tween(t, T_PRESS, T_PRESS + 0.32, ease.inCubic) * (1 - tween(t, 10.0, 10.5, ease.outCubic));
const TRAVEL = 20;

interface Cam {
  x: number;
  y: number;
  z: number;
}
const dolly = (a: Cam, b: Cam, k: number): Cam => {
  const z = a.z * Math.pow(b.z / a.z, k);
  const f = Math.abs(1 / b.z - 1 / a.z) < 1e-6 ? k : (1 / z - 1 / a.z) / (1 / b.z - 1 / a.z);
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z };
};
const FINAL: Cam = { x: 690, y: -478, z: 0.79 };
const camera = (t: number): Cam => {
  const iso: Cam = { x: 48, y: -14, z: 1.02 };
  const iso2: Cam = { x: 52, y: 30, z: 1.16 };
  if (t < 5.4) return dolly(iso, iso2, tween(t, 0, 5.4, ease.inOutSine));
  // Swing to the key: follow its projected centre while the projection turns
  if (t < 7.9) {
    const k = tween(t, 5.4, 7.9, ease.inOutCubic);
    const key = proj(KX, KY, 60);
    const target: Cam = { x: key[0], y: key[1], z: 3.5 };
    const z = iso2.z * Math.pow(target.z / iso2.z, k);
    const f = smoothF(k);
    return { x: lerp(iso2.x, target.x, f), y: lerp(iso2.y, target.y, f), z };
  }
  const sec: Cam = { x: KX, y: -60, z: 3.5 };
  const sec2: Cam = { x: KX + 10, y: -62, z: 3.7 };
  if (t < 9.3) return dolly(sec, sec2, seg(t, 7.9, 9.3));
  const mid: Cam = { x: 470, y: -70, z: 1.9 };
  if (t < 10.6) return dolly(sec2, mid, tween(t, 9.3, 10.6, ease.inOutCubic));
  if (t < 12.4) return dolly(mid, FINAL, tween(t, 10.6, 12.4, ease.inOutCubic));
  return dolly(FINAL, { x: FINAL.x, y: FINAL.y - 6, z: 0.81 }, tween(t, 12.4, DURATION, ease.inOutSine));
};
const smoothF = (k: number) => 1 - Math.pow(1 - k, 2.2);

/* ---------- drawing ---------- */

const LEGENDS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', '⌘', 'X', 'C', '↵'];

/** Return-key arrow drawn as a path (fonts vary), raw canvas units */
const returnGlyph = (c: Ctx, cx: number, cy: number, sz: number, color: string, alpha: number, w: number) => {
  if (alpha <= 0.01) return;
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(cx + sz * 0.42, cy - sz * 0.42);
  c.lineTo(cx + sz * 0.42, cy + sz * 0.12);
  c.lineTo(cx - sz * 0.22, cy + sz * 0.12);
  c.stroke();
  c.beginPath();
  c.moveTo(cx - sz * 0.46, cy + sz * 0.12);
  c.lineTo(cx - sz * 0.18, cy - sz * 0.1);
  c.lineTo(cx - sz * 0.18, cy + sz * 0.34);
  c.closePath();
  c.fill();
  c.restore();
};

const drawKeyboard = (c: Ctx, t: number, swap: number) => {
  // swap: 0 iso parts, 1 replaced by the section drawing
  const e = 1 - tween(t, T_COLLAPSE, T_COLLAPSE + 1.6, ease.inOutCubic);
  const eL = (lag: number) => 1 - tween(t, T_COLLAPSE + lag, T_COLLAPSE + lag + 1.4, ease.inOutCubic);
  const dPCB = 46 * eL(0.3);
  const dPlate = 104 * eL(0.15);
  const dSw = 170 * eL(0.08);
  const dCap = 250 * e;
  const backA = 1 - seg(P, 0.35, 0.75); // rows behind the front row fade as the view turns
  const partA = 1 - swap;
  const travel = -TRAVEL * press(t);

  /* case */
  const kCase = seg(t, 0.3, 1.4);
  const cf = boxFaces(-14, -14, 0, COLS * U + 28, ROWS * U + 28, Z_CASE);
  solidBox(c, cf, kCase, partA, { w: 2.4, glow: 1.2, washA: 0.06 });
  if (kCase > 0.6 && partA > 0.01) {
    // Inner rim of the tray
    const rim = [proj(-2, -2, Z_CASE), proj(COLS * U + 2, -2, Z_CASE), proj(COLS * U + 2, ROWS * U + 2, Z_CASE), proj(-2, ROWS * U + 2, Z_CASE)];
    stroke(c, polyP(rim), { w: 1.1, color: BP.cyan, alpha: partA * (kCase - 0.6) * 2.5 });
  }

  /* PCB */
  const kPcb = seg(t, 0.7, 1.8);
  const pz = Z_PCB0 + dPCB;
  const pf = boxFaces(0, 0, pz, COLS * U, ROWS * U, Z_PCB1 - Z_PCB0);
  solidBox(c, pf, kPcb, partA, { w: 1.8, washA: 0.12 });
  if (kPcb > 0.4 && partA > 0.01) {
    const a = partA * clamp((kPcb - 0.4) * 2) * (1 - seg(P, 0.2, 0.6));
    const zz = Z_PCB1 + dPCB;
    const tr = new Path2D();
    const pads = new Path2D();
    const seg3 = (pts: Pt[]) => polyP(pts.map(([x, y]) => proj(x, y, zz)), false, tr);
    for (let r = 0; r < ROWS; r++) {
      for (let q = 0; q < COLS; q++) {
        const x = q * U + 50;
        const y = r * U + 50;
        polyP(arcPts(x - 16, y - 18, 6, 0, TAU, 10).map(([u, v]) => proj(u, v, zz)), true, pads);
        polyP(arcPts(x + 18, y - 4, 6, 0, TAU, 10).map(([u, v]) => proj(u, v, zz)), true, pads);
        seg3([[x + 18, y - 4], [x + 34, y + 12], [x + 34, y + 40]]);
        seg3([[x - 16, y - 18], [x - 36, y - 38], [q * U + 6, y - 38]]);
      }
      seg3([[0, r * U + 90], [COLS * U, r * U + 90]]);
    }
    // Controller footprint near the back
    polyP([[COLS * U - 70, 8], [COLS * U - 18, 8], [COLS * U - 18, 34], [COLS * U - 70, 34]].map(([x, y]) => proj(x, y, zz)), true, tr);
    stroke(c, tr, { w: 1, color: BP.cyan, alpha: a * 0.9 });
    stroke(c, pads, { w: 1.1, color: BP.line, alpha: a });
  }

  /* switches: bottom housings sit under the plate */
  const kSw = seg(t, 1.3, 2.5);
  const sw = (lower: boolean) => {
    for (let r = 0; r < ROWS; r++) {
      for (let q = 0; q < COLS; q++) {
        const a = partA * (r === ROWS - 1 ? 1 : backA) * (r === TR && q === TC ? 1 - swap : 1);
        if (a <= 0.01) continue;
        const x = q * U + 50;
        const y = r * U + 50;
        const kk = clamp(kSw * 1.6 - (r * COLS + q) * 0.05);
        const isT = r === TR && q === TC;
        const tz = isT ? travel : 0;
        if (lower) {
          solidBox(c, boxFaces(x - 31, y - 31, Z_HB + dSw, 62, 62, Z_PL0 - Z_HB), kk, a, { w: 1.4, washA: 0.08 });
        } else {
          solidBox(c, boxFaces(x - 32, y - 32, Z_PL1 + dSw, 64, 64, Z_HT - Z_PL1, 4), kk, a, { w: 1.6, washA: 0.12 });
          // Stem cross
          if (kk > 0.6) {
            const sz = Z_HT + dSw;
            const st = new Path2D();
            const s1 = boxFaces(x - 4, y - 12, sz, 8, 24, 14 + tz);
            const s2 = boxFaces(x - 12, y - 4, sz, 24, 8, 14 + tz);
            polyP(s1.top, true, st);
            polyP(s2.top, true, st);
            polyP(s1.front, true, st);
            polyP(s2.right, true, st);
            wash(c, st, 0.3 * a, BP.cyan);
            stroke(c, st, { w: 1, alpha: a * (kk - 0.6) * 2.5 });
          }
        }
      }
    }
  };
  sw(true);

  /* plate */
  const kPl = seg(t, 1.0, 2.1);
  const plz = Z_PL0 + dPlate;
  const plf = boxFaces(-4, -4, plz, COLS * U + 8, ROWS * U + 8, Z_PL1 - Z_PL0);
  solidBox(c, plf, kPl, partA, { w: 1.8, washA: 0.14 });
  if (kPl > 0.5 && partA > 0.01) {
    const a = partA * (kPl - 0.5) * 2 * (1 - seg(P, 0.2, 0.6));
    const holes = new Path2D();
    for (let r = 0; r < ROWS; r++) {
      for (let q = 0; q < COLS; q++) {
        const x = q * U + 50;
        const y = r * U + 50;
        polyP([proj(x - 33, y - 33, Z_PL1 + dPlate), proj(x + 33, y - 33, Z_PL1 + dPlate), proj(x + 33, y + 33, Z_PL1 + dPlate), proj(x - 33, y + 33, Z_PL1 + dPlate)], true, holes);
      }
    }
    c.save();
    c.globalAlpha = a * 0.9;
    c.fillStyle = BP.deep;
    c.fill(holes);
    c.restore();
    stroke(c, holes, { w: 1.1, color: BP.cyan, alpha: a });
  }
  sw(false);

  /* keycaps */
  const kCap = seg(t, 1.9, 3.2);
  for (let r = 0; r < ROWS; r++) {
    for (let q = 0; q < COLS; q++) {
      const isT = r === TR && q === TC;
      const a = (r === ROWS - 1 ? 1 : backA) * (isT ? 1 - swap : 1);
      if (a <= 0.01) continue;
      const x = q * U + 5;
      const y = r * U + 5;
      const kk = clamp(kCap * 1.5 - (r * COLS + q) * 0.04);
      const cz = Z_CAP0 + dCap + (isT ? travel : 0);
      const f = boxFaces(x, y, cz, 90, 90, Z_CAP1 - Z_CAP0, 11, 3);
      solidBox(c, f, kk, a, { w: 2, glow: 1, washA: 0.11 });
      // Dish on the top face and the legend
      if (kk > 0.7) {
        const la = a * (kk - 0.7) / 0.3 * (1 - seg(P, 0.1, 0.45));
        if (la > 0.01) {
          c.save();
          planeTransform(c, cz + Z_CAP1 - Z_CAP0);
          c.globalAlpha = la;
          c.fillStyle = isT ? BP.accent : BP.line;
          c.font = `600 ${LEGENDS[r * COLS + q].length > 1 ? 18 : 26}px ${TECH}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          if (isT) returnGlyph(c, x + 45, y + 42, 34, BP.accent, la, 4);
          else c.fillText(LEGENDS[r * COLS + q], x + 45, y + 42);
          c.restore();
        }
      }
    }
  }
  return { dCap, dSw, dPlate, dPCB, e };
};

/** Front section of the target switch and keycap (front elevation world, Y = -z) */
const drawSection = (c: Ctx, t: number, a: number) => {
  if (a <= 0.01) return;
  const d = -TRAVEL * press(t);
  const X = KX;
  const Y = (z: number) => -z;
  const hatchBox: [number, number, number, number] = [-40, -140, 520, 160];

  // Board layers across the whole width, sectioned
  const pcb = new Path2D();
  pcb.rect(0, Y(Z_PCB1), COLS * U, Z_PCB1 - Z_PCB0);
  wash(c, pcb, 0.2 * a);
  hatch(c, pcb, hatchBox, { gap: 5, w: 0.7, alpha: a * 0.8 });
  stroke(c, pcb, { w: 1.4, alpha: a });
  const plate = new Path2D();
  plate.rect(-4, Y(Z_PL1), X - 33 + 4, Z_PL1 - Z_PL0);
  plate.rect(X + 33, Y(Z_PL1), COLS * U + 4 - (X + 33), Z_PL1 - Z_PL0);
  wash(c, plate, 0.25 * a);
  hatch(c, plate, hatchBox, { gap: 4, w: 0.6, angle: -Math.PI / 4, alpha: a * 0.9 });
  stroke(c, plate, { w: 1.4, alpha: a });
  const tray: Pt[] = [
    [-14, Y(Z_CASE)],
    [-14, Y(0)],
    [COLS * U + 14, Y(0)],
    [COLS * U + 14, Y(Z_CASE)],
    [COLS * U + 4, Y(Z_CASE)],
    [COLS * U + 4, Y(8)],
    [-4, Y(8)],
    [-4, Y(Z_CASE)],
  ];
  const trayP = polyP(tray);
  wash(c, trayP, 0.1 * a);
  hatch(c, trayP, hatchBox, { gap: 7, w: 0.7, alpha: a * 0.7 });
  stroke(c, trayP, { w: 1.8, glow: 1, alpha: a });

  // Neighbouring switches in plain elevation
  const nb = new Path2D();
  for (let q = 0; q < COLS - 1; q++) {
    const x = q * U + 50;
    polyP(housing(x), true, nb);
    nb.rect(x - 16, Y(Z_HB), 4, 10);
    nb.rect(x + 14, Y(Z_HB), 4, 10);
  }
  c.save();
  c.globalAlpha = a;
  c.fillStyle = BP.paper;
  c.fill(nb);
  c.restore();
  wash(c, nb, 0.1 * a);
  stroke(c, nb, { w: 1.4, alpha: a * 0.9 });

  // Keycap section: profile with a dished top, hollow skirt, stem socket
  const cz0 = Z_CAP0 + d;
  const cz1 = Z_CAP1 + d;
  const cap = capOutline(X, cz0, cz1);
  const capP = polyP(cap);
  c.save();
  c.globalAlpha = a;
  c.fillStyle = BP.paper;
  c.fill(capP);
  c.restore();
  const hollow = polyP([
    [X - 39, Y(cz0)],
    [X - 31, Y(cz1 - 7)],
    [X + 31, Y(cz1 - 7)],
    [X + 39, Y(cz0)],
  ]);
  c.save();
  c.clip(capP);
  wash(c, capP, 0.2 * a);
  c.restore();
  hatch(c, capP, hatchBox, { gap: 6, w: 0.7, alpha: a * 0.65 });
  c.save();
  c.globalAlpha = a;
  c.fillStyle = BP.paper;
  c.fill(hollow);
  c.restore();
  stroke(c, hollow, { w: 1, color: BP.cyan, alpha: a });
  const socket = new Path2D();
  socket.rect(X - 8, Y(cz1 - 7), 16, cz1 - 7 - (78 + d));
  wash(c, socket, 0.25 * a);
  stroke(c, socket, { w: 1.2, alpha: a });
  stroke(c, capP, { w: 2.2, glow: 1.2, alpha: a });
  centreMark(c, X, Y((cz0 + cz1) / 2), 72, a * 0.7);
  // Bottom housing with pins into the PCB
  const hb = housing(X);
  const hbp = polyP(hb);
  c.save();
  c.globalAlpha = a;
  c.fillStyle = BP.paper;
  c.fill(hbp);
  c.restore();
  wash(c, hbp, 0.12 * a);
  stroke(c, hbp, { w: 1.8, alpha: a });
  const pins = new Path2D();
  pins.rect(X - 16, Y(Z_HB), 4, 10);
  pins.rect(X + 14, Y(Z_HB), 4, 10);
  stroke(c, pins, { w: 1.1, alpha: a });

  // Spring: coils from housing floor up to the stem slider
  const sTop = 48 + d;
  const sBot = 14;
  const coils = 7;
  const spring: Pt[] = [];
  for (let i = 0; i <= coils * 2; i++) {
    const z = lerp(sBot, sTop, i / (coils * 2));
    spring.push([X + (i % 2 ? 11 : -11), Y(z)]);
  }
  stroke(c, polyP(spring, false), { w: 1.3, color: BP.cyan, alpha: a });

  // Stem: slider block, shaft, cross top
  const stem: Pt[] = [
    [X - 14, Y(46 + d)],
    [X - 14, Y(56 + d)],
    [X - 5, Y(56 + d)],
    [X - 5, Y(80 + d)],
    [X + 5, Y(80 + d)],
    [X + 5, Y(56 + d)],
    [X + 14, Y(56 + d)],
    [X + 14, Y(46 + d)],
  ];
  const stp = polyP(stem);
  wash(c, stp, 0.3 * a, BP.cyan);
  stroke(c, stp, { w: 1.6, alpha: a });
  // Actuator leg pushing the contact leaf
  const leg: Pt[] = [
    [X + 14, Y(52 + d)],
    [X + 22, Y(48 + d)],
    [X + 22, Y(40 + d)],
  ];
  stroke(c, polyP(leg, false), { w: 1.4, alpha: a });
  // Contact leaves: the moving one bends to the fixed one past actuation
  const act = clamp((-d - 6) / 6);
  const fixedLeaf = polyP([[X + 26, Y(Z_HB + 2)], [X + 26, Y(42)]], false);
  const moving = polyP(
    [
      [X + 21, Y(Z_HB + 2)],
      [lerp(X + 18, X + 25, act), Y(36)],
      [lerp(X + 18, X + 25, act), Y(44)],
    ],
    false
  );
  stroke(c, fixedLeaf, { w: 1.6, alpha: a });
  stroke(c, moving, { w: 1.6, alpha: a });
  const spark = act >= 1 ? 1 - seg(t, T_SIGNAL + 0.05, T_SIGNAL + 0.7) * 0.6 : 0;
  flare(c, X + 25, Y(38), px(18 + 14 * spark), spark * a * 0.9);

};

const housing = (X: number): Pt[] => [
  [X - 31, -Z_HB],
  [X + 31, -Z_HB],
  [X + 31, -Z_PL0],
  [X + 34, -Z_PL0],
  [X + 34, -Z_PL1],
  [X + 30, -Z_HT],
  [X - 30, -Z_HT],
  [X - 34, -Z_PL1],
  [X - 34, -Z_PL0],
  [X - 31, -Z_PL0],
];

const capOutline = (X: number, cz0: number, cz1: number): Pt[] => [
  [X - 45, -cz0],
  ...splinePts(
    [
      [X - 35, -cz1],
      [X, -cz1 + 3.5],
      [X + 35, -cz1],
    ],
    8
  ),
  [X + 45, -cz0],
];

/** Tile shape (rounded square) used as the morph target */
const tilePts = (x: number, y: number, s: number, rad: number): Pt[] => {
  const pts: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => pts.push(...arcPts(cx, cy, rad, a0, a0 + Math.PI / 2, 8));
  corner(x + rad, y + rad, Math.PI);
  corner(x + s - rad, y + rad, -Math.PI / 2);
  corner(x + s - rad, y + s - rad, 0);
  corner(x + rad, y + s - rad, Math.PI / 2);
  return pts;
};

const rrect = (x0: number, y0: number, x1: number, y1: number, rad: number) => {
  const p = new Path2D();
  p.roundRect(x0, y0, x1 - x0, y1 - y0, rad);
  return p;
};

const tileIcon = (c: Ctx, i: number, x: number, y: number, a: number) => {
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  const p = new Path2D();
  if (i === 0) {
    circle(cx, cy - 6, 44, p);
    p.moveTo(cx, cy - 6);
    p.lineTo(cx, cy - 40);
    p.moveTo(cx, cy - 6);
    p.lineTo(cx + 26, cy + 8);
  } else if (i === 1) {
    for (let k = 0; k < 4; k++) p.rect(cx - 56 + k * 30, cy + 40 - (24 + k * 18), 20, 24 + k * 18);
    p.moveTo(cx - 64, cy + 40);
    p.lineTo(cx + 64, cy + 40);
  } else if (i === 2) {
    p.rect(cx - 56, cy - 36, 112, 74);
    p.moveTo(cx - 56, cy - 36);
    p.lineTo(cx, cy + 8);
    p.lineTo(cx + 56, cy - 36);
  } else if (i === 4) {
    p.moveTo(cx - 30, cy - 44);
    p.lineTo(cx + 44, cy);
    p.lineTo(cx - 30, cy + 44);
    p.closePath();
  } else if (i === 5) {
    p.moveTo(cx - 40, cy - 28);
    p.lineTo(cx - 64, cy);
    p.lineTo(cx - 40, cy + 28);
    p.moveTo(cx + 40, cy - 28);
    p.lineTo(cx + 64, cy);
    p.lineTo(cx + 40, cy + 28);
    p.moveTo(cx + 14, cy - 40);
    p.lineTo(cx - 14, cy + 40);
  }
  stroke(c, p, { w: 1.6, color: BP.cyan, alpha: a });
};

const drawMonitor = (c: Ctx, t: number, s: State) => {
  // Stand and bezel draw after the wire has traced the screen
  const kb = seg(t, T_TRACE + 0.9, T_TRACE + 1.9);
  if (kb > 0) {
    const bez = rrect(SCR.x0 - 22, SCR.y0 - 22, SCR.x1 + 22, SCR.y1 + 22, 18);
    c.save();
    c.globalAlpha = 0.6 * kb;
    c.fillStyle = BP.deep;
    c.fill(bez);
    c.restore();
    drawOn(c, bezelPts(), kb, { closed: true, w: 2.6, glow: 1.2 });
    const neck = new Path2D();
    neck.moveTo(NECK_X - 34, SCR.y1 + 22);
    neck.lineTo(NECK_X - 24, -22);
    neck.moveTo(NECK_X + 34, SCR.y1 + 22);
    neck.lineTo(NECK_X + 24, -22);
    neck.roundRect(NECK_X - 140, -22, 280, 22, 6);
    stroke(c, neck, { w: 2, alpha: kb });
    centreMark(c, NECK_X, (SCR.y0 + SCR.y1) / 2, 40, kb * 0.6);
    dim(c, [SCR.x0, SCR.y0 - 22], [SCR.x1, SCR.y0 - 22], -46, '1440 PX', seg(t, T_TRACE + 1.4, T_TRACE + 2.4));
    dim(c, [SCR.x1 + 22, SCR.y0], [SCR.x1 + 22, SCR.y1], -50, '900', seg(t, T_TRACE + 1.6, T_TRACE + 2.6));
  }
  // Screen glass: the trace by the wire is its outline
  const ks = seg(t, T_TRACE, T_TRACE + 1.2);
  if (ks > 0.98) {
    const sp = new Path2D();
    sp.rect(SCR.x0, SCR.y0, SCR.x1 - SCR.x0, SCR.y1 - SCR.y0);
    wash(c, sp, 0.06);
  }

  // Tiles: hero tile is the keycap's landing spot, others draw in after
  const winK = tween(t, T_WINDOW, T_WINDOW + 1.1, ease.inOutCubic);
  for (let i = 0; i < TILES.length; i++) {
    if (i === HERO) continue;
    const k = seg(t, T_LIFT + 0.7 + i * 0.12, T_LIFT + 1.4 + i * 0.12);
    if (k <= 0) continue;
    const [x, y] = TILES[i];
    const a = 1 - seg(winK, 0.2, 0.7);
    if (a <= 0.01) continue;
    drawOn(c, tilePts(x, y, TILE, 26), k, { closed: true, w: 1.8, alpha: a });
    if (k > 0.6) tileIcon(c, i, x, y, a * (k - 0.6) * 2.5);
  }

  // Keycap lifts off, flies along a phantom arc and becomes the hero tile
  const kl = tween(t, T_LIFT, T_LIFT + 1.2, ease.inOutCubic);
  if (t >= T_LIFT && winK <= 0) {
    const [hx, hy] = TILES[HERO];
    // Phantom trajectory
    const from: Pt = [KX, -90];
    const to: Pt = [hx + TILE / 2, hy + TILE / 2];
    const ctrl: Pt = [KX + 40, hy - 40];
    const arc: Pt[] = [];
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      arc.push([
        (1 - k) * (1 - k) * from[0] + 2 * (1 - k) * k * ctrl[0] + k * k * to[0],
        (1 - k) * (1 - k) * from[1] + 2 * (1 - k) * k * ctrl[1] + k * k * to[1],
      ]);
    }
    const ta = 1 - seg(t, T_LIFT + 1.4, T_LIFT + 1.8);
    drawOn(c, arc, seg(t, T_LIFT - 0.1, T_LIFT + 0.6), { w: 1, color: BP.cyan, dash: DASH.phantom, alpha: ta * 0.8, nib: false });
    if (ta > 0.02 && t > T_LIFT + 0.6) {
      const e1 = arc[arc.length - 1];
      const e0 = arc[arc.length - 3];
      arrowHead(c, e1[0], e1[1], Math.atan2(e1[1] - e0[1], e1[0] - e0[0]), BP.cyan, 14, ta * 0.8);
    }
    // Morphing outline, moved along the arc
    const pos = tipAt(arc, kl);
    const shape = s.capProfile.map((p, i) => {
      const q = s.tileShape[i];
      return [lerp(p[0], q[0], kl), lerp(p[1], q[1], kl)] as Pt;
    });
    // Profile and tile are both stored around (0,0); scale grows from key size to tile size
    const scale = lerp(1, TILE / 90, kl);
    const pts = shape.map(([x, y]) => [pos[0] + x * scale, pos[1] + y * scale] as Pt);
    const pp = polyP(pts);
    c.save();
    c.globalAlpha = 0.9;
    c.fillStyle = BP.paper;
    c.fill(pp);
    c.restore();
    wash(c, pp, 0.14 + 0.1 * kl, BP.accent);
    stroke(c, pp, { w: 2.4, color: BP.accent, glow: 1 });
    if (kl > 0.85) {
      returnGlyph(c, pos[0], pos[1], 80, BP.accent, (kl - 0.85) / 0.15, px(3.5));
    }
  }

  // Hero tile opens into the window
  if (winK > 0) {
    const [hx, hy] = TILES[HERO];
    const x0 = lerp(hx, WIN.x0, winK);
    const x1 = lerp(hx + TILE, WIN.x1, winK);
    const y0 = lerp(hy, WIN.y0, winK);
    const y1 = lerp(hy + TILE, WIN.y1, winK);
    const rad = lerp(26, 14, winK);
    const wp = rrect(x0, y0, x1, y1, rad);
    c.save();
    c.globalAlpha = 0.95;
    c.fillStyle = BP.paper;
    c.fill(wp);
    c.restore();
    wash(c, wp, 0.08);
    const edge = lerp(0, 1, seg(winK, 0.3, 1));
    stroke(c, wp, { w: 2.4, color: edge > 0.5 ? BP.line : BP.accent, glow: 1 });
    if (winK < 0.6) returnGlyph(c, (x0 + x1) / 2, (y0 + y1) / 2, 80, BP.accent, 1 - winK / 0.6, px(3.5));
    drawWindowContent(c, t, x0, y0, x1, y1);
  }
};

const bezelPts = (): Pt[] => {
  const r = 18;
  const x0 = SCR.x0 - 22;
  const y0 = SCR.y0 - 22;
  const x1 = SCR.x1 + 22;
  const y1 = SCR.y1 + 22;
  return [
    [NECK_X, y1],
    ...arcPts(x1 - r, y1 - r, r, Math.PI / 2, 0, 6),
    ...arcPts(x1 - r, y0 + r, r, 0, -Math.PI / 2, 6),
    ...arcPts(x0 + r, y0 + r, r, -Math.PI / 2, -Math.PI, 6),
    ...arcPts(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, 6),
  ];
};

const drawWindowContent = (c: Ctx, t: number, x0: number, y0: number, x1: number, y1: number) => {
  const k = (a: number, b: number) => seg(t, T_WINDOW + a, T_WINDOW + b);
  const kt = k(0.6, 1.2);
  if (kt <= 0) return;
  c.save();
  c.beginPath();
  c.rect(x0, y0, x1 - x0, y1 - y0);
  c.clip();
  // Title bar with three dots and an address field
  const bar = y0 + 48;
  drawOn(c, [[x0, bar], [x1, bar]], kt, { w: 1.6, nib: false });
  const dots = new Path2D();
  for (let i = 0; i < 3; i++) circle(x0 + 30 + i * 24, y0 + 24, 7, dots);
  stroke(c, dots, { w: 1.4, alpha: kt });
  wash(c, circle(x0 + 30, y0 + 24, 7), 0.8 * kt, BP.accent);
  const addr = rrect(x0 + 140, y0 + 12, x0 + 560, y0 + 36, 12);
  stroke(c, addr, { w: 1.1, color: BP.cyan, alpha: kt });
  letter(c, 'localhost:3000', x0 + 160, y0 + 25, { size: 15, color: BP.cyan, base: 'middle', weight: 600 }, k(0.9, 1.5));
  // Sidebar
  const ks = k(0.8, 1.5);
  const side = x0 + 230;
  drawOn(c, [[side, bar], [side, y1]], ks, { w: 1.4, nib: false });
  const nav = new Path2D();
  for (let i = 0; i < 6; i++) {
    const y = bar + 46 + i * 46;
    nav.rect(x0 + 30, y - 10, 20, 20);
    nav.moveTo(x0 + 66, y);
    nav.lineTo(x0 + 66 + 90 + ((i * 37) % 60), y);
  }
  stroke(c, nav, { w: 1.2, color: BP.cyan, alpha: ks });
  // Heading block, three cards, text lines
  const kc = k(1.0, 1.8);
  const hx = side + 50;
  const head = new Path2D();
  head.rect(hx, bar + 40, 360, 30);
  wash(c, head, 0.25 * kc, BP.line);
  stroke(c, head, { w: 1.4, alpha: kc });
  const cw = (x1 - hx - 50 - 2 * 30) / 3;
  for (let i = 0; i < 3; i++) {
    const kk = clamp(kc * 1.6 - i * 0.25);
    const cx = hx + i * (cw + 30);
    drawOn(c, tilePts(cx, bar + 104, cw, 16).map(([x, y]) => [x, lerp(bar + 104, y, 1) + (y - (bar + 104)) * (170 / cw - 1)] as Pt), kk, {
      closed: true,
      w: 1.6,
      alpha: 1,
    });
    if (kk > 0.6) {
      const l = new Path2D();
      l.moveTo(cx + 24, bar + 140);
      l.lineTo(cx + cw * 0.6, bar + 140);
      l.moveTo(cx + 24, bar + 170);
      l.lineTo(cx + cw - 30, bar + 170);
      l.moveTo(cx + 24, bar + 194);
      l.lineTo(cx + cw - 70, bar + 194);
      stroke(c, l, { w: 1.2, color: BP.cyan, alpha: (kk - 0.6) * 2.5 });
    }
  }
  const kl = k(1.3, 2.2);
  const lines = new Path2D();
  for (let i = 0; i < 5; i++) {
    const y = bar + 320 + i * 34;
    if (y > y1 - 30) break;
    const w = (x1 - hx - 60) * (0.5 + 0.45 * Math.abs(Math.sin(i * 2.1 + 1)));
    lines.moveTo(hx, y);
    lines.lineTo(hx + w * clamp(kl * 1.5 - i * 0.12), y);
  }
  stroke(c, lines, { w: 1.4, color: BP.pale, alpha: 1 });
  // Text field with a blinking cursor: the input the key press made
  const kf = k(1.6, 2.2);
  if (kf > 0) {
    const fy = y1 - 64;
    const field = rrect(hx, fy - 22, hx + 420, fy + 22, 10);
    stroke(c, field, { w: 1.4, alpha: kf });
    const btn = rrect(hx + 440, fy - 22, hx + 560, fy + 22, 10);
    wash(c, btn, 0.55 * kf, BP.accent);
    stroke(c, btn, { w: 1.4, color: BP.accent, alpha: kf });
    letter(c, 'SHIP', hx + 500, fy + 1, { size: 16, align: 'center', base: 'middle', weight: 700, spacing: 3, alpha: kf });
    const blink = Math.floor((t - T_WINDOW) * 2.2) % 2 === 0 ? 1 : 0.15;
    stroke(c, line(hx + 22, fy - 13, hx + 22, fy + 13), { w: 2.4, color: BP.line, alpha: kf * blink });
  }
  c.restore();
};

export const blueprintKeyboardFilm: RisoFilm<State> = {
  id: 'blueprint-keyboard',
  title: 'Spec Sheet',
  caption: 'One key press travels down a switch, becomes a wire, and draws an app on the screen.',
  theme: 'Craft',
  motif: 'The square key: keycap, app tile, window',
  duration: DURATION,
  series: 'Blueprint',
  mode: 'direct',
  paper: BP.paper,
  grain: 0.12,
  inks: BP_INKS,
  scenes: [
    { at: 0, label: 'Exploded view' },
    { at: T_COLLAPSE, label: 'Assembly' },
    { at: T_TURN, label: 'Key travel' },
    { at: T_SIGNAL + 0.8, label: 'Signal' },
    { at: T_LIFT, label: 'Key to window' },
  ],
  posterTime: 17.2,
  setup(r: Riso) {
    // Wire: contact leaf, through the PCB, resistor, controller, along the desk, up the stand
    const X = KX;
    const wy = -31;
    const res: Pt[] = [];
    for (let i = 0; i <= 8; i++) res.push([440 + i * 7.5, wy + (i === 0 || i === 8 ? 0 : i % 2 ? -9 : 9)]);
    const wireA: Pt[] = [
      [X + 25, -38],
      [X + 25, -17],
      [COLS * U + 24, -17],
      [COLS * U + 24, wy],
      [440, wy],
      ...res,
      [530, wy],
      [620, wy],
      [660, wy],
      [660, -11],
      [NECK_X - 6, -11],
      [NECK_X - 6, SCR.y1],
      [NECK_X, SCR.y1],
    ];
    const wireB: Pt[] = [
      [NECK_X, SCR.y1],
      [SCR.x1, SCR.y1],
      [SCR.x1, SCR.y0],
      [SCR.x0, SCR.y0],
      [SCR.x0, SCR.y1],
      [NECK_X, SCR.y1],
    ];
    // Keycap profile and tile, both centred on (0,0) at key scale (tile 90 units)
    const cap = capOutline(0, Z_CAP0, Z_CAP1).map(([x, y]) => [x, y + (Z_CAP0 + Z_CAP1) / 2] as Pt);
    const tile = tilePts(-45, -45, 90, 12);
    const [capProfile, tileShape] = morphPair(cap, tile, 140);
    return { sheet: makeSheet(r, 77), wireA, wireB, capProfile, tileShape };
  },
  draw(r, t, s) {
    const c = r.layers[0];
    sheetUnder(r, c, s.sheet);
    P = tween(t, T_TURN, T_TURN + 1.4, ease.inOutCubic);
    const cam = camera(t);
    r.camera(cam.x, cam.y, cam.z);
    pen(cam.z);
    grid(c, cam.x, cam.y, cam.z, r.W, r.H, 0, seg(t, 0, 0.8));

    // Centre lines through the target key, early
    const swap = seg(P, 0.82, 1);
    {
      const parts = drawKeyboard(c, t, swap);
      // Exploded-view phantom lines and callouts
      const ea = 1 - seg(t, T_COLLAPSE + 1.2, T_COLLAPSE + 1.8);
      if (ea > 0.01 && t > 1) {
        const ph = new Path2D();
        for (const [x, y] of [
          [-14, ROWS * U + 14],
          [COLS * U + 14, ROWS * U + 14],
          [COLS * U + 14, -14],
        ] as Pt[]) {
          const a = proj(x, y, 0);
          const b = proj(x, y, Z_CAP1 + parts.dCap);
          ph.moveTo(a[0], a[1]);
          ph.lineTo(b[0], b[1]);
        }
        stroke(c, ph, { w: 1, color: BP.cyan, dash: DASH.phantom, alpha: ea * 0.6 * seg(t, 1.2, 2.2) });
        const lb = (a0: number) => seg(t, a0, a0 + 0.9);
        callout(c, proj(5, 205, Z_CAP1 + parts.dCap - 10), [-470, -230], 'KEYCAP', lb(2.6), { num: '1', alpha: ea });
        callout(c, proj(18, 218, Z_HT + parts.dSw - 6), [-500, -40], 'SWITCH', lb(2.8), { num: '2', alpha: ea });
        callout(c, proj(COLS * U + 4, 150, Z_PL0 + parts.dPlate + 2), [560, 100], 'PLATE', lb(3.0), { num: '3', alpha: ea });
        callout(c, proj(COLS * U, 260, Z_PCB0 + parts.dPCB + 2), [560, 280], 'PCB', lb(3.15), { num: '4', alpha: ea });
        callout(c, proj(120, ROWS * U + 14, 10), [-420, 360], 'CASE', lb(3.3), { num: '5', alpha: ea });
      }
    }
    drawSection(c, t, swap);
    // Section dimensions during the press
    const da = 1 - seg(t, 10.2, 10.8);
    if (swap > 0.5 && da > 0.01) {
      const d = -TRAVEL * press(t);
      dim(c, [KX - 45, -(Z_CAP0 + d)], [KX + 45, -(Z_CAP0 + d)], -80, '18.0', seg(t, 7.6, 8.3), { alpha: da });
      dim(c, [KX + 35, -Z_CAP1], [KX + 35, -(Z_CAP1 - TRAVEL)], -40, 'TRAVEL 4.0', seg(t, T_PRESS + 0.3, T_PRESS + 1.0), { alpha: da, size: 13 });
      dim(c, [KX + 35, -Z_CAP1], [KX + 35, -(Z_CAP1 - 10)], -78, 'ACT. 2.0', seg(t, T_PRESS + 0.5, T_PRESS + 1.2), { alpha: da, size: 13 });
      // Force arrow from above while pressed
      const fa = press(t) * da;
      if (fa > 0.01) {
        const y0 = -(Z_CAP1 + 6 - TRAVEL * press(t));
        stroke(c, line(KX, y0 - 34, KX, y0), { w: 2, color: BP.accent, alpha: fa });
        arrowHead(c, KX, y0 + 3, Math.PI / 2, BP.accent, 14, fa);
      }
    }

    // The signal: an orange pulse that draws the wiring as it goes
    const kA = tween(t, T_SIGNAL, T_TRACE, ease.inOutSine);
    if (kA > 0) {
      drawOn(c, s.wireA, kA, { w: 1.8, color: BP.line, glow: 1, nib: false });
      const trail = partial(s.wireA, kA);
      stroke(c, trail, { w: 2.2, color: BP.accent, alpha: 0.85 * (1 - seg(t, T_TRACE + 0.6, T_TRACE + 1.6)) });
      // Controller chip and resistor labels appear as the pulse passes
      const chip = seg(kA, 0.18, 0.3);
      if (chip > 0) {
        const cp = new Path2D();
        cp.roundRect(538, -60, 74, 58, 4);
        c.save();
        c.globalAlpha = chip;
        c.fillStyle = BP.paper;
        c.fill(cp);
        c.restore();
        wash(c, cp, 0.15 * chip);
        stroke(c, cp, { w: 1.6, alpha: chip });
        const legs = new Path2D();
        for (let i = 0; i < 4; i++) {
          legs.moveTo(548 + i * 18, -60);
          legs.lineTo(548 + i * 18, -68);
          legs.moveTo(548 + i * 18, -2);
          legs.lineTo(548 + i * 18, 6);
        }
        stroke(c, legs, { w: 1.2, alpha: chip });
        letter(c, 'MCU', 575, -42, { size: 13, align: 'center', base: 'middle', weight: 700, alpha: chip, spacing: 1 });
        letter(c, 'R1', 470, -48, { size: 11, align: 'center', color: BP.cyan, weight: 700, alpha: chip });
      }
      if (kA < 1) {
        const [x, y] = tipAt(s.wireA, kA);
        flare(c, x, y, px(26), 0.95);
        c.save();
        c.fillStyle = BP.line;
        c.beginPath();
        c.arc(x, y, px(3.5), 0, TAU);
        c.fill();
        c.restore();
      }
    }
    const kB = tween(t, T_TRACE, T_TRACE + 1.2, ease.inOutSine);
    if (kB > 0) {
      drawOn(c, s.wireB, kB, { w: 2, color: BP.line, glow: 1, nib: false });
      if (kB < 1) {
        const [x, y] = tipAt(s.wireB, kB);
        flare(c, x, y, px(30), 0.95);
      }
    }
    if (t > T_TRACE) drawMonitor(c, t, s);
    // Desk line under everything once we pull back
    const kd = seg(t, 10.4, 11.8);
    if (kd > 0) {
      const dl = new Path2D();
      dl.moveTo(lerp(400, -260, kd), 0);
      dl.lineTo(lerp(400, 1560, kd), 0);
      stroke(c, dl, { w: 2.2, glow: 1 });
      const ticks = new Path2D();
      for (let x = -240; x < 1560; x += 40) {
        if (x < lerp(400, -260, kd) || x > lerp(400, 1560, kd)) continue;
        ticks.moveTo(x, 4);
        ticks.lineTo(x - 14, 18);
      }
      stroke(c, ticks, { w: 1, color: BP.pale, alpha: 0.7 });
    }

    // Screen furniture
    c.setTransform(r.scale, 0, 0, r.scale, 0, 0);
    border(r, c, { title: 'SPEC SHEET', sub: 'CRAFT · REV A', dwg: 'KB-40-RET', scale: '4 : 1', sheet: '2 OF 2', by: 'S. SHUMUNOV' }, seg(t, 0, 1.1), seg(t, T_TITLE, T_TITLE + 1.4));
    letter(c, 'ISOMETRIC · EXPLODED', 46, 64, { size: 13, color: BP.cyan, spacing: 2, alpha: 0.85 * (1 - seg(t, T_TURN, T_TURN + 0.5)) }, seg(t, 0.6, 1.6));
    letter(c, 'SECTION B–B · RETURN KEY', 46, 64, { size: 13, color: BP.cyan, spacing: 2, alpha: 0.85 * (1 - seg(t, 10.4, 10.9)) }, seg(t, T_TURN + 1.2, T_TURN + 2));
    letter(c, 'ELEVATION · I/O', 46, 64, { size: 13, color: BP.cyan, spacing: 2, alpha: 0.85 }, seg(t, 11.2, 12.2));
    sheetOver(r, c, s.sheet);
  },
};
