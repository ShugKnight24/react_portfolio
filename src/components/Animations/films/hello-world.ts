import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { mulberry, clamp, lerp, seg, smooth, tween, ease, hash, noise1, TAU, DISPLAY, SERIF, MONO, spacedText } from '../riso/kit';

/*
 * Hello, World. A cursor blinks on an empty line at 2 a.m. It stretches into the edge of a
 * building, code lines stack into bricks, the bricks become a small-town shop that opens at dawn
 * and takes its first tap. Pull back: it was on the laptop all along, the cursor blinks after
 * "hello, world".
 */

const G = 0;
const O = 1;
const K = 2;
type Mix = [number, number, number];

/** Laptop screen in world space; the shop world is drawn inside it at 0.4 */
const SX = 480;
const SY = 190;
const SW = 640;
const SH = 360;
const SS = SW / 1600;
const ZMAX = 2.52;

/** Shop world */
const GROUND = 760;
const FL = 500;
const FR = 1100;
const ROWS = 19;
const ROW_T0 = 6.3;
const ROW_DT = 0.13;
const SNAP_T0 = 8.75;

interface Seg {
  x0: number;
  x1: number;
  mix: Mix;
}
interface Row {
  y: number;
  segs: Seg[];
  brick: Mix;
}
interface Star {
  x: number;
  y: number;
  r: number;
  ph: number;
}
interface State {
  term: { y: number; segs: Seg[] }[];
  rows: Row[];
  stars: Star[];
  goods: { x: number; y: number; w: number; h: number; kind: number }[];
}

/* ---------- small drawing helpers ---------- */

const rp = (x: number, y: number, w: number, h: number) => {
  const p = new Path2D();
  p.rect(x, y, w, h);
  return p;
};
const rr = (x: number, y: number, w: number, h: number, rad: number) => {
  const p = new Path2D();
  p.roundRect(x, y, w, h, rad);
  return p;
};
const circ = (x: number, y: number, rad: number) => {
  const p = new Path2D();
  p.arc(x, y, Math.max(0.1, rad), 0, TAU);
  return p;
};
const poly = (pts: number[]) => {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
};

const fillD = (r: Riso, ctx: Ctx, p: Path2D, d: number) => {
  if (d <= 0.012) return;
  ctx.fillStyle = r.tone(ctx, d);
  ctx.fill(p);
};
const knock = (ctx: Ctx, p: Path2D, a = 1) => {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = a;
  ctx.fillStyle = '#000';
  ctx.fill(p);
  ctx.restore();
};
/** Fill a path with an ink mix; opaque knocks whatever is underneath first */
const paint = (r: Riso, p: Path2D, m: Mix, opaque = true) => {
  const L = r.layers;
  for (let i = 0; i < 3; i++) {
    if (opaque) knock(L[i], p);
    fillD(r, L[i], p, m[i]);
  }
};
const strokeMix = (r: Riso, p: Path2D, m: Mix, width: number, opaque = true) => {
  const L = r.layers;
  for (let i = 0; i < 3; i++) {
    const c = L[i];
    c.save();
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (opaque) {
      c.globalCompositeOperation = 'destination-out';
      c.strokeStyle = '#000';
      c.stroke(p);
      c.globalCompositeOperation = 'source-over';
    }
    if (m[i] > 0.012) {
      c.strokeStyle = r.tone(c, m[i]);
      c.stroke(p);
    }
    c.restore();
  }
};
const textMix = (r: Riso, text: string, x: number, y: number, font: string, m: Mix, align: CanvasTextAlign = 'left', spacing = 0) => {
  const L = r.layers;
  for (let i = 0; i < 3; i++) {
    const c = L[i];
    c.save();
    c.font = font;
    c.textAlign = align;
    c.textBaseline = 'alphabetic';
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    if (spacing) spacedText(c, text, x, y, spacing);
    else c.fillText(text, x, y);
    c.globalCompositeOperation = 'source-over';
    if (m[i] > 0.012) {
      c.fillStyle = r.tone(c, m[i]);
      if (spacing) spacedText(c, text, x, y, spacing);
      else c.fillText(text, x, y);
    }
    c.restore();
  }
};
const push = (r: Riso, f: (c: Ctx) => void) => {
  for (const c of r.layers) {
    c.save();
    f(c);
  }
};
const pop = (r: Riso) => {
  for (const c of r.layers) c.restore();
};
const mixLerp = (a: Mix, b: Mix, k: number): Mix => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/* ---------- palette roles ---------- */
const KEYWORD: Mix = [1, 0, 0];
const STRING: Mix = [0, 1, 0];
const IDENT: Mix = [0, 0, 0];
const COMMENT: Mix = [0.42, 0, 0];
const TOKENS = [KEYWORD, STRING, IDENT, IDENT, COMMENT, KEYWORD];

const makeSegs = (rng: () => number, x: number, maxX: number, n: number, gap: number): Seg[] => {
  const segs: Seg[] = [];
  for (let j = 0; j < n && x < maxX - 40; j++) {
    const w = Math.min(maxX - x, 40 + rng() * 150);
    segs.push({ x0: x, x1: x + w, mix: TOKENS[Math.floor(rng() * TOKENS.length)] });
    x += w + gap;
  }
  return segs;
};

/* ---------- the desk (world space) ---------- */

