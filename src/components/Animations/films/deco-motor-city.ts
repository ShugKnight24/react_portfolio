import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, hash, mulberry, morph, morphPair, circlePts, smoothPath, type Pt } from '../riso/kit';
import {
  DECO,
  rgba,
  mix,
  poly,
  circle,
  rrect,
  gearPts,
  sunPts,
  gilt,
  giltStroke,
  goldGrad,
  grad,
  radial,
  glow,
  burstPath,
  speedLines,
  beam,
  decoFrame,
  decoText,
  ruleDiamond,
  makeStars,
  drawStars,
  letterGold,
  sheenGrad,
  zigguratPts,
  drawStreamliner,
  NAVY_TRAIN,
  type Star,
} from '../styles/deco';

/*
 * Motor City Deco. The sunburst is the motif. A gold-and-orange setback tower telescopes up out
 * of the night city and its crown opens into a sunburst; we push into it and the sun's rays
 * thicken into the teeth of a gold gear driving an assembly line. Small gears drop onto a
 * streamlined car as its wheels and it drives out through a stepped portal into a race with a
 * streamlined train along the river (an impact frame as it passes the locomotive's nose). The
 * camera pulls back over the river and the real sun breaks the horizon in a sunburst over the
 * skyline: Motor City.
 */

const DUR = 18.5;

/* S1 tower */
const BASE_Y = 1000;
const TIERS: [number, number][] = [
  [300, 330],
  [228, 230],
  [168, 180],
  [118, 130],
  [78, 84],
];
const SUN_R = 46;
const SUN_LEN = 74;
const RAYS = 16;
const T_PUSH0 = 2.9;
const T_PUSH1 = 4.0;
const Z_PUSH = 4;
const T_MORPH1 = 4.85;
const T_IRIS0 = 4.3;
const T_IRIS1 = 5.05;

/* S2 assembly */
const PITCH = (TAU * 244) / 16;
const pr = (n: number) => (n * PITCH) / TAU;
const FLOOR = 800;
const PORTAL_X = 1650;
const T_PORTAL0 = 7.95;
const T_PORTAL1 = 8.8;
const CAR_S2 = 0.42;

/* S3 race */
const CAR_S = 0.36;
const TRAIN_S = 0.42;
const RAIL_Y = 770;
const ROAD_Y = 880;
const T_IMPACT = 11.0;
const T_OUT0 = 12.6;
const T_OUT1 = 14.5;
const T_RISE0 = 13.3;
const T_BURST = 14.45;
const T_TITLE = 15.0;
const HORIZON = 562;

interface Gear {
  x: number;
  y: number;
  n: number;
  rot: (t: number) => number;
}

interface State {
  city1: Path2D;
  city1Win: Path2D;
  stars1: Star[];
  stars3: Star[];
  motif: [Pt[], Pt[]];
  wheel: [Pt[], Pt[]];
  carBody: Path2D;
  carFender: Path2D;
  carSkirt: Path2D;
  carWin: Path2D;
  carStripe: Path2D;
  skyline: HTMLCanvasElement;
  gears: Gear[];
}

/* ---------- small helpers ---------- */

type Key = [number, number, number, number];
/** Piecewise eased camera keys [t, cx, cy, z] */
const keys = (t: number, ks: Key[]): [number, number, number] => {
  if (t <= ks[0][0]) return [ks[0][1], ks[0][2], ks[0][3]];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const a = ks[i - 1];
      const b = ks[i];
      const k = ease.inOutCubic(seg(t, a[0], b[0]));
      // zoom in log space so pushes feel even
      return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), Math.exp(lerp(Math.log(a[3]), Math.log(b[3]), k))];
    }
  }
  const l = ks[ks.length - 1];
  return [l[1], l[2], l[3]];
};

const toScreen = (cam: [number, number, number], x: number, y: number): Pt => [800 + (x - cam[0]) * cam[2], 450 + (y - cam[1]) * cam[2]];

/** Smoothstep integral, for decelerating motion */
const smInt = (k: number) => k * k * k - (k * k * k * k) / 2;

/** Distance travelled with speed v0 until a, then easing to v1 by b */
const travel = (t: number, v0: number, v1: number, a: number, b: number) => {
  if (t <= a) return v0 * t;
  const k = clamp((t - a) / (b - a));
  const d = v0 * a + (b - a) * (v0 * k - (v0 - v1) * smInt(k));
  return t <= b ? d : d + v1 * (t - b);
};

/** Race time: slows to a crawl through the impact frame */
const raceT = (t: number) => t - 0.88 * clamp(t - T_IMPACT, 0, 0.36);

const CAR_V = 760;
const TRAIN_V = 600;
const CAR_END_X = 1160;
const carD = (tr: number) => travel(tr, CAR_V, 0, T_OUT0, 14.7);
const carX = (tr: number) => CAR_END_X - (carD(40) - carD(tr));
const trainD = (tr: number) => travel(tr, TRAIN_V, 140, T_OUT0, 14.7);
const trainX = (tr: number) => carX(T_IMPACT) + 276 * CAR_S + 6 + trainD(tr) - trainD(T_IMPACT);

/** S2 hero car x on the line, then driving off */
const heroX = (t: number) => {
  const xb = 1000 + 90 * (Math.min(t, 7.6) - 4.4);
  return t <= 7.6 ? xb : xb + 0.5 * 1100 * (t - 7.6) ** 2;
};

/* ---------- tower ---------- */

const kx = (x: number, y: number) => 800 + (x - 800) * (1 - (0.2 * (BASE_Y - y)) / 1100);

const quad = (x0: number, x1: number, y0: number, y1: number, p: Path2D = new Path2D()) => {
  p.moveTo(kx(x0, y0), y0);
  p.lineTo(kx(x1, y0), y0);
  p.lineTo(kx(x1, y1), y1);
  p.lineTo(kx(x0, y1), y1);
  p.closePath();
  return p;
};

const drawTier = (c: Ctx, i: number, top: number, clipBottom: number, t: number) => {
  const [hw, h] = TIERS[i];
  const bottom = top + h;
  if (top >= clipBottom) return;
  c.save();
  const cl = new Path2D();
  cl.rect(-2000, -3000, 5600, clipBottom + 3000);
  c.clip(cl);
  const L = 800 - hw;
  const R = 800 + hw;
  const body = quad(L, R, top, bottom + 2);
  c.fillStyle = grad(c, kx(L, top), 0, kx(R, top), 0, [
    [0, '#f4b45c'],
    [0.2, '#ea962f'],
    [0.5, '#d97a29'],
    [0.66, '#b4521e'],
    [1, '#5e2412'],
  ]);
  c.fill(body);
  // vertical light falloff toward the street
  c.fillStyle = grad(c, 0, top, 0, bottom, [
    [0, 'rgba(255,220,150,0.18)'],
    [0.6, 'rgba(60,20,20,0)'],
    [1, 'rgba(40,10,20,0.35)'],
  ]);
  c.fill(body);
  // window strips and piers
  const np = Math.max(3, Math.round(hw / 30) | 1);
  const sp = (hw * 2 - 36) / (np - 1);
  const piers = new Path2D();
  const strips = new Path2D();
  const lit = new Path2D();
  const dim = new Path2D();
  for (let j = 0; j < np - 1; j++) {
    const x0 = L + 18 + j * sp + 5;
    const x1 = L + 18 + (j + 1) * sp - 5;
    quad(x0, x1, top + 34, bottom - 6, strips);
    for (let y = top + 40; y < bottom - 16; y += 22) {
      const id = i * 1000 + j * 37 + Math.round(y);
      const on = hash(id) > 0.42 !== hash(id + Math.floor(t * 1.3)) > 0.97;
      quad(x0 + 3, x1 - 3, y, y + 12, on ? lit : dim);
    }
  }
  for (let j = 0; j < np; j++) {
    const x = L + 18 + j * sp;
    quad(x - 4.5, x + 4.5, top + 24, bottom, piers);
  }
  c.fillStyle = 'rgba(40,14,16,0.72)';
  c.fill(strips);
  c.fillStyle = '#ffd99a';
  c.fill(lit);
  c.fillStyle = 'rgba(120,52,30,0.9)';
  c.fill(dim);
  gilt(c, piers, [L, top, hw * 2, h], { angle: 0.15 });
  // chevron frieze under the coping
  const chev = new Path2D();
  const nC = Math.round(hw / 14);
  for (let j = 0; j < nC; j++) {
    const xa = L + 8 + (j * (hw * 2 - 16)) / nC;
    const xb = L + 8 + ((j + 1) * (hw * 2 - 16)) / nC;
    const xm = (xa + xb) / 2;
    chev.moveTo(kx(xa, top + 8), top + 8);
    chev.lineTo(kx(xm, top + 20), top + 20);
    chev.lineTo(kx(xb, top + 8), top + 8);
    chev.lineTo(kx(xb, top + 13), top + 13);
    chev.lineTo(kx(xm, top + 25), top + 25);
    chev.lineTo(kx(xa, top + 13), top + 13);
    chev.closePath();
  }
  gilt(c, chev, [L, top, hw * 2, 30], { angle: 0 });
  // coping
  const cap = quad(L - 4, R + 4, top - 5, top + 3);
  gilt(c, cap, [L, top - 5, hw * 2, 8], { angle: 0 });
  // corner piers that rise above the parapet with stepped caps
  const cp = new Path2D();
  for (const x of [L + 2, R - 22]) {
    quad(x, x + 20, top - 30, bottom, cp);
    quad(x + 4, x + 16, top - 44, top - 30, cp);
    quad(x + 7, x + 13, top - 54, top - 44, cp);
  }
  c.fillStyle = grad(c, kx(L, top), 0, kx(R, top), 0, [
    [0, '#f6c068'],
    [0.5, '#c8642a'],
    [1, '#4a1c10'],
  ]);
  c.fill(cp);
  giltStroke(c, cp, [L, top, hw * 2, h], 1.6);
  c.restore();
};

