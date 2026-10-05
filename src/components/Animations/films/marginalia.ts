import type { RisoFilm, Riso } from '../riso/engine';
import type { Pt } from '../riso/kit';
import { mulberry, TAU, clamp, lerp, seg, tween, ease, hash, morphPair, morph, polyPath, smoothPath, bez, DISPLAY, spacedText } from '../riso/kit';

/*
 * Marginalia: a page lifts off an open book under a reading lamp, folds into a paper bird and
 * flies out of the window, over a city of book spines lit by a moon that hangs like a lamp, then
 * dives into a sea of text where it unfolds into the paper crest of a great wave. The wave
 * settles flat into the lines of the book's last page, a bird is doodled in the margin, and the
 * book closes.
 *
 * Coordinate spaces: the room (scenes 1, 2, 5) and the city/sea (scenes 3, 4). The window maps the
 * whole city frame into the room, and the right page maps the sea frame into the room, so the
 * camera can zoom through one into the other without a cut.
 */

const Y = 0;
const T = 1;
const B = 2;
const ALL = [Y, T, B];

type Row = { y: number; words: [number, number][] };
type Fill = { ink: number; d: number; path: Path2D };
type M6 = [number, number, number, number, number, number];

interface CityArt {
  knock: Path2D;
  fills: Fill[];
  winKnock: Path2D;
  winY: Path2D;
  bandKnock: Path2D;
  antenna: Path2D;
  tips: Path2D;
}

interface RoomArt {
  wall: Path2D;
  desk: Path2D;
  grain: Path2D;
  winInner: Path2D;
  frame: Path2D;
  sill: Path2D;
  rod: Path2D;
  curtains: Path2D;
  folds: Path2D;
  lampBase: Path2D;
  lampArm: Path2D;
  joints: Path2D;
  shade: Path2D;
  mouth: Path2D;
  cone: Path2D;
  stack: Fill[];
  stackKnock: Path2D;
  stackPages: Path2D;
  stackLines: Path2D;
  pencil: Fill[];
  pencilKnock: Path2D;
  boardL: Path2D;
  boardR: Path2D;
  pageL: Path2D;
  pageR: Path2D;
  edgesL: Path2D;
  edgesR: Path2D;
  marg: Path2D;
  shadow: Path2D;
}

interface State {
  seaRows: Row[];
  rowsL: Row[];
  rowsR: Row[];
  rowsLift: Row[];
  city: CityArt;
  room: RoomArt;
  stars: [number, number, number, number][];
  motes: [number, number, number, number][];
  spray: [number, number, number, number, number][];
}

/* ---------- small helpers ---------- */

const knock = (r: Riso, path: Path2D, inks: number[] = ALL, alpha = 1) => {
  for (const i of inks) {
    const c = r.layers[i];
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = alpha;
    c.fillStyle = '#000';
    c.fill(path);
    c.restore();
  }
};

const knockStroke = (r: Riso, path: Path2D, width: number, inks: number[] = ALL, dash: number[] = []) => {
  for (const i of inks) {
    const c = r.layers[i];
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = '#000';
    c.lineWidth = width;
    c.lineCap = 'round';
    c.setLineDash(dash);
    c.stroke(path);
    c.restore();
  }
};

const fillInk = (r: Riso, ink: number, path: Path2D, d = 1, rule: CanvasFillRule = 'nonzero') => {
  const c = r.layers[ink];
  c.fillStyle = r.tone(c, d);
  c.fill(path, rule);
};

const strokeInk = (r: Riso, ink: number, path: Path2D, width: number, d = 1, dash: number[] = [], cap: CanvasLineCap = 'round') => {
  const c = r.layers[ink];
  c.save();
  c.lineWidth = width;
  c.lineCap = cap;
  c.lineJoin = 'round';
  c.setLineDash(dash);
  c.strokeStyle = r.tone(c, d);
  c.stroke(path);
  c.restore();
};

const paint = (r: Riso, fills: Fill[]) => {
  for (const f of fills) fillInk(r, f.ink, f.path, f.d);
};

const withXf = (r: Riso, clip: Path2D | null, m: M6 | null, fn: () => void) => {
  const ls = r.layers;
  for (const c of ls) {
    c.save();
    if (clip) c.clip(clip);
    if (m) c.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  }
  fn();
  for (const c of ls) c.restore();
};

const xfPts = (pts: Pt[], x: number, y: number, s: number, rot: number): Pt[] => {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  return pts.map(([px, py]) => [x + (px * c - py * sn) * s, y + (px * sn + py * c) * s]);
};

const catmull = (pts: Pt[], closed: boolean, n: number): Pt[] => {
  const out: Pt[] = [];
  const N = pts.length;
  const get = (i: number) => (closed ? pts[(i + N) % N] : pts[Math.max(0, Math.min(N - 1, i))]);
  const last = closed ? N : N - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const u2 = u * u;
      const u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[N - 1]);
  return out;
};

const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/* ---------- text rows (sea of text / printed lines) ---------- */

/** Rows live in "sea" space: y = 708 + 77j. Seen through a page they shrink 7x into print. */
const genRows = (seed: number, j0: number, j1: number): Row[] => {
  const rng = mulberry(seed);
  const rows: Row[] = [];
  for (let j = j0; j <= j1; j++) {
    const words: [number, number][] = [];
    let x = -780 + rng() * 60;
    const brk = rng() < 0.24 ? 300 + rng() * 1000 : 1e9;
    let broke = false;
    while (x < 2400) {
      const len = 40 + rng() * 150 + (rng() < 0.12 ? 90 : 0);
      words.push([x, x + len]);
      x += len + 30 + rng() * 10;
      if (!broke && x > brk) {
        broke = true;
        x += 280 + rng() * 420;
      }
    }
    rows.push({ y: 708 + 77 * j, words });
  }
  return rows;
};

const waveY = (x: number, y: number, t: number) =>
  Math.sin(x * 0.0055 + t * 1.25 + y * 0.013) + 0.45 * Math.sin(x * 0.016 - t * 0.85 + y * 0.031);