function drawDesk(r: Riso, t: number) {
  const [g, o, k] = r.layers;
  const day = t > 10 ? 1 : 0;
  const lampOn = t < 17.1 ? 0.94 + 0.06 * noise1(t * 3, 4) : t < 17.16 ? 0.35 : 0;

  // Wall
  const wall = rp(-60, -60, 1720, 662);
  const far = day ? 0.42 : 0.86;
  const near = lerp(far, day ? 0.26 : 0.36, lampOn);
  r.gradient(k, wall, { kind: 'radial', cx: 300, cy: 300, r0: 0, r1: 980, from: near, to: far }, 12);
  fillD(r, g, wall, day ? 0.1 : 0.2);
  r.gradient(o, wall, { kind: 'radial', cx: 300, cy: 300, r0: 0, r1: 560, from: 0.55 * lampOn, to: 0 }, 9);
  if (day) r.gradient(o, wall, { kind: 'radial', cx: 1380, cy: 230, r0: 0, r1: 760, from: 0.4, to: 0 }, 9);

  // Window on the wall: moon at night, sunrise in the morning
  const glass = rp(1262, 82, 236, 266);
  paint(r, rp(1248, 68, 264, 294), [0.2, 0, 0.95]);
  if (!day) {
    paint(r, glass, [0.32, 0, 0.88]);
    const moon = circ(1420, 160, 34);
    for (const c of r.layers) knock(c, moon);
    fillD(r, k, circ(1436, 148, 30), 0.88);
    fillD(r, g, circ(1436, 148, 30), 0.32);
    for (let i = 0; i < 6; i++) {
      const sx = 1280 + hash(i * 3.1) * 200;
      const sy = 100 + hash(i * 7.7) * 200;
      knock(k, circ(sx, sy, 2.2 + 1.2 * Math.sin(t * 3 + i)));
    }
  } else {
    for (const c of r.layers) knock(c, glass);
    r.gradient(o, glass, { kind: 'linear', x0: 0, y0: 82, x1: 0, y1: 348, from: 0.12, to: 0.8 }, 8);
    r.gradient(g, glass, { kind: 'linear', x0: 0, y0: 82, x1: 0, y1: 348, from: 0.25, to: 0 }, 6);
    const sun = new Path2D();
    sun.arc(1340, 348, 62, Math.PI, TAU);
    o.save();
    o.clip(glass);
    o.fillStyle = '#000';
    o.fill(sun);
    o.restore();
    fillD(r, k, rp(1262, 300, 236, 48), 0.25);
  }
  paint(r, rp(1376, 82, 8, 266), [0.2, 0, 0.95]);
  paint(r, rp(1262, 210, 236, 8), [0.2, 0, 0.95]);
  paint(r, rp(1236, 360, 288, 14), [0.3, 0, 1]);

  // Desk
  const desk = rp(-60, 600, 1720, 360);
  for (const c of r.layers) knock(c, desk);
  fillD(r, g, desk, 0.5);
  r.gradient(k, desk, { kind: 'radial', cx: 330, cy: 670, r0: 0, r1: 760, from: lerp(day ? 0.42 : 0.6, 0.14, lampOn), to: day ? 0.42 : 0.62 }, 12);
  r.gradient(o, desk, { kind: 'radial', cx: 330, cy: 670, r0: 0, r1: 420, from: 0.85 * lampOn, to: 0 }, 9);
  fillD(r, k, rp(-60, 600, 1720, 7), 1);
  // Wood grain
  const grain = new Path2D();
  for (let i = 0; i < 7; i++) {
    const y = 640 + i * 38 + hash(i) * 12;
    grain.moveTo(-60, y);
    for (let x = -60; x <= 1660; x += 80) grain.lineTo(x, y + noise1(x * 0.004 + i, 3) * 6);
  }
  k.save();
  k.lineWidth = 2;
  k.strokeStyle = r.tone(k, 0.5);
  k.stroke(grain);
  k.restore();

  // Laptop shadow, base and lid
  const shadow = new Path2D();
  shadow.ellipse(800, 630, 450, 20, 0, 0, TAU);
  fillD(r, k, shadow, 0.85);
  const base = poly([424, 574, 1176, 574, 1236, 620, 364, 620]);
  paint(r, base, [0.45, 0.12 * lampOn, 0.72]);
  paint(r, rp(372, 616, 856, 8), [0.3, 0, 1]);
  knock(k, rp(430, 577, 740, 3), 0.75);
  knock(k, rr(740, 606, 120, 8, 4), 0.5);
  const lid = rr(456, 166, 688, 408, 18);
  paint(r, lid, [0.15, 0, 1]);
  const rim = new Path2D();
  rim.moveTo(470, 560);
  rim.lineTo(470, 184);
  rim.quadraticCurveTo(470, 172, 486, 172);
  rim.lineTo(820, 172);
  k.save();
  k.globalCompositeOperation = 'destination-out';
  k.globalAlpha = 0.45 * lampOn + 0.15;
  k.strokeStyle = '#000';
  k.lineWidth = 3;
  k.stroke(rim);
  k.restore();
  knock(k, circ(800, 178, 3), 0.6);

  // Mug and steam
  const mug = rr(1268, 548, 92, 104, 12);
  const handle = new Path2D();
  handle.arc(1362, 596, 24, -1.3, 1.3);
  strokeMix(r, handle, [0, 1, 0.1], 13);
  paint(r, mug, [0, 1, 0.1]);
  g.save();
  g.clip(mug);
  g.fillStyle = r.tone(g, 0.4);
  g.fillRect(1326, 540, 40, 120);
  g.restore();
  fillD(r, k, rp(1268, 640, 92, 12), 0.35);
  const lip = new Path2D();
  lip.ellipse(1314, 552, 44, 8, 0, 0, TAU);
  paint(r, lip, [0.4, 0.5, 0.9]);
  const steam = new Path2D();
  for (let i = 0; i < 3; i++) {
    const x0 = 1296 + i * 18;
    steam.moveTo(x0, 535);
    for (let y = 535; y >= 400; y -= 9) {
      const amp = 4 + (535 - y) * 0.08;
      steam.lineTo(x0 + Math.sin(y * 0.045 - t * 2.4 + i * 2) * amp, y);
    }
  }
  for (const c of [k, g]) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = 0.5;
    c.strokeStyle = '#000';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.stroke(steam);
    c.restore();
  }

  // Desk lamp
  const dark: Mix = [0.25, 0, 1];
  const lampBase = new Path2D();
  lampBase.ellipse(150, 652, 76, 16, 0, 0, TAU);
  paint(r, lampBase, dark);
  paint(r, rr(132, 628, 36, 26, 8), dark);
  const arm = new Path2D();
  arm.moveTo(150, 636);
  arm.lineTo(98, 420);
  arm.lineTo(268, 246);
  strokeMix(r, arm, dark, 12);
  paint(r, circ(98, 420, 11), dark);
  paint(r, circ(268, 246, 13), dark);
  const ang = Math.atan2(640 - 246, 380 - 268);
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const lp = (u: number, v: number): [number, number] => [268 + u * ca - v * sa, 246 + u * sa + v * ca];
  const head = new Path2D();
  const h0 = lp(-26, -18);
  head.moveTo(h0[0], h0[1]);
  for (const [u, v] of [
    [10, -24],
    [70, -54],
    [70, 54],
    [10, 24],
    [-26, 18],
  ]) {
    const q = lp(u, v);
    head.lineTo(q[0], q[1]);
  }
  head.closePath();
  const mouth = lp(70, 0);
  // Beam
  const b0 = lp(70, -50);
  const b1 = lp(70, 50);
  const beam = poly([b0[0], b0[1], b1[0], b1[1], 600, 650, 150, 650]);
  if (lampOn > 0.05) {
    fillD(r, o, beam, 0.2 * lampOn);
    knock(k, beam, 0.22 * lampOn);
  }
  paint(r, head, dark);
  const bulb = new Path2D();
  bulb.ellipse(mouth[0], mouth[1], 48, 14, ang + Math.PI / 2, 0, TAU);
  paint(r, bulb, lampOn > 0.05 ? [0, 0.8, 0] : [0.2, 0.2, 0.6]);

  // End line on the desk
  const ke = tween(t, 17.25, 17.9, ease.outCubic);
  if (ke > 0) {
    push(r, (c) => c.clip(rp(800 - 560 * ke, 730, 1120 * ke, 70)));
    textMix(r, 'built for the shop down the street — since 2016', 800, 778, `italic 600 36px ${SERIF}`, [0, 0, 0], 'center', 0.5);
    pop(r);
  }
}

