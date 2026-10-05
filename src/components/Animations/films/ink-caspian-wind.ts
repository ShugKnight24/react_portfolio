import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import { TAU, clamp, ease, hash, lerp, mulberry, noise1, seg, tween, type Pt } from '../riso/kit';
import {
  SUMI,
  applyCam,
  bake,
  blotPts,
  drawPlate,
  ink,
  inscription,
  keys,
  linePts,
  makeSeal,
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
  verm,
  type Brush,
  type Cam,
  type Plate,
} from '../styles/inkwash';

/*
 * City of Winds: a triptych of hanging scrolls, painted in sumi side by side.
 * The Caspian, the old walled city with its round stone tower, and the snowy Caucasus are
 * brushed in at once, each alive with its own weather (waves, a flag, laundry and smoke,
 * drifting cloud). Motif: one red pomegranate blossom. The wind plucks it from a branch
 * over the sea and carries it across the gaps between the scrolls (the only thing that
 * crosses them); when it turns back home the borders dissolve, the three paintings flood
 * into one landscape, and the blossom settles on its branch.
 */

const DURATION = 18.5;
const PX = [80, 580, 1080];
const PW = 440;
const MT = 60;
const MB = 840;
const IN_X = 22;
const IN_T = 56;
const IN_B = 64;
const HZ = 385;
const T_PLUCK = 5.7;
const T_MERGE = 12.5;
const T_MERGED = 15.0;
const T_LAND = 15.9;
const TX = 720;
const TT = 290;
const TB = 672;
const TR = 58;
const MX = 948;
const ATTACH: Pt = [318, 244];

const pane = (i: number) => ({ x0: PX[i] + IN_X, x1: PX[i] + PW - IN_X, y0: MT + IN_T, y1: MB - IN_B });

/* ---------- geography ---------- */

const curveFn = (ctrl: Pt[]) => {
  const pts = spline(ctrl, 12);
  return (x: number) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const a = pts[i - 1];
        const b = pts[i];
        return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0] || 1));
      }
    }
    return pts[pts.length - 1][1];
  };
};

const peak = (x: number, c: number, h: number, w: number) => h * Math.pow(Math.max(0, 1 - Math.abs(x - c) / w), 1.3);

const yFar = (x: number) => {
  const h = Math.max(
    peak(x, 1185, 220, 160), peak(x, 1335, 248, 175), peak(x, 1480, 205, 145), peak(x, 1010, 118, 175), peak(x, 860, 52, 170), peak(x, 1650, 165, 170),
    peak(x, 1262, 168, 70), peak(x, 1408, 158, 60), peak(x, 1105, 150, 70), peak(x, 1565, 150, 75), peak(x, 1225, 196, 40)
  );
  const k = Math.min(1, h / 40);
  return HZ - h + 13 * noise1(x / 42, 3) * k + 5 * noise1(x / 13, 4) * k + 1.5 * noise1(x / 4, 5) * k;
};

const yMid = (x: number) => {
  const h = Math.max(peak(x, 1250, 160, 200), peak(x, 1420, 140, 170), peak(x, 1085, 92, 180), peak(x, 1610, 118, 190), peak(x, 920, 40, 200), peak(x, 1330, 118, 60), peak(x, 1170, 112, 60), peak(x, 1520, 100, 70));
  return 540 - h + 11 * noise1(x / 40, 7) + 4 * noise1(x / 11, 8) + 1.2 * noise1(x / 4, 9);
};

const WALL_H = 56;
const wallTop = (x: number) => lerp(668, 612, clamp((x - 590) / 535)) + 1.5 * noise1(x / 60, 8);
const shore = curveFn([[400, 960], [470, 860], [530, 772], [572, 738], [590, 728]]);
const rightHill = curveFn([[1125, 672], [1200, 652], [1300, 630], [1390, 612], [1470, 626], [1560, 606], [1700, 600], [1860, 610]]);
const yLand = (x: number) => (x < 590 ? shore(x) : x <= 1125 ? wallTop(x) + WALL_H + 2 : rightHill(x));

/* ---------- small drawing helpers ---------- */

interface Mark {
  pts: Pt[];
  o: Brush;
  col: string;
  t0: number;
  t1: number;
  pl: Plate;
}

/** A brush stroke that paints itself on between t0 and t1, then is drawn from its bake */
const mark = (r: Riso, pts: Pt[], o: Brush, col: string, t0: number, t1: number): Mark => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const m = o.w + 6;
  const oo: Brush = { step: 2, ...o };
  const pl = bake(r, x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m, 1.4, (g) => stroke(g, pts, { ...oo, p: 1 }, col));
  return { pts, o: oo, col, t0, t1, pl };
};

const drawMark = (c: Ctx, m: Mark, t: number) => {
  if (t >= m.t1) drawPlate(c, m.pl);
  else if (t > m.t0) stroke(c, m.pts, { ...m.o, p: ease.inOutSine(seg(t, m.t0, m.t1)) }, m.col);
};

/** Wavy front sweeping up (dir 1) or down (dir -1) through a rect */
const sweepV = (x0: number, y0: number, x1: number, y1: number, k: number, seed = 1, dir = 1): Path2D => {
  const p = new Path2D();
  const Y = dir > 0 ? lerp(y1 + 80, y0 - 80, clamp(k)) : lerp(y0 - 80, y1 + 80, clamp(k));
  const pts: Pt[] = [];
  for (let x = x0 - 40; x <= x1 + 40; x += 20) pts.push([x, Y + 26 * Math.sin(x / 41 + seed) + 14 * Math.sin(x / 15 + seed * 2)]);
  const far = dir > 0 ? y1 + 200 : y0 - 200;
  p.moveTo(x0 - 40, far);
  for (const q of pts) p.lineTo(q[0], q[1]);
  p.lineTo(x1 + 40, far);
  p.closePath();
  return p;
};

type Dir = 'L' | 'R' | 'U' | 'D';
const reveal = (c: Ctx, pl: Plate, k: number, dir: Dir, seed = 1) => {
  if (k <= 0) return;
  if (k >= 1) {
    drawPlate(c, pl);
    return;
  }
  c.save();
  const x1 = pl.x + pl.w;
  const y1 = pl.y + pl.h;
  c.clip(dir === 'L' || dir === 'R' ? sweepPath(pl.x, pl.y, x1, y1, k, seed, dir === 'L' ? 1 : -1) : sweepV(pl.x, pl.y, x1, y1, k, seed, dir === 'U' ? 1 : -1));
  drawPlate(c, pl);
  c.restore();
};

const mistPlate = (r: Riso, w: number, h: number, seed: number, a: number): Plate =>
  bake(r, 0, 0, w, h, 0.5, (g) => {
    g.filter = `blur(${Math.round(h * 0.16 * r.scale * 0.5)}px)`;
    for (let i = 0; i < 22; i++) {
      const x = hash(seed + i) * w;
      const y = h * (0.5 + (hash(seed * 3 + i) - 0.5) * 0.35);
      g.fillStyle = paperA(a * (0.55 + 0.45 * hash(i * 7 + seed)));
      g.beginPath();
      g.ellipse(x, y, 90 + hash(i * 5 + seed) * 180, h * (0.14 + 0.12 * hash(i + seed * 9)), 0, 0, TAU);
      g.fill();
    }
  });

/* ---------- the city ---------- */

interface House {
  x: number;
  w: number;
  base: number;
  h: number;
  row: number;
  tone: number;
  seed: number;
}

const makeHouses = (): House[] => {
  const rng = mulberry(11);
  const out: House[] = [];
  for (let row = 5; row >= 0; row--) {
    const half = 265 - row * 38;
    const cx = 850;
    let x = Math.max(600, cx - half) + rng() * 10;
    const x1 = Math.min(1112, cx + half + 60);
    while (x < x1) {
      const w = 30 + rng() * 34;
      const base = wallTop(x + w / 2) + 6 - row * 33 - rng() * 7;
      // keep the tower's face clear of the higher rows; the minaret too
      const nearTower = x + w > TX - TR - 10 && x < TX + TR + 40 && row >= 2;
      const nearMin = x + w > MX - 16 && x < MX + 14 && row >= 3;
      if (!nearTower && !nearMin && rng() > 0.08) out.push({ x, w, base, h: 22 + rng() * 22 + (row === 0 ? 8 : 0), row, tone: 0.04 + rng() * 0.09, seed: Math.floor(rng() * 1000) });
      x += w + 2 + rng() * 6;
    }
  }
  return out;
};