const addRows = (
  pT: Path2D,
  rows: Row[],
  xa: number,
  xb: number,
  ya: number,
  yb: number,
  amp: number,
  t: number,
  pY?: Path2D,
  refl?: (x: number, y: number) => boolean
) => {
  for (const row of rows) {
    if (row.y < ya || row.y > yb) continue;
    for (const [a, b] of row.words) {
      const a2 = Math.max(a, xa);
      const b2 = Math.min(b, xb);
      if (b2 - a2 < 4) continue;
      const p = pY && refl && refl((a2 + b2) / 2, row.y) ? pY : pT;
      if (amp === 0) {
        p.moveTo(a2, row.y);
        p.lineTo(b2, row.y);
        continue;
      }
      for (let k = 0; k <= 3; k++) {
        const x = lerp(a2, b2, k / 3);
        const y = row.y + amp * waveY(x, row.y, t);
        if (k === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
    }
  }
};

/* ---------- the paper bird ---------- */

const BIRD_UNION: Pt[] = [
  [1.2, -0.45],
  [1.12, -0.38],
  [0.4, 0.12],
  [0, 0.3],
  [-0.55, 0.15],
  [-1.15, -0.5],
  [-0.35, -0.05],
  [-0.05, -1.0],
  [0.35, 0],
  [1.05, -0.5],
];
const BIRD_BODY: Pt[] = [
  [1.2, -0.45],
  [1.12, -0.38],
  [0.4, 0.12],
  [0, 0.3],
  [-0.55, 0.15],
  [-1.15, -0.5],
  [-0.35, -0.05],
  [0.35, 0],
  [1.05, -0.5],
];
const BELLY: Pt[] = [
  [0.4, 0.12],
  [0, 0.3],
  [-0.55, 0.15],
  [0, 0.1],
];

const birdGeo = (w: number, sweep: number, spread: number) => {
  const tipX = -0.05 - 0.38 * sweep;
  const tipY = lerp(-0.2 - 0.8 * w, -0.42, sweep * 0.55);
  const wing: Pt[] = [
    [-0.35, -0.05],
    [tipX, tipY],
    [0.35, 0],
    [0, 0.06],
  ];
  const far: Pt[] = [
    [lerp(-0.35, -0.2, spread), lerp(-0.05, -0.04, spread)],
    [tipX + 0.3 * spread, tipY * lerp(1, 0.84, spread) + 0.04 * spread],
    [lerp(0.35, 0.45, spread), 0],
    [lerp(0, 0.1, spread), 0.06],
  ];
  return { wing, far, tip: [tipX, tipY] as Pt };
};

const drawBird = (r: Riso, x: number, y: number, s: number, rot: number, w: number, sweep: number, spread: number, lw: number, outline = 0) => {
  const g = birdGeo(w, sweep, spread);
  const far = polyPath(xfPts(g.far, x, y, s, rot));
  const body = polyPath(xfPts(BIRD_BODY, x, y, s, rot));
  const wing = polyPath(xfPts(g.wing, x, y, s, rot));
  if (spread > 0.01) {
    knock(r, far);
    fillInk(r, B, far, 0.45);
    fillInk(r, T, far, 0.22);
  }
  knock(r, body);
  fillInk(r, T, polyPath(xfPts(BELLY, x, y, s, rot)), 0.3);
  knock(r, wing);
  const under = clamp(-w) * 0.42;
  fillInk(r, B, wing, 0.07 + under);
  const cr = new Path2D();
  const P = (pts: Pt[]) => xfPts(pts, x, y, s, rot);
  const [a1, b1] = P([
    [0.4, 0.03],
    [-0.95, -0.38],
  ]);
  cr.moveTo(a1[0], a1[1]);
  cr.lineTo(b1[0], b1[1]);
  const [a2, b2] = P([
    [0.42, 0.05],
    [1.08, -0.43],
  ]);
  cr.moveTo(a2[0], a2[1]);
  cr.lineTo(b2[0], b2[1]);
  const [a3, b3] = P([
    [0, 0.02],
    [g.tip[0] * 0.85, g.tip[1] * 0.85],
  ]);
  cr.moveTo(a3[0], a3[1]);
  cr.lineTo(b3[0], b3[1]);
  strokeInk(r, B, cr, lw);
  if (outline > 0.02) {
    const o = polyPath(xfPts(BIRD_BODY, x, y, s, rot));
    polyPath(xfPts(g.wing, x, y, s, rot), true, o);
    strokeInk(r, B, o, lw * 0.9, outline);
  }
};

/* ---------- the lifting page ---------- */

const PAGE_W = 280;
const liftPt = (u: number, v: number, a: number): Pt => {
  const tw = lerp(0.84, 1.2, v);
  const n = 10;
  let x = 0;
  let l = 0;
  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) / n) * u;
    const phi = a * tw * (0.55 + 0.9 * s);
    x += Math.cos(phi) * (u / n);
    l += Math.sin(phi) * (u / n);
  }
  const top = lerp(508, 498, u);
  const bot = lerp(716, 712, u);
  return [800 + x * PAGE_W, lerp(top, bot, v) - l * PAGE_W * 0.62];
};

const liftOutline = (a: number, flat = false): Pt[] => {
  const out: Pt[] = [];
  const N = 16;
  const f = (u: number, v: number): Pt => {
    const p = liftPt(u, v, a);
    if (!flat) return p;
    return [p[0], lerp(lerp(508, 498, u), lerp(716, 712, u), v)];
  };
  for (let i = 0; i <= N; i++) out.push(f(i / N, 1));
  for (let i = 1; i < 4; i++) out.push(f(1, 1 - i / 4));
  for (let i = N; i >= 0; i--) out.push(f(i / N, 0));
  return out;
};

const liftText = (rows: Row[], a: number): Path2D => {
  const p = new Path2D();
  for (const row of rows) {
    const yr = (row.y - 1250) / 7 + 605;
    if (yr < 520 || yr > 700) continue;
    const v = (yr - 506) / 208;
    for (const [w0, w1] of row.words) {
      const xa = Math.max(822, (w0 - 800) / 7 + 940);
      const xb = Math.min(1030, (w1 - 800) / 7 + 940);
      if (xb - xa < 1) continue;
      for (let k = 0; k <= 3; k++) {
        const q = liftPt((lerp(xa, xb, k / 3) - 800) / PAGE_W, v, a);
        if (k === 0) p.moveTo(q[0], q[1]);
        else p.lineTo(q[0], q[1]);
      }
    }
  }
  return p;
};

/** Printed text on a flat page whose centre is (cx, 605) in the room */
const pageText = (r: Riso, rows: Row[], cx: number, xa: number, xb: number, d = 1) => {
  const p = new Path2D();
  addRows(p, rows, xa, xb, 700, 1870, 0, 0);
  const c = r.layers[T];
  c.save();
  c.translate(cx, 605);
  c.scale(1 / 7, 1 / 7);
  c.translate(-800, -1250);
  c.lineWidth = 18;
  c.strokeStyle = r.tone(c, d);
  c.stroke(p);
  c.restore();
};

/* ---------- city of spines ---------- */

const MOON: Pt = [1150, 215];