/* ---------- the shop world (inner space, 1600 x 900, drawn on the screen) ---------- */

function sky(r: Riso, t: number, dawn: number) {
  const [g, o, k] = r.layers;
  const all = rp(-20, -20, 1640, 940);
  const gr = (c: Ctx, from: number, to: number, steps = 10) =>
    r.gradient(c, all, { kind: 'linear', x0: 0, y0: 0, x1: 0, y1: GROUND, from, to }, steps);
  gr(k, lerp(0.88, 0.1, dawn), lerp(0.8, 0, dawn));
  gr(g, lerp(0.12, 0.16, dawn), lerp(0.14, 0, dawn), 8);
  if (dawn > 0) gr(o, lerp(0, 0.12, dawn), lerp(0, 0.85, dawn), 10);
  // A sun rising behind the street
  if (dawn > 0.2) {
    const sy = lerp(520, 190, tween(dawn, 0.2, 1, ease.outCubic));
    const sun = circ(1380, sy, 86);
    for (const c of r.layers) knock(c, sun);
    fillD(r, o, sun, 1);
  }
  void t;
}

function drawTerminal(r: Riso, t: number, s: State) {
  const scroll = 760 * tween(t, 3.7, 5.1, ease.inCubic);
  if (scroll > 740) return;
  for (const row of s.term) {
    const y = row.y - scroll;
    for (const sg of row.segs) paint(r, rr(sg.x0, y, sg.x1 - sg.x0, 26, 5), sg.mix);
  }
  textMix(r, '>', 196, 566 - scroll * 1.1, `900 96px ${MONO}`, KEYWORD);
}