const drawHouse = (g: Ctx, h: House) => {
  const top = h.base - h.h;
  const sd = 6 + (h.seed % 5);
  const rise = 5;
  // flat roof plane seen from above, the side wall in shade, the lit face
  g.fillStyle = SUMI.paper;
  g.beginPath();
  g.moveTo(h.x, h.base);
  g.lineTo(h.x, top);
  g.lineTo(h.x + sd, top - rise);
  g.lineTo(h.x + h.w + sd, top - rise);
  g.lineTo(h.x + h.w + sd, h.base - rise);
  g.lineTo(h.x + h.w, h.base);
  g.closePath();
  g.fill();
  g.fillStyle = ink(h.tone);
  g.fillRect(h.x, top, h.w, h.h);
  g.fillStyle = ink(0.24 + h.tone);
  g.beginPath();
  g.moveTo(h.x + h.w, top);
  g.lineTo(h.x + h.w + sd, top - rise);
  g.lineTo(h.x + h.w + sd, h.base - rise);
  g.lineTo(h.x + h.w, h.base);
  g.closePath();
  g.fill();
  g.fillStyle = ink(0.07);
  g.beginPath();
  g.moveTo(h.x, top);
  g.lineTo(h.x + sd, top - rise);
  g.lineTo(h.x + h.w + sd, top - rise);
  g.lineTo(h.x + h.w, top);
  g.closePath();
  g.fill();
  const lines = new Path2D();
  strokePath([[h.x - 1, top], [h.x + h.w + 1, top + 0.5]], { w: 2.6, outT: 0.2, inT: 0.1, seed: h.seed, step: 1.5, rough: 0.1 }, lines);
  strokePath([[h.x, top + 1], [h.x + 0.5, h.base]], { w: 1.3, outT: 0.5, seed: h.seed + 1, step: 1.5 }, lines);
  strokePath([[h.x + h.w + sd, top - rise], [h.x + h.w + sd, h.base - rise]], { w: 1.1, outT: 0.6, seed: h.seed + 2, step: 1.5 }, lines);
  g.fillStyle = ink(0.68);
  g.fill(lines);
  // arched windows and doors
  const win = new Path2D();
  const n = 1 + (h.seed % 3);
  for (let i = 0; i < n; i++) {
    const wx = h.x + ((i + 0.5) / n) * h.w;
    const door = i === 0 && h.seed % 4 === 0 && h.row <= 1;
    const ww = door ? 4.2 : 2.6;
    const wy = door ? h.base - 13 : top + h.h * 0.32;
    const wh = door ? 13 : 7;
    win.moveTo(wx - ww, wy + wh);
    win.lineTo(wx - ww, wy);
    win.arc(wx, wy, ww, Math.PI, 0);
    win.lineTo(wx + ww, wy + wh);
    win.closePath();
  }
  g.fillStyle = ink(0.72);
  g.fill(win);
};

const drawTower = (g: Ctx) => {
  const body = new Path2D();
  body.moveTo(TX - TR, TB);
  body.lineTo(TX - TR + 4, TT);
  body.lineTo(TX + TR - 4, TT);
  body.lineTo(TX + TR, TB);
  body.closePath();
  // the buttress spine on the right
  const butt = new Path2D();
  butt.moveTo(TX + TR - 8, TB);
  butt.lineTo(TX + TR + 38, TB);
  butt.lineTo(TX + TR + 14, TT + 42);
  butt.lineTo(TX + TR - 6, TT + 34);
  butt.closePath();
  g.fillStyle = SUMI.paper;
  g.fill(butt);
  g.fill(body);
  g.save();
  g.clip(butt);
  const gb = g.createLinearGradient(TX + TR - 8, 0, TX + TR + 38, 0);
  gb.addColorStop(0, ink(0.16));
  gb.addColorStop(0.55, ink(0.22));
  gb.addColorStop(0.6, ink(0.46));
  gb.addColorStop(1, ink(0.55));
  g.fillStyle = gb;
  g.fillRect(TX, TT, 120, TB - TT);
  g.restore();
  g.save();
  g.clip(body);
  const gr = g.createLinearGradient(TX - TR, 0, TX + TR, 0);
  gr.addColorStop(0, ink(0.2));
  gr.addColorStop(0.24, ink(0.04));
  gr.addColorStop(0.5, ink(0.1));
  gr.addColorStop(0.82, ink(0.34));
  gr.addColorStop(1, ink(0.5));
  g.fillStyle = gr;
  g.fillRect(TX - TR - 4, TT, TR * 2 + 8, TB - TT);
  // stone courses curve with the eye line
  const courses = new Path2D();
  for (let y = TT + 34, i = 0; y < TB; y += 21, i++) {
    const ry = (y - HZ) * 0.04;
    const pts: Pt[] = [];
    for (let k = 0; k <= 16; k++) {
      const u = -1 + (k / 16) * 2;
      pts.push([TX + u * TR, y + ry * Math.sqrt(1 - u * u)]);
    }
    strokePath(pts, { w: 1.7, dry: 0.85, outT: 0.5, inT: 0.2, seed: 40 + i, step: 2, jitter: 0.3 }, courses);
    // a few joints
    for (let j = 0; j < 4; j++) {
      const u = -0.85 + hash(i * 9 + j) * 1.7;
      const jx = TX + u * TR;
      const jy = y + ry * Math.sqrt(1 - u * u);
      strokePath([[jx, jy + 1], [jx, jy + 19]], { w: 1.1, outT: 0.5, seed: i * 5 + j, step: 2 }, courses);
    }
  }
  g.fillStyle = ink(0.22);
  g.fill(courses);
  g.restore();
  // crown band and its shadow
  const crown = new Path2D();
  crown.moveTo(TX - TR, TT + 20);
  crown.lineTo(TX - TR, TT - 2);
  crown.ellipse(TX, TT - 2, TR, 7, 0, Math.PI, 0, false);
  crown.lineTo(TX + TR, TT + 20);
  crown.ellipse(TX, TT + 20, TR, 8, 0, 0, Math.PI, false);
  crown.closePath();
  g.fillStyle = SUMI.paper;
  g.fill(crown);
  const gc = g.createLinearGradient(TX - TR, 0, TX + TR, 0);
  gc.addColorStop(0, ink(0.24));
  gc.addColorStop(0.3, ink(0.08));
  gc.addColorStop(1, ink(0.56));
  g.fillStyle = gc;
  g.fill(crown);
  g.fillStyle = ink(0.07);
  g.beginPath();
  g.ellipse(TX, TT - 2, TR - 1, 6, 0, 0, TAU);
  g.fill();
  const sh = new Path2D();
  const under: Pt[] = [];
  for (let k = 0; k <= 16; k++) {
    const u = -1 + (k / 16) * 2;
    under.push([TX + u * (TR - 3), TT + 22 + 7 * Math.sqrt(1 - u * u)]);
  }
  strokePath(under, { w: 5, dry: 0.4, outT: 0.3, seed: 77, step: 2 }, sh);
  g.fillStyle = ink(0.55);
  g.fill(sh);
  // slit windows
  const win = new Path2D();
  for (const [wx, wy] of [[TX - 18, 392], [TX + 12, 486], [TX - 30, 566], [TX + 4, 330]] as Pt[]) {
    win.moveTo(wx - 3, wy + 16);
    win.lineTo(wx - 3, wy);
    win.arc(wx, wy, 3, Math.PI, 0);
    win.lineTo(wx + 3, wy + 16);
    win.closePath();
  }
  g.fillStyle = ink(0.78);
  g.fill(win);
};

const drawMinaret = (g: Ctx) => {
  const base = 642;
  const shaft = new Path2D();
  shaft.moveTo(MX - 12, base);
  shaft.lineTo(MX - 10, 420);
  shaft.lineTo(MX + 10, 420);
  shaft.lineTo(MX + 12, base);
  shaft.closePath();
  shaft.moveTo(MX - 8.5, 418);
  shaft.lineTo(MX - 8, 374);
  shaft.lineTo(MX + 8, 374);
  shaft.lineTo(MX + 8.5, 418);
  shaft.closePath();
  g.fillStyle = SUMI.paper;
  g.fill(shaft);
  const gr = g.createLinearGradient(MX - 12, 0, MX + 12, 0);
  gr.addColorStop(0, ink(0.14));
  gr.addColorStop(0.3, ink(0.04));
  gr.addColorStop(1, ink(0.5));
  g.fillStyle = gr;
  g.fill(shaft);
  // balcony and cap
  g.fillStyle = ink(0.6);
  g.beginPath();
  g.ellipse(MX, 421, 18, 4.5, 0, 0, TAU);
  g.fill();
  g.fillStyle = ink(0.35);
  g.fillRect(MX - 15, 410, 30, 9);
  g.fillStyle = ink(0.7);
  g.beginPath();
  g.moveTo(MX - 10, 375);
  g.quadraticCurveTo(MX - 9, 352, MX, 338);
  g.quadraticCurveTo(MX + 9, 352, MX + 10, 375);
  g.closePath();
  g.fill();
  stroke(g, [[MX, 340], [MX, 322]], { w: 1.6, outT: 0.5, seed: 3, step: 1 }, ink(0.8));
  g.fillStyle = ink(0.7);
  g.beginPath();
  g.arc(MX, 330, 2.2, 0, TAU);
  g.fill();
};

const drawWall = (g: Ctx) => {
  const x0 = 590;
  const x1 = 1125;
  const body = new Path2D();
  body.moveTo(x0, wallTop(x0) + WALL_H);
  for (let x = x0; x <= x1; x += 6) body.lineTo(x, wallTop(x) + WALL_H + 2 * noise1(x / 40, 5));
  for (let x = x1; x >= x0; x -= 6) body.lineTo(x, wallTop(x));
  body.closePath();
  g.fillStyle = SUMI.paper;
  g.fill(body);
  g.fillStyle = ink(0.13);
  g.fill(body);
  // courses of stone
  const lines = new Path2D();
  for (let k = 1; k < 5; k++) {
    for (let x = x0 + 10 + k * 13; x < x1 - 30; x += 70 + hash(k * 31 + x) * 60) {
      const len = 40 + hash(x * 3 + k) * 60;
      const f = (k / 5) * WALL_H;
      strokePath([[x, wallTop(x) + f], [x + len, wallTop(x + len) + f]], { w: 1.5, dry: 0.8, outT: 0.5, inT: 0.3, seed: x + k, step: 2 }, lines);
    }
  }
  g.fillStyle = ink(0.16);
  g.fill(lines);
  // merlons along the top
  const mer = new Path2D();
  for (let x = x0 + 4; x < x1 - 6; x += 17) {
    const y = wallTop(x + 5);
    mer.rect(x, y - 9, 10, 10);
  }
  g.fillStyle = SUMI.paper;
  g.fill(mer);
  g.fillStyle = ink(0.2);
  g.fill(mer);
  // the gate
  const gx = 878;
  const gy = wallTop(gx) + WALL_H;
  const gate = new Path2D();
  gate.moveTo(gx - 13, gy);
  gate.lineTo(gx - 13, gy - 24);
  gate.arc(gx, gy - 24, 13, Math.PI, 0);
  gate.lineTo(gx + 13, gy);
  gate.closePath();
  g.fillStyle = ink(0.8);
  g.fill(gate);
  // round bastions at either end
  for (const bx of [x0 + 4, x1 - 6]) {
    const top = wallTop(bx) - 22;
    const bot = wallTop(bx) + WALL_H + 4;
    const b = new Path2D();
    b.moveTo(bx - 24, bot);
    b.lineTo(bx - 23, top);
    b.lineTo(bx + 23, top);
    b.lineTo(bx + 24, bot);
    b.closePath();
    g.fillStyle = SUMI.paper;
    g.fill(b);
    const gb = g.createLinearGradient(bx - 24, 0, bx + 24, 0);
    gb.addColorStop(0, ink(0.18));
    gb.addColorStop(0.3, ink(0.06));
    gb.addColorStop(1, ink(0.46));
    g.fillStyle = gb;
    g.fill(b);
    const m = new Path2D();
    for (let k = -2; k <= 2; k++) m.rect(bx + k * 9.5 - 3.5, top - 8, 7, 9);
    g.fillStyle = ink(0.3);
    g.fill(m);
  }
};