const buildCity = (): CityArt => {
  const rng = mulberry(41);
  const knockP = new Path2D();
  const tones = new Map<string, Fill>();
  const add = (ink: number, d: number): Path2D => {
    const key = `${ink}:${d}`;
    let f = tones.get(key);
    if (!f) {
      f = { ink, d, path: new Path2D() };
      tones.set(key, f);
    }
    return f.path;
  };
  const winKnock = new Path2D();
  const winY = new Path2D();
  const bandKnock = new Path2D();
  const antenna = new Path2D();
  const tips = new Path2D();
  let x = -460;
  let n = 0;
  while (x < 2060) {
    const w = 36 + rng() * 54;
    const nearMoon = x > 980 && x < 1320;
    const tall = rng() < 0.32;
    let h = tall ? 300 + rng() * 170 : 120 + rng() * 200;
    if (nearMoon) h = Math.min(h, 290);
    const top = 650 - h;
    knockP.rect(x, top, w, h);
    const kind = (n * 7 + Math.floor(rng() * 6)) % 6;
    n++;
    const yellow = kind === 3 || kind === 5;
    if (kind === 0) add(B, 1).rect(x, top, w, h);
    if (kind === 1) add(T, 1).rect(x, top, w, h);
    if (kind === 2) {
      add(T, 1).rect(x, top, w, h);
      add(B, 0.45).rect(x, top, w, h);
    }
    if (kind === 3) {
      add(Y, 1).rect(x, top, w, h);
      add(B, 0.4).rect(x, top, w, h);
    }
    if (kind === 4) {
      add(B, 0.75).rect(x, top, w, h);
      add(T, 0.4).rect(x, top, w, h);
    }
    if (kind === 5) {
      add(Y, 1).rect(x, top, w, h);
      add(T, 0.5).rect(x, top, w, h);
    }
    const bands = yellow ? add(B, 1) : bandKnock;
    bands.rect(x, top + 10, w, 5);
    bands.rect(x, 650 - 28, w, 5);
    if (rng() < 0.6 && h > 200) {
      const cols = Math.max(1, Math.floor((w - 10) / 12));
      const x0 = x + (w - cols * 12 + 6) / 2;
      for (let yy = top + 30; yy < 650 - 46; yy += 18) {
        for (let c = 0; c < cols; c++) {
          if (rng() < 0.42) {
            if (yellow) add(B, 1).rect(x0 + c * 12, yy, 6, 9);
            else {
              winKnock.rect(x0 + c * 12, yy, 6, 9);
              winY.rect(x0 + c * 12, yy, 6, 9);
            }
          }
        }
      }
    } else {
      const lh = 24 + rng() * 26;
      const ly = top + h * 0.22;
      if (yellow) add(B, 1).rect(x + w * 0.2, ly, w * 0.6, lh);
      else {
        winKnock.rect(x + w * 0.2, ly, w * 0.6, lh);
        winY.rect(x + w * 0.2, ly, w * 0.6, lh);
      }
    }
    if (tall && h > 380 && rng() < 0.6) {
      antenna.moveTo(x + w / 2, top);
      antenna.lineTo(x + w / 2, top - 36);
      tips.moveTo(x + w / 2 + 4, top - 38);
      tips.arc(x + w / 2, top - 38, 4, 0, TAU);
    }
    x += w + 2 + rng() * 5;
  }
  return { knock: knockP, fills: [...tones.values()], winKnock, winY, bandKnock, antenna, tips };
};

interface SeaOpts {
  top: number;
  bg: number;
  amp: number;
  refl: number;
  xa: number;
  xb: number;
  ya: number;
  yb: number;
}

const drawSea = (r: Riso, s: State, t: number, o: SeaOpts) => {
  const sea = new Path2D();
  sea.rect(-900, o.top, 3400, 2300 - o.top);
  if (o.bg > 0.01) {
    fillInk(r, T, sea, 0.42 * o.bg);
    r.gradient(r.layers[B], sea, { kind: 'linear', x0: 0, y0: 680, x1: 0, y1: 1900, from: 0.05 * o.bg, to: 0.5 * o.bg }, 10);
  }
  const pT = new Path2D();
  const pY = new Path2D();
  addRows(pT, s.seaRows, o.xa, o.xb, Math.max(o.ya, o.top + 10), o.yb, o.amp, t, pY, o.refl > 0 ? (x, y) => y < 800 && Math.abs(x - MOON[0]) < 70 + (y - 700) * 0.6 : undefined);
  strokeInk(r, T, pT, 18, 1, [], 'butt');
  if (o.refl > 0) strokeInk(r, Y, pY, 18, 1, [], 'butt');
};

const drawCity = (r: Riso, s: State, t: number) => {
  const [ly, lt, lb] = r.layers;
  const sky = new Path2D();
  sky.rect(-900, -900, 3400, 1582);
  r.gradient(lt, sky, { kind: 'linear', x0: 0, y0: -150, x1: 0, y1: 660, from: 0.95, to: 0.5 }, 12);
  r.gradient(lb, sky, { kind: 'linear', x0: 0, y0: -150, x1: 0, y1: 660, from: 0.62, to: 0.12 }, 12);
  r.gradient(ly, sky, { kind: 'radial', cx: MOON[0], cy: MOON[1], r0: 62, r1: 480, from: 0.7, to: 0 }, 12);
  const st = new Path2D();
  for (const [x, y, rad, ph] of s.stars) {
    const rr = rad * (0.55 + 0.45 * Math.sin(t * 2.6 + ph));
    st.moveTo(x + rr, y);
    st.arc(x, y, rr, 0, TAU);
  }
  knock(r, st, [T, B]);
  // the moon, hung like a pendant lamp
  const cord = new Path2D();
  cord.moveTo(MOON[0], -900);
  cord.lineTo(MOON[0], MOON[1] - 80);
  strokeInk(r, T, cord, 3);
  strokeInk(r, B, cord, 3);
  const moon = new Path2D();
  moon.arc(MOON[0], MOON[1], 66, 0, TAU);
  knock(r, moon, [T, B]);
  ly.fillStyle = '#000';
  ly.fill(moon);
  const cr = new Path2D();
  for (const [dx, dy, rr] of [
    [-22, -8, 14],
    [24, 20, 10],
    [6, -32, 7],
    [-26, 28, 8],
    [30, -14, 5],
  ]) {
    cr.moveTo(MOON[0] + dx + rr, MOON[1] + dy);
    cr.arc(MOON[0] + dx, MOON[1] + dy, rr, 0, TAU);
  }
  fillInk(r, B, cr, 0.28);
  const cap = polyPath([
    [MOON[0] - 24, MOON[1] - 60],
    [MOON[0] + 24, MOON[1] - 60],
    [MOON[0] + 13, MOON[1] - 84],
    [MOON[0] - 13, MOON[1] - 84],
  ]);
  fillInk(r, T, cap);
  fillInk(r, B, cap);
  // spines
  knock(r, s.city.knock);
  paint(r, s.city.fills);
  knock(r, s.city.winKnock, [T, B]);
  ly.fillStyle = '#000';
  ly.fill(s.city.winY);
  knock(r, s.city.bandKnock);
  strokeInk(r, T, s.city.antenna, 3);
  strokeInk(r, B, s.city.antenna, 3);
  knock(r, s.city.tips, [T, B]);
  ly.fill(s.city.tips);
  // shelf plank
  const plank = new Path2D();
  plank.rect(-900, 650, 3400, 32);
  knock(r, plank);
  fillInk(r, B, plank);
  fillInk(r, T, plank, 0.5);
  const lip = new Path2D();
  lip.rect(-900, 650, 3400, 5);
  fillInk(r, Y, lip, 0.6);
};

/* ---------- the wave ---------- */

const WAVE: Pt[] = [
  [-400, 1900],
  [-400, 1590],
  [0, 1575],
  [300, 1550],
  [520, 1490],
  [660, 1410],
  [760, 1310],
  [820, 1220],
  [850, 1150],
  [855, 1095],
  [835, 1055],
  [795, 1035],
  [750, 1045],
  [715, 1075],
  [700, 1110],
  [685, 1070],
  [700, 1015],
  [750, 965],
  [830, 925],
  [920, 902],
  [1010, 898],
  [1100, 915],
  [1220, 960],
  [1380, 1040],
  [1560, 1120],
  [1800, 1190],
  [2000, 1230],
  [2000, 1900],
];
const SEGN = 6;
const LIP_W: Record<number, number> = { 11: 0.2, 12: 0.45, 13: 0.8, 14: 1, 15: 0.8, 16: 0.45, 17: 0.2 };