function neighbors(r: Riso, t: number, dawn: number) {
  const kn1 = tween(t, 5.9, 7.1, ease.outCubic);
  const kn2 = tween(t, 6.15, 7.35, ease.outCubic);
  const lit = (i: number) => dawn < 0.25 + hash(i * 5.3) * 0.6;
  const win = (p: Path2D, i: number) => paint(r, p, lit(i) ? [0, 1, 0] : [0.3, 0.2, lerp(0.6, 0.35, dawn)]);
  const nightK = lerp(0.62, 0.38, dawn);
  if (kn1 > 0) {
    push(r, (c) => {
      c.clip(rp(-20, -20, 1640, GROUND + 20));
      c.translate(0, (1 - kn1) * 540);
    });
    const body = new Path2D();
    body.rect(40, 400, 410, 380);
    body.rect(30, 386, 430, 16);
    body.rect(170, 362, 150, 26);
    paint(r, body, [0.6, 0, nightK]);
    win(rr(84, 440, 78, 104, 39), 1);
    win(rr(206, 440, 78, 104, 39), 2);
    win(rr(328, 440, 78, 104, 39), 3);
    paint(r, rp(30, 572, 430, 10), [0.4, 0, 1]);
    win(rp(68, 610, 180, 118), 4);
    paint(r, rp(155, 610, 6, 118), [0.4, 0, 1]);
    paint(r, rp(370, 618, 62, 142), [0.3, 0.4, 0.9]);
    pop(r);
  }
  if (kn2 > 0) {
    push(r, (c) => {
      c.clip(rp(-20, -20, 1640, GROUND + 20));
      c.translate(0, (1 - kn2) * 560);
    });
    const body = new Path2D();
    body.moveTo(1140, 436);
    body.lineTo(1355, 282);
    body.lineTo(1570, 436);
    body.closePath();
    body.rect(1150, 430, 410, 350);
    paint(r, body, [0.25, 0.42, nightK + 0.05]);
    paint(r, poly([1130, 440, 1355, 276, 1580, 440, 1580, 452, 1355, 292, 1130, 452]), [0.3, 0, 1]);
    win(circ(1355, 372, 26), 5);
    win(rr(1196, 470, 70, 96, 6), 6);
    win(rr(1444, 470, 70, 96, 6), 7);
    win(rp(1190, 612, 220, 116), 8);
    paint(r, rp(1186, 600, 228, 10), [0.4, 0, 1]);
    paint(r, rp(1450, 620, 66, 140), [0.6, 0, 0.9]);
    pop(r);
  }
  // Street lamp grows out of the sidewalk
  const kl = tween(t, 6.8, 7.8, ease.outCubic);
  if (kl > 0) {
    const top = lerp(GROUND, 470, kl);
    const lampLit = clamp(1 - seg(dawn, 0.75, 0.85));
    if (lampLit > 0 && kl > 0.9) {
      const halo = circ(285, top - 20, 150);
      const k = r.layers[K];
      k.save();
      k.globalCompositeOperation = 'destination-out';
      r.gradient(k, halo, { kind: 'radial', cx: 285, cy: top - 20, r0: 0, r1: 150, from: 0.75 * lampLit, to: 0 }, 8);
      k.restore();
      r.gradient(r.layers[O], halo, { kind: 'radial', cx: 285, cy: top - 20, r0: 0, r1: 150, from: 0.6 * lampLit, to: 0 }, 8);
    }
    const dark: Mix = [0.3, 0, 1];
    paint(r, rp(281, top, 8, GROUND - top + 4), dark);
    paint(r, rp(271, GROUND - 22, 28, 26), dark);
    if (kl > 0.6) {
      const a = clamp((kl - 0.6) / 0.4);
      paint(r, poly([268, top - 44 * a, 302, top - 44 * a, 296, top, 274, top]), dark);
      paint(r, poly([274, top - 38 * a, 296, top - 38 * a, 292, top - 6 * a, 278, top - 6 * a]), lampLit > 0 ? [0, 1, 0] : [0, 0.3, 0.5]);
      paint(r, poly([264, top - 44 * a, 306, top - 44 * a, 285, top - 60 * a]), dark);
    }
  }
}

function ground(r: Riso, t: number, dawn: number) {
  const kg = tween(t, 4.9, 6.0, ease.outCubic);
  if (kg <= 0) return;
  const hw = lerp(20, 860, kg);
  const x0 = 800 - hw;
  const w = hw * 2;
  const walk = rp(x0, GROUND, w, 102);
  paint(r, walk, [0.16, 0.05 * dawn, lerp(0.42, 0.16, dawn)]);
  const joints = new Path2D();
  for (let x = -60; x < 1700; x += 118) joints.rect(x, GROUND, 4, 102);
  joints.rect(-20, GROUND + 48, 1640, 3);
  r.layers[K].save();
  r.layers[K].clip(walk);
  fillD(r, r.layers[K], joints, 0.7);
  r.layers[K].restore();
  paint(r, rp(x0, GROUND + 100, w, 14), [0.2, 0, 0.9]);
  paint(r, rp(x0, GROUND + 114, w, 40), [0.35, 0, lerp(0.75, 0.55, dawn)]);
  paint(r, rp(x0, GROUND - 4, w, 8), [0.3, 0, 1]);
}

/** The cursor: blinks, stretches into a wall edge, splits into the shop's pilasters */
function cursorBars(r: Riso, t: number) {
  const slide = tween(t, 3.9, 5.1, ease.inOutCubic);
  const ks = tween(t, 4.5, 5.5, ease.inOutCubic);
  const split = tween(t, 5.45, 6.7, ease.inOutCubic);
  const blinkOn = t > 3.7 || t % 1.1 < 0.62;
  const top = lerp(482, 236, ks);
  const bot = lerp(570, GROUND, ks);
  const xc = lerp(300, 780, slide);
  const lx = lerp(xc, FL, split);
  const rx = lerp(xc, FR - 40, split);
  return { top, bot, lx, rx, split, blinkOn };
}

function drawBars(r: Riso, t: number) {
  const b = cursorBars(r, t);
  if (!b.blinkOn) return;
  const shade = seg(t, 8.6, 9.4);
  for (const x of b.split > 0 ? [b.lx, b.rx] : [b.lx]) {
    const p = rp(x, b.top, 40, b.bot - b.top);
    paint(r, p, KEYWORD);
    if (shade > 0) {
      fillD(r, r.layers[K], rp(x + 26, b.top, 14, b.bot - b.top), 0.4 * shade);
      fillD(r, r.layers[K], rp(x, b.bot - 30, 40, 30), 0.5 * shade);
      knock(r.layers[G], rp(x + 6, b.top + 8, 4, b.bot - b.top - 40), 0.6 * shade);
    }
  }
}