/* ---------- gears ---------- */

const drawGear = (c: Ctx, g: Gear, t: number, holesK = 1, sheenK = -1) => {
  const pRad = pr(g.n);
  const rO = pRad + 16;
  const rI = pRad - 16;
  const rot = g.rot(t);
  const body = poly(gearPts(g.x, g.y, rO, rI, g.n, rot));
  const holes = new Path2D();
  const m = g.n >= 12 ? 6 : 5;
  if (holesK > 0) {
    const r1 = rI * 0.42;
    const r2 = rI * lerp(0.6, 0.8, holesK);
    for (let i = 0; i < m; i++) {
      const a = rot + (i / m) * TAU + 0.2;
      const w = (TAU / m) * 0.62 * holesK;
      holes.moveTo(g.x + Math.cos(a) * r1, g.y + Math.sin(a) * r1);
      holes.arc(g.x, g.y, r2, a, a + w);
      holes.arc(g.x, g.y, r1, a + w, a, true);
      holes.closePath();
    }
  }
  const all = new Path2D(body);
  all.addPath(holes);
  c.save();
  c.translate(7, 11);
  c.fillStyle = 'rgba(0,10,8,0.4)';
  c.fill(all, 'evenodd');
  c.restore();
  gilt(c, all, [g.x - rO, g.y - rO, rO * 2, rO * 2], { angle: 0.8, rule: 'evenodd', sheen: sheenK });
  // engraved rings and hub
  const ring = new Path2D();
  circle(g.x, g.y, rI - 9, ring);
  circle(g.x, g.y, rI * 0.36, ring);
  c.strokeStyle = rgba(DECO.goldDeep, 0.8);
  c.lineWidth = 2;
  c.stroke(ring);
  const hub = circle(g.x, g.y, rI * 0.3);
  gilt(c, hub, [g.x - rO, g.y - rO, rO * 2, rO * 2], { angle: 2.4, warm: 0.35 });
  const eng = new Path2D();
  for (let i = 0; i < 12; i++) {
    const a = rot * 1 + (i / 12) * TAU;
    eng.moveTo(g.x + Math.cos(a) * rI * 0.1, g.y + Math.sin(a) * rI * 0.1);
    eng.lineTo(g.x + Math.cos(a) * rI * 0.27, g.y + Math.sin(a) * rI * 0.27);
  }
  c.strokeStyle = rgba(DECO.goldDeep, 0.7);
  c.lineWidth = 1.5;
  c.stroke(eng);
  c.fillStyle = DECO.deepGreen;
  c.fill(circle(g.x, g.y, rI * 0.07));
};

/* ---------- car ---------- */

interface CarOpts {
  rot: number;
  /** 0: gear, 1: wheel */
  wheelK?: number;
  /** Wheels: 0 none, 1 mounted. Drop offset in local px while falling */
  wheels?: boolean;
  drop?: number;
  primer?: boolean;
  lamp?: number;
  trestle?: number;
  shadow?: number;
}

const drawWheel = (c: Ctx, s: State, x: number, y: number, rot: number, k: number) => {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  const out = poly(morph(s.wheel[0], s.wheel[1], k));
  if (k < 1) {
    c.globalAlpha = 1;
    gilt(c, out, [-52, -52, 104, 104], { angle: 0.8 - rot });
  }
  if (k > 0) {
    c.globalAlpha = k;
    c.fillStyle = DECO.ink;
    c.fill(out);
    c.globalAlpha = 1;
    // whitewall
    const ww = circle(0, 0, 35);
    circle(0, 0, 27, ww);
    c.fillStyle = rgba(DECO.cream, k);
    c.fill(ww, 'evenodd');
  }
  // hub: a small sunburst
  const hub = circle(0, 0, 25);
  gilt(c, hub, [-25, -25, 50, 50], { angle: 0.8 - rot });
  const sp = new Path2D();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    sp.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
    sp.lineTo(Math.cos(a) * 23, Math.sin(a) * 23);
  }
  c.strokeStyle = DECO.goldDeep;
  c.lineWidth = 2.2;
  c.stroke(sp);
  if (k < 1) {
    c.fillStyle = rgba(DECO.deepGreen, 1 - k);
    const hl = new Path2D();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      circle(Math.cos(a) * 34, Math.sin(a) * 34, 5, hl);
    }
    c.fill(hl);
  }
  c.fillStyle = DECO.goldDeep;
  c.fill(circle(0, 0, 6));
  c.restore();
};