/* ---------- the blossom ---------- */

/** A pomegranate flower: a fleshy urn-shaped calyx with crumpled petals spilling out of it.
 * Local space: the stem end at (0, 16), the petals up toward -y. */
const drawBlossom = (c: Ctx, x: number, y: number, sc: number, rot: number, sq: number, open: number) => {
  if (sc <= 0.01) return;
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(sc * sq, sc);
  // petals behind the calyx
  const o = clamp(open);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42 * (0.4 + 0.6 * o);
    const d = 4 + 11 * o;
    const R = 3.5 + 8 * o;
    const px = Math.cos(a) * d;
    const py = -8 + Math.sin(a) * d;
    const halo = blotPts(px, py, R * 1.22 + 0.8, 50 + i, 0.4, 18, 0.9);
    c.fillStyle = verm(0.2);
    c.beginPath();
    c.moveTo(halo[0][0], halo[0][1]);
    for (const q of halo) c.lineTo(q[0], q[1]);
    c.closePath();
    c.fill();
    const pts = blotPts(px, py, R, 30 + i, 0.32, 22, 0.85);
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts) p.lineTo(q[0], q[1]);
    p.closePath();
    c.fillStyle = i % 2 ? SUMI.verm : SUMI.vermSoft;
    c.fill(p);
    c.strokeStyle = 'rgba(156,42,23,0.55)';
    c.lineWidth = 0.7;
    c.stroke(p);
  }
  // crinkles
  if (o > 0.3) {
    c.strokeStyle = 'rgba(156,42,23,0.6)';
    c.lineWidth = 0.6;
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.5;
      c.moveTo(Math.cos(a) * 4, -8 + Math.sin(a) * 4);
      c.lineTo(Math.cos(a + 0.15) * 11 * o, -8 + Math.sin(a + 0.15) * 11 * o);
    }
    c.stroke();
  }
  // the calyx: an urn with pointed sepals
  const cal = new Path2D();
  cal.moveTo(-2, 16);
  cal.bezierCurveTo(-8, 12, -9.5, 3, -6, -3);
  cal.lineTo(-10, -9);
  cal.lineTo(-5, -6);
  cal.lineTo(-4, -11);
  cal.lineTo(-1.5, -6.5);
  cal.lineTo(1.5, -11.5);
  cal.lineTo(2.5, -6.5);
  cal.lineTo(5.5, -10.5);
  cal.lineTo(5.5, -5.5);
  cal.lineTo(10, -8.5);
  cal.lineTo(6, -3);
  cal.bezierCurveTo(9.5, 3, 8, 12, 2, 16);
  cal.closePath();
  c.fillStyle = SUMI.vermDeep;
  c.fill(cal);
  c.fillStyle = 'rgba(236,180,150,0.35)';
  c.beginPath();
  c.ellipse(-3.4, 4, 1.6, 6, 0.15, 0, TAU);
  c.fill();
  c.fillStyle = ink(0.75);
  c.beginPath();
  c.ellipse(0, 16, 2.2, 1.5, 0, 0, TAU);
  c.fill();
  c.restore();
};

/** blossom flight keys: [t, x, y] */
const FLIGHT: [number, number, number][] = [
  [T_PLUCK - 0.6, ATTACH[0] - 4, ATTACH[1] - 6],
  [T_PLUCK, ATTACH[0], ATTACH[1]],
  [6.3, 392, 318],
  [6.9, 452, 446],
  [7.6, 560, 412],
  [8.25, 652, 296],
  [8.75, 724, 214],
  [9.2, 812, 236],
  [9.6, 818, 318],
  [9.95, 760, 344],
  [10.3, 788, 286],
  [10.85, 910, 262],
  [11.4, 1050, 248],
  [11.9, 1205, 232],
  [12.4, 1332, 112],
  [12.85, 1420, 96],
  [13.6, 1170, 84],
  [14.4, 790, 132],
  [15.2, 470, 196],
  [T_LAND, ATTACH[0], ATTACH[1]],
  [T_LAND + 0.6, ATTACH[0] + 4, ATTACH[1] - 4],
];

const flightPos = (t: number): Pt => {
  const F = FLIGHT;
  let i = 1;
  while (i < F.length - 1 && t > F[i][0]) i++;
  const k = clamp((t - F[i - 1][0]) / (F[i][0] - F[i - 1][0]));
  const g = (j: number) => F[Math.max(0, Math.min(F.length - 1, j))];
  const p0 = g(i - 2);
  const p1 = g(i - 1);
  const p2 = g(i);
  const p3 = g(i + 1);
  const t2 = k * k;
  const t3 = t2 * k;
  const cr = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * k + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
  return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
};

const flightRot = (t: number) => {
  const u = t - T_PLUCK;
  return 0.5 + 2.1 * u + 0.6 * Math.sin(1.7 * u);
};

/** Where the blossom is, its turn, squash (tumble) and how open it is */
const blossomAt = (t: number) => {
  const sway = (0.05 + 0.18 * seg(t, 4.6, T_PLUCK)) * Math.sin(t * 4.2) + 0.12 * seg(t, 5.2, T_PLUCK);
  if (t < T_PLUCK) {
    return { x: ATTACH[0], y: ATTACH[1], rot: 0.5 + sway, sq: 1, open: lerp(0.15, 1, tween(t, 4.1, 5.1, ease.outCubic)), sc: 1.55 * tween(t, 3.6, 4.0, ease.outBack) };
  }
  const [x, y] = t < T_LAND + 0.6 ? flightPos(t) : [ATTACH[0] + 4, ATTACH[1] - 4];
  const land = tween(t, 14.9, T_LAND, ease.inOutSine);
  const fr = flightRot(Math.min(t, T_LAND));
  const target = 0.5 + TAU * Math.round((flightRot(T_LAND) - 0.5) / TAU);
  const settle = t > T_LAND ? 0.06 * Math.sin((t - T_LAND) * 2.4) * Math.exp(-(t - T_LAND) * 0.6) + 0.03 * Math.sin(t * 1.3) : 0;
  const rot = lerp(fr, target, land) + settle;
  const sq = lerp(0.55 + 0.45 * Math.abs(Math.cos(1.25 * (t - T_PLUCK))), 1, land);
  // when it has landed it hangs back at its stem
  const hx = t > T_LAND ? ATTACH[0] : x;
  const hy = t > T_LAND ? ATTACH[1] : y;
  return { x: lerp(x, hx, land), y: lerp(y, hy, land), rot, sq, open: 1, sc: 1.55 };
};

/* ---------- wind ---------- */

interface Gust {
  t0: number;
  dur: number;
  pts: Pt[];
  w: number;
  a: number;
  seed: number;
}

interface GustDef {
  t0: number;
  dur: number;
  w: number;
  a: number;
  seed: number;
  ctrl: Pt[];
}

const GUSTS: GustDef[] = [
  { t0: 1.9, dur: 1.5, w: 5, a: 0.22, seed: 1, ctrl: [[140, 200], [250, 186], [380, 200], [480, 230]] },
  { t0: 2.6, dur: 1.6, w: 5, a: 0.2, seed: 2, ctrl: [[1120, 470], [1250, 440], [1380, 448], [1480, 420]] },
  { t0: 3.4, dur: 1.5, w: 4, a: 0.2, seed: 3, ctrl: [[620, 200], [700, 180], [820, 190], [960, 170]] },
  { t0: 5.0, dur: 1.2, w: 7, a: 0.32, seed: 4, ctrl: [[60, 196], [180, 206], [290, 232], [400, 290], [460, 360]] },
  { t0: 5.6, dur: 1.4, w: 6, a: 0.3, seed: 5, ctrl: [[160, 300], [300, 340], [430, 420], [540, 430], [640, 370]] },
  { t0: 7.0, dur: 1.5, w: 7, a: 0.32, seed: 6, ctrl: [[420, 470], [540, 410], [640, 300], [740, 220], [840, 210]] },
  { t0: 8.4, dur: 1.6, w: 6, a: 0.3, seed: 7, ctrl: [[640, 190], [760, 180], [850, 240], [830, 340], [740, 350], [720, 300]] },
  { t0: 9.9, dur: 1.5, w: 7, a: 0.3, seed: 8, ctrl: [[760, 300], [900, 268], [1060, 240], [1220, 236]] },
  { t0: 10.9, dur: 1.6, w: 7, a: 0.3, seed: 9, ctrl: [[1060, 300], [1200, 250], [1320, 150], [1440, 100], [1520, 120]] },
  { t0: 12.4, dur: 2.0, w: 15, a: 0.4, seed: 10, ctrl: [[1660, 130], [1300, 74], [900, 110], [520, 170], [120, 210], [-80, 230]] },
  { t0: 12.8, dur: 2.0, w: 10, a: 0.34, seed: 11, ctrl: [[1680, 330], [1200, 270], [760, 300], [300, 330], [-80, 340]] },
  { t0: 13.4, dur: 1.8, w: 8, a: 0.26, seed: 12, ctrl: [[1680, 520], [1200, 480], [800, 500], [300, 470], [-80, 480]] },
  { t0: 15.6, dur: 2.4, w: 4, a: 0.16, seed: 13, ctrl: [[1500, 300], [1250, 280], [1000, 300], [760, 280]] },
];