function codeRows(r: Riso, t: number, s: State) {
  if (t < ROW_T0) return;
  const settled = t > SNAP_T0 + ROWS * 0.05 + 0.85;
  const brickPaths: [Path2D, Path2D, Path2D] = [new Path2D(), new Path2D(), new Path2D()];
  let cursor: Path2D | null = null;
  for (let i = 0; i < ROWS; i++) {
    const row = s.rows[i];
    const t0 = ROW_T0 + i * ROW_DT;
    if (t < t0) break;
    const kt = seg(t, t0, t0 + ROW_DT);
    const sn0 = SNAP_T0 + i * 0.05;
    const ks = tween(t, sn0, sn0 + 0.5, ease.inOutCubic);
    const start = row.segs[0].x0;
    const end = row.segs[row.segs.length - 1].x1;
    const head = lerp(start, end, kt);
    const n = row.segs.length;
    if (settled) {
      for (let j = 0; j < 3; j++) brickPaths[j].rect(540, row.y, 520, 18);
      continue;
    }
    row.segs.forEach((sg, j) => {
      const tx0 = 540 + (520 * j) / n;
      const tx1 = 540 + (520 * (j + 1)) / n;
      let x0 = lerp(sg.x0, tx0, ks);
      let x1 = lerp(sg.x1, tx1, ks);
      if (ks === 0) {
        if (sg.x0 > head) return;
        x1 = Math.min(x1, head);
      }
      if (x1 - x0 < 1) return;
      x0 -= ks * 0.5;
      x1 += ks * 0.5;
      paint(r, rr(x0, row.y, x1 - x0, 18, 4 * (1 - ks)), mixLerp(sg.mix, row.brick, ks));
    });
    if (kt > 0 && kt < 1) cursor = rp(head + 6, row.y - 3, 14, 24);
    else if (kt === 1 && i === ROWS - 1 && t < t0 + ROW_DT + 0.5 && (t * 3) % 1 < 0.6) cursor = rp(end + 6, row.y - 3, 14, 24);
  }
  if (settled) {
    // One fill per ink once every course has become brick
    const avg = s.rows[0].brick;
    for (let j = 0; j < 3; j++) paint(r, brickPaths[j], [j === G ? avg[0] : 0, j === O ? avg[1] : 0, j === K ? avg[2] : 0], j === 0);
    // per-brick variation in K
    const vary = new Path2D();
    for (let i = 0; i < ROWS; i++) {
      const off = i % 2 ? 52 : 0;
      for (let b = -1; b < 6; b++) {
        if (hash(i * 13 + b) > 0.6) {
          const x = Math.max(540, 540 + off + b * 104);
          vary.rect(x, s.rows[i].y, Math.min(104, 1060 - x), 18);
        }
      }
    }
    fillD(r, r.layers[K], vary, 0.22);
  }
  // Brick joints
  const joints = new Path2D();
  for (let i = 0; i < ROWS; i++) {
    const sn1 = SNAP_T0 + i * 0.05 + 0.5;
    const kj = seg(t, sn1, sn1 + 0.35);
    if (kj <= 0) continue;
    const off = i % 2 ? 52 : 0;
    const w = 4 * kj;
    for (let b = 1; b < 6; b++) {
      const x = 540 + off + b * 104 - 52 * (i % 2 ? 1 : 0);
      if (x > 545 && x < 1055) joints.rect(x - w / 2, s.rows[i].y, w, 18);
    }
  }
  for (const c of r.layers) knock(c, joints);
  if (cursor) paint(r, cursor, KEYWORD);
}