const drawCar = (c: Ctx, s: State, x: number, y: number, sc: number, o: CarOpts) => {
  c.save();
  c.translate(x, y);
  c.scale(sc, sc);
  // ground shadow
  if ((o.shadow ?? 1) > 0) {
    c.fillStyle = radial(c, 0, 0, 10, 290, [
      [0, rgba('#000000', 0.45 * (o.shadow ?? 1))],
      [1, 'rgba(0,0,0,0)'],
    ]);
    c.save();
    c.scale(1, 0.06);
    c.fillRect(-300, -300, 600, 600);
    c.restore();
  }
  const primer = !!o.primer;
  const top = primer ? '#fbf4e2' : '#f7bf9c';
  const midA = primer ? '#e9dcc0' : DECO.coral;
  const midB = primer ? '#c9b893' : DECO.red;
  const low = primer ? '#8f8064' : DECO.maroon;
  const bodyG = grad(c, 0, -190, 0, -20, [
    [0, top],
    [0.3, midA],
    [0.72, midB],
    [1, low],
  ]);
  const wk = o.wheelK ?? 1;
  const drop = o.drop ?? 0;
  // trestles under a wheel-less body
  const tr = o.trestle ?? 0;
  if (tr > 0) {
    const ts = new Path2D();
    for (const tx of [-150, 165]) {
      ts.moveTo(tx - 22, 0);
      ts.lineTo(tx - 8, -26 * tr);
      ts.lineTo(tx + 8, -26 * tr);
      ts.lineTo(tx + 22, 0);
      ts.closePath();
    }
    c.fillStyle = '#2c3b39';
    c.fill(ts);
  }
  // rear wheel (behind the skirt)
  if (o.wheels) drawWheel(c, s, -150, -46 - drop, o.rot, wk);
  c.fillStyle = bodyG;
  c.fill(s.carBody);
  // airbrushed sheen along the flank
  c.save();
  c.clip(s.carBody);
  c.fillStyle = grad(c, 0, -170, 0, -110, [
    [0, 'rgba(255,240,225,0)'],
    [0.5, 'rgba(255,240,225,0.32)'],
    [1, 'rgba(255,240,225,0)'],
  ]);
  c.fillRect(-300, -180, 600, 80);
  c.restore();
  // windows
  c.fillStyle = grad(c, 0, -180, 0, -132, [
    [0, primer ? '#5b6a68' : '#f5cfa0'],
    [0.45, primer ? '#34413f' : '#c96c5e'],
    [1, primer ? '#1d2625' : '#2a1f3c'],
  ]);
  c.fill(s.carWin);
  c.strokeStyle = primer ? '#9a8c70' : rgba(DECO.goldHi, 0.9);
  c.lineWidth = 2.5;
  c.stroke(s.carWin);
  // B-pillar and door seam
  c.fillStyle = primer ? '#9a8c70' : rgba(DECO.goldHi, 0.9);
  c.fillRect(-57, -177, 5, 44);
  c.strokeStyle = rgba(DECO.maroon, primer ? 0.35 : 0.6);
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(-12, -132);
  c.quadraticCurveTo(-8, -80, -14, -26);
  c.stroke();
  c.fillStyle = primer ? '#9a8c70' : DECO.goldHi;
  c.fillRect(-40, -110, 18, 4);
  // cream sweep stripe
  c.fillStyle = primer ? 'rgba(255,255,255,0.3)' : DECO.cream;
  c.fill(s.carStripe);
  // rear skirt
  c.fillStyle = grad(c, 0, -110, 0, -24, [
    [0, primer ? '#f2e8d0' : '#f2a07c'],
    [0.5, midB],
    [1, low],
  ]);
  c.fill(s.carSkirt);
  c.strokeStyle = rgba(primer ? '#fffaf0' : '#ffd8c0', 0.6);
  c.lineWidth = 2;
  c.stroke(s.carSkirt);
  // front wheel well and wheel
  c.fillStyle = primer ? '#3a3a33' : '#2a0e10';
  c.fill(circle(165, -46, 57));
  if (o.wheels) drawWheel(c, s, 165, -46 - drop, o.rot, wk);
  // pontoon fender
  c.fillStyle = grad(c, 0, -118, 0, -26, [
    [0, primer ? '#fbf4e2' : '#f7b590'],
    [0.4, midA],
    [1, low],
  ]);
  c.fill(s.carFender);
  c.strokeStyle = rgba(primer ? '#fffaf0' : '#ffe0c8', 0.7);
  c.lineWidth = 2;
  c.stroke(s.carFender);
  // speed whiskers on the fender
  const wh = new Path2D();
  for (let i = 0; i < 3; i++) {
    const yy = -62 - i * 10;
    wh.moveTo(248 - i * 6, yy);
    wh.lineTo(150 - i * 22, yy);
  }
  c.strokeStyle = primer ? 'rgba(140,128,100,0.8)' : DECO.goldHi;
  c.lineWidth = 3.4;
  c.lineCap = 'round';
  c.stroke(wh);
  // bumper and hood ornament
  c.fillStyle = primer ? '#b8aa8a' : '#efe4cf';
  c.fill(rrect(258, -38, 34, 9, 4));
  c.fill(rrect(-286, -36, 26, 8, 4));
  if (!primer) {
    const orn = new Path2D();
    orn.moveTo(214, -102);
    orn.lineTo(250, -100);
    orn.lineTo(222, -112);
    orn.closePath();
    gilt(c, orn, [214, -112, 36, 12]);
  }
  // headlamp
  const lamp = circle(262, -80, 11);
  gilt(c, lamp, [250, -92, 24, 24]);
  c.fillStyle = primer ? '#cfc4a8' : '#fff6dc';
  c.fill(circle(263, -80, 7));
  c.restore();
  if ((o.lamp ?? 0) > 0) {
    const lx = x + 268 * sc;
    const ly = y - 80 * sc;
    glow(c, lx, ly, 70 * sc, '#fff1c8', 0.8 * (o.lamp ?? 0));
  }
};

/* ---------- train ---------- */

/* ---------- skyline (S3/S4 background) ---------- */

const SKY_X0 = -300;
const SKY_Y0 = 150;
const SKY_W = 2200;
const SKY_H = HORIZON - SKY_Y0 + 2;

const buildSkyline = (r: Riso): HTMLCanvasElement => {
  const RES = 1.6;
  const { canvas, ctx: c } = r.scratch(SKY_W * RES, SKY_H * RES);
  c.scale(RES, RES);
  c.translate(-SKY_X0, -SKY_Y0);
  const rng = mulberry(41);
  const base = HORIZON;
  // far layer then near layer
  for (const layer of [0, 1]) {
    let x = -320;
    while (x < 1900) {
      const w = 40 + rng() * (layer ? 90 : 70);
      const nearSun = x + w > 680 && x < 920;
      let h = (layer ? 40 : 80) + rng() * (layer ? 120 : 150);
      if (nearSun) h = 18 + rng() * 26;
      if (x > 1080 && x < 1290) {
        x += w;
        continue;
      }
      const col = layer ? mix(DECO.midnight, DECO.navy, 0.4 + rng() * 0.3) : mix(DECO.navy, DECO.blue, 0.2 + rng() * 0.3);
      const steps = 1 + Math.floor(rng() * 3);
      const tiers: [number, number][] = [];
      let hw = w / 2;
      let rem = h;
      for (let i = 0; i < steps; i++) {
        const th = i === steps - 1 ? rem : rem * (0.55 + rng() * 0.2);
        tiers.push([hw, th]);
        rem -= th;
        hw *= 0.68;
      }
      const cx = x + w / 2;
      const pts = zigguratPts(cx, base, tiers);
      const p = poly(pts);
      c.fillStyle = col;
      c.fill(p);
      // spire
      if (rng() < 0.3 && !nearSun) {
        c.beginPath();
        c.moveTo(cx - 4, base - h);
        c.lineTo(cx, base - h - 30 - rng() * 40);
        c.lineTo(cx + 4, base - h);
        c.fill();
      }
      // lit windows
      const win = new Path2D();
      for (let yy = base - h + 12; yy < base - 6; yy += 11) {
        for (let xx = x + 6; xx < x + w - 6; xx += 9) {
          const inside = Math.abs(xx - cx) < hwAt(tiers, base - yy) - 4;
          if (inside && rng() < (layer ? 0.32 : 0.18)) win.rect(xx, yy, 3.2, 5);
        }
      }
      c.fillStyle = layer ? 'rgba(255,214,150,0.85)' : 'rgba(255,214,150,0.45)';
      c.fill(win);
      // gilt edge on the sun side
      c.strokeStyle = rgba(DECO.gold, layer ? 0.5 : 0.25);
      c.lineWidth = 1.2;
      c.stroke(p);
      x += w + (layer ? 4 + rng() * 14 : -8 + rng() * 20);
    }
  }
  // the hero tower in miniature, with its sunburst crown
  const tx = 1185;
  const tt: [number, number][] = [
    [64, 150],
    [48, 90],
    [34, 70],
    [24, 48],
    [16, 30],
  ];
  const tp = poly(zigguratPts(tx, base, tt));
  c.fillStyle = grad(c, tx - 64, 0, tx + 64, 0, [
    [0, '#f2ae55'],
    [0.5, '#d8772a'],
    [1, '#5e2412'],
  ]);
  c.fill(tp);
  const pier = new Path2D();
  let yb = base;
  for (const [hw, th] of tt) {
    for (let j = -2; j <= 2; j++) pier.rect(tx + (j * hw) / 2.6 - 1.3, yb - th + 4, 2.6, th - 4);
    yb -= th;
  }
  c.fillStyle = goldGrad(c, tx - 64, base - 300, tx + 64, base);
  c.fill(pier);
  const crownY = base - tt.reduce((a, b) => a + b[1], 0);
  const cs = poly(sunPts(tx, crownY, 10, 16, 16, 0, 120));
  gilt(c, cs, [tx - 26, crownY - 26, 52, 52]);
  // suspension bridge on the left
  const deck = 524;
  const towers = [70, 430];
  const br = new Path2D();
  br.rect(-320, deck, 960, 9);
  for (const bx of towers) {
    poly(
      zigguratPts(bx, deck + 30, [
        [16, 150],
        [12, 110],
        [8, 50],
        [4, 20],
      ]),
      br
    );
  }
  c.fillStyle = '#0d1630';
  c.fill(br);
  const cable = new Path2D();
  const topY = deck + 30 - 310;
  const cat = (x0: number, y0: number, x1: number, y1: number, sag: number) => {
    cable.moveTo(x0, y0);
    for (let i = 1; i <= 24; i++) {
      const k = i / 24;
      cable.lineTo(lerp(x0, x1, k), lerp(y0, y1, k) + sag * 4 * k * (1 - k));
    }
  };
  cat(towers[0], topY, towers[1], topY, 230);
  cat(-320, deck - 10, towers[0], topY, -40);
  cat(towers[1], topY, 640, deck - 4, -40);
  for (let x = -300; x < 640; x += 18) {
    const yc =
      x < towers[0]
        ? lerp(deck - 10, topY, (x + 320) / (towers[0] + 320)) - 40 * 4 * ((x + 320) / 390) * (1 - (x + 320) / 390)
        : x < towers[1]
          ? topY + 230 * 4 * ((x - towers[0]) / 360) * (1 - (x - towers[0]) / 360)
          : lerp(topY, deck - 4, (x - towers[1]) / 210) - 40 * 4 * ((x - towers[1]) / 210) * (1 - (x - towers[1]) / 210);
    cable.moveTo(x, yc);
    cable.lineTo(x, deck);
  }
  c.strokeStyle = '#0d1630';
  c.lineWidth = 1.6;
  c.stroke(cable);
  const lights = new Path2D();
  for (let x = -300; x < 640; x += 22) circle(x, deck + 4, 1.8, lights);
  c.fillStyle = '#ffd99a';
  c.fill(lights);
  return canvas;
};