/** How hard the wind blows right now (drives flags, laundry, smoke, trees) */
const windAt = (t: number) => 0.55 + 0.25 * Math.sin(t * 1.3) + 0.5 * seg(t, 4.8, 6.0) * (1 - seg(t, 15.5, 17.5)) + 0.4 * Math.exp(-(((t - 13) / 0.9) ** 2));

/* ---------- state ---------- */

interface State {
  marks: Mark[];
  sea: Plate;
  far: Plate;
  mid: Plate;
  land: Plate;
  backH: Plate;
  frontH: Plate;
  tower: Plate;
  minaret: Plate;
  wall: Plate;
  mounts: Plate[];
  mists: Plate[];
  seal: HTMLCanvasElement;
  gusts: Gust[];
  leaves: { pts: Pt[]; t0: number; a: number; seed: number }[];
  poplars: { x: number; y: number; h: number; t0: number; seed: number }[];
  smoke: Pt[];
  laundry: [Pt, Pt];
}

const carveWind = (g: Ctx, s: number) => {
  const w = s * 0.095;
  for (let k = 0; k < 3; k++) {
    const y = (k - 1) * s * 0.24;
    const x0 = -s * 0.34 + k * s * 0.04;
    const pts = spline([[x0, y], [x0 + s * 0.2, y - s * 0.05], [x0 + s * 0.42, y + s * 0.04], [s * 0.3, y - s * 0.02], [s * 0.3, y - s * 0.12], [s * 0.2, y - s * 0.1]], 6);
    g.fill(strokePath(pts, { w, inT: 0.05, outT: 0.2, startW: 0.9, minW: 0.6, jitter: 0.05, rough: 0.04, seed: k + 1, step: 1 }));
  }
};