function storefront(r: Riso, t: number, s: State, dawn: number) {
  const kw = tween(t, 9.3, 10.1, ease.inOutCubic);
  if (kw <= 0) return;
  const [g, o, k] = r.layers;
  const xw = lerp(540, 1060, kw);
  push(r, (c) => c.clip(rp(540, 450, xw - 540, 312)));

  paint(r, rp(540, 450, 520, 312), [1, 0, 0.08]);
  fillD(r, k, rp(540, 450, 520, 10), 0.5);

  // Window
  const glass = rp(576, 476, 290, 212);
  paint(r, glass, [0.12, 0, lerp(0.62, 0.42, dawn)]);
  r.gradient(o, glass, { kind: 'radial', cx: 720, cy: 560, r0: 0, r1: 240, from: 0.55, to: 0.12 }, 8);
  push(r, (c) => c.clip(glass));
  const dark: Mix = [0.3, 0, 1];
  for (const gd of s.goods) {
    if (gd.kind === 0) {
      const loaf = new Path2D();
      loaf.ellipse(gd.x + gd.w / 2, gd.y, gd.w / 2, gd.h, 0, Math.PI, TAU);
      paint(r, loaf, [0, 1, 0.22]);
      knock(o, rp(gd.x + gd.w * 0.3, gd.y - gd.h * 0.7, gd.w * 0.4, 2), 0.7);
    } else if (gd.kind === 1) {
      paint(r, rr(gd.x, gd.y - gd.h, gd.w, gd.h, 3), [0.7, 0, 0.1]);
      paint(r, rp(gd.x + 2, gd.y - gd.h - 5, gd.w - 4, 5), dark);
    } else {
      paint(r, rr(gd.x, gd.y - gd.h, gd.w, gd.h, gd.w / 2), [0, 0.45, 0]);
    }
  }
  paint(r, rp(584, 540, 274, 6), dark);
  paint(r, rp(584, 600, 274, 6), dark);
  // Counter
  paint(r, rp(576, 642, 290, 46), [0.35, 0.15, 0.85]);
  knock(k, rp(576, 642, 290, 2), 0.8);
  // Tablet POS
  const tap = seg(t, 13.95, 14.05);
  paint(r, poly([634, 642, 646, 642, 642, 628, 638, 628]), dark);
  paint(r, rr(612, 596, 58, 36, 5), dark);
  const scr = rr(617, 601, 48, 26, 2);
  paint(r, scr, tap > 0 ? [1, 0, 0] : [0.45, 0, 0]);
  if (tap > 0) {
    const tick = new Path2D();
    tick.moveTo(630, 614);
    tick.lineTo(638, 621);
    tick.lineTo(652, 606);
    for (const c of r.layers) {
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.strokeStyle = '#000';
      c.lineWidth = 4;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke(tick);
      c.restore();
    }
  }
  // Customer inside, at the counter
  const kin = tween(t, 13.35, 13.85, ease.outCubic);
  if (kin > 0) {
    const bx = lerp(900, 728, kin);
    const reach = tween(t, 13.75, 13.95, ease.inOutSine) * (1 - tween(t, 14.25, 14.5));
    const dip = Math.sin(seg(t, 13.9, 14.05) * Math.PI) * 6;
    const body = new Path2D();
    body.moveTo(bx - 34, 700);
    body.lineTo(bx - 32, 628);
    body.quadraticCurveTo(bx - 30, 610, bx, 608);
    body.quadraticCurveTo(bx + 30, 610, bx + 32, 628);
    body.lineTo(bx + 34, 700);
    body.closePath();
    const coat: Mix = [0, 0.7, 0.7];
    const arm = new Path2D();
    arm.moveTo(bx - 22, 622);
    const hx = lerp(bx - 30, 664, reach);
    const hy = lerp(668, 616 + dip, reach);
    arm.quadraticCurveTo(lerp(bx - 34, bx - 50, reach), 650, hx, hy);
    paint(r, body, coat);
    paint(r, circ(bx + 2, 586, 19), [0.2, 0, 0.95]);
    paint(r, rp(bx - 6, 600, 14, 10), [0.2, 0, 0.95]);
    strokeMix(r, arm, coat, 13);
  }
  // Reflections on the glass
  for (const c of [k, o]) {
    knock(c, poly([606, 688, 694, 476, 730, 476, 642, 688]), 0.32);
    knock(c, poly([660, 688, 748, 476, 760, 476, 672, 688]), 0.32);
  }
  pop(r);
  fillD(r, k, rp(576, 476, 290, 4), 0.6);

  // Sill and kick plates
  paint(r, rp(566, 688, 310, 12), [1, 0, 0.45]);
  for (const x of [584, 726]) {
    const p = rr(x, 708, 132, 40, 3);
    fillD(r, k, p, 0.32);
    knock(k, rp(x + 4, 744, 128, 2), 0.8);
  }

  // Door
  const kd = tween(t, 12.7, 13.1, ease.inOutCubic) * (1 - tween(t, 13.65, 14.05, ease.inOutCubic));
  const doorway = rp(894, 478, 132, 284);
  paint(r, doorway, [0.1, 0.38, 0.8]);
  fillD(r, o, rp(894, 700, 132, 62), 0.3);
  const wf = 1 - 0.74 * kd;
  push(r, (c) => {
    c.translate(894, 0);
    c.scale(wf, 1);
    c.translate(-894, 0);
  });
  paint(r, rp(894, 478, 132, 284), [1, 0, 0.12 + 0.4 * kd]);
  fillD(r, k, rp(1012, 478, 14, 284), 0.4);
  const dglass = rr(908, 494, 104, 142, 4);
  paint(r, dglass, [0.1, 0.3, lerp(0.6, 0.45, dawn)]);
  knock(k, poly([920, 636, 970, 494, 984, 494, 934, 636]), 0.3);
  fillD(r, k, rr(908, 652, 104, 92, 3), 0.32);
  paint(r, circ(1004, 664, 6), [0, 1, 0]);
  // OPEN sign hanging in the door
  const on = t > 11.4 && !(t > 11.47 && t < 11.55) && !(t > 11.61 && t < 11.66);
  const string = new Path2D();
  string.moveTo(930, 552);
  string.lineTo(960, 520);
  string.lineTo(990, 552);
  k.save();
  k.lineWidth = 2;
  k.strokeStyle = '#000';
  k.stroke(string);
  k.restore();
  if (on) {
    const glow = circ(960, 566, 70);
    push(r, (c) => c.clip(dglass));
    r.gradient(o, glow, { kind: 'radial', cx: 960, cy: 566, r0: 10, r1: 70, from: 0.8, to: 0 }, 7);
    pop(r);
  }
  const board = rr(918, 548, 84, 38, 4);
  paint(r, board, [0.1, 0, 0.95]);
  textMix(r, "OPEN", 960, 576, `900 25px ${DISPLAY}`, on ? [0, 1, 0] : [0, 0, 0.55], 'center', 1);
  pop(r);
  // Door frame
  paint(r, rp(886, 470, 8, 292), [1, 0, 0.5]);
  paint(r, rp(1026, 470, 8, 292), [1, 0, 0.5]);
  paint(r, rp(886, 466, 148, 10), [1, 0, 0.5]);

  pop(r);
  // Leading edge of the wipe is the cursor again
  if (kw < 1) paint(r, rp(xw - 7, 446, 14, 318), STRING);
}