const hwAt = (tiers: [number, number][], hFromBase: number) => {
  let acc = 0;
  for (const [hw, th] of tiers) {
    acc += th;
    if (hFromBase <= acc) return hw;
  }
  return 0;
};

/* ---------- scenes ---------- */

const towerTops = (t: number) => {
  const tops: number[] = [];
  let below = BASE_Y;
  for (let i = 0; i < TIERS.length; i++) {
    const rise = ease.outBack(seg(t, 0.15 + i * 0.36, 0.85 + i * 0.36));
    const top = below - TIERS[i][1] * clamp(rise, 0, 1.12);
    tops.push(top);
    below = top;
  }
  return tops;
};

const sunLift = (t: number) => 92 * tween(t, 3.25, 4.0, ease.inOutCubic);

const s1Cam = (t: number): [number, number, number] => {
  const tops = towerTops(t);
  const sy = tops[4] - sunLift(t);
  const a = keys(t, [
    [0, 800, 780, 1.3],
    [2.7, 800, 390, 0.84],
  ]);
  if (t <= T_PUSH0) return a;
  const k = ease.inOutCubic(seg(t, T_PUSH0, T_PUSH1));
  return [800, lerp(a[1], sy, k), Math.exp(lerp(Math.log(a[2]), Math.log(Z_PUSH), k))];
};

const drawS1 = (r: Riso, c: Ctx, t: number, s: State, withSun: boolean) => {
  const cam = s1Cam(t);
  r.camera(cam[0], cam[1], cam[2]);
  // sky
  c.fillStyle = grad(c, 0, -500, 0, BASE_Y, [
    [0, DECO.midnight],
    [0.42, DECO.navy],
    [0.72, '#5b2c55'],
    [0.88, DECO.coral],
    [1, DECO.peach],
  ]);
  c.fillRect(-1600, -1400, 4800, 2600);
  drawStars(c, s.stars1, t, DECO.cream, 0.9);
  // searchlights
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const ang = -Math.PI / 2 + side * (0.25 + 0.18 * i) + Math.sin(t * 0.7 + i * 1.7) * 0.22;
    beam(c, 800 + side * (120 + i * 60), 980, ang, 1500, 0.035, DECO.cream, 0.16);
  }
  const tops = towerTops(t);
  const sunY = tops[4] - sunLift(t);
  const open = tween(t, 2.2, 3.1, ease.outCubic);
  // halo behind the crown
  glow(c, 800, sunY, 260 + 60 * open, DECO.peach, 0.35 * open);
  if (withSun && open > 0) {
    const fan = burstPath(800, sunY, {
      r0: SUN_R + 8,
      r1: 300,
      n: 24,
      a0: -Math.PI,
      span: Math.PI,
      width: 0.34,
      k: open,
      taper: true,
    });
    c.fillStyle = radial(c, 800, sunY, SUN_R, 300, [
      [0, rgba(DECO.goldHi, 0.75)],
      [1, rgba(DECO.gold, 0)],
    ]);
    c.fill(fan);
  }
  // crown sun sits in the top tier (drawn before the tiers so they hide its lower half)
  if (withSun) {
    c.save();
    const lift = sunLift(t);
    const cl = new Path2D();
    cl.rect(-2000, -3000, 5600, tops[4] + 3000 + lift * 3);
    c.clip(cl);
    drawSun(c, 800, sunY, open, t);
    c.restore();
  }
  let below = BASE_Y;
  for (let i = 0; i < TIERS.length; i++) {
    drawTier(c, i, tops[i], below, t);
    below = tops[i];
  }
  // front city
  c.fillStyle = DECO.navy;
  c.fill(s.city1);
  c.fillRect(-1600, BASE_Y + 30, 4800, 800);
  c.fillStyle = 'rgba(255,214,150,0.8)';
  c.fill(s.city1Win);
};

/** The crown sun: spiky disc with rings (same outline as the motif) */
const drawSun = (c: Ctx, x: number, y: number, open: number, t: number) => {
  const rot = 0.25 * t;
  const pts = sunPts(x, y, SUN_R, RAYS, SUN_LEN * open, rot - Math.PI / 2, 240);
  const p = poly(pts);
  gilt(c, p, [x - 120, y - 120, 240, 240], { angle: 0.7, sheen: seg(t, 2.6, 3.6) });
  const ring = new Path2D();
  circle(x, y, SUN_R - 6, ring);
  circle(x, y, SUN_R * 0.55, ring);
  c.strokeStyle = DECO.goldDeep;
  c.lineWidth = 2;
  c.stroke(ring);
  gilt(c, circle(x, y, SUN_R * 0.5), [x - 30, y - 30, 60, 60], { angle: 2.2, warm: 0.4 });
};

const G0X = 800;
const G0Y = 380;

const s2Cam = (t: number): [number, number, number] => {
  const ks: Key[] = [
    [T_MORPH1, G0X, G0Y, 1.8],
    [6.05, 800, 470, 1.0],
    [6.75, heroX(6.75) + 30, 680, 2.4],
    [7.45, heroX(7.45) + 40, 690, 2.6],
    [T_PORTAL0, heroX(T_PORTAL0) + 170, 630, 1.8],
  ];
  if (t <= T_PORTAL0) return keys(t, ks);
  const a = keys(T_PORTAL0, ks);
  const k = ease.inCubic(seg(t, T_PORTAL0, T_PORTAL1));
  return [lerp(a[0], PORTAL_X, ease.outCubic(seg(t, T_PORTAL0, T_PORTAL1))), lerp(a[1], 610, k), Math.exp(lerp(Math.log(a[2]), Math.log(5), k))];
};