const build = (r: Riso): State => {
  const blur = (px: number) => Math.max(0.5, px * r.scale);
  const marks: Mark[] = [];
  const M = (pts: Pt[], o: Brush, col: string, t0: number, t1: number) => marks.push(mark(r, pts, o, col, t0, t1));

  /* the sea */
  const sea = bake(r, -200, HZ - 4, 1300, 620, 1.0, (g) => {
    const gr = g.createLinearGradient(0, HZ, 0, 1000);
    gr.addColorStop(0, ink(0.1));
    gr.addColorStop(0.08, ink(0.04));
    gr.addColorStop(0.5, ink(0.12));
    gr.addColorStop(1, ink(0.26));
    g.fillStyle = gr;
    g.fillRect(-200, HZ, 1300, 620);
    const streaks = new Path2D();
    for (let i = 0; i < 46; i++) {
      const u = hash(i * 3.7);
      const y = HZ + 6 + Math.pow(u, 1.6) * 480;
      const x = -180 + hash(i * 5.1) * 760;
      const len = 60 + hash(i * 2.3) * 220;
      strokePath(linePts([x, y], [x + len, y + 1], 8, 1, i), { w: 1.5 + u * 4, dry: 0.9, outT: 0.5, inT: 0.3, seed: i, step: 3 }, streaks);
    }
    g.fillStyle = ink(0.1);
    g.fill(streaks);
    g.globalCompositeOperation = 'destination-in';
    const fe = g.createLinearGradient(900, 0, 1080, 0);
    fe.addColorStop(0, 'rgba(0,0,0,1)');
    fe.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fe;
    g.fillRect(-200, HZ - 4, 1300, 620);
    g.globalCompositeOperation = 'source-over';
  });

  /* far snowy Caucasus */
  const far = bake(r, 600, 100, 1300, 420, 1.1, (g) => {
    mountain(g, yFar, 620, 1880, { alpha: 0.34, fade: 230, seed: 13, cun: 3.5, dots: 0, blur: blur(1.6), cunAlpha: 0.32 });
    // the snow: leave the upper slopes paper-white, with dark couloirs running into it
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.filter = `blur(${blur(2.2)}px)`;
    g.fillStyle = '#000';
    const snow = new Path2D();
    snow.moveTo(620, yFar(620));
    for (let x = 620; x <= 1880; x += 4) snow.lineTo(x, yFar(x) - 2);
    for (let x = 1880; x >= 620; x -= 4) {
      const h = HZ - yFar(x);
      const d = clamp(h * 0.42, 0, 110) * (0.7 + 0.3 * noise1(x / 26, 21)) * (0.8 + 0.2 * Math.abs(Math.sin(x / 11)));
      snow.lineTo(x, yFar(x) + d);
    }
    snow.closePath();
    g.fill(snow);
    g.restore();
    // pale shade on the snow of the right-facing slopes
    g.save();
    g.filter = `blur(${blur(5)}px)`;
    for (let x = 624; x < 1876; x += 4) {
      const sl = (yFar(x + 6) - yFar(x - 6)) / 12;
      if (sl <= 0.1) continue;
      const h = HZ - yFar(x);
      g.fillStyle = ink(clamp(sl * 0.1, 0, 0.1));
      g.fillRect(x, yFar(x) + 2, 4.5, clamp(h * 0.5, 0, 120));
    }
    g.restore();
    // couloirs
    const cou = new Path2D();
    for (let i = 0; i < 40; i++) {
      const x = 700 + hash(i * 7.7) * 1150;
      const h = HZ - yFar(x);
      if (h < 60) continue;
      const y0 = yFar(x) + 6 + hash(i * 3.1) * h * 0.2;
      const len = h * (0.12 + hash(i) * 0.2);
      const sl = clamp((yFar(x + 6) - yFar(x - 6)) / 12, -1.2, 1.2);
      strokePath([[x, y0], [x + sl * len * 0.35, y0 + len * 0.5], [x + sl * len * 0.75, y0 + len]], { w: 2 + hash(i * 9) * 2.5, dry: 0.8, outT: 0.6, seed: i, step: 2 }, cou);
    }
    g.fillStyle = ink(0.3);
    g.fill(cou);
    g.globalCompositeOperation = 'destination-in';
    const fe = g.createLinearGradient(640, 0, 800, 0);
    fe.addColorStop(0, 'rgba(0,0,0,0)');
    fe.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fe;
    g.fillRect(600, 100, 1300, 420);
    g.globalCompositeOperation = 'source-over';
  });

  /* middle range */
  const mid = bake(r, 820, 340, 1060, 420, 1.1, (g) => {
    mountain(g, yMid, 840, 1880, { alpha: 0.42, fade: 200, seed: 23, cun: 3.5, dots: 3, blur: blur(1.4), cunAlpha: 0.4 });
    g.globalCompositeOperation = 'destination-in';
    const fe = g.createLinearGradient(840, 0, 980, 0);
    fe.addColorStop(0, 'rgba(0,0,0,0)');
    fe.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fe;
    g.fillRect(820, 340, 1060, 420);
    g.globalCompositeOperation = 'source-over';
  });

  /* land under the city and the near hill */
  const land = bake(r, 380, 560, 1500, 460, 1.1, (g) => {
    const top: Pt[] = [];
    for (let x = 400; x <= 1860; x += 5) top.push([x, yLand(x)]);
    const p = new Path2D();
    p.moveTo(400, 1020);
    for (const q of top) p.lineTo(q[0], q[1]);
    p.lineTo(1860, 1020);
    p.closePath();
    g.fillStyle = SUMI.paper;
    g.fill(p);
    const gr = g.createLinearGradient(0, 600, 0, 1000);
    gr.addColorStop(0, ink(0.06));
    gr.addColorStop(1, ink(0.2));
    g.fillStyle = gr;
    g.fill(p);
    mountain(g, (x) => yLand(x) + 1, 470, 1860, { alpha: 0.24, fade: 140, seed: 31, cun: 3, dots: 4, blur: blur(1), cunAlpha: 0.34 });
    // the dark bank in the foreground
    const fore = (x: number) => 872 - 50 * Math.sin(((x - 480) / 1400) * Math.PI) + 10 * noise1(x / 50, 33) + 4 * noise1(x / 13, 34);
    // a road winding down from the gate, and a small orchard on the slope
    const road = new Path2D();
    const rc: Pt[] = [[880, 730], [850, 770], [930, 800], [1010, 830], [960, 880], [900, 940]];
    strokePath(spline(rc.map(([x, y]) => [x - 7, y] as Pt), 10), { w: 2.2, dry: 0.6, outT: 0.3, inT: 0.1, seed: 41, step: 2 }, road);
    strokePath(spline(rc.map(([x, y], i) => [x + 7 + i * 4, y] as Pt), 10), { w: 2.2, dry: 0.6, outT: 0.3, inT: 0.1, seed: 42, step: 2 }, road);
    g.fillStyle = ink(0.45);
    g.fill(road);
    const orch = new Path2D();
    const trunks = new Path2D();
    for (let i = 0; i < 26; i++) {
      const row = i % 3;
      const x = 1180 + (i / 26) * 420 + (hash(i * 3.7) - 0.5) * 20;
      const y = rightHill(x) + 40 + row * 34 + (hash(i * 2.9) - 0.5) * 8;
      const rr = 7 + hash(i * 1.3) * 4 - row * 0.5;
      for (let k = 0; k < 5; k++) {
        const dx = (hash(i * 11 + k) - 0.5) * rr * 1.1;
        const dy = (hash(i * 13 + k) - 0.5) * rr * 0.8;
        const q = rr * (0.45 + 0.3 * hash(i + k * 7));
        orch.moveTo(x + dx + q, y - rr + dy);
        orch.arc(x + dx, y - rr + dy, q, 0, TAU);
      }
      strokePath([[x, y + 2], [x + 0.5, y - rr * 0.6]], { w: 1.8, outT: 0.4, seed: 70 + i, step: 1.5 }, trunks);
    }
    g.fillStyle = ink(0.5);
    g.fill(orch);
    g.fillStyle = ink(0.7);
    g.fill(trunks);
    const fp = new Path2D();
    fp.moveTo(480, 1030);
    for (let x = 480; x <= 1860; x += 6) fp.lineTo(x, fore(x));
    fp.lineTo(1860, 1030);
    fp.closePath();
    g.fillStyle = ink(0.2);
    g.fill(fp);
    mountain(g, fore, 480, 1860, { alpha: 0.5, fade: 90, seed: 35, cun: 5, dots: 5, blur: blur(1), cunAlpha: 0.5 });
    const fl = new Path2D();
    strokePath(ridgeLine(fore, 480, 1860, 6), { w: 6, dry: 0.7, outT: 0.3, inT: 0.05, seed: 36, step: 2.5, press: (u) => 0.7 + 0.5 * Math.abs(Math.sin(u * 17)) }, fl);
    // grass on the bank, leaning with the wind
    for (let i = 0; i < 90; i++) {
      const x = 500 + hash(i * 3.3) * 1340;
      const y = fore(x) + 2;
      const h = 10 + hash(i * 5.1) * 18;
      strokePath([[x, y], [x + h * 0.35, y - h * 0.6], [x + h * 0.7, y - h]], { w: 2 + hash(i) * 1.5, outT: 0.7, inT: 0.1, seed: 300 + i, step: 2 }, fl);
    }
    g.fillStyle = ink(0.75);
    g.fill(fl);
    // rocks and grass tufts along the shore
    const sh = new Path2D();
    for (let i = 0; i < 18; i++) {
      const y = 740 + i * 14;
      const x = 590 - (590 - 400) * ((y - 728) / 232) + (hash(i) - 0.5) * 16;
      strokePath([[x - 2, y], [x + 8 + hash(i * 3) * 16, y + 2]], { w: 2 + hash(i * 7) * 3, dry: 0.7, outT: 0.5, seed: i, step: 2 }, sh);
    }
    g.fillStyle = ink(0.4);
    g.fill(sh);
  });

  /* city */
  const houses = makeHouses();
  const backH = bake(r, 590, 400, 560, 300, 1.4, (g) => houses.filter((h) => h.row >= 2).forEach((h) => drawHouse(g, h)));
  const frontH = bake(r, 590, 500, 560, 220, 1.4, (g) => houses.filter((h) => h.row < 2).forEach((h) => drawHouse(g, h)));
  const tower = bake(r, TX - TR - 10, TT - 20, TR * 2 + 60, TB - TT + 30, 1.5, (g) => drawTower(g));
  const minaret = bake(r, MX - 24, 316, 48, 340, 1.5, (g) => drawMinaret(g));
  const wall = bake(r, 560, 570, 600, 130, 1.4, (g) => drawWall(g));

  /* mounts */
  const mounts = PX.map((x0, i) =>
    bake(r, x0 - 40, MT - 30, PW + 80, MB - MT + 80, 1.0, (g) => {
      g.save();
      g.shadowColor = 'rgba(70,50,25,0.28)';
      g.shadowBlur = 16 * r.scale;
      g.shadowOffsetX = 5 * r.scale;
      g.shadowOffsetY = 9 * r.scale;
      g.fillStyle = '#d8cdb5';
      g.fillRect(x0, MT, PW, MB - MT);
      g.restore();
      // heaven and earth bands
      g.fillStyle = 'rgba(120,100,70,0.16)';
      g.fillRect(x0, MT, PW, IN_T - 16);
      g.fillRect(x0, MB - IN_B + 18, PW, IN_B - 18);
      // silk weave
      g.strokeStyle = 'rgba(80,60,35,0.05)';
      g.lineWidth = 1;
      g.beginPath();
      for (let y = MT + 2; y < MB; y += 3) {
        g.moveTo(x0, y + hash(y + i) * 0.6);
        g.lineTo(x0 + PW, y);
      }
      g.stroke();
      // hanging ribbons
      g.fillStyle = 'rgba(80,60,35,0.12)';
      g.fillRect(x0 + 130, MT, 9, IN_T - 10);
      g.fillRect(x0 + PW - 139, MT, 9, IN_T - 10);
      // painting area cut out, framed by a thin brocade line
      const b = pane(i);
      g.strokeStyle = ink(0.3);
      g.lineWidth = 1.4;
      g.strokeRect(b.x0 - 6, b.y0 - 6, b.x1 - b.x0 + 12, b.y1 - b.y0 + 12);
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = ink(0.22);
      g.lineWidth = 1;
      g.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    })
  );

  /* marks: the outlines, painted on in parallel in all three panels */
  const inkL = ink(0.62);
  M(linePts([-150, HZ], [700, HZ], 30, 1.2, 5), { w: 3.6, dry: 0.45, outT: 0.25, inT: 0.04, seed: 5, startW: 0.9 }, inkL, 1.8, 2.8);
  M(spline([[10, 146], [110, 162], [200, 188], [268, 212], [326, 236]], 10), { w: 15, dry: 0.65, outT: 0.4, inT: 0.05, seed: 6, startW: 1, press: (u) => 1.1 - 0.4 * u }, ink(0.86), 2.0, 3.0);
  M(spline([[150, 172], [172, 146], [204, 124]], 8), { w: 6.5, dry: 0.5, outT: 0.5, seed: 7 }, ink(0.82), 2.7, 3.15);
  M(spline([[238, 203], [258, 232], [268, 266]], 8), { w: 5.5, dry: 0.5, outT: 0.5, seed: 8 }, ink(0.82), 2.85, 3.3);
  M(spline([[300, 226], [316, 236], [318, 244]], 6), { w: 3.5, outT: 0.5, seed: 9 }, ink(0.8), 3.2, 3.5);
  // coastline
  M(spline([[404, 950], [470, 860], [530, 772], [574, 738], [600, 728]], 10), { w: 4, dry: 0.6, outT: 0.4, seed: 10 }, ink(0.6), 3.3, 4.2);
  // wall lines
  M(ridgeLine((x) => wallTop(x) - 9, 590, 1125, 8), { w: 3.5, dry: 0.5, outT: 0.2, inT: 0.03, seed: 11, startW: 0.9 }, ink(0.72), 1.9, 3.0);
  M(ridgeLine((x) => wallTop(x) + WALL_H, 590, 1125, 8), { w: 4.5, dry: 0.6, outT: 0.25, inT: 0.03, seed: 12, startW: 0.9 }, ink(0.72), 2.1, 3.2);
  // the tower drawn in four strokes
  M(linePts([TX - TR + 4, TT - 2], [TX - TR, TB], 16, 1.5, 13), { w: 5, dry: 0.4, outT: 0.2, inT: 0.05, seed: 13, startW: 1 }, ink(0.8), 2.2, 3.0);
  M(linePts([TX + TR - 4, TT - 2], [TX + TR, TB], 16, 1.2, 14), { w: 4.5, dry: 0.4, outT: 0.2, inT: 0.05, seed: 14, startW: 1 }, ink(0.8), 2.4, 3.15);
  M(linePts([TX + TR + 14, TT + 42], [TX + TR + 38, TB], 16, 1.2, 15), { w: 4, dry: 0.5, outT: 0.25, seed: 15 }, ink(0.75), 2.7, 3.35);
  M(Array.from({ length: 25 }, (_, k) => [TX - TR + (k / 24) * TR * 2, TT - 2 - 7 * Math.sin((k / 24) * Math.PI)] as Pt), { w: 3.5, outT: 0.3, inT: 0.1, seed: 16 }, ink(0.75), 2.9, 3.4);
  M(linePts([MX - 11, 380], [MX - 13, 640], 10, 0.8, 17), { w: 2.6, outT: 0.3, seed: 17 }, ink(0.75), 3.4, 4.0);
  M(linePts([MX + 11, 380], [MX + 13, 640], 10, 0.8, 18), { w: 2.6, outT: 0.3, seed: 18 }, ink(0.75), 3.55, 4.15);
  // ridges
  M(ridgeLine(yFar, 640, 1880, 5).reverse(), { w: 4, dry: 0.55, outT: 0.3, inT: 0.02, seed: 19, step: 2.5, press: (u) => 0.7 + 0.5 * Math.abs(Math.sin(u * 13)) }, ink(0.72), 1.7, 3.1);
  M(ridgeLine(yMid, 860, 1880, 5).reverse(), { w: 5, dry: 0.6, outT: 0.3, inT: 0.02, seed: 20, step: 2.5, press: (u) => 0.7 + 0.5 * Math.abs(Math.sin(u * 11)) }, ink(0.74), 3.0, 4.1);
  M(ridgeLine(rightHill, 1125, 1860, 6).reverse(), { w: 5, dry: 0.6, outT: 0.3, inT: 0.02, seed: 21, step: 2.5 }, ink(0.7), 3.8, 4.7);

  /* leaves on the branch */
  const leaves: State['leaves'] = [];
  const leafAt: [number, number, number][] = [
    [96, 160, -2.2], [120, 166, 0.9], [150, 172, -1.6], [176, 146, -2.4], [196, 128, -0.6], [205, 124, 0.4], [210, 194, 1.2],
    [238, 204, -1.0], [255, 228, 2.4], [264, 250, 0.6], [270, 266, 1.9], [292, 222, -1.2], [306, 232, 1.4],
  ];
  leafAt.forEach(([x, y, a], i) => {
    const len = 30 + hash(i * 3.1) * 14;
    const bend = (hash(i * 7.3) - 0.5) * 0.5;
    const pts = spline([[x, y], [x + Math.cos(a) * len * 0.5 + Math.cos(a + 1.57) * 4 * bend, y + Math.sin(a) * len * 0.5 + Math.sin(a + 1.57) * 4 * bend], [x + Math.cos(a + bend) * len, y + Math.sin(a + bend) * len]], 6);
    leaves.push({ pts, t0: 3.0 + i * 0.09, a: 0.5 + hash(i * 5.7) * 0.3, seed: 60 + i });
  });

  const poplars: State['poplars'] = [1150, 1174, 1222, 1290, 1314, 1382, 1440, 1464, 1508, 1058, 1084, 1580].map((x, i) => ({
    x,
    y: yLand(x) + 2,
    h: 70 + hash(i * 4.3) * 55,
    t0: 4.1 + hash(i * 2.1) * 0.9,
    seed: 90 + i,
  }));

  // smoke from two roofs, and laundry strung on a third
  const roofOf = (x: number, row: number): Pt => {
    const h = houses.filter((q) => q.row === row && q.x < x && q.x + q.w > x)[0];
    return h ? [x, h.base - h.h - 3] : [x, wallTop(x) - row * 33 - 30];
  };
  const smoke = [roofOf(1040, 2), roofOf(905, 3)];
  const la = roofOf(840, 1);
  const lb = roofOf(890, 1);

  const gusts: Gust[] = GUSTS.map((g) => ({ t0: g.t0, dur: g.dur, w: g.w, a: g.a, seed: g.seed, pts: spline(g.ctrl, 14) }));

  return {
    marks,
    sea,
    far,
    mid,
    land,
    backH,
    frontH,
    tower,
    minaret,
    wall,
    mounts,
    mists: [mistPlate(r, 2400, 150, 41, 0.95), mistPlate(r, 2400, 130, 47, 0.9)],
    seal: makeSeal(r, 110, carveWind, 9),
    gusts,
    leaves,
    poplars,
    smoke,
    laundry: [[la[0], la[1] - 14], [lb[0], lb[1] - 14]],
  };
};