function signAndAwning(r: Riso, t: number, dawn: number) {
  const k = r.layers[K];
  // Cornice
  const kc = tween(t, 9.9, 10.5, ease.outCubic);
  if (kc > 0) {
    const hc = 312 * kc;
    paint(r, rp(800 - hc, 220, hc * 2, 16), [0.3, 0, 1]);
    paint(r, rp(800 - hc + 10, 212, hc * 2 - 20, 8), [0.3, 0, 1]);
  }
  // Sign band opens between a pair of angle brackets
  const kb = tween(t, 10.0, 10.75, ease.inOutCubic);
  if (kb > 0) {
    const hb = lerp(26, 274, kb);
    const band = rp(800 - hb, 240, hb * 2, 60);
    paint(r, band, [1, 0, 0.1]);
    fillD(r, k, rp(800 - hb, 292, hb * 2, 8), 0.45);
    push(r, (c) => c.clip(band));
    textMix(r, 'BAKERY', 800, 287, `900 42px ${DISPLAY}`, [0, 0, 0], 'center', 9);
    pop(r);
    const f = `900 50px ${MONO}`;
    textMix(r, '<', 800 - hb + 4, 288, f, STRING, 'left');
    textMix(r, '>', 800 + hb - 4, 288, f, STRING, 'right');
  }
  // Awning unrolls
  const ka = tween(t, 10.45, 11.25, ease.outBack);
  if (t > 10.46) {
    const yt = 340;
    const yb = yt + 82 * ka;
    const n = 12;
    const lt = 548;
    const rt = 1052;
    const lb = lerp(548, 518, clamp(ka));
    const rbx = lerp(1052, 1082, clamp(ka));
    const shadow = rp(550, yb + 18, 500, 34 * clamp(ka));
    fillD(r, k, shadow, 0.35);
    const stripes: [Path2D, Path2D] = [new Path2D(), new Path2D()];
    for (let j = 0; j < n; j++) {
      const a0 = lerp(lt, rt, j / n);
      const a1 = lerp(lt, rt, (j + 1) / n);
      const b0 = lerp(lb, rbx, j / n);
      const b1 = lerp(lb, rbx, (j + 1) / n);
      const p = stripes[j % 2];
      p.moveTo(a0, yt);
      p.lineTo(a1, yt);
      p.lineTo(b1, yb);
      p.lineTo(b0, yb);
      p.closePath();
      const rad = (b1 - b0) / 2;
      p.moveTo(b1, yb);
      p.ellipse((b0 + b1) / 2, yb, rad, rad * 0.8 * clamp(ka), 0, 0, Math.PI);
    }
    paint(r, stripes[0], [0, 1, 0.04]);
    paint(r, stripes[1], [0.1, 0.12, 0]);
    r.gradient(k, poly([lt, yt, rt, yt, rbx, yb + 30, lb, yb + 30]), { kind: 'linear', x0: 0, y0: yt, x1: 0, y1: yb, from: 0.45, to: 0 }, 6);
    paint(r, rr(536, yt - 8, 528, 12, 4), [0.3, 0, 1]);
  }
  void dawn;
}

/** A walking figure in profile, origin at the feet */
function walker(r: Riso, x: number, feet: number, sc: number, phase: number) {
  push(r, (c) => {
    c.translate(x, feet);
    c.scale(sc, sc);
  });
  const sw = Math.sin(phase) * 0.42;
  const dark: Mix = [0.2, 0, 1];
  const coat: Mix = [0, 1, 0.2];
  const legs = new Path2D();
  legs.moveTo(0, -104);
  legs.lineTo(Math.sin(sw) * 104, -104 + Math.cos(sw) * 104);
  legs.moveTo(0, -104);
  legs.lineTo(-Math.sin(sw) * 104, -104 + Math.cos(sw) * 104);
  strokeMix(r, legs, dark, 17);
  const back = new Path2D();
  back.moveTo(-2, -180);
  back.lineTo(-Math.sin(sw) * 54, -124);
  strokeMix(r, back, [0, 0.8, 0.6], 13);
  const body = new Path2D();
  body.moveTo(-20, -192);
  body.quadraticCurveTo(0, -200, 20, -190);
  body.lineTo(28, -96);
  body.lineTo(-28, -96);
  body.closePath();
  paint(r, body, coat);
  // Tote bag
  const hx = Math.sin(sw) * 54;
  const bag = rr(hx - 6, -132, 34, 40, 4);
  const front = new Path2D();
  front.moveTo(2, -180);
  front.lineTo(hx, -122);
  paint(r, bag, [0.85, 0, 0.1]);
  strokeMix(r, front, coat, 13);
  // Head, facing right, with a beanie
  paint(r, circ(2, -214, 19), dark);
  paint(r, poly([18, -214, 24, -206, 18, -204]), dark);
  const hat = new Path2D();
  hat.arc(2, -218, 20, Math.PI, TAU);
  hat.closePath();
  paint(r, hat, [1, 0, 0.15]);
  paint(r, circ(2, -240, 6), [1, 0, 0.15]);
  pop(r);
}

function customer(r: Riso, t: number) {
  if (t < 11.4 || t > 13.6) return;
  const walk = tween(t, 11.45, 12.95, ease.inOutSine);
  const ke = tween(t, 12.95, 13.5, ease.inOutSine);
  const x = lerp(-70, 958, walk) + ke * 6;
  const phase = (x / 1028) * 26 * Math.PI * (1 - ke * 0.3);
  if (ke > 0) {
    push(r, (c) => c.clip(rp(894, 478, 132, 284 + 140 * (1 - ke))));
  }
  walker(r, x, lerp(822, 764, ke), lerp(1, 0.84, ke), phase);
  if (ke > 0) {
    // Swallowed by the warm dark of the doorway
    const fade = smooth(seg(ke, 0.25, 1));
    const door = rp(929, 478, 97, 284);
    const L = r.layers;
    const m: Mix = [0.1, 0.38, 0.8];
    for (let i = 0; i < 3; i++) {
      knock(L[i], door, fade);
      L[i].save();
      L[i].globalAlpha = fade;
      fillD(r, L[i], door, m[i]);
      L[i].restore();
    }
    pop(r);
  }
}

function rings(r: Riso, t: number) {
  const o = r.layers[O];
  for (let j = 0; j < 3; j++) {
    const age = (t - 13.98 - j * 0.14) / 0.7;
    if (age <= 0 || age >= 1) continue;
    const p = circ(641, 614, 20 + age * 120);
    o.save();
    o.lineWidth = 8 * (1 - age);
    o.strokeStyle = '#000';
    o.stroke(p);
    o.restore();
  }
}

function endStrip(r: Riso, t: number) {
  const k = tween(t, 15.4, 15.95, ease.outCubic);
  if (k <= 0) return;
  const y = lerp(905, 772, k);
  paint(r, rp(-20, y, 1640, 160), [0.12, 0, 0.94]);
  const msg = 'hello, world';
  const n = Math.floor(seg(t, 16.05, 16.95) * (msg.length + 0.999));
  const font = `700 66px ${MONO}`;
  textMix(r, '>', 70, y + 86, font, KEYWORD);
  const shown = msg.slice(0, n);
  textMix(r, shown, 130, y + 86, font, IDENT);
  const c = r.layers[G];
  c.save();
  c.font = font;
  const w = c.measureText(shown).width;
  c.restore();
  const typing = t < 16.95;
  if (typing || t > 18.1 || (t - 16.95) % 1.05 < 0.6) paint(r, rp(138 + w, y + 30, 36, 68), KEYWORD);
}