const portalPts = () =>
  zigguratPts(PORTAL_X, FLOOR, [
    [230, 260],
    [196, 50],
    [156, 44],
    [108, 36],
  ]);

const drawS2 = (r: Riso, c: Ctx, t: number, s: State, o: { hero: boolean; g0: boolean; portalWorld?: boolean }) => {
  const cam = s2Cam(t);
  r.camera(cam[0], cam[1], cam[2]);
  // wall
  c.fillStyle = grad(c, 0, -200, 0, FLOOR, [
    [0, '#04130f'],
    [0.5, DECO.deepGreen],
    [0.85, DECO.emerald],
    [1, '#13584c'],
  ]);
  c.fillRect(-800, -600, 3600, FLOOR + 600);
  // fluted pilasters with stepped capitals
  const pil = new Path2D();
  const flute = new Path2D();
  for (let x = -480; x < 2400; x += 320) {
    pil.rect(x - 30, 60, 60, FLOOR - 60);
    pil.rect(x - 40, 40, 80, 22);
    pil.rect(x - 50, 22, 100, 18);
    for (let f = -2; f <= 2; f++) {
      flute.moveTo(x + f * 10, 80);
      flute.lineTo(x + f * 10, FLOOR - 20);
    }
  }
  c.fillStyle = 'rgba(2,20,16,0.7)';
  c.fill(pil);
  c.strokeStyle = rgba(DECO.gold, 0.35);
  c.lineWidth = 1.5;
  c.stroke(flute);
  // rising-sun relief on the wall behind the line
  const rel = burstPath(1150, FLOOR, { r0: 120, r1: 470, n: 15, a0: -Math.PI, span: Math.PI, width: 0.52 });
  c.fillStyle = rgba(DECO.jade, 0.32);
  c.fill(rel);
  const arcs = new Path2D();
  for (const rr of [120, 135, 480]) {
    arcs.moveTo(1150 + rr, FLOOR);
    arcs.arc(1150, FLOOR, rr, 0, Math.PI, true);
  }
  c.strokeStyle = rgba(DECO.gold, 0.45);
  c.lineWidth = 2;
  c.stroke(arcs);
  // streamline bands across the wall
  c.fillStyle = goldGrad(c, -800, 0, 2800, 0);
  c.globalAlpha = 0.65;
  for (const y of [640, 652, 664]) c.fillRect(-800, y, 3600, y === 652 ? 4 : 2);
  c.globalAlpha = 1;
  // the portal opening onto the evening
  if (o.portalWorld) {
    const pp = poly(portalPts());
    c.fillStyle = '#0b1226';
    c.fill(pp);
  }
  const pf = poly(portalPts());
  c.save();
  c.lineJoin = 'miter';
  giltStroke(c, pf, [PORTAL_X - 240, 380, 480, 420], 8);
  c.strokeStyle = DECO.deepGreen;
  c.lineWidth = 3;
  c.stroke(pf);
  c.restore();
  // piston driven by G1
  const g1 = s.gears[1];
  const ca = g1.rot(t);
  const px = g1.x + Math.cos(ca) * 70;
  const py = g1.y + Math.sin(ca) * 70;
  const L = 270;
  const sy = py - Math.sqrt(Math.max(0, L * L - (px - g1.x) ** 2));
  c.fillStyle = '#0b2c27';
  c.fill(rrect(g1.x - 34, 40, 68, 210, 6));
  giltStroke(c, rrect(g1.x - 34, 40, 68, 210, 6), [g1.x - 34, 40, 68, 210], 3);
  gilt(c, rrect(g1.x - 26, sy - 60, 52, 64, 5), [g1.x - 26, sy - 60, 52, 64], { angle: 0 });
  c.strokeStyle = goldGrad(c, px, py, g1.x, sy);
  c.lineWidth = 16;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(g1.x, sy);
  c.lineTo(px, py);
  c.stroke();
  // gears
  const sh = seg(t, 5.6, 6.6);
  for (let i = s.gears.length - 1; i >= 0; i--) {
    if (i === 0 && !o.g0) continue;
    drawGear(c, s.gears[i], t, i === 0 ? clamp((t - T_MORPH1 + 0.25) * 3) : 1, i === 0 ? sh : -1);
  }
  c.fillStyle = rgba(DECO.gold, 0.9);
  c.fill(circle(px, py, 9));
  // presses
  for (const [x, ph] of [
    [420, 0],
    [700, 0.45],
  ] as const) {
    const cyc = ((t * 0.9 + ph) % 1 + 1) % 1;
    const stroke = cyc < 0.25 ? ease.inCubic(cyc / 0.25) : 1 - ease.inOutSine(clamp((cyc - 0.25) / 0.75));
    const hy = lerp(560, 700, stroke);
    c.fillStyle = '#0b2c27';
    c.fillRect(x - 12, 420, 24, hy - 420);
    const head = poly(
      zigguratPts(x, hy + 40, [
        [70, 18],
        [52, 14],
        [34, 12],
      ])
    );
    gilt(c, head, [x - 70, hy, 140, 44], { angle: 0.3 });
    if (cyc > 0.24 && cyc < 0.4) {
      const sk = (cyc - 0.24) / 0.16;
      const spk = new Path2D();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI + (i / 9) * Math.PI;
        const r0 = 40 + sk * 60;
        spk.moveTo(x + Math.cos(a) * r0, hy + 44 + Math.sin(a) * r0 * 0.4);
        spk.lineTo(x + Math.cos(a) * (r0 + 26), hy + 44 + Math.sin(a) * (r0 + 26) * 0.4);
      }
      c.strokeStyle = rgba(DECO.goldHi, 1 - sk);
      c.lineWidth = 3;
      c.stroke(spk);
    }
  }
  // conveyor
  c.fillStyle = '#081a17';
  c.fillRect(-800, FLOOR, 2240, 26);
  c.save();
  c.strokeStyle = DECO.gold;
  c.lineWidth = 3;
  c.setLineDash([16, 22]);
  c.lineDashOffset = -t * 90;
  c.beginPath();
  c.moveTo(-800, FLOOR + 4);
  c.lineTo(1440, FLOOR + 4);
  c.stroke();
  c.restore();
  const rollers = new Path2D();
  const spokes = new Path2D();
  for (let x = -780; x < 1440; x += 46) {
    circle(x, FLOOR + 16, 9, rollers);
    const a = (t * 90) / 9;
    spokes.moveTo(x + Math.cos(a) * 8, FLOOR + 16 + Math.sin(a) * 8);
    spokes.lineTo(x - Math.cos(a) * 8, FLOOR + 16 - Math.sin(a) * 8);
  }
  c.fillStyle = DECO.goldLo;
  c.fill(rollers);
  c.strokeStyle = DECO.goldHi;
  c.lineWidth = 2;
  c.stroke(spokes);
  // floor
  c.fillStyle = grad(c, 0, FLOOR + 26, 0, FLOOR + 200, [
    [0, '#061512'],
    [1, '#020706'],
  ]);
  c.fillRect(-800, FLOOR + 26, 3600, 400);
  c.fillRect(1440, FLOOR, 1400, 30);
  c.strokeStyle = rgba(DECO.gold, 0.35);
  c.lineWidth = 1.2;
  c.beginPath();
  for (let x = -800; x < 2800; x += 60) {
    c.moveTo(x, FLOOR + 30);
    c.lineTo(x + 30, FLOOR + 60);
    c.lineTo(x + 60, FLOOR + 30);
  }
  c.stroke();
  // car bodies in primer behind the hero
  const hx = heroX(t);
  for (let k = 1; k <= 3; k++) {
    drawCar(c, s, hx - k * 560, FLOOR, CAR_S2, { rot: 0, wheels: false, primer: true, trestle: 1, shadow: 0.6 });
  }
  if (o.hero) drawHero(c, s, t, hx, FLOOR, CAR_S2);
  // gantry and twin chutes that feed the wheel gears
  const gx = heroX(7.05);
  c.fillStyle = '#0a2622';
  c.fillRect(1080, 500, 380, 24);
  c.fillStyle = goldGrad(c, 1080, 500, 1460, 524);
  c.fillRect(1080, 500, 380, 3);
  c.fillRect(1080, 521, 380, 3);
  for (const dx of [-150 * CAR_S2, 165 * CAR_S2]) {
    const ch = poly(
      zigguratPts(gx + dx, 640, [
        [22, 40],
        [30, 30],
        [38, 40],
      ])
    );
    c.fillStyle = '#0d302a';
    c.fill(ch);
    giltStroke(c, ch, [gx + dx - 38, 530, 76, 110], 2.5);
    c.fillStyle = DECO.goldHi;
    c.fill(circle(gx + dx, 634, 3));
  }
};