/* ---------- camera and frame ---------- */

const camAt = (t: number): Cam => {
  const ks: [number, number, number, number][] = [
    [0, 800, 250, 1.45],
    [1.0, 800, 320, 1.32],
    [2.7, 800, 450, 1.0],
    [4.7, 790, 455, 1.05],
    [5.9, 420, 330, 1.42],
    [6.9, 500, 400, 1.3],
    [8.7, 720, 330, 1.34],
    [10.1, 830, 330, 1.26],
    [11.9, 1170, 300, 1.26],
    [12.6, 1150, 320, 1.2],
    [14.3, 800, 450, 1.0],
    [16.0, 800, 450, 1.0],
    [18.5, 780, 432, 1.04],
  ];
  const x = keys(t, ks.map((k) => [k[0], k[1]] as [number, number]), ease.inOutSine);
  const y = keys(t, ks.map((k) => [k[0], k[2]] as [number, number]), ease.inOutSine);
  const z = Math.exp(keys(t, ks.map((k) => [k[0], Math.log(k[3])] as [number, number]), ease.inOutSine));
  return { x, y, z };
};

const UNROLL = [0.15, 0.0, 0.3];
const rollerY = (i: number, t: number) => lerp(MT + 14, MB, ease.inOutCubic(seg(t, UNROLL[i], UNROLL[i] + 1.25)));

const mergeE = (t: number) => 320 * ease.inOutCubic(seg(t, T_MERGE, T_MERGED));

/** The painted area: the three panes while hung, flooding out over the borders as they merge */
const maskPath = (t: number) => {
  const p = new Path2D();
  const e = mergeE(t);
  for (let i = 0; i < 3; i++) {
    const b = pane(i);
    const y1 = Math.min(b.y1, rollerY(i, t) - IN_B) + e;
    const y0 = b.y0 - e;
    const x0 = b.x0 - e;
    const x1 = b.x1 + e;
    if (y1 <= y0 + 1) continue;
    const amp = Math.min(1, e / 30) * 16;
    const wav = (s: number) => amp * (0.6 * noise1(s / 46, 50 + i) + 0.4 * noise1(s / 13, 60 + i));
    if (amp <= 0) {
      p.rect(x0, y0, x1 - x0, y1 - y0);
      continue;
    }
    p.moveTo(x0, y0);
    for (let x = x0; x <= x1; x += 12) p.lineTo(x, y0 - wav(x));
    for (let y = y0; y <= y1; y += 12) p.lineTo(x1 + wav(y + 900), y);
    for (let x = x1; x >= x0; x -= 12) p.lineTo(x, y1 + wav(x + 2000));
    for (let y = y1; y >= y0; y -= 12) p.lineTo(x0 - wav(y + 3000), y);
    p.closePath();
  }
  return p;
};

/* ---------- live painters ---------- */

const drawWaves = (c: Ctx, t: number) => {
  const N = 17;
  for (let j = 0; j < N; j++) {
    const u = j / (N - 1);
    const pr = seg(t, 2.9 + 0.11 * j, 3.6 + 0.11 * j);
    if (pr <= 0) continue;
    const y = HZ + 7 + 500 * Math.pow(u, 1.65);
    const s = 0.16 + 1.1 * u;
    const lam = 16 + 34 * s;
    const amp = 1.2 + 3.4 * s;
    const ph = t * (1.4 + 0.6 * s) + j * 1.3;
    const drift = t * (4 + 14 * s);
    const p = new Path2D();
    const hooks = new Path2D();
    let x = -160 + ((drift + hash(j * 3.3) * 200) % 200);
    let i = 0;
    const xEnd = y < 600 ? 1000 : 640 - (y - 600) * 0.6;
    while (x < xEnd) {
      const len = (50 + 150 * hash(j * 17 + i)) * (0.5 + s);
      const gap = (14 + 40 * hash(j * 5 + i * 3)) * (0.4 + s);
      const yy = y + (hash(j * 7 + i) - 0.5) * 8 * s;
      const pts: Pt[] = [];
      for (let q = 0; q <= len; q += 6) pts.push([x + q, yy + amp * Math.sin((x + q) / lam - ph)]);
      if (pts.length > 2) {
        strokePath(pts, { w: 0.9 + 2.4 * s, p: pr, outT: 0.4, inT: 0.25, dry: 0.55, seed: j * 31 + i, step: 3 + s * 2, startW: 0.4 }, p);
        // a crest curling over at the end of the nearer swells
        if (s > 0.55 && hash(j * 13 + i) > 0.45) {
          const [ex, ey] = pts[pts.length - 1];
          const hs = 6 * s * (0.8 + 0.3 * Math.sin(ph + i));
          strokePath([[ex - hs * 2, ey + hs * 0.2], [ex - hs * 0.8, ey - hs * 1.1], [ex + hs * 0.3, ey - hs * 1.2], [ex + hs * 0.6, ey - hs * 0.4], [ex, ey - hs * 0.2]], { w: 1.2 + 2 * s, p: pr, outT: 0.4, inT: 0.2, seed: j * 7 + i, step: 1.5 }, hooks);
        }
      }
      x += len + gap;
      i++;
    }
    c.fillStyle = ink(0.2 + 0.42 * u);
    c.fill(p);
    c.fillStyle = ink(0.35 + 0.4 * u);
    c.fill(hooks);
  }
  // three big curling waves in the foreground
  const fg = new Path2D();
  const inner = new Path2D();
  const foam = new Path2D();
  for (let k = 0; k < 3; k++) {
    const pr = tween(t, 3.8 + k * 0.3, 4.9 + k * 0.3, ease.inOutSine);
    if (pr <= 0) continue;
    const ph = t * 1.15 + k * 2.1;
    const bx = 150 + k * 140 + 10 * Math.sin(ph);
    const by = 760 - k * 16 + 4 * Math.sin(ph + 1);
    const lift = 1 + 0.12 * Math.sin(ph);
    const sc = 1.15 - k * 0.15;
    const ctrl: Pt[] = [[-110, 22], [-60, 10], [-14, -12 * lift], [20, -32 * lift], [48, -36 * lift], [62, -24 * lift], [52, -12 * lift], [40, -16 * lift]];
    const pts = spline(ctrl.map(([x, y]) => [bx + x * sc, by + y * sc] as Pt), 6);
    strokePath(pts, { w: 7 * sc, p: pr, dry: 0.5, outT: 0.3, inT: 0.08, seed: 200 + k, step: 2.5 }, fg);
    for (let m = 1; m <= 2; m++) {
      const q = spline(ctrl.slice(0, 5).map(([x, y]) => [bx + (x - m * 8) * sc, by + (y + m * 9) * sc] as Pt), 6);
      strokePath(q, { w: 2.4 * sc, p: pr, dry: 0.7, outT: 0.5, inT: 0.2, seed: 210 + k * 3 + m, step: 2.5 }, inner);
    }
    if (pr > 0.9) splatterPath(bx + 60 * sc, by - 30 * sc, -0.6, 1.4, 34 * sc, 9, 1.8 * sc, 0.8 + 0.2 * Math.sin(ph * 2), 220 + k, foam);
  }
  c.fillStyle = ink(0.82);
  c.fill(fg);
  c.fillStyle = ink(0.42);
  c.fill(inner);
  c.fillStyle = ink(0.6);
  c.fill(foam);
};