const waveDense = (g: number, curl: number, t: number): Pt[] => {
  const pts: Pt[] = WAVE.map(([x, y], i) => {
    const w = LIP_W[i] ?? 0;
    const wob = Math.sin(t * 1.7 + i * 0.9) * 7 * w;
    const X = x - 55 * curl * w + wob;
    const Yv = y + 60 * curl * w + wob * 0.6;
    return [X, 1800 - (1800 - Yv) * g];
  });
  return catmull(pts, true, SEGN);
};

/** Paper crest along the top of the lip: outer edge, inner edge, normals and thickness */
const crestGeo = (dense: Pt[], g: number) => {
  const i0 = 14 * SEGN;
  const i1 = 23 * SEGN;
  const top: Pt[] = [];
  const nIn: Pt[] = [];
  const th: number[] = [];
  for (let i = i0; i <= i1; i++) {
    const p = dense[i];
    const a = dense[Math.max(i0, i - 1)];
    const b = dense[Math.min(i1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const s = (i - i0) / (i1 - i0);
    top.push(p);
    nIn.push([-dy / l, dx / l]);
    th.push(66 * Math.sin(Math.PI * Math.pow(s, 0.6)) * Math.max(0.05, g));
  }
  const inner = top.map((p, i): Pt => [p[0] + nIn[i][0] * th[i], p[1] + nIn[i][1] * th[i]]);
  const outline = [...top, ...inner.slice().reverse()];
  return { top, nIn, th, outline };
};

const drawWave = (r: Riso, s: State, t: number, g: number, curl: number, crestK: number, birdPts: Pt[] | null, fade: number) => {
  if (g <= 0.005) return;
  const dense = waveDense(g, curl, t);
  const body = polyPath(dense);
  knock(r, body);
  fillInk(r, T, body);
  r.gradient(r.layers[B], body, { kind: 'linear', x0: 0, y0: 900, x1: 0, y1: 1800, from: 0.12, to: 0.6 }, 10);
  // contour lines of print following the face
  withXf(r, body, null, () => {
    const lines = new Path2D();
    const back = dense.slice(14 * SEGN, 26 * SEGN);
        for (let j = 1; j <= 14; j++) {
      polyPath(
        back.map(([x, y]): Pt => [x + j * 12, y + j * 40 * Math.max(0.25, g)]),
        false,
        lines
      );
    }
    knockStroke(r, lines, 7, [T, B], [70, 16, 130, 16, 45, 16]);
  });
  const cg = crestGeo(dense, g);
  // the paper crest, morphing out of the bird
  if (crestK <= 0) return;
  let crestPts = cg.outline;
  if (birdPts && crestK < 1) {
    const [a, b] = morphPair(birdPts, cg.outline, 140);
    crestPts = morph(a, b, crestK);
  }
  const crest = polyPath(crestPts);
  knock(r, crest);
  fillInk(r, Y, crest, 0.22);
  fillInk(r, B, crest, 0.1);
  const show = clamp((crestK - 0.65) / 0.35) * fade;
  if (show > 0.02) {
    const tl = new Path2D();
    for (const f of [0.3, 0.55, 0.8]) {
      let started = false;
      cg.top.forEach((p, i) => {
        if (cg.th[i] < 12) {
          started = false;
          return;
        }
        const q: Pt = [p[0] + cg.nIn[i][0] * cg.th[i] * f, p[1] + cg.nIn[i][1] * cg.th[i] * f];
        if (!started) tl.moveTo(q[0], q[1]);
        else tl.lineTo(q[0], q[1]);
        started = true;
      });
    }
    strokeInk(r, T, tl, 5 * Math.max(0.4, g), show, [50, 14, 90, 14, 30, 14], 'butt');
    const inner = new Path2D();
    cg.top.forEach((p, i) => {
      const q: Pt = [p[0] + cg.nIn[i][0] * cg.th[i], p[1] + cg.nIn[i][1] * cg.th[i]];
      if (i === 0) inner.moveTo(q[0], q[1]);
      else inner.lineTo(q[0], q[1]);
    });
    strokeInk(r, B, inner, 3, show);
    // foam claws reaching forward from the lip
    const claws = new Path2D();
    const n = cg.top.length;
    for (let k = 0; k < 8; k++) {
      const i = Math.floor(n * (0.03 + k * 0.045));
      const p = cg.top[i];
      const ni = cg.nIn[i];
      const tan: Pt = [ni[1], -ni[0]];
      const out: Pt = [-ni[0], -ni[1]];
      const len = (24 + 18 * hash(k + 3)) * show * g * (1 + 0.18 * Math.sin(t * 4.2 + k * 1.7));
      const dir: Pt = [out[0] - tan[0] * 0.9, out[1] - tan[1] * 0.9];
      const dl = Math.hypot(dir[0], dir[1]) || 1;
      const tip: Pt = [p[0] + (dir[0] / dl) * len, p[1] + (dir[1] / dl) * len];
      const hw = 8 * g;
      claws.moveTo(p[0] - tan[0] * hw, p[1] - tan[1] * hw);
      claws.quadraticCurveTo(tip[0] + tan[0] * 6, tip[1] + tan[1] * 6, tip[0], tip[1]);
      claws.lineTo(p[0] + tan[0] * hw, p[1] + tan[1] * hw);
      claws.closePath();
    }
    knock(r, claws);
    fillInk(r, Y, claws, 0.15 * show);
    // spray
    const tip = cg.top[0];
    const sp = new Path2D();
    for (const [ox, oy, vx, vy, ph] of s.spray) {
      const tau = ((t * 0.45 + ph) % 1) * 1.6;
      const x = tip[0] + ox + vx * tau;
      const y = tip[1] + oy + vy * tau + 170 * tau * tau;
      const rr = (2.5 + 4 * hash(ph * 97)) * (1 - tau / 1.6) * show * g;
      if (rr < 0.6) continue;
      sp.moveTo(x + rr, y);
      sp.arc(x, y, rr, 0, TAU);
    }
    knock(r, sp, [T, B]);
  }
};

/* ---------- room ---------- */

const buildRoom = (): RoomArt => {
  const rng = mulberry(5);
  const wall = new Path2D();
  wall.rect(-900, -900, 3400, 1370);
  const desk = new Path2D();
  desk.rect(-900, 470, 3400, 1300);
  const grain = new Path2D();
  for (let i = 0; i < 11; i++) {
    const y0 = 500 + i * 40 + rng() * 14;
    const ph = rng() * 6;
    grain.moveTo(-900, y0);
    for (let x = -900; x <= 2500; x += 80) grain.lineTo(x, y0 + Math.sin(x * 0.004 + ph) * 7 + Math.sin(x * 0.013 + ph * 2) * 2);
  }
  const winInner = new Path2D();
  winInner.rect(1100, 90, 320, 180);
  const frame = new Path2D();
  frame.rect(1080, 70, 360, 220);
  frame.rect(1100, 90, 320, 180);
  const sill = new Path2D();
  sill.rect(1058, 288, 404, 22);
  const rod = new Path2D();
  rod.moveTo(985, 50);
  rod.lineTo(1535, 50);
  const curtL: Pt[] = [
    [992, 48],
    [1094, 48],
    [1086, 120],
    [1078, 210],
    [1074, 300],
    [1086, 390],
    [1108, 468],
    [1060, 470],
    [1018, 466],
    [982, 470],
    [990, 360],
    [996, 200],
  ];
  const curtains = smoothPath(curtL);
  smoothPath(
    curtL.map(([x, y]): Pt => [2520 - x, y]),
    true,
    0.5,
    curtains
  );
  const folds = new Path2D();
  for (const base of [1010, 1032, 1055]) {
    for (const m of [1, -1]) {
      const bx = m === 1 ? base : 2520 - base;
      folds.moveTo(bx, 60);
      folds.bezierCurveTo(bx + 6 * m, 200, bx - 6 * m, 330, bx + 10 * m * 0.6, 462);
    }
  }
  const lampBase = new Path2D();
  lampBase.ellipse(300, 652, 78, 20, 0, 0, TAU);
  lampBase.rect(288, 620, 24, 32);
  const lampArm = new Path2D();
  lampArm.moveTo(300, 640);
  lampArm.lineTo(258, 452);
  lampArm.lineTo(392, 262);
  const joints = new Path2D();
  joints.arc(258, 452, 11, 0, TAU);
  joints.moveTo(402, 262);
  joints.arc(392, 262, 10, 0, TAU);
  const shade = smoothPath(
    [
      [352, 258],
      [402, 210],
      [458, 226],
      [544, 318],
      [500, 362],
      [450, 380],
    ],
    true,
    0.35
  );
  const mouth = new Path2D();
  mouth.ellipse(497, 350, 54, 15, -0.86, 0, TAU);
  const cone = polyPath([
    [544, 318],
    [450, 380],
    [560, 800],
    [1150, 700],
  ]);
  // stacked books under the window
  const stack: Fill[] = [];
  const stackKnock = new Path2D();
  const stackPages = new Path2D();
  const stackLines = new Path2D();
  const books: [number, number, number, number, number][] = [
    [1170, 592, 300, 46, 0],
    [1196, 550, 262, 42, 1],
    [1182, 516, 238, 34, 2],
  ];
  for (const [x, y, w, h, k] of books) {
    const p = new Path2D();
    p.rect(x, y, w, h);
    stackKnock.rect(x, y, w, h);
    if (k === 0) stack.push({ ink: T, d: 1, path: p }, { ink: B, d: 0.35, path: p });
    if (k === 1) stack.push({ ink: B, d: 1, path: p });
    if (k === 2) stack.push({ ink: Y, d: 1, path: p }, { ink: B, d: 0.4, path: p });
    stackPages.rect(x + w - 26, y + 5, 22, h - 10);
    for (let yy = y + 9; yy < y + h - 6; yy += 4) {
      stackLines.moveTo(x + w - 26, yy);
      stackLines.lineTo(x + w - 4, yy);
    }
    const band = new Path2D();
    band.rect(x + 18, y, 7, h);
    band.rect(x + 30, y, 3, h);
    stack.push({ ink: k === 2 ? B : Y, d: 1, path: band });
  }
  // pencil
  const pencil: Fill[] = [];
  const P = (pts: Pt[]) => polyPath(xfPts(pts, 572, 792, 1, -0.16));
  const pBody = P(rectPts(0, -5, 150, 10));
  const pTip = P([
    [150, -5],
    [174, 0],
    [150, 5],
  ]);
  const pLead = P([
    [166, -1.7],
    [174, 0],
    [166, 1.7],
  ]);
  const pFer = P(rectPts(-14, -5, 14, 10));
  const pEr = P(rectPts(-28, -5, 14, 10));
  const pencilKnock = new Path2D();
  for (const p of [pBody, pTip, pFer, pEr]) pencilKnock.addPath(p);
  pencil.push(
    { ink: Y, d: 1, path: pBody },
    { ink: B, d: 0.22, path: pBody },
    { ink: Y, d: 0.45, path: pTip },
    { ink: B, d: 1, path: pLead },
    { ink: T, d: 1, path: pFer },
    { ink: B, d: 1, path: pEr }
  );
  const boardL = new Path2D();
  boardL.roundRect(498, 488, 302, 238, [6, 0, 0, 6]);
  const boardR = new Path2D();
  boardR.roundRect(800, 488, 302, 238, [0, 6, 6, 0]);
  const pageL = polyPath([
    [800, 508],
    [520, 498],
    [518, 712],
    [800, 716],
  ]);
  const pageR = polyPath([
    [800, 508],
    [1080, 498],
    [1082, 712],
    [800, 716],
  ]);
  const edgesL = new Path2D();
  const edgesR = new Path2D();
  for (const o of [4, 7.5]) {
    edgesL.moveTo(519, 712 + o);
    edgesL.lineTo(800, 716 + o);
    edgesR.moveTo(800, 716 + o);
    edgesR.lineTo(1081, 712 + o);
  }
  // marginalia on the left page
  const marg = new Path2D();
  marg.moveTo(528, 545);
  for (let i = 1; i <= 7; i++) marg.lineTo(528 + i * 4.5, 545 + (i % 2 ? -3 : 3));
  marg.moveTo(542, 592);
  marg.lineTo(554, 604);
  marg.moveTo(554, 592);
  marg.lineTo(542, 604);
  marg.moveTo(548, 590);
  marg.lineTo(548, 606);
  marg.moveTo(568, 612);
  marg.lineTo(563, 614);
  marg.lineTo(563, 652);
  marg.lineTo(568, 654);
  marg.moveTo(600, 566);
  for (let x = 600; x <= 712; x += 8) marg.lineTo(x, 566 + Math.sin(x * 0.4) * 1.6);
  marg.moveTo(530, 672);
  marg.bezierCurveTo(540, 664, 552, 680, 560, 670);
  const shadow = new Path2D();
  shadow.roundRect(506, 720, 604, 18, 9);
  return {
    wall,
    desk,
    grain,
    winInner,
    frame,
    sill,
    rod,
    curtains,
    folds,
    lampBase,
    lampArm,
    joints,
    shade,
    mouth,
    cone,
    stack,
    stackKnock,
    stackPages,
    stackLines,
    pencil,
    pencilKnock,
    boardL,
    boardR,
    pageL,
    pageR,
    edgesL,
    edgesR,
    marg,
    shadow,
  };
};

const lampLevel = (t: number) => {
  if (t > 10) return 0.97 + 0.03 * Math.sin(t * 2.1);
  const on = smooth01(seg(t, 0.3, 1.0));
  const flick = t > 0.42 && t < 0.56 ? 0.35 : 1;
  return on * flick;
};
const smooth01 = (k: number) => k * k * (3 - 2 * k);

const drawRoomBase = (r: Riso, s: State, t: number, L: number) => {
  const R = s.room;
  const [ly, lt, lb] = r.layers;
  // wall, lit by the lamp
  r.gradient(lt, R.wall, { kind: 'radial', cx: 450, cy: 300, r0: 40, r1: 1150, from: lerp(0.8, 0.18, L), to: 0.82 }, 14);
  r.gradient(lb, R.wall, { kind: 'radial', cx: 450, cy: 300, r0: 40, r1: 1150, from: lerp(0.6, 0.14, L), to: 0.6 }, 14);
  if (L > 0.02) r.gradient(ly, R.wall, { kind: 'radial', cx: 450, cy: 300, r0: 30, r1: 760, from: 0.8 * L, to: 0 }, 14);
  // desk with a pool of light
  r.gradient(lb, R.desk, { kind: 'radial', cx: 760, cy: 650, r0: 40, r1: 820, from: lerp(0.9, 0.42, L), to: 0.95 }, 14);
  r.gradient(lt, R.desk, { kind: 'radial', cx: 760, cy: 650, r0: 40, r1: 820, from: lerp(0.55, 0.05, L), to: 0.6 }, 12);
  r.gradient(ly, R.desk, { kind: 'radial', cx: 760, cy: 650, r0: 40, r1: 700, from: 0.92 * L, to: 0.12 * L }, 12);
  strokeInk(r, B, R.grain, 2.2, 1);
  const edge = new Path2D();
  edge.rect(-900, 468, 3400, 6);
  fillInk(r, T, edge);
  fillInk(r, B, edge);
  // window onto the city
  knock(r, R.winInner);
  withXf(r, R.winInner, [0.2, 0, 0, 0.2, 1100, 90], () => {
    drawCity(r, s, t);
    drawSea(r, s, t, { top: 682, bg: 1, amp: 14, refl: 1, xa: -900, xb: 2500, ya: 0, yb: 3000 });
  });
  fillInk(r, T, R.frame, 1, 'evenodd');
  fillInk(r, B, R.frame, 0.8, 'evenodd');
  knock(r, R.sill);
  fillInk(r, B, R.sill);
  fillInk(r, Y, R.sill, 0.4 * L + 0.05);
  strokeInk(r, T, R.rod, 6);
  strokeInk(r, B, R.rod, 6);
  knock(r, R.curtains);
  fillInk(r, B, R.curtains);
  fillInk(r, T, R.curtains, 0.3);
  fillInk(r, Y, R.curtains, 0.25 * L);
  strokeInk(r, T, R.folds, 3, 1);
  // light cone
  if (L > 0.02) fillInk(r, Y, R.cone, 0.2 * L);
  // lamp
  strokeInk(r, T, R.lampArm, 10);
  strokeInk(r, B, R.lampArm, 10);
  knock(r, R.lampBase);
  fillInk(r, T, R.lampBase);
  fillInk(r, B, R.lampBase);
  fillInk(r, Y, R.lampBase, 0.3 * L);
  fillInk(r, T, R.joints);
  fillInk(r, B, R.joints);
  knock(r, R.shade);
  fillInk(r, T, R.shade);
  fillInk(r, B, R.shade, 0.55);
  r.gradient(ly, R.shade, { kind: 'linear', x0: 380, y0: 230, x1: 520, y1: 350, from: 0, to: 0.5 * L }, 6);
  if (L > 0.05) {
    knock(r, R.mouth, [T, B], L);
    fillInk(r, Y, R.mouth, 1);
  } else fillInk(r, B, R.mouth, 0.6);
  // stack of books
  const sh = new Path2D();
  sh.ellipse(1320, 642, 170, 12, 0, 0, TAU);
  fillInk(r, B, sh, 0.5);
  knock(r, R.stackKnock);
  paint(r, R.stack);
  knock(r, R.stackPages);
  fillInk(r, Y, R.stackPages, 0.15 * L);
  strokeInk(r, B, R.stackLines, 1, 0.8, [], 'butt');
  // pencil
  knock(r, R.pencilKnock);
  paint(r, R.pencil);
};

const drawMotes = (r: Riso, s: State, t: number, L: number) => {
  if (L < 0.4) return;
  const p = new Path2D();
  const m0: Pt = [497, 350];
  const m1: Pt = [850, 745];
  for (const [u0, v0, rad, ph] of s.motes) {
    const u = (u0 + t * 0.035) % 1;
    const v = v0 + 0.08 * Math.sin(t * 0.7 + ph);
    const wdt = lerp(40, 280, u);
    const x = lerp(m0[0], m1[0], u) + v * wdt * 0.75;
    const y = lerp(m0[1], m1[1], u) - v * wdt * 0.66;
    const rr = rad * (0.6 + 0.4 * Math.sin(t * 3 + ph)) * L;
    p.moveTo(x + rr, y);
    p.arc(x, y, rr, 0, TAU);
  }
  knock(r, p, [T, B], 0.85);
};

const drawLeftHalfInside = (r: Riso, s: State, L: number) => {
  const R = s.room;
  fillInk(r, B, R.boardL);
  fillInk(r, T, R.boardL, 0.45);
  knock(r, R.pageL);
  knockStroke(r, R.edgesL, 1.6);
  fillInk(r, Y, R.pageL, 0.16 * L);
  r.gradient(r.layers[B], R.pageL, { kind: 'linear', x0: 800, y0: 0, x1: 735, y1: 0, from: 0.42, to: 0 }, 6);
  pageText(r, s.rowsL, 660, 170, 1626);
  strokeInk(r, B, R.marg, 1.5);
};

const drawRightBase = (r: Riso, s: State, L: number) => {
  const R = s.room;
  fillInk(r, B, R.boardR);
  fillInk(r, T, R.boardR, 0.45);
  knock(r, R.pageR);
  knockStroke(r, R.edgesR, 1.6);
};

const rightPageFinish = (r: Riso, s: State, L: number, d = 1) => {
  const R = s.room;
  fillInk(r, Y, R.pageR, 0.16 * L * d);
  r.gradient(r.layers[B], R.pageR, { kind: 'linear', x0: 800, y0: 0, x1: 865, y1: 0, from: 0.42 * d, to: 0 }, 6);
};

/* ---------- cameras and paths ---------- */

type Cam = [number, number, number];

const roomCam = (t: number): Cam => {
  if (t < 3.8) {
    const k = tween(t, 0, 3.8, ease.inOutSine);
    return [lerp(800, 860, k), lerp(470, 540, k), lerp(1, 1.3, k)];
  }
  if (t < 4.9) {
    const k = tween(t, 3.8, 4.9, ease.inOutSine);
    return [lerp(860, 870, k), lerp(540, 500, k), lerp(1.3, 1.25, k)];
  }
  if (t < 7.4) {
    const z = Math.exp(lerp(Math.log(1.25), Math.log(5), tween(t, 4.9, 7.4, ease.inOutCubic)));
    const kp = tween(t, 4.9, 7.25, ease.inOutCubic);
    const wx = lerp((1260 - 870) * 1.25 + 800, 800, kp);
    const wy = lerp((180 - 500) * 1.25 + 450, 450, kp);
    return [1260 - (wx - 800) / z, 180 - (wy - 450) / z, z];
  }
  const k = tween(t, 15.2, 17.0, ease.inOutCubic);
  const z = Math.exp(lerp(Math.log(7), Math.log(1.6), k));
  const px = lerp(800, 864, k);
  const py = lerp(450, 458, k);
  const cx = 940 - (px - 800) / z;
  const cy = 605 - (py - 450) / z;
  const k2 = tween(t, 17.2, 18.4, ease.inOutSine);
  const k3 = tween(t, 18.4, 19.5, ease.outSine);
  const z2 = Math.exp(lerp(Math.log(z), Math.log(1.2), k2)) * (1 + 0.04 * k3);
  return [lerp(cx, 870, k2), lerp(cy, 535, k2), z2];
};

const cityCam = (t: number): Cam => {
  if (t < 10) {
    const k = ease.outSine(seg(t, 7.4, 10));
    return [lerp(800, 840, k), lerp(450, 430, k), lerp(1, 1.06, k)];
  }
  const k = tween(t, 10, 11.6, ease.inOutCubic);
  return [lerp(840, 800, k), lerp(430, 1250, k), lerp(1.06, 1, k)];
};

const toScreen = (p: Pt, c: Cam): Pt => [(p[0] - c[0]) * c[2] + 800, (p[1] - c[1]) * c[2] + 450];

const B0: Pt = [905, 335];
const B0S = 80;
const B0R = -0.15;
const LIFT_END = 0.98;

const waveG = (t: number) => {
  const up = 0.12 + 0.88 * ease.outCubic(seg(t, 11.0, 12.8));
  return up * (1 - tween(t, 15.4, 16.8, ease.inOutSine));
};
const IMPACT_T = 11.55;

const tanRot = (p: (k: number) => Pt, k: number, lo: number, hi: number) => {
  const a = p(clamp(k - 0.01));
  const b = p(clamp(k + 0.01));
  return clamp(Math.atan2(b[1] - a[1], b[0] - a[0]), lo, hi);
};

const flapW = (t: number) => {
  if (t >= 4.9 && t < 7.4) {
    const e = Math.sin(Math.PI * seg(t, 4.9, 7.4));
    return lerp(1, Math.cos(TAU * 2.3 * (t - 4.9)), e * 0.95);
  }
  if (t >= 7.4 && t < 9.6) {
    const e = Math.sin(Math.PI * seg(t, 7.4, 9.2));
    return lerp(1, Math.cos(TAU * 1.5 * (t - 7.4)), e * 0.8);
  }
  if (t >= 9.6) return lerp(1, 0.55, tween(t, 9.6, 10.4));
  return 1;
};

/** Bird in city space for 7.4..IMPACT_T */
const cityBird = (t: number) => {
  if (t < 9.6) {
    const P = (k: number) => bez([800, 420], [960, 370], [1110, 183], [1240, 215], k);
    const k = tween(t, 7.4, 9.6, ease.inOutSine);
    const p = P(k);
    return { x: p[0], y: p[1], s: lerp(60, 56, k), rot: tanRot(P, k, -0.6, 1.4) };
  }
  const yI = 1800 - (1800 - 925) * waveG(IMPACT_T);
  const P = (k: number) => bez([1240, 215], [1420, 260], [1180, 720], [1010, yI], k);
  const k = tween(t, 9.6, IMPACT_T, ease.inOutSine);
  const p = P(k);
  return { x: p[0], y: p[1], s: lerp(56, 54, k), rot: tanRot(P, k, -0.6, 0.8) };
};

/* ---------- film ---------- */

export const marginaliaFilm: RisoFilm<State> = {
  id: 'marginalia',
  title: 'Marginalia',
  caption: 'A page folds into a bird, flies over a city of spines and comes home as a wave of text.',
  theme: 'Books',
  motif: 'A page and its curl',
  duration: 19.5,
  paper: '#f3ead8',
  inks: [
    { color: '#ffb511', offset: [0, 0], angle: 15 },
    { color: '#00838a', offset: [1.4, -0.9], angle: 75 },
    { color: '#914e72', offset: [-1.1, 0.8], angle: 45 },
  ],
  scenes: [
    { at: 0, label: 'Reading lamp' },
    { at: 3.8, label: 'The fold' },
    { at: 7.4, label: 'City of spines' },
    { at: 11.2, label: 'Sea of text' },
    { at: 15.2, label: 'Last page' },
  ],
  posterTime: 9.3,
  setup() {
    const rng = mulberry(77);
    const stars: [number, number, number, number][] = [];
    while (stars.length < 60) {
      const x = -400 + rng() * 2400;
      const y = -350 + rng() * 820;
      if (Math.hypot(x - MOON[0], y - MOON[1]) < 150) continue;
      stars.push([x, y, 1.6 + rng() * 2.4, rng() * TAU]);
    }
    const motes: [number, number, number, number][] = [];
    for (let i = 0; i < 18; i++) motes.push([rng(), rng() * 2 - 1, 1.4 + rng() * 1.6, rng() * TAU]);
    const spray: [number, number, number, number, number][] = [];
    for (let i = 0; i < 26; i++) spray.push([rng() * 60 - 30, -rng() * 30, -60 - rng() * 140, -110 - rng() * 150, rng()]);
    return {
      seaRows: genRows(11, -5, 18),
      rowsL: genRows(23, 0, 15),
      rowsR: genRows(37, 0, 15),
      rowsLift: genRows(53, 0, 15),
      city: buildCity(),
      room: buildRoom(),
      stars,
      motes,
      spray,
    };
  },
  draw(r, t, s) {
    /* ----- scenes 1-2: the room, the lifting page, the fold, out the window ----- */
    if (t < 7.4) {
      const L = lampLevel(t);
      const cam = roomCam(t);
      r.camera(cam[0], cam[1], cam[2]);
      drawRoomBase(r, s, t, L);
      fillInk(r, B, s.room.shadow, 0.5);
      drawLeftHalfInside(r, s, L);
      drawRightBase(r, s, L);
      pageText(r, s.rowsR, 940, -26, 1430);
      rightPageFinish(r, s, L);
      const a = LIFT_END * tween(t, 1.5, 3.8, ease.inOutSine);
      if (t < 4.8) {
        const mk = tween(t, 3.8, 4.8, ease.inOutCubic);
        // shadow of the lifting page on the page beneath
        if (a > 0.02) {
          const shp = polyPath(
            liftOutline(a, true).map(([x, y]): Pt => [x + 14 * a, y + 8 * a])
          );
          withXf(r, s.room.pageR, null, () => fillInk(r, B, shp, 0.32 * Math.min(1, a * 1.5) * (1 - mk)));
        }
        const pageOut = liftOutline(a);
        let shape: Path2D;
        if (mk <= 0) shape = polyPath(pageOut);
        else {
          const [pa, pb] = morphPair(pageOut, xfPts(BIRD_UNION, B0[0], B0[1], B0S, B0R), 140);
          shape = polyPath(morph(pa, pb, mk));
        }
        knock(r, shape);
        fillInk(r, Y, shape, 0.14 * L);
        if (mk <= 0) {
          const tip = liftPt(1, 0.5, a);
          r.gradient(r.layers[B], shape, { kind: 'linear', x0: 800, y0: 610, x1: tip[0], y1: tip[1], from: 0.02, to: 0.32 * Math.min(1, a) }, 8);
        } else fillInk(r, B, shape, 0.12);
        const td = 1 - mk * 1.7;
        if (td > 0.02) {
          withXf(r, shape, null, () => strokeInk(r, T, liftText(s.rowsLift, a), 2.6, td, [], 'butt'));
        }
        if (mk > 0.55) {
          // creases appear as the fold finishes
          const P = (pts: Pt[]) => xfPts(pts, B0[0], B0[1], B0S, B0R);
          const cr = new Path2D();
          for (const seg2 of [
            [
              [0.4, 0.03],
              [-0.95, -0.38],
            ],
            [
              [0.42, 0.05],
              [1.08, -0.43],
            ],
            [
              [0, 0.02],
              [-0.04, -0.85],
            ],
          ] as Pt[][]) {
            const [p, q] = P(seg2);
            cr.moveTo(p[0], p[1]);
            cr.lineTo(q[0], q[1]);
          }
          withXf(r, shape, null, () => strokeInk(r, B, cr, 1.6 / cam[2] * 1.25, (mk - 0.55) / 0.45));
        }
      }
      drawMotes(r, s, t, L);
      if (t >= 4.8) {
        // the bird, in screen space, heading into the window
        r.camera(800, 450, 1);
        const c48 = roomCam(4.8);
        const S0 = toScreen(B0, c48);
        const s0 = B0S * c48[2];
        const P = (k: number) => bez(S0, [S0[0] + 90, S0[1] - 150], [640, 470], [800, 420], k);
        const kb = tween(t, 4.8, 7.4, ease.inOutSine);
        const p = P(kb);
        const rot = lerp(B0R, tanRot(P, kb, -0.6, 0.6), smooth01(seg(t, 4.8, 5.4)));
        const sz = lerp(s0, 60, kb);
        drawBird(r, p[0], p[1], sz, rot, flapW(t), 0, tween(t, 4.8, 5.2), 1.8);
      }
      return;
    }

    /* ----- scenes 3-4: city of spines, sea of text, the wave ----- */
    if (t < 15.2) {
      const cam = cityCam(t);
      r.camera(cam[0], cam[1], cam[2]);
      if (cam[1] < 1100) drawCity(r, s, t);
      drawSea(r, s, t, { top: 682, bg: 1, amp: 14, refl: 1, xa: -900, xb: 2500, ya: 0, yb: 3000 });
      let birdPts: Pt[] | null = null;
      if (t >= IMPACT_T) {
        const b = cityBird(IMPACT_T);
        const dy = (1800 - 925) * (waveG(IMPACT_T) - waveG(t));
        birdPts = xfPts(BIRD_UNION, b.x, b.y + dy, b.s, b.rot);
      }
      if (t > 10.6) {
        const crestK = tween(t, IMPACT_T, IMPACT_T + 1.05, ease.inOutCubic);
        drawWave(r, s, t, waveG(t), tween(t, 12.6, 15.2, ease.inOutSine), crestK, birdPts, 1);
      }
      if (t < IMPACT_T) {
        const b = cityBird(t);
        drawBird(r, b.x, b.y, b.s, b.rot, flapW(t), 0.5 * tween(t, 9.6, 10.4), 1, 1.8, tween(t, 7.4, 8.2));
      }
      return;
    }

    /* ----- scene 5: out of the page, the wave settles into print, the book closes ----- */
    const L = lampLevel(t);
    const cam = roomCam(t);
    r.camera(cam[0], cam[1], cam[2]);
    const R = s.room;
    drawRoomBase(r, s, t, L);
    fillInk(r, B, R.shadow, 0.5);
    drawRightBase(r, s, L);
    const kb = tween(t, 15.5, 16.9, ease.inOutSine);
    const bg = 1 - tween(t, 15.9, 17.0, ease.inOutSine);
    withXf(r, R.pageR, [1 / 7, 0, 0, 1 / 7, 940 - 800 / 7, 605 - 1250 / 7], () => {
      drawSea(r, s, t, {
        top: 400,
        bg,
        amp: 14 * (1 - tween(t, 15.4, 16.8, ease.inOutSine)),
        refl: 0,
        xa: lerp(-900, -26, kb),
        xb: lerp(2500, 1430, kb),
        ya: lerp(0, 700, kb),
        yb: lerp(3000, 1870, kb),
      });
      drawWave(r, s, t, waveG(t), 1, 1, null, clamp(1 - seg(t, 15.4, 16.3)));
    });
    rightPageFinish(r, s, L, tween(t, 15.6, 17.0));
    // a bird doodled in the margin
    const dk = tween(t, 16.8, 17.4, ease.inOutSine);
    if (dk > 0) {
      const doodle = polyPath(xfPts(BIRD_UNION, 1055, 590, 17, -0.12));
      const len = 330;
      strokeInk(r, B, doodle, 1.5, 1, [len * dk, len]);
      const wv = new Path2D();
      wv.moveTo(1040, 626);
      for (let x = 1040; x <= 1072; x += 2) wv.lineTo(x, 626 + Math.sin((x - 1040) * 0.4) * 2);
      if (dk > 0.6) strokeInk(r, B, wv, 1.4, 1, [60 * (dk - 0.6) / 0.4, 80]);
    }
    // the front cover closes over the last page
    const a = Math.PI * tween(t, 17.4, 18.2, ease.inOutCubic);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (a > 0.01) {
      const shp = new Path2D();
      const off = 34 * sa;
      shp.moveTo(800, 488);
      shp.lineTo(800 - 302 * ca + off, 488 + off * 0.3);
      shp.lineTo(800 - 302 * ca + off, 726 + off * 0.3);
      shp.lineTo(800, 726);
      shp.closePath();
      withXf(r, R.boardR, null, () => fillInk(r, B, shp, 0.4 * sa));
    }
    const m: M6 = [ca, 0.3 * sa, 0, 1, 800 - 800 * ca, -800 * 0.3 * sa];
    withXf(r, null, m, () => {
      if (ca >= 0) drawLeftHalfInside(r, s, L);
      else {
        knock(r, R.boardL);
        fillInk(r, B, R.boardL);
        fillInk(r, T, R.boardL, 0.5);
        const fr = new Path2D();
        fr.rect(514, 504, 270, 206);
        knockStroke(r, fr, 2.5, [T, B]);
        strokeInk(r, Y, fr, 2.5);
      }
    });
    // title on the closed cover
    const tk = tween(t, 18.1, 18.7, ease.outSine);
    if (tk > 0) {
      drawBird(r, 950, 588, 26 * lerp(0.85, 1, tk), -0.12, 1, 0, 1, 1.2);
      const [, lt, lb] = r.layers;
      const ly = r.layers[Y];
      ly.font = `900 23px ${DISPLAY}`;
      lt.font = ly.font;
      lb.font = ly.font;
      for (const c of [lt, lb]) {
        c.save();
        c.globalCompositeOperation = 'destination-out';
        c.globalAlpha = tk;
        c.fillStyle = '#000';
        c.textBaseline = 'middle';
        spacedText(c, 'MARGINALIA', 950, 650, 3);
        c.restore();
      }
      ly.save();
      ly.textBaseline = 'middle';
      ly.fillStyle = r.tone(ly, tk);
      spacedText(ly, 'MARGINALIA', 950, 650, 3);
      ly.restore();
    }
    drawMotes(r, s, t, L);
  },
};