function drawShop(r: Riso, t: number, s: State) {
  const dawn = tween(t, 11.0, 13.2, ease.inOutSine);
  sky(r, t, dawn);
  // Stars over the night street
  const sv = seg(t, 4.9, 5.9) * (1 - seg(dawn, 0, 0.6));
  if (sv > 0) {
    const st = new Path2D();
    for (const p of s.stars) {
      const rad = p.r * sv * (0.65 + 0.35 * Math.sin(t * 2.6 + p.ph));
      st.moveTo(p.x + rad, p.y);
      st.arc(p.x, p.y, rad, 0, TAU);
    }
    knock(r.layers[K], st);
  }
  drawTerminal(r, t, s);
  neighbors(r, t, dawn);
  ground(r, t, dawn);
  const b = cursorBars(r, t);
  if (b.split > 0.02) {
    const page = rp(b.lx + 40, 236, b.rx - b.lx - 40, GROUND - 236);
    for (const c of r.layers) knock(c, page);
    fillD(r, r.layers[G], page, 0.06);
  }
  codeRows(r, t, s);
  storefront(r, t, s, dawn);
  drawBars(r, t);
  signAndAwning(r, t, dawn);
  customer(r, t);
  rings(r, t);
  endStrip(r, t);
}

export const helloWorldFilm: RisoFilm<State> = {
  id: 'hello-world',
  title: 'Hello, World',
  caption: 'A blinking cursor at 2 a.m. becomes the shop down the street.',
  theme: 'Craft',
  motif: 'The blinking cursor',
  duration: 19,
  paper: '#f3ead8',
  inks: [
    { color: '#00a95c', offset: [1.4, -1], angle: 15 },
    { color: '#ff6c2f', offset: [-1.2, 0.9], angle: 75 },
    { color: '#2b2b30', offset: [0, 0], angle: 45 },
  ],
  scenes: [
    { at: 0, label: 'Late night, empty line' },
    { at: 3.7, label: 'The cursor becomes a street' },
    { at: 8.7, label: 'Code into brick' },
    { at: 11.2, label: 'Open' },
    { at: 14.4, label: 'hello, world' },
  ],
  posterTime: 12.4,

  setup() {
    const rng = mulberry(2016);
    const term: State['term'] = [];
    let ind = 0;
    for (let i = 0; i < 6; i++) {
      term.push({ y: 96 + i * 58, segs: makeSegs(rng, 200 + ind * 56, 1400, 1 + Math.floor(rng() * 3), 18) });
      ind = clamp(ind + (rng() < 0.5 ? 1 : -1), 0, 3);
    }
    const rows: Row[] = [];
    ind = 0;
    for (let i = 0; i < ROWS; i++) {
      const segs = makeSegs(rng, 560 + ind * 34, 1040, 1 + Math.floor(rng() * 3), 14).map((sg): Seg => (sg.mix === IDENT ? { ...sg, mix: [0, 0, 0.72] } : sg));
      const j = rng() * 0.14 - 0.07;
      rows.push({ y: 740 - i * 24, segs, brick: [0.1, 0.82 + j, 0.34] });
      ind = clamp(ind + Math.floor(rng() * 3) - 1, 0, 4);
    }
    const stars: Star[] = [];
    for (let i = 0; i < 46; i++) stars.push({ x: rng() * 1600, y: rng() * 400, r: 2 + rng() * rng() * 4, ph: rng() * TAU });
    const goods: State['goods'] = [];
    for (const shelf of [540, 600]) {
      let x = 592;
      while (x < 840) {
        const kind = Math.floor(rng() * 3);
        const w = kind === 0 ? 34 + rng() * 14 : kind === 1 ? 16 + rng() * 6 : 18;
        const h = kind === 0 ? 14 + rng() * 6 : kind === 1 ? 22 + rng() * 10 : 18;
        if (x + w > 852) break;
        goods.push({ x, y: shelf, w, h, kind });
        x += w + 6 + rng() * 10;
      }
    }
    return { term, rows, stars, goods };
  },

  draw(r, t, s) {
    const zIn = tween(t, 3.4, 5.4, ease.inOutCubic);
    const zOut = tween(t, 14.4, 16.1, ease.inOutCubic);
    const pushIn = 0.06 * seg(t, 0, 3.6) * (1 - zIn);
    const zf = zIn * (1 - zOut);
    const zoom = Math.exp(lerp(Math.log(1 + pushIn), Math.log(ZMAX), zf));
    const p0 = seg(t, 0, 3.6);
    const cx = lerp(lerp(800, 760, p0 * (1 - zOut)), SX + SW / 2, zf);
    const cy = lerp(lerp(450, 432, p0 * (1 - zOut)), SY + SH / 2, zf);
    r.camera(cx, cy, zoom);

    const deskVisible = zoom < ZMAX - 0.01;
    if (deskVisible) drawDesk(r, t);

    const screen = rp(SX, SY, SW, SH);
    push(r, (c) => {
      knock(c, screen);
      c.clip(screen);
      c.translate(SX, SY);
      c.scale(SS, SS);
    });
    drawShop(r, t, s);
    pop(r);
    if (deskVisible) {
      // Faint screen glare
      knock(r.layers[K], poly([SX + 380, SY, SX + 470, SY, SX + 330, SY + SH, SX + 240, SY + SH]), 0.08 * (1 - zf));
    }
  },
};