const drawBoatAndGulls = (c: Ctx, t: number) => {
  const k = seg(t, 4.4, 5.0);
  if (k <= 0) return;
  const bx = 230 + t * 2.2;
  const by = HZ + 2 + Math.sin(t * 1.4) * 0.8;
  c.save();
  c.globalAlpha = k;
  stroke(c, [[bx - 14, by - 1], [bx, by + 2.5], [bx + 14, by - 1.5]], { w: 3.2, outT: 0.3, seed: 1, step: 1.5 }, ink(0.75));
  c.fillStyle = ink(0.5);
  c.beginPath();
  c.moveTo(bx - 1, by - 2);
  c.quadraticCurveTo(bx + 7, by - 12, bx + 1, by - 26);
  c.lineTo(bx - 1, by - 2);
  c.fill();
  c.fillStyle = ink(0.32);
  c.beginPath();
  c.moveTo(bx - 3, by - 2);
  c.quadraticCurveTo(bx - 9, by - 9, bx - 2, by - 20);
  c.fill();
  c.restore();
  const gp = new Path2D();
  for (let i = 0; i < 3; i++) {
    const gk = seg(t, 4.7 + i * 0.2, 5.2 + i * 0.2);
    if (gk <= 0) continue;
    const gx = 120 + i * 60 + (t - 4.7) * (16 + i * 4);
    const gy = 300 + i * 22 + Math.sin(t * 0.9 + i * 2) * 8;
    const f = Math.sin(t * 6 + i * 2.2);
    const s = 1 - i * 0.18;
    const pts: Pt[] = [[gx - 10 * s, gy - 2 * s + 3 * f * s], [gx - 5 * s, gy - 5 * s * f], [gx, gy], [gx + 5 * s, gy - 5 * s * f], [gx + 10 * s, gy - 2 * s + 3 * f * s]];
    strokePath(pts, { w: 2.2 * s * gk, outT: 0.4, inT: 0.4, startW: 0.3, seed: 40 + i, step: 1 }, gp);
  }
  c.fillStyle = ink(0.7);
  c.fill(gp);
};

const drawBranchLive = (c: Ctx, s: State, t: number) => {
  const lp = new Path2D();
  const sway = Math.sin(t * 2.3) * 0.04 * windAt(t);
  for (const lf of s.leaves) {
    const k = tween(t, lf.t0, lf.t0 + 0.5, ease.outCubic);
    if (k <= 0) continue;
    const [ox, oy] = lf.pts[0];
    const pts = lf.pts.map(([x, y], i) => {
      const a = sway * (i / lf.pts.length) * 3 + Math.sin(t * 3.1 + lf.seed) * 0.03;
      const dx = x - ox;
      const dy = y - oy;
      return [ox + dx * Math.cos(a) - dy * Math.sin(a), oy + dx * Math.sin(a) + dy * Math.cos(a)] as Pt;
    });
    strokePath(pts, { w: 9, p: k, inT: 0.4, outT: 0.55, startW: 0.25, seed: lf.seed, step: 1.6 }, lp);
  }
  c.fillStyle = ink(0.62);
  c.fill(lp);
  // two grey buds
  const bk = tween(t, 3.4, 3.9, ease.outBack);
  if (bk > 0) {
    c.fillStyle = ink(0.48);
    for (const [bx, by, a] of [[206, 120, -0.6], [268, 270, 0.3]] as [number, number, number][]) {
      c.save();
      c.translate(bx, by);
      c.rotate(a);
      c.scale(bk, bk);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(-6, -3, -5, -12, -2, -15);
      c.lineTo(0, -18);
      c.lineTo(2, -15);
      c.bezierCurveTo(5, -12, 6, -3, 0, 0);
      c.fill();
      c.restore();
    }
  }
};

const drawCityLive = (c: Ctx, s: State, t: number) => {
  const w = windAt(t);
  // the flag on the tower
  const fk = seg(t, 4.4, 5.0);
  if (fk > 0) {
    const top = TT - 64;
    stroke(c, [[TX, TT - 6], [TX, top]], { w: 2.4, outT: 0.2, seed: 3, step: 1.5, p: fk }, ink(0.8));
    const L = 50 * fk;
    const H = 24;
    const pts: Pt[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const x = TX + u * L;
      pts.push([x, top + 2 + Math.sin(u * 5 - t * 7) * 4 * u * w + u * (1.4 - w) * 6]);
    }
    const bot: Pt[] = [];
    for (let k = 12; k >= 0; k--) {
      const u = k / 12;
      const x = TX + u * L * (0.96 + 0.04 * Math.sin(t * 9));
      bot.push([x, top + 2 + H * (1 - 0.18 * u) + Math.sin(u * 5 - t * 7 - 0.6) * 4.5 * u * w + u * (1.4 - w) * 8]);
    }
    c.fillStyle = ink(0.8);
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts) c.lineTo(q[0], q[1]);
    for (const q of bot) c.lineTo(q[0], q[1]);
    c.closePath();
    c.fill();
  }
  // laundry
  const lk = seg(t, 4.6, 5.2);
  if (lk > 0) {
    const [a, b] = s.laundry;
    c.save();
    c.globalAlpha = lk;
    stroke(c, [[a[0], a[1] + 14], [a[0], a[1]]], { w: 1.6, outT: 0.2, seed: 1, step: 1 }, ink(0.7));
    stroke(c, [[b[0], b[1] + 14], [b[0], b[1]]], { w: 1.6, outT: 0.2, seed: 2, step: 1 }, ink(0.7));
    const sag = 6 + 2 * Math.sin(t * 2);
    const at = (u: number): Pt => [lerp(a[0], b[0], u), lerp(a[1], b[1], u) + sag * 4 * u * (1 - u)];
    c.strokeStyle = ink(0.6);
    c.lineWidth = 0.9;
    c.beginPath();
    for (let k = 0; k <= 10; k++) {
      const q = at(k / 10);
      if (k) c.lineTo(q[0], q[1]);
      else c.moveTo(q[0], q[1]);
    }
    c.stroke();
    for (let k = 0; k < 4; k++) {
      const u = 0.17 + k * 0.22;
      const [x, y] = at(u);
      const ang = -(0.25 + 0.45 * w) - 0.22 * Math.sin(t * 5 + k * 1.9);
      const cw = 9 + (k % 2) * 3;
      const ch = 12 + ((k * 7) % 4);
      c.save();
      c.translate(x, y);
      c.rotate(ang);
      const flut = 1.5 * Math.sin(t * 9 + k);
      c.beginPath();
      c.moveTo(-cw / 2, 0);
      c.lineTo(cw / 2, 0);
      c.lineTo(cw / 2 + flut, ch);
      c.lineTo(-cw / 2 + flut * 0.6, ch - 1);
      c.closePath();
      c.fillStyle = k === 1 ? ink(0.45) : paperA(1);
      c.fill();
      c.strokeStyle = ink(0.55);
      c.lineWidth = 0.9;
      c.stroke();
      c.restore();
    }
    c.restore();
  }
  // smoke
  const sk = seg(t, 4.6, 5.6);
  if (sk > 0) {
    for (let j = 0; j < s.smoke.length; j++) {
      const [sx, sy] = s.smoke[j];
      const p = new Path2D();
      for (let i = 0; i < 16; i++) {
        const a = (t * 0.45 + i / 16 + j * 0.37) % 1;
        if (a > sk) continue;
        const x = sx + a * 120 * w + Math.sin(a * 6 + i + t) * 7 * a;
        const y = sy - a * 70 - Math.sin(a * 3) * 8;
        const rr = 3 + a * 15;
        p.moveTo(x + rr * 1.3, y);
        p.ellipse(x, y, rr * 1.3, rr, -0.3, 0, TAU);
        p.moveTo(x + rr * 0.8, y + rr * 0.1);
        p.ellipse(x, y + rr * 0.1, rr * 0.8, rr * 0.6, -0.3, 0, TAU);
      }
      c.fillStyle = ink(0.06);
      c.fill(p);
    }
  }
};

const drawPoplars = (c: Ctx, s: State, t: number) => {
  const w = windAt(t);
  const fol = new Path2D();
  const tr = new Path2D();
  for (const pp of s.poplars) {
    const k = tween(t, pp.t0, pp.t0 + 0.8, ease.inOutSine);
    if (k <= 0) continue;
    const bend = (Math.sin(t * 1.9 + pp.seed) * 0.4 + 0.6) * w * 7;
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      pts.push([pp.x + bend * u * u, pp.y - 12 - u * pp.h]);
    }
    strokePath(pts, { w: 14 * (pp.h / 100) + 4, p: k, inT: 0.45, outT: 0.5, startW: 0.3, seed: pp.seed, step: 2, dry: 0.25, rough: 0.14 }, fol);
    strokePath([[pp.x, pp.y + 2], [pp.x + 0.5, pp.y - 16]], { w: 2.4, p: clamp(k * 3), outT: 0.3, seed: pp.seed + 1, step: 1.5 }, tr);
  }
  c.fillStyle = ink(0.66);
  c.fill(fol);
  c.fillStyle = ink(0.75);
  c.fill(tr);
};