const heroOpts = (t: number): CarOpts => {
  const drop = t < 6.85 ? 360 : 360 * (1 - ease.outBack(seg(t, 6.85, 7.25)));
  return {
    rot: t < 7.25 ? t * 6 : 7.25 * 6 + (heroX(t) - heroX(7.25)) / 46 / CAR_S2,
    wheels: t > 6.85,
    wheelK: tween(t, 7.15, 7.55, ease.inOutCubic),
    drop,
    trestle: 1 - tween(t, 7.3, 7.6),
    lamp: tween(t, 7.5, 7.9),
  };
};

const drawHero = (c: Ctx, s: State, t: number, x: number, y: number, sc: number) => {
  drawCar(c, s, x, y, sc, heroOpts(t));
};

/* S3: race and river */

const fgCam = (t: number): [number, number, number] => {
  const tr = raceT(t);
  const xc = carX(tr);
  const shake = t > T_IMPACT && t < T_IMPACT + 0.3 ? Math.sin(t * 90) * 6 * (1 - (t - T_IMPACT) / 0.3) : 0;
  const ks: Key[] = [
    [8.4, 100, 772, 2.4],
    [9.5, 70, 766, 2.25],
    [10.35, 160, 745, 1.55],
    [10.95, 96, 772, 2.9],
    [11.7, 30, 770, 2.3],
    [T_OUT0, -10, 766, 2.0],
  ];
  const [ox, cy, z] = keys(t, ks);
  const out = ease.inOutCubic(seg(t, T_OUT0, T_OUT1));
  const cx = lerp(xc + ox, 800, out);
  return [cx + shake, lerp(cy, 486, out), Math.exp(lerp(Math.log(z), 0, out))];
};

const bgCam = (t: number): [number, number, number] => {
  const out = ease.inOutCubic(seg(t, T_OUT0, T_OUT1));
  const z = lerp(1.25, 1, out);
  const cx = lerp(470 + 70 * (t - 8.4), 800, out);
  return [cx, HORIZON - 112 / z, z];
};

const drawS3 = (r: Riso, c: Ctx, t: number, s: State, o: { car: boolean }) => {
  const tr = raceT(t);
  const bc = bgCam(t);
  r.camera(bc[0], bc[1], bc[2]);
  const rise = tween(t, T_RISE0, T_BURST, ease.outCubic);
  const burst = t >= T_BURST ? ease.outBack(seg(t, T_BURST, T_BURST + 0.45)) : 0;
  const dawn = clamp(seg(t, T_BURST - 0.1, T_BURST + 1.2));
  // sky
  c.fillStyle = grad(c, 0, -150, 0, HORIZON, [
    [0, mix(DECO.midnight, DECO.navy, dawn)],
    [0.45, mix('#1e2a5c', '#3a3a78', dawn)],
    [0.75, mix('#6a2f58', '#c4566a', dawn)],
    [0.93, mix(DECO.coral, DECO.salmon, dawn)],
    [1, mix(DECO.salmon, DECO.peach, dawn)],
  ]);
  c.fillRect(-1200, -600, 4000, HORIZON + 600);
  drawStars(c, s.stars3, t, DECO.cream, 1 - dawn);
  const sunY = lerp(HORIZON + 160, HORIZON - 30, rise);
  // horizon glow
  glow(c, 800, HORIZON, 520 + 200 * burst, DECO.peach, 0.45 + 0.4 * rise);
  // sunburst rays
  if (burst > 0) {
    c.save();
    const sky = new Path2D();
    sky.rect(-1200, -800, 4000, HORIZON + 800);
    c.clip(sky);
    const rot = 0.03 * (t - T_BURST);
    const wide = burstPath(800, sunY, { r0: 130, r1: 1500, n: 18, a0: -Math.PI + rot, span: Math.PI, width: 0.5, k: burst, stagger: 0 });
    c.fillStyle = radial(c, 800, sunY, 120, 1100, [
      [0, rgba(DECO.peach, 0.75)],
      [0.5, rgba(DECO.salmon, 0.35)],
      [1, rgba(DECO.coral, 0.05)],
    ]);
    c.fill(wide);
    const thin = burstPath(800, sunY, {
      r0: 150,
      r1: 1400,
      n: 18,
      a0: -Math.PI + rot + Math.PI / 36,
      span: Math.PI,
      width: 0.16,
      k: burst,
      stagger: 0,
      taper: true,
    });
    c.fillStyle = radial(c, 800, sunY, 140, 1000, [
      [0, rgba(DECO.goldHi, 0.95)],
      [0.6, rgba(DECO.gold, 0.6)],
      [1, rgba(DECO.gold, 0)],
    ]);
    c.fill(thin);
    c.restore();
  }
  // the sun
  if (rise > 0) {
    c.save();
    const sky = new Path2D();
    sky.rect(-1200, -800, 4000, HORIZON + 800);
    c.clip(sky);
    const R = 140 * (1 + 0.06 * burst);
    glow(c, 800, sunY, R * 2.4, DECO.goldHi, 0.5 + 0.3 * burst);
    const sp = poly(sunPts(800, sunY, R, RAYS, 34 * burst, 0.1 * t, 240));
    gilt(c, sp, [800 - R - 40, sunY - R - 40, R * 2 + 80, R * 2 + 80], { angle: 0.6, sheen: seg(t, T_BURST + 0.2, T_BURST + 1.6) });
    const rings = new Path2D();
    for (const k of [0.82, 0.62, 0.42]) circle(800, sunY, R * k, rings);
    c.strokeStyle = rgba(DECO.goldDeep, 0.7);
    c.lineWidth = 2.5;
    c.stroke(rings);
    c.restore();
  }
  // the burst: a shock ring and a flash off the rising sun
  const bk = seg(t, T_BURST, T_BURST + 0.8);
  if (bk > 0 && bk < 1) {
    glow(c, 800, sunY, 1000, DECO.ivory, 0.7 * (1 - bk) ** 2);
    c.strokeStyle = rgba(DECO.goldHi, (1 - bk) * 0.9);
    c.lineWidth = 22 * (1 - bk) + 2;
    c.stroke(circle(800, sunY, lerp(150, 1500, ease.outCubic(bk))));
  }
  // skyline
  c.drawImage(s.skyline, SKY_X0, SKY_Y0, SKY_W, SKY_H);
  // the hero tower crown glints at dawn
  glow(c, 1185, HORIZON - 388, 40, DECO.goldHi, 0.6 * dawn + 0.25);
  // river
  c.fillStyle = grad(c, 0, HORIZON, 0, 900, [
    [0, mix('#2b2f63', '#7a4a70', dawn)],
    [0.3, DECO.navy],
    [1, DECO.midnight],
  ]);
  c.fillRect(-1200, HORIZON, 4000, 700);
  c.save();
  c.globalAlpha = 0.28;
  c.translate(0, HORIZON * 2);
  c.scale(1, -0.9);
  c.drawImage(s.skyline, SKY_X0, SKY_Y0 + 60, SKY_W, SKY_H);
  c.restore();
  // ripples and sun path
  const rip = new Path2D();
  const gold = new Path2D();
  for (let i = 0; i < 46; i++) {
    const y = HORIZON + 4 + i * i * 0.16 + i * 3;
    if (y > 960) break;
    const off = ((t * (30 + i * 3) + i * 97) % 200) - 100;
    for (let x = -1100; x < 2700; x += 200) rip.rect(x + off, y, 120, 1.6 + i * 0.05);
    const wdt = 30 + i * 9;
    const sh = Math.sin(t * 3 + i * 1.3) * 10;
    gold.rect(800 - wdt / 2 + sh, y, wdt * (0.5 + 0.5 * hash(i)), 2 + i * 0.06);
    gold.rect(800 + wdt * 0.1 - sh, y + 1, wdt * 0.4 * hash(i + 9), 2 + i * 0.06);
  }
  c.fillStyle = rgba(DECO.midnight, 0.55);
  c.fill(rip);
  c.fillStyle = rgba(DECO.goldHi, 0.25 + 0.6 * rise);
  c.fill(gold);

  // speed lines (screen space) behind the foreground
  const spd = clamp(1 - seg(t, T_OUT0, 14.4)) * (t > 8 ? 1 : 0);
  r.camera(800, 450, 1);
  speedLines(c, -100, 1700, [96, 128, 150, 214, 232, 470, 486], -t * 2600, DECO.cream, 0.55 * spd, 2.5, 380, 520);

  // impact frame
  const iA = t < T_IMPACT ? 0 : t < T_IMPACT + 0.32 ? 1 : 1 - seg(t, T_IMPACT + 0.32, T_IMPACT + 0.5);
  const fc = fgCam(t);
  if (iA > 0) {
    const nose = toScreen(fc, carX(tr) + 276 * CAR_S, ROAD_Y - 60);
    c.fillStyle = rgba(DECO.ink, 0.92 * iA);
    c.fillRect(-20, -20, 1640, 940);
    const ik = ease.outExpo(seg(t, T_IMPACT, T_IMPACT + 0.25));
    const rays = burstPath(nose[0], nose[1] - 40, { r0: 60, r1: 2000, n: 40, width: 0.42, k: ik, stagger: 0, taper: false });
    c.fillStyle = goldGrad(c, 0, 0, 1600, 900);
    c.globalAlpha = iA;
    c.fill(rays);
    c.globalAlpha = 1;
  }

  // foreground world
  r.camera(fc[0], fc[1], fc[2]);
  const vx0 = fc[0] - 800 / fc[2] - 200;
  const vx1 = fc[0] + 800 / fc[2] + 200;
  // viaduct: deck and stepped arches
  const via = new Path2D();
  via.rect(vx0, RAIL_Y, vx1 - vx0, ROAD_Y - RAIL_Y - 4);
  const P = 150;
  for (let x = Math.floor(vx0 / P) * P; x < vx1; x += P) {
    poly(
      zigguratPts(x + P / 2, ROAD_Y - 4, [
        [52, 54],
        [40, 12],
        [26, 10],
      ]),
      via
    );
  }
  c.fillStyle = grad(c, 0, RAIL_Y, 0, ROAD_Y, [
    [0, '#14453d'],
    [1, '#07211d'],
  ]);
  c.fill(via, 'evenodd');
  c.strokeStyle = rgba(DECO.gold, 0.45);
  c.lineWidth = 1.5;
  c.stroke(via);
  c.fillStyle = goldGrad(c, vx0, 0, vx1, 0);
  c.fillRect(vx0, RAIL_Y + 2, vx1 - vx0, 3);
  c.fillRect(vx0, RAIL_Y + 10, vx1 - vx0, 1.5);
  // train
  const tx = trainX(tr);
  drawStreamliner(c, tx, RAIL_Y, TRAIN_S, NAVY_TRAIN, { wheelRot: tx / 9 });
  // road
  c.fillStyle = DECO.ink;
  c.fillRect(vx0, ROAD_Y, vx1 - vx0, 300);
  c.fillStyle = DECO.cream;
  c.fillRect(vx0, ROAD_Y, vx1 - vx0, 3);
  c.save();
  c.strokeStyle = rgba(DECO.gold, 0.8);
  c.lineWidth = 3;
  c.setLineDash([40, 50]);
  c.beginPath();
  c.moveTo(vx0 - (vx0 % 90), ROAD_Y + 24);
  c.lineTo(vx1, ROAD_Y + 24);
  c.stroke();
  c.restore();
  if (o.car) {
    const xc = carX(tr);
    drawCar(c, s, xc, ROAD_Y, CAR_S, { rot: xc / (46 * CAR_S), wheels: true, lamp: 1 });
  }
  // flash
  if (t > T_IMPACT - 0.02 && t < T_IMPACT + 0.12) {
    r.camera(800, 450, 1);
    c.fillStyle = rgba(DECO.ivory, 0.85 * (1 - seg(t, T_IMPACT, T_IMPACT + 0.12)));
    c.fillRect(-20, -20, 1640, 940);
  }
};

/* ---------- film ---------- */

export const decoMotorCityFilm: RisoFilm<State> = {
  id: 'deco-motor-city',
  title: 'Motor City Deco',
  caption: 'A tower’s sunburst crown turns gear, then wheel, then the sun rising over the river.',
  theme: 'Detroit',
  motif: 'The sunburst: crown, gear, wheel, sunrise',
  duration: DUR,
  series: 'Art deco',
  mode: 'direct',
  paper: DECO.midnight,
  grain: 0.22,
  inks: [{ color: DECO.gold }, { color: DECO.orange }, { color: DECO.navy }, { color: DECO.emerald }, { color: DECO.coral }],
  scenes: [
    { at: 0, label: 'Setbacks' },
    { at: 4.3, label: 'The line' },
    { at: 8.4, label: 'Streamline' },
    { at: 12.6, label: 'Over the river' },
    { at: T_TITLE, label: 'Motor City' },
  ],
  posterTime: 16.6,

  setup(r: Riso) {
    const rng = mulberry(12);
    // S1 front city
    const city1 = new Path2D();
    const city1Win = new Path2D();
    let x = -900;
    while (x < 2500) {
      const w = 60 + rng() * 120;
      const near = Math.abs(x + w / 2 - 800) < 330;
      const h = near ? 40 + rng() * 60 : 100 + rng() * 200;
      const top = BASE_Y - h;
      poly(
        zigguratPts(x + w / 2, BASE_Y + 40, [
          [w / 2, h * 0.7 + 40],
          [w * 0.34, h * 0.3],
        ]),
        city1
      );
      for (let yy = top + 14; yy < BASE_Y; yy += 14)
        for (let xx = x + 8; xx < x + w - 8; xx += 11) if (rng() < 0.22 && yy > top + h * 0.3 + 6) city1Win.rect(xx, yy, 4, 6);
      x += w + rng() * 10;
    }
    const motif = morphPair(
      sunPts(0, 0, SUN_R * Z_PUSH, RAYS, SUN_LEN * Z_PUSH, 0, 480),
      gearPts(0, 0, (pr(16) + 16) * 1.8, (pr(16) - 16) * 1.8, 16, 0),
      480
    );
    const wheel = morphPair(gearPts(0, 0, 52, 42, 12, 0), circlePts(0, 0, 46, 120, 0), 240);
    // car outlines (local, ground at y=0, nose to +x)
    const carBody = smoothPath(
      [
        [270, -34],
        [276, -60],
        [258, -86],
        [214, -102],
        [140, -114],
        [70, -122],
        [40, -132],
        [10, -168],
        [-36, -186],
        [-96, -186],
        [-152, -164],
        [-210, -128],
        [-254, -88],
        [-274, -50],
        [-266, -28],
        [-180, -22],
        [0, -21],
        [200, -23],
      ],
      true,
      0.5
    );
    const carFender = new Path2D();
    carFender.moveTo(10, -32);
    carFender.bezierCurveTo(30, -70, 70, -108, 150, -116);
    carFender.bezierCurveTo(230, -120, 280, -104, 290, -64);
    carFender.quadraticCurveTo(294, -40, 282, -30);
    carFender.lineTo(226, -30);
    carFender.lineTo(223, -46);
    carFender.arc(165, -46, 58, 0, Math.PI, true);
    carFender.lineTo(80, -30);
    carFender.closePath();
    const carSkirt = smoothPath(
      [
        [-34, -26],
        [-58, -66],
        [-104, -100],
        [-176, -106],
        [-236, -84],
        [-268, -50],
        [-270, -27],
        [-150, -25],
      ],
      true,
      0.45
    );
    const carWin = new Path2D();
    carWin.moveTo(30, -134);
    carWin.bezierCurveTo(14, -160, -6, -176, -44, -178);
    carWin.lineTo(-96, -178);
    carWin.bezierCurveTo(-130, -172, -156, -152, -176, -134);
    carWin.closePath();
    const carStripe = new Path2D();
    carStripe.moveTo(96, -104);
    carStripe.bezierCurveTo(0, -108, -150, -104, -262, -72);
    carStripe.lineTo(-256, -66);
    carStripe.bezierCurveTo(-150, -94, 0, -98, 96, -96);
    carStripe.closePath();
    const skyline = buildSkyline(r);
    // S2 gear train
    const w0 = 0.55;
    const n0 = 16;
    const g0: Gear = { x: G0X, y: G0Y, n: n0, rot: (t) => w0 * (t - 4) + 0.6 };
    const mesh = (a: Gear, n: number, phi: number): Gear => {
      const d = pr(a.n) + pr(n);
      const x = a.x + Math.cos(phi) * d;
      const y = a.y + Math.sin(phi) * d;
      const sa = TAU / a.n;
      const sb = TAU / n;
      return {
        x,
        y,
        n,
        rot: (t) => {
          const u = (phi - a.rot(t)) / sa;
          return phi + Math.PI + (u + 0.5) * sb;
        },
      };
    };
    const g1 = mesh(g0, 10, 2.62);
    const g2 = mesh(g0, 8, -0.42);
    const g3 = mesh(g1, 6, 2.0);
    const g4 = mesh(g2, 7, -0.3);
    return {
      city1,
      city1Win,
      stars1: makeStars(70, 3, -400, 2000, -600, 500),
      stars3: makeStars(60, 9, -600, 2200, -200, 380),
      motif,
      wheel,
      carBody,
      carFender,
      carSkirt,
      carWin,
      carStripe,
      skyline,
      gears: [g0, g1, g2, g3, g4],
    };
  },

  draw(r, t, s) {
    const c = r.layers[0];

    if (t < T_IRIS1) {
      drawS1(r, c, t, s, t < T_PUSH1);
    }
    // S1 -> S2: the sun becomes the gear inside an opening iris
    if (t >= T_IRIS0 && t < T_PORTAL1) {
      c.save();
      if (t < T_IRIS1) {
        r.camera(800, 450, 1);
        const R = lerp(470, 1050, ease.inOutCubic(seg(t, T_IRIS0, T_IRIS1)));
        c.clip(circle(800, 450, R));
      }
      const portal = t > 5.5;
      drawS2(r, c, t, s, { hero: t < T_PORTAL0, g0: t >= T_MORPH1, portalWorld: !portal });
      c.restore();
      if (t < T_IRIS1) {
        r.camera(800, 450, 1);
        const R = lerp(470, 1050, ease.inOutCubic(seg(t, T_IRIS0, T_IRIS1)));
        const ring = circle(800, 450, R + 10);
        circle(800, 450, R, ring);
        gilt(c, ring, [800 - R, 450 - R, R * 2, R * 2], { rule: 'evenodd', angle: 0.8 });
        c.strokeStyle = DECO.ink;
        c.lineWidth = 2;
        c.stroke(circle(800, 450, R + 14));
      }
    }
    // the motif morph, screen space
    if (t >= T_PUSH1 && t < T_MORPH1) {
      r.camera(800, 450, 1);
      const k = ease.inOutCubic(seg(t, T_PUSH1 + 0.05, T_MORPH1));
      const rotA = 0.25 * t - Math.PI / 2;
      const rotB = s.gears[0].rot(t);
      const pts = morph(s.motif[0], s.motif[1], k);
      c.save();
      c.translate(800, 450);
      c.rotate(lerp(rotA, rotB, k));
      const p = poly(pts);
      gilt(c, p, [-480, -480, 960, 960], { angle: 0.7 - lerp(rotA, rotB, k), sheen: seg(t, 4.1, 4.85) });
      const ring = new Path2D();
      circle(0, 0, lerp(SUN_R - 6, pr(16) - 25, k) * lerp(Z_PUSH, 1.8, k), ring);
      circle(0, 0, lerp(SUN_R * 0.55 * Z_PUSH, (pr(16) - 16) * 0.36 * 1.8, k), ring);
      c.strokeStyle = DECO.goldDeep;
      c.lineWidth = lerp(8, 3.6, k);
      c.stroke(ring);
      c.restore();
    }
    // S2 portal opening onto S3
    if (t >= 5.5 && t < T_PORTAL1) {
      const cam = s2Cam(t);
      r.camera(cam[0], cam[1], cam[2]);
      c.save();
      c.clip(poly(portalPts()));
      drawS3(r, c, Math.max(t, 8.0), s, { car: false });
      c.restore();
      // portal frame over it
      r.camera(cam[0], cam[1], cam[2]);
      const pf = poly(portalPts());
      c.lineJoin = 'miter';
      giltStroke(c, pf, [PORTAL_X - 240, 380, 480, 420], 8);
    }
    if (t >= T_PORTAL1) drawS3(r, c, t, s, { car: true });
    // the hero car carried through the portal in screen space
    if (t >= T_PORTAL0 && t < T_PORTAL1) {
      const k = ease.inOutCubic(seg(t, T_PORTAL0, T_PORTAL1));
      const c2 = s2Cam(t);
      const a = toScreen(c2, heroX(t), FLOOR);
      const sa = CAR_S2 * c2[2];
      const fc = fgCam(t);
      const xc = carX(raceT(t));
      const b = toScreen(fc, xc, ROAD_Y);
      const sb = CAR_S * fc[2];
      r.camera(800, 450, 1);
      const o = heroOpts(t);
      drawCar(c, s, lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(sa, sb, k), { ...o, rot: lerp(o.rot, xc / (46 * CAR_S), k) });
    }

    /* ---------- overlays ---------- */
    r.camera(800, 450, 1);
    // title
    if (t >= T_TITLE) {
      const k = ease.outCubic(seg(t, T_TITLE, T_TITLE + 1.2));
      c.save();
      c.translate(800, 200);
      c.scale(1, 0.3);
      c.fillStyle = radial(c, 0, 0, 60, 640, [
        [0, rgba(DECO.midnight, 0.8 * k)],
        [0.6, rgba(DECO.midnight, 0.45 * k)],
        [1, rgba(DECO.midnight, 0)],
      ]);
      c.fillRect(-800, -700, 1600, 1400);
      c.restore();
      c.save();
      c.shadowColor = 'rgba(6,8,24,0.9)';
      c.shadowOffsetY = 4;
      c.shadowBlur = 10;
      decoText(c, 'MOTOR CITY', 800, 206, 100, 36, k, letterGold(c, 130, 206), 500);
      c.restore();
      const sk = seg(t, 16.3, 17.5);
      if (sk > 0 && sk < 1) decoText(c, 'MOTOR CITY', 800, 206, 100, 36, 1, sheenGrad(c, 330, 1270, sk), 500);
      ruleDiamond(c, 800, 240, 640, ease.outCubic(seg(t, T_TITLE + 0.5, T_TITLE + 1.4)), letterGold(c, 232, 248), 2);
      decoText(c, 'DETROIT', 800, 290, 30, 26, ease.outCubic(seg(t, T_TITLE + 0.8, T_TITLE + 1.8)), DECO.cream, 500);
    }
    decoFrame(c, tween(t, 0.1, 1.6, ease.inOutCubic), {
      inset: 24,
      margin: DECO.midnight,
      sheenK: t > 15 ? seg(t, 16.2, 17.8) : seg(t, 1.2, 2.6),
    });
  },
};