/** Cloud: soft paper-white puffs with a grey wash under them, drifting */
const drawCloud = (c: Ctx, cx: number, cy: number, w: number, seed: number, a: number) => {
  const n = 6;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const x = cx + (u - 0.5) * w;
      const rr = w * (0.13 + 0.12 * hash(seed + i)) * (1 - 0.5 * Math.abs(u - 0.5));
      const y = cy - rr * 0.35 * (1 - Math.abs(u - 0.5));
      if (pass === 0) {
        const g = c.createRadialGradient(x, y + rr * 0.45, 0, x, y + rr * 0.45, rr * 1.35);
        g.addColorStop(0, ink(0.12 * a));
        g.addColorStop(1, ink(0));
        c.fillStyle = g;
        c.fillRect(x - rr * 1.4, y - rr * 0.9, rr * 2.8, rr * 2.8);
      } else {
        const g = c.createRadialGradient(x - rr * 0.2, y - rr * 0.25, 0, x, y, rr);
        g.addColorStop(0, paperA(0.98 * a));
        g.addColorStop(0.7, paperA(0.9 * a));
        g.addColorStop(1, paperA(0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, rr, 0, TAU);
        c.fill();
      }
    }
  }
};

const drawClouds = (c: Ctx, t: number) => {
  const k = seg(t, 4.6, 5.6);
  if (k <= 0) return;
  const cl: [number, number, number, number, number][] = [
    [1100 + t * 11, 336, 180, 3, 0.85],
    [1390 + t * 7, 250, 170, 8, 1],
    [70 + t * 7, 262, 190, 12, 0.8],
    [880 + t * 6, 196, 150, 15, 0.8],
    [1500 + t * 9, 455, 220, 21, 0.9],
  ];
  for (const [x, y, w, seed, a] of cl) drawCloud(c, x, y, w, seed, a * k);
};

const drawGusts = (c: Ctx, s: State, t: number) => {
  for (const g of s.gusts) {
    const k = seg(t, g.t0, g.t0 + g.dur);
    if (k <= 0 || k >= 1) continue;
    const p = ease.inOutSine(clamp(k * 1.35));
    const from = clamp(ease.inSine(k) * 1.35 - 0.45);
    stroke(c, g.pts, { w: g.w, p, from, dry: 0.9, outT: 0.6, inT: 0.25, startW: 0.3, seed: g.seed, step: 3, bristles: 7 }, ink(g.a * Math.sin(k * Math.PI)));
  }
};

/* ---------- film ---------- */

export const inkCaspianWindFilm: RisoFilm<State> = {
  id: 'ink-caspian-wind',
  title: 'City of Winds',
  caption: 'Three hanging scrolls (the Caspian, the old walled city, the Caucasus) painted at once; the wind carries one pomegranate blossom across them until they flow into one land.',
  theme: 'Origins',
  category: 'Origins & travel',
  motif: 'One red pomegranate blossom: plucked, carried across the gaps, home again',
  duration: DURATION,
  series: 'Ink wash',
  mode: 'direct',
  paper: SUMI.paper,
  paperTexture: true,
  grain: 0.1,
  inks: [{ color: SUMI.ink }, { color: '#5d5853' }, { color: '#a49d92' }, { color: SUMI.verm }],
  scenes: [
    { at: 0, label: 'Three scrolls' },
    { at: 1.7, label: 'Painting' },
    { at: 5.0, label: 'The wind' },
    { at: T_MERGE, label: 'One land' },
    { at: 15.6, label: 'City of Winds' },
  ],
  posterTime: 18.2,

  setup(r) {
    return build(r);
  },

  draw(r, t, s) {
    const c = r.layers[0];
    const C = camAt(t);
    applyCam(r, C);
    const mk = 1 - seg(t, T_MERGE + 0.1, T_MERGE + 1.6);
    const mergeK = ease.inOutSine(seg(t, T_MERGE, T_MERGED));

    /* ----- the mounts, unrolling ----- */
    if (mk > 0) {
      for (let i = 0; i < 3; i++) {
        const ry = rollerY(i, t);
        c.save();
        c.globalAlpha = mk;
        c.beginPath();
        c.rect(PX[i] - 40, MT - 30, PW + 80, ry - MT + 30 + (ry >= MB - 0.5 ? 50 : 0));
        c.clip();
        drawPlate(c, s.mounts[i]);
        c.restore();
      }
    }

    /* ----- the painting, seen through the panes ----- */
    c.save();
    if (t < T_MERGED) c.clip(maskPath(t));
    const ms = s.marks;
    // far mountains, mist, middle range
    reveal(c, s.far, tween(t, 2.5, 3.9, ease.inOutSine), 'R', 2);
    drawMark(c, ms[14], t);
    const drift = t * 14 * (1 + 0.6 * mergeK);
    const mistDraw = (pl: Plate, y: number, a: number, dx: number) => {
      if (a <= 0) return;
      c.save();
      c.globalAlpha = a;
      const x = -400 - (((dx % 1200) + 1200) % 1200);
      c.drawImage(pl.cv, x, y, pl.w, pl.h);
      c.drawImage(pl.cv, x + pl.w - 2, y, pl.w, pl.h);
      c.restore();
    };
    mistDraw(s.mists[0], 330, 0.85 * seg(t, 3.6, 4.8), drift);
    reveal(c, s.mid, tween(t, 3.2, 4.5, ease.inOutSine), 'R', 3);
    drawMark(c, ms[15], t);
    mistDraw(s.mists[1], 470, 0.8 * seg(t, 4.2, 5.2), -drift * 1.3 + 500);
    // sky clouds
    drawClouds(c, t);
    // the sea
    reveal(c, s.sea, tween(t, 2.4, 3.8, ease.inOutSine), 'L', 1);
    drawMark(c, ms[0], t);
    drawWaves(c, t);
    drawBoatAndGulls(c, t);
    // land, city
    reveal(c, s.land, tween(t, 3.4, 4.6, ease.inOutSine), 'U', 4);
    drawMark(c, ms[5], t);
    drawMark(c, ms[16], t);
    reveal(c, s.backH, tween(t, 3.1, 4.5, ease.inOutSine), 'U', 5);
    reveal(c, s.minaret, tween(t, 3.7, 4.4, ease.inOutSine), 'U', 6);
    drawMark(c, ms[12], t);
    drawMark(c, ms[13], t);
    reveal(c, s.tower, tween(t, 2.9, 3.9, ease.inOutSine), 'U', 7);
    for (let i = 8; i <= 11; i++) drawMark(c, ms[i], t);
    reveal(c, s.frontH, tween(t, 3.5, 4.6, ease.inOutSine), 'U', 8);
    reveal(c, s.wall, tween(t, 2.9, 4.0, ease.inOutSine), 'L', 9);
    drawMark(c, ms[6], t);
    drawMark(c, ms[7], t);
    drawCityLive(c, s, t);
    drawPoplars(c, s, t);
    // the branch over the sea
    for (let i = 1; i <= 4; i++) drawMark(c, ms[i], t);
    drawBranchLive(c, s, t);
    c.restore();

    /* ----- the wet front of the flood, while it still has a border to cross ----- */
    const e = mergeE(t);
    if (e > 0.5 && e < 60) {
      c.strokeStyle = ink(0.16 * (1 - seg(e, 25, 58)));
      c.lineWidth = 2.5;
      c.stroke(maskPath(t));
    }

    /* ----- rollers and cords ----- */
    if (mk > 0) {
      c.save();
      c.globalAlpha = mk;
      const lift = (1 - mk) * 36;
      for (let i = 0; i < 3; i++) {
        const x0 = PX[i];
        const ty = MT - lift;
        c.strokeStyle = ink(0.55);
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(x0 + 70, ty);
        c.lineTo(x0 + PW / 2, ty - 42);
        c.lineTo(x0 + PW - 70, ty);
        c.stroke();
        c.fillStyle = ink(0.8);
        c.beginPath();
        c.arc(x0 + PW / 2, ty - 43, 3, 0, TAU);
        c.fill();
        c.fillStyle = ink(0.72);
        c.fillRect(x0 - 4, ty - 5, PW + 8, 10);
        const ry = rollerY(i, t) + lift;
        const rr = lerp(15, 8, seg(ry, MT + 14, MB));
        c.fillStyle = ink(0.78);
        c.fillRect(x0 - 6, ry - rr, PW + 12, rr * 2);
        c.fillStyle = paperA(0.25);
        c.fillRect(x0 - 6, ry - rr * 0.55, PW + 12, rr * 0.3);
        c.fillStyle = ink(0.88);
        for (const ex of [x0 - 14, x0 + PW + 14]) {
          c.beginPath();
          c.ellipse(ex, ry, 9, rr + 3, 0, 0, TAU);
          c.fill();
        }
      }
      c.restore();
    }

    /* ----- wind and the blossom, in front of everything ----- */
    drawGusts(c, s, t);
    const b = blossomAt(t);
    if (t > T_PLUCK - 0.05 && t < T_PLUCK + 0.6) {
      const k = seg(t, T_PLUCK - 0.05, T_PLUCK + 0.6);
      c.fillStyle = verm(0.7 * (1 - k));
      c.fill(splatterPath(ATTACH[0] + 6, ATTACH[1] + 10, 0.6, 1.1, 50, 6, 1.6, k, 31));
    }
    drawBlossom(c, b.x, b.y, b.sc, b.rot, b.sq, b.open);

    /* ----- title and seal ----- */
    const tk = seg(t, 15.7, 16.7);
    const tw = inscription(c, 'City of Winds', 852, 132, 46, Math.max(tk, 0.0001), 3, 500) ?? 300;
    stampSeal(c, s.seal, 852 + tw + 42, 116, 54, seg(t, 16.5, 17.1), -0.05);
    paperAge(c, 1);
  },
};
