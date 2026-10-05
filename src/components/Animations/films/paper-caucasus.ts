import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import { DISPLAY, TAU, clamp, ease, hash, lerp, mulberry, seg, tween, type Pt } from '../riso/kit';
import {
  bakePlate,
  blendPose,
  blobPts,
  castShadow,
  clipRect,
  cutPath,
  cutRidge,
  dogArt,
  drawPlate,
  keys,
  layerView,
  limb,
  lope,
  makeCraft,
  makeStamp,
  mix,
  part,
  personArt,
  pinePts,
  roundTree,
  sheet,
  stampDraw,
  tornRidge,
  viewRect,
  warmLight,
  STAND,
  type Craft,
  type DogLook,
  type PersonLook,
  type Plate,
  type Stamp,
  type View,
} from '../styles/papercut';

/**
 * Caucasus: a cut-paper descent from the peaks to the Caspian.
 * Motif: a pomegranate seed. One seed in a split fruit on a carpet becomes the red sun over the
 * Caucasus; it ripens again on the village trees and sits at the heart of a carpet drying on a
 * balcony; at the end it hangs over the Caspian while a carpet border and medallion close
 * around it.
 */

const DURATION = 19;
const T_SWAP = 3.5;
const T_PEAKS = T_SWAP;
const T_VILLAGE = 7.4;
const T_PASTURE = 11;
const T_SEA = 14.6;
const T_FRAME = 15.9;

const P = {
  carpet: '#9c2230',
  carpetDeep: '#7c1a26',
  indigo: '#2d3b66',
  cream: '#efe1c3',
  gold: '#d6a548',
  seed: '#d43c45',
  seedDeep: '#b02536',
  seedLit: '#f49aa0',
  skin: '#8e1e2a',
  blush: '#bf3a3d',
  pith: '#f1dcb6',
  crown: '#6d1821',
  leaf: '#5f7d45',
  skyTop: '#f2d7bb',
  skyLow: '#f6e3c4',
  skyEve: '#f0c6a0',
  sun: '#d43c45',
  sunHalo: '#f2b08a',
  peakA: '#8a97bd',
  snow: '#f8f4ea',
  peakB: '#6c7fa5',
  forestC: '#5b7a5b',
  hillD: '#93a560',
  hillDk: '#7a8f4f',
  stoneA: '#c9b597',
  stoneB: '#b39b7b',
  stoneC: '#a1896b',
  roof: '#6b5747',
  window: '#3f3029',
  wood: '#7a5233',
  ground: '#9fae62',
  groundDk: '#879a52',
  sand: '#e2cd9c',
  sea1: '#79b8c3',
  sea2: '#4b95ac',
  sea3: '#2f7590',
  foam: '#f6f2e8',
  fore: '#3f5d3a',
  wool: '#efe7d6',
  woolDk: '#d8ccb4',
  face: '#3b302b',
};

const SHEPHERD: PersonLook = {
  skin: '#d9a684',
  hat: '#4a3a2f',
  hatKind: 'papakha',
  coat: '#6e4d3a',
  coatShade: '#563b2c',
  coatLong: true,
  pants: '#3a3330',
  pantsShade: '#2c2624',
  boots: '#2e2420',
  staff: '#8a6a45',
};

const SHEEPDOG: DogLook = {
  coat: '#e6d9c2',
  shade: '#c9b99d',
  pale: '#f8f1e3',
  ear: '#b7a184',
  nose: '#2b1d16',
};

/* ---------- world ---------- */

const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

const SHORE = 3240;

/** Terraced village, the pasture, then the beach */
const groundY = (x: number) => {
  const step = 250;
  const f = (x + 500) / step;
  const i = Math.floor(f);
  const terr = 50 * (i + smoothstep(0.86, 1, f - i));
  let y = 455 + terr + 6 * Math.sin(x / 70);
  const v = smoothstep(1350, 1600, x);
  const pasture = 700 + 120 * smoothstep(1600, 3100, x) + 14 * Math.sin(x / 160);
  y = lerp(y, pasture, v);
  y = lerp(y, 832, smoothstep(3000, SHORE - 160, x));
  y += 260 * smoothstep(SHORE - 120, SHORE + 380, x);
  return y;
};

/* ---------- camera ---------- */

function camera(t: number): View {
  const x = keys(t, [[T_SWAP, 640], [5.2, 680], [T_VILLAGE, 760], [T_PASTURE, 1660], [T_SEA, 2560], [T_FRAME, 3390], [DURATION, 3420]], ease.inOutSine);
  const y = keys(t, [[T_SWAP, -260], [5.0, -230], [T_VILLAGE, 330], [T_PASTURE, 420], [T_SEA, 520], [T_FRAME, 470], [DURATION, 470]], ease.inOutSine);
  const z = keys(t, [[T_SWAP, 1], [T_SEA, 1], [T_FRAME, 0.92], [DURATION, 0.95]], ease.inOutSine);
  return { x, y, z };
}

/** Lens zoom about a screen point, applied on top of a layer's camera */
const lensCam = (r: Riso, v: View, Z: number, px: number, py: number) => {
  const wx = v.x + (px - 800) / v.z;
  const wy = v.y + (py - 450) / v.z;
  r.camera(wx + (v.x - wx) / Z, wy + (v.y - wy) / Z, v.z * Z);
};

/** Sun at rest in screen space */
const sunAt = (t: number) => ({
  x: keys(t, [[T_SWAP, 1180], [T_VILLAGE, 1190], [T_PASTURE, 1230], [T_SEA, 1060], [T_FRAME + 0.8, 880], [DURATION, 880]], ease.inOutSine),
  y: keys(t, [[T_SWAP, 235], [T_VILLAGE, 210], [T_PASTURE, 200], [T_SEA, 290], [T_FRAME + 0.8, 345], [DURATION, 350]], ease.inOutSine),
  r: keys(t, [[T_SWAP, 78], [T_SEA, 74], [T_FRAME + 0.8, 82]], ease.inOutSine),
});

/** Pull-out from the sun after the swap */
const sunZoom = (t: number) => (t < T_SWAP ? 1 : Math.exp(Math.log(26) * (1 - ease.outCubic(seg(t, T_SWAP, 5.4)))));

/* ---------- opening: the split pomegranate on a carpet ---------- */

interface Seed {
  x: number;
  y: number;
  r: number;
  a: number;
  deep: boolean;
}

const seedPts = (s: Seed): Pt[] => blobPts(s.x, s.y, s.r, s.r * 0.86, s.x * 0.37 + s.y, 0.16, 9, s.a);

const TARGET: Pt = [842, 470];

const buildOpening = (r: Riso, k: Craft, rng: () => number) => {
  const sheets: { path: Path2D; color: string; depth: number; edge?: number; seed: number; tex?: number }[] = [];
  const add = (path: Path2D, color: string, depth: number, seed: number, edge = 0.5, tex = 0.85) => sheets.push({ path, color, depth, edge, seed, tex });
  // Carpet field and appliqué pattern
  const field = new Path2D();
  field.rect(-400, -300, 2400, 1500);
  add(field, P.carpet, 0, 1, 0);
  const band = (y0: number, y1: number, color: string, seed: number, depth = 4) => {
    const p = new Path2D();
    cutPath([[-60, y0], [1660, y0 + 2], [1660, y1], [-60, y1 - 1]], 1.4, seed, 14, p);
    add(p, color, depth, seed);
  };
  band(-40, 150, P.indigo, 2);
  band(150, 164, P.gold, 3, 2);
  // Running-wave zigzag on the border
  const zig = new Path2D();
  for (let x = -40; x < 1660; x += 60) {
    cutPath([[x, 112], [x + 30, 62], [x + 60, 112], [x + 48, 112], [x + 30, 84], [x + 12, 112]], 0.7, x, 6, zig);
  }
  add(zig, P.cream, 2, 4);
  const dots = new Path2D();
  for (let x = -10; x < 1660; x += 60) cutPath(blobPts(x, 40, 9, 9, x, 0.08, 4, Math.PI / 4), 0.6, x + 1, 5, dots);
  add(dots, P.carpet, 2, 5);
  // Medallion: two squares make the eight-point star, cream outline under indigo
  const star = (cx: number, cy: number, rad: number, p: Path2D = new Path2D()) => {
    for (const rot of [0, Math.PI / 4]) {
      const pts: Pt[] = [0, 1, 2, 3].map((i) => [cx + Math.cos(rot + i * (TAU / 4)) * rad, cy + Math.sin(rot + i * (TAU / 4)) * rad]);
      cutPath(pts, 1.2, rad + rot * 10 + cx, 10, p);
    }
    return p;
  };
  add(star(330, 560, 300), P.cream, 6, 6);
  add(star(330, 560, 282), P.indigo, 3, 7);
  add(star(330, 560, 170), P.gold, 3, 8);
  add(cutPath(blobPts(330, 560, 105, 105, 9, 0.02, 4, Math.PI / 4), 1, 9), P.carpet, 3, 9);
  const motifs = new Path2D();
  for (const [x, y] of [[1480, 300], [1100, 860], [620, 260], [1560, 600], [80, 230]] as Pt[]) {
    cutPath(blobPts(x, y, 26, 26, x, 0.04, 4, Math.PI / 4), 0.8, x + y, 6, motifs);
  }
  add(motifs, P.cream, 3, 10);

  // A leaf under the whole fruit
  const leaf = (x: number, y: number, a: number, len: number, seed: number) => {
    const p = new Path2D();
    const pts: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      pts.push([u * len, Math.sin(u * Math.PI) * len * 0.22]);
    }
    for (let i = 11; i >= 1; i--) {
      const u = i / 12;
      pts.push([u * len, -Math.sin(u * Math.PI) * len * 0.22]);
    }
    cutPath(pts.map(([px, py]) => [x + px * Math.cos(a) - py * Math.sin(a), y + px * Math.sin(a) + py * Math.cos(a)] as Pt), 0.8, seed, 6, p);
    add(p, P.leaf, 5, seed);
  };
  leaf(1180, 640, -2.4, 150, 20);
  leaf(1360, 860, -0.6, 130, 21);

  // The whole fruit, crown up
  const W: Pt = [1330, 730];
  add(cutPath(blobPts(W[0], W[1], 128, 122, 30, 0.05, 48), 1.2, 30), P.skin, 12, 30);
  add(cutPath(blobPts(W[0] - 22, W[1] - 26, 84, 72, 31, 0.08, 36, -0.5), 1, 31), P.blush, 2, 31);
  const crown = new Path2D();
  const cpts: Pt[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const rr = i % 2 ? 14 : 34;
    cpts.push([W[0] + 20 + Math.cos(a) * rr, W[1] - 30 + Math.sin(a) * rr]);
  }
  cutPath(cpts, 0.8, 32, 5, crown);
  add(crown, P.crown, 4, 32);

  // The other half, face down: just its skin and a little blush
  const B: Pt = [1290, 330];
  add(cutPath(blobPts(B[0], B[1], 142, 128, 40, 0.05, 48, 0.4), 1.2, 40), P.skin, 12, 40);
  add(cutPath(blobPts(B[0] - 30, B[1] - 26, 92, 70, 41, 0.08, 36, 0.2), 1, 41), P.blush, 2, 41);
  add(cutPath(blobPts(B[0] - 58, B[1] - 50, 30, 16, 42, 0.1, 20, -0.5), 0.8, 42), '#d9645c', 1, 42, 0.3);

  // The open half: skin, pith ring, chambers of seeds
  const A: Pt = [820, 500];
  const RA = 178;
  add(cutPath(blobPts(A[0], A[1], RA, RA * 0.96, 50, 0.04, 64), 1.2, 50), P.skin, 14, 50);
  add(cutPath(blobPts(A[0], A[1], RA - 16, RA * 0.96 - 16, 51, 0.04, 64), 1, 51), P.pith, 2, 51, 0.3);
  const seeds: Seed[] = [];
  const walls = [0.3, 1.25, 2.2, 3.1, 4.1, 5.15];
  for (let ring = 0; ring < 7; ring++) {
    const rr = 26 + ring * 19;
    const n = Math.floor((TAU * rr) / 21);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ring * 0.37;
      // Leave the pith membranes between chambers
      let near = false;
      for (const w of walls) {
        const d = Math.abs(((a - w + Math.PI * 3) % TAU) - Math.PI);
        if (d * rr < 9) near = true;
      }
      if (near || rr > RA - 30) continue;
      seeds.push({ x: A[0] + Math.cos(a) * rr + (rng() - 0.5) * 3, y: A[1] + Math.sin(a) * rr * 0.96 + (rng() - 0.5) * 3, r: 10.5 + rng() * 2, a: a + rng(), deep: rng() < 0.4 });
    }
  }
  // Loose seeds on the carpet
  for (const [x, y] of [[1035, 640], [1060, 610], [600, 700], [1005, 300], [640, 330]] as Pt[]) seeds.push({ x, y, r: 12, a: x, deep: x > 1000 });
  // The dive target: the seed nearest the centre of the frame
  let ti = 0;
  let best = Infinity;
  seeds.forEach((s, i) => {
    const d = Math.hypot(s.x - TARGET[0], s.y - TARGET[1]);
    if (d < best) {
      best = d;
      ti = i;
    }
  });
  const target = seeds[ti];
  const deep = new Path2D();
  const light = new Path2D();
  const lit = new Path2D();
  seeds.forEach((s, i) => {
    if (i === ti) return;
    cutPath(seedPts(s), 0.4, i, 4, s.deep ? deep : light);
    lit.moveTo(s.x - s.r * 0.32 + s.r * 0.26 * Math.cos(-0.6), s.y - s.r * 0.34 + s.r * 0.26 * Math.sin(-0.6));
    lit.ellipse(s.x - s.r * 0.32, s.y - s.r * 0.34, s.r * 0.26, s.r * 0.18, -0.6, 0, TAU);
  });
  add(deep, P.seedDeep, 3, 60, 0.4);
  add(light, P.seed, 3, 61, 0.5);
  add(lit, P.seedLit, 0, 62, 0, 0.3);

  const plate = bakePlate(r, 1, { x: -120, y: -80, w: 1840, h: 1060 }, (g) => {
    for (const s of sheets) sheet(g, k, s.path, s.color, { depth: s.depth, edge: s.edge, seed: s.seed, tex: s.tex });
  });
  return { plate, sheets, target, targetPath: cutPath(seedPts(target), 0.4, 999, 4) };
};

/* ---------- sheep ---------- */

const sheepArt = (g: Ctx, ph: number, seed: number, graze: number) => {
  const legs = new Path2D();
  const q = ph * TAU;
  const bob = Math.abs(Math.sin(q)) * 2;
  const legAt = (x: number, off: number) => {
    const a = 0.32 * Math.sin(q + off);
    limb([x, -26], [x + Math.sin(a) * 26, -26 + Math.cos(a) * 26], 6, 5, legs);
  };
  legAt(-24, Math.PI);
  legAt(22, 0);
  part(g, legs, '#2f2622');
  const legs2 = new Path2D();
  const a1 = 0.32 * Math.sin(q);
  const a2 = 0.32 * Math.sin(q + Math.PI);
  limb([-18, -26], [-18 + Math.sin(a1) * 26, Math.cos(a1) * 26 - 26], 6.5, 5.5, legs2);
  limb([28, -26], [28 + Math.sin(a2) * 26, Math.cos(a2) * 26 - 26], 6.5, 5.5, legs2);
  // Woolly body: a scalloped cloud
  const body = new Path2D();
  const pts: Pt[] = [];
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const lobe = 1 + 0.07 * Math.abs(Math.sin(a * 6 + seed));
    pts.push([2 + Math.cos(a) * 44 * lobe, -46 - bob + Math.sin(a) * 26 * lobe]);
  }
  cutPath(pts, 0.6, seed, 5, body);
  part(g, body, P.woolDk, 1, 0.25);
  const top = new Path2D();
  cutPath(pts.map(([x, y]) => [x * 0.86 - 2, y * 0.82 - 10] as Pt), 0.6, seed + 1, 5, top);
  part(g, top, P.wool, 0.6, 0.15);
  part(g, legs2, P.face, 1, 0.2);
  // Head: down to graze or up to walk
  const hx = 46;
  const hy = -50 + graze * 22 - bob;
  const head = new Path2D();
  head.ellipse(hx, hy, 15, 10, 0.5 + graze * 0.6, 0, TAU);
  part(g, head, P.face, 0.8, 0.25);
  const ear = new Path2D();
  ear.ellipse(hx - 9, hy - 7, 8, 3.5, -0.5, 0, TAU);
  part(g, ear, P.face);
  const tuft = new Path2D();
  tuft.arc(hx - 10, hy - 4, 8, 0, TAU);
  part(g, tuft, P.wool, 0.5, 0.15);
};

/* ---------- village houses ---------- */

const house = (
  out: { path: Path2D; color: string; depth: number; seed: number }[],
  x: number,
  base: number,
  w: number,
  h: number,
  seed: number,
  stone: string,
  balcony = false
) => {
  const wall = new Path2D();
  cutPath([[x, base + 30], [x, base - h], [x + w, base - h], [x + w, base + 30]], 1, seed, 9, wall);
  out.push({ path: wall, color: stone, depth: 6, seed });
  // Coursed stone: a few lighter cut stones laid on the wall
  const stones = new Path2D();
  for (let row = 0; row < Math.floor(h / 18); row++) {
    const y = base - 10 - row * 18;
    for (let sx = x + 6 + (row % 2) * 12; sx < x + w - 20; sx += 26 + hash(seed + row + sx) * 14) {
      if (hash(seed * 3 + row * 7 + sx) < 0.55) continue;
      cutPath([[sx, y - 7], [sx + 18, y - 8], [sx + 19, y + 3], [sx + 1, y + 4]], 0.5, sx + row, 4, stones);
    }
  }
  out.push({ path: stones, color: mix(stone, '#f4e8d0', 0.35), depth: 1, seed: seed + 1 });
  const roof = new Path2D();
  cutPath([[x - 8, base - h - 12], [x + w + 8, base - h - 13], [x + w + 6, base - h + 2], [x - 6, base - h + 2]], 0.8, seed + 2, 7, roof);
  out.push({ path: roof, color: P.roof, depth: 4, seed: seed + 2 });
  const win = new Path2D();
  const nw = w > 120 ? 2 : 1;
  for (let i = 0; i < nw; i++) {
    const wx = x + (w / (nw + 1)) * (i + 1) - 10;
    cutPath([[wx, base - h + 22], [wx + 20, base - h + 22], [wx + 20, base - h + 50], [wx, base - h + 50]], 0.5, seed + 3 + i, 5, win);
  }
  out.push({ path: win, color: P.window, depth: 1.5, seed: seed + 3 });
  const frame = new Path2D();
  for (let i = 0; i < nw; i++) {
    const wx = x + (w / (nw + 1)) * (i + 1) - 10;
    cutPath([[wx - 4, base - h + 50], [wx + 24, base - h + 50], [wx + 24, base - h + 56], [wx - 4, base - h + 56]], 0.4, seed + 9 + i, 5, frame);
  }
  if (!balcony) {
    cutPath([[x + w * 0.62, base], [x + w * 0.62, base - 44], [x + w * 0.62 + 24, base - 46], [x + w * 0.62 + 24, base]], 0.5, seed + 6, 5, frame);
  }
  out.push({ path: frame, color: P.wood, depth: 2, seed: seed + 6 });
};

/* ---------- state ---------- */

interface LiveSheet {
  path: Path2D;
  color: string;
  depth: number;
  seed: number;
  edge?: number;
  tex?: number;
  shade?: [number, number];
}

interface State {
  k: Craft;
  far: { p: number; sheets: LiveSheet[] }[];
  open: Plate;
  openSheets: LiveSheet[];
  target: { x: number; y: number; r: number };
  targetPath: Path2D;
  sky: Plate[];
  plates: Plate[];
  ground: Plate;
  fore: Plate;
  person: Stamp;
  sheep: Stamp;
  dog: Stamp;
  fruits: { x: number; y: number; r: number; p: number }[];
  chimneys: Pt[];
  sunCut: Pt[];
  frames: { plate: Plate; from: Pt }[];
  medallion: Plate[];
}

const camAt = (lx: number, p: number) => 800 + (lx - 800) / p;

const build = (r: Riso): State => {
  const k = makeCraft(r, 57);
  const rng = mulberry(29);
  const res = Math.max(1.6, r.scale * 1.6);
  const open = buildOpening(r, k, rng);

  const views: View[] = [];
  for (let t = T_SWAP; t <= DURATION; t += 0.05) views.push(camera(t));

  /* sky, two times of day */
  const bands: Path2D[] = [];
  [-40, 180, 340, 480].forEach((y, i) => bands.push(cutRidge((x) => y + 12 * Math.sin(x / 200 + i * 2.1) + 7 * Math.sin(x / 63 + i), -60, 1660, 1000, 70 + i, 1.4, 12)));
  const skyPlate = (top: string, low: string) =>
    bakePlate(r, 0, { x: 0, y: 0, w: 1600, h: 900 }, (g) => {
      g.fillStyle = top;
      g.fillRect(0, 0, 1600, 900);
      bands.forEach((b, i) => sheet(g, k, b, mix(top, low, (i + 1) / bands.length), { depth: 4, edge: 0.4, seed: 70 + i, tex: 0.7 }));
    }, 1);
  const sky = [skyPlate(P.skyTop, P.skyLow), skyPlate(P.skyEve, '#f6dcb4')];

  type Def = LiveSheet;
  const layers: { p: number; top: number; sheets: Def[]; haze?: boolean }[] = [];
  const X0 = -1500;
  const X1 = 4600;
  const BOTTOM = 3000;
  // Far ranges taper down to the Caspian horizon on the east (right) side of each sheet
  const eastA = (x: number) => smoothstep(650, 1250, x);
  const eastB = (x: number) => smoothstep(1100, 1800, x);
  const eastC = (x: number) => smoothstep(1500, 2100, x);

  // A: the high Caucasus, jagged and snowy
  {
    const p = 0.07;
    const y = (x: number) => {
      const peaks = 420 - 290 * Math.pow(1 - Math.abs(Math.sin(x / 190 + 0.3)), 1.5) - 70 * Math.pow(1 - Math.abs(Math.sin(x / 61 + 1)), 2) - 12 * Math.sin(x / 23);
      return lerp(peaks, 616, eastA(x));
    };
    const snowLine = (x: number) => 315 + 22 * Math.sin(x / 19) + 16 * Math.sin(x / 47);
    const caps: Pt[] = [];
    for (let x = X0; x <= X1; x += 5) caps.push([x, Math.min(y(x), snowLine(x))]);
    for (let x = X1; x >= X0; x -= 5) caps.push([x, snowLine(x) + 0.01]);
    layers.push({
      p,
      top: 80,
      sheets: [
        { path: tornRidge(y, X0, X1, BOTTOM, 4, 3), color: P.snow, depth: 3, seed: 3, edge: 0, tex: 0.5 },
        { path: cutRidge(y, X0, X1, BOTTOM, 4, 1.4, 6), color: P.peakA, depth: 3, seed: 4, edge: 0.6, shade: [150, 650] },
        { path: cutPath(caps, 1, 5, 5), color: P.snow, depth: 2, seed: 5, edge: 0.5 },
      ],
    });
  }
  const vellum = (p: number, y0: number, seed: number, a: number) =>
    layers.push({ p, top: y0 - 40, haze: true, sheets: [{ path: cutRidge((x) => y0 + 14 * Math.sin(x / 210 + seed) + 6 * Math.sin(x / 77), X0, X1, BOTTOM, seed, 1.2), color: `rgba(250,244,232,${a})`, depth: 0, seed, edge: 0.3, tex: 0.5 }] });
  vellum(0.1, 470, 81, 0.24);
  // Far sea: appears where the mountains have gone down
  {
    const p = 0.12;
    const sea = new Path2D();
    const pts: Pt[] = [];
    for (let x = X0; x <= X1; x += 12) pts.push([x, 612 + 1.5 * Math.sin(x / 40)]);
    pts.push([X1, BOTTOM], [X0, BOTTOM]);
    cutPath(pts, 0.8, 85, 10, sea);
    layers.push({ p, top: 560, sheets: [{ path: sea, color: P.sea1, depth: 2, seed: 85, edge: 0.7 }] });
  }
  // B: blue middle ranges with snow on top
  {
    const p = 0.18;
    const y = (x: number) => lerp(500 - 180 * Math.pow(1 - Math.abs(Math.sin(x / 240 + 1.9)), 1.5) - 40 * Math.pow(1 - Math.abs(Math.sin(x / 71)), 2), 640, eastB(x));
    const snowLine = (x: number) => 400 + 12 * Math.sin(x / 23);
    const caps: Pt[] = [];
    for (let x = X0; x <= X1; x += 6) caps.push([x, Math.min(y(x), snowLine(x))]);
    for (let x = X1; x >= X0; x -= 6) caps.push([x, snowLine(x) + 0.01]);
    layers.push({
      p,
      top: 320,
      sheets: [
        { path: cutRidge(y, X0, X1, BOTTOM, 6, 1.5), color: P.peakB, depth: 5, seed: 6, edge: 0.6, shade: [330, 800] },
        { path: cutPath(caps, 1, 7, 6), color: P.snow, depth: 2, seed: 7, edge: 0.4 },
      ],
    });
  }
  vellum(0.24, 540, 83, 0.2);
  // C: forested foothills
  {
    const p = 0.34;
    const y = (x: number) => lerp(560 - 70 * Math.sin(x / 240 + 0.8) - 22 * Math.sin(x / 77), 720, eastC(x));
    const trees = new Path2D();
    for (let x = X0 + 10; x < X1; x += 13 + rng() * 18) {
      if (eastC(x) > 0.6 || rng() < 0.25) continue;
      const h = 26 + rng() * 26;
      cutPath(pinePts(x, y(x) + 8, h, h * 0.45, x, 4), 0.6, x, 5, trees);
    }
    layers.push({
      p,
      top: 420,
      sheets: [
        { path: trees, color: P.forestC, depth: 4, seed: 8, edge: 0.4 },
        { path: cutRidge(y, X0, X1, BOTTOM, 9, 1.4), color: P.forestC, depth: 6, seed: 9, edge: 0.5, shade: [480, 900] },
      ],
    });
  }
  // Mid sea
  {
    const p = 0.45;
    const pts: Pt[] = [];
    for (let x = X0; x <= X1; x += 12) pts.push([x, 668 + 2 * Math.sin(x / 50)]);
    pts.push([X1, BOTTOM], [X0, BOTTOM]);
    layers.push({ p, top: 640, sheets: [{ path: cutPath(pts, 0.8, 86, 10), color: P.sea2, depth: 4, seed: 86, edge: 0.7 }] });
  }
  // D: the village hillside, houses stacked up its face
  {
    const p = 0.72;
    const y = (x: number) => {
      const c = camAt(x, p);
      const hill = 330 + 0.3 * Math.max(0, c - 300) + 10 * Math.sin(x / 90);
      return lerp(Math.min(700, hill), 900, smoothstep(2400, 3000, c));
    };
    const defs: Def[] = [];
    const trees = new Path2D();
    for (let x = X0; x < X1; x += 40 + rng() * 60) {
      const c = camAt(x, p);
      if (c > 2600 || rng() < 0.4) continue;
      const h = 50 + rng() * 40;
      roundTree(trees, x, y(x) + 10, h, h * 0.7, x * 0.2);
    }
    defs.push({ path: trees, color: P.hillDk, depth: 5, seed: 10, edge: 0.4 });
    defs.push({ path: cutRidge(y, X0, X1, BOTTOM, 11, 1.4), color: P.hillD, depth: 7, seed: 11, edge: 0.6, shade: [300, 900] });
    // Houses in rows: each row sits a little lower and in front of the one above
    const hs: { path: Path2D; color: string; depth: number; seed: number }[] = [];
    const stonesC = [P.stoneA, P.stoneB, P.stoneC];
    for (let row = 0; row < 3; row++) {
      for (let x = X0; x < X1; x += 64 + rng() * 50) {
        const c = camAt(x, p);
        if (c < 300 || c > 1850) continue;
        const w = 70 + rng() * 50;
        const hh = 50 + rng() * 26;
        const base = y(x + w / 2) + 30 + row * 46;
        if (rng() < 0.2) continue;
        house(hs, x + row * 22, base, w, hh, Math.floor(x * 3 + row * 101), stonesC[Math.floor(rng() * 3)]);
      }
    }
    for (const h of hs) defs.push({ ...h, edge: 0.5 });
    layers.push({ p, top: 250, sheets: defs });
  }
  // Near sea, behind the beach
  {
    const p = 0.86;
    const pts: Pt[] = [];
    const sy = (x: number) => 790 + 3 * Math.sin(x / 60);
    for (let x = X0; x <= X1; x += 12) pts.push([x, sy(x)]);
    pts.push([X1, BOTTOM], [X0, BOTTOM]);
    const foam = tornRidge(sy, X0, X1, BOTTOM, 4, 87);
    layers.push({
      p,
      top: 720,
      sheets: [
        { path: foam, color: P.foam, depth: 3, seed: 87, edge: 0, tex: 0.4 },
        { path: cutPath(pts, 0.8, 88, 10), color: P.sea3, depth: 5, seed: 88, edge: 0.7 },
      ],
    });
  }

  // Fold each vellum sheet into the plate of the layer just in front (they barely part)
  const baked = layers.filter((L, i) => {
    const N = layers[i + 1];
    if (!L.haze || !N) return true;
    N.sheets = [...L.sheets, ...N.sheets];
    N.top = Math.min(N.top, L.top);
    return false;
  });
  const plates = baked.map((L) =>
    bakePlate(r, L.p, clipRect(viewRect(views, L.p), { x: -1e4, y: L.top - 30, w: 2e4, h: 2e4 }), (g) => {
      for (const s of L.sheets) sheet(g, k, s.path, s.color, { depth: s.depth, edge: s.edge ?? 0.5, seed: s.seed, tex: s.tex ?? 0.85, shade: s.shade });
    }, L.p < 0.3 ? 1 : 1.25)
  );

  /* ground plane: terraces, front houses, the pasture, the beach */
  const gd: Def[] = [];
  gd.push({ path: cutRidge(groundY, -900, SHORE + 200, BOTTOM, 21, 1.3, 7), color: P.ground, depth: 10, seed: 21, edge: 0.6, shade: [380, 950] });
  // Stone retaining walls on the terrace steps
  const walls = new Path2D();
  for (let i = -1; i < 8; i++) {
    const x = -500 + 250 * (i + 1) - 30;
    if (x > 1450) break;
    const yTop = groundY(x - 20);
    const yBot = groundY(x + 50);
    for (let row = 0; row * 14 < yBot - yTop + 30; row++) {
      for (let j = 0; j < 4; j++) {
        const sx = x - 30 + j * 22 + (row % 2) * 10;
        const sy = yTop + 4 + row * 14;
        cutPath([[sx, sy], [sx + 19, sy - 1], [sx + 20, sy + 11], [sx, sy + 12]], 0.6, sx + row * 13, 4, walls);
      }
    }
  }
  gd.push({ path: walls, color: P.stoneB, depth: 2, seed: 22, edge: 0.6 });
  const sand = new Path2D();
  {
    const pts: Pt[] = [];
    for (let x = 2900; x <= SHORE + 200; x += 10) pts.push([x, groundY(x) + 2]);
    pts.push([SHORE + 200, BOTTOM], [2900, BOTTOM]);
    cutPath(pts, 1, 23, 9, sand);
  }
  gd.push({ path: sand, color: P.sand, depth: 3, seed: 23, edge: 0.6 });
  const tufts = new Path2D();
  for (let x = 1450; x < 3000; x += 24 + rng() * 40) {
    const y = groundY(x) + 2;
    for (let j = 0; j < 3; j++) cutPath([[x + j * 5 - 3, y + 4], [x + j * 5 + (j - 1) * 4, y - 9 - rng() * 8], [x + j * 5 + 3, y + 4]], 0.4, x + j, 4, tufts);
  }
  gd.push({ path: tufts, color: P.groundDk, depth: 2, seed: 24, edge: 0.3 });
  // Front houses
  const front: { path: Path2D; color: string; depth: number; seed: number }[] = [];
  const chimneys: Pt[] = [];
  const fh: [number, number, number, string, boolean][] = [
    [160, 170, 128, P.stoneA, false],
    [620, 190, 140, P.stoneC, true],
    [1080, 160, 120, P.stoneB, false],
  ];
  for (const [x, w, h, col, bal] of fh) {
    const base = groundY(x + w / 2) + 4;
    house(front, x, base, w, h, x + 7, col, bal);
    chimneys.push([x + w * 0.22, base - h - 12]);
    const ch = new Path2D();
    cutPath([[x + w * 0.22 - 9, base - h - 8], [x + w * 0.22 - 9, base - h - 30], [x + w * 0.22 + 9, base - h - 30], [x + w * 0.22 + 9, base - h - 8]], 0.5, x + 3, 5, ch);
    front.push({ path: ch, color: col, depth: 3, seed: x + 3 });
    if (bal) {
      // Wooden balcony with a carpet drying over the rail
      const bal2 = new Path2D();
      const by = base - h * 0.48;
      cutPath([[x - 40, by], [x + w + 30, by], [x + w + 30, by + 8], [x - 40, by + 8]], 0.6, x + 11, 6, bal2);
      for (let px = x - 34; px < x + w + 30; px += 34) cutPath([[px, by + 6], [px + 7, by + 6], [px + 7, base + 10], [px, base + 10]], 0.5, px, 5, bal2);
      cutPath([[x - 40, by - 46], [x + w + 30, by - 46], [x + w + 30, by - 40], [x - 40, by - 40]], 0.6, x + 12, 6, bal2);
      for (let px = x - 34; px < x + w + 30; px += 17) cutPath([[px, by - 42], [px + 4, by - 42], [px + 4, by], [px, by]], 0.3, px + 1, 5, bal2);
      front.push({ path: bal2, color: P.wood, depth: 4, seed: x + 11 });
      const cx = x + 8;
      const cy = by - 46;
      const cw = 118;
      const chh = 150;
      const rug = new Path2D();
      cutPath([[cx, cy - 4], [cx + cw, cy - 4], [cx + cw + 2, cy + chh], [cx - 1, cy + chh + 2]], 0.8, x + 13, 7, rug);
      front.push({ path: rug, color: P.indigo, depth: 6, seed: x + 13 });
      const fieldR = new Path2D();
      cutPath([[cx + 12, cy + 10], [cx + cw - 12, cy + 10], [cx + cw - 11, cy + chh - 12], [cx + 11, cy + chh - 11]], 0.6, x + 14, 6, fieldR);
      front.push({ path: fieldR, color: P.carpet, depth: 2, seed: x + 14 });
      const med = new Path2D();
      const mx = cx + cw / 2;
      const my = cy + chh / 2 + 2;
      cutPath([[mx, my - 44], [mx + 34, my], [mx, my + 44], [mx - 34, my]], 0.6, x + 15, 5, med);
      front.push({ path: med, color: P.cream, depth: 2, seed: x + 15 });
      const med2 = new Path2D();
      cutPath([[mx, my - 34], [mx + 26, my], [mx, my + 34], [mx - 26, my]], 0.5, x + 16, 5, med2);
      front.push({ path: med2, color: P.indigo, depth: 1, seed: x + 16 });
      const seedC = new Path2D();
      cutPath(blobPts(mx, my, 10, 9, 17, 0.1, 10), 0.4, x + 17, 4, seedC);
      front.push({ path: seedC, color: P.seed, depth: 1.5, seed: x + 17 });
      const fringe = new Path2D();
      for (let fx = cx + 4; fx < cx + cw; fx += 8) cutPath([[fx, cy + chh], [fx + 3, cy + chh], [fx + 3, cy + chh + 12], [fx, cy + chh + 12]], 0.3, fx, 4, fringe);
      front.push({ path: fringe, color: P.cream, depth: 1, seed: x + 18 });
    }
  }
  for (const h of front) gd.push({ ...h, edge: 0.55 });
  const ground = bakePlate(r, 1, clipRect(viewRect(views, 1), { x: -1e4, y: 180, w: 2e4, h: 2e4 }), (g) => {
    for (const s of gd) sheet(g, k, s.path, s.color, { depth: s.depth, edge: s.edge ?? 0.5, seed: s.seed, tex: s.tex ?? 0.85, shade: s.shade });
  });

  /* foreground: pomegranate trees and low shrubs; fruits are live so they can sway */
  const foreP = 1.28;
  const fd: Def[] = [];
  const fruits: State['fruits'] = [];
  const trunk = new Path2D();
  const crowns = new Path2D();
  const crownsDk = new Path2D();
  const treeAt = (cxw: number, offset: number, h: number) => {
    const lx = 800 + (cxw - 800) * foreP + offset;
    const base = 1010 + 0.45 * (groundY(cxw) - 600);
    cutPath([[lx - 14, base + 80], [lx - 8, base - h * 0.45], [lx - 40, base - h * 0.7], [lx - 30, base - h * 0.72], [lx + 2, base - h * 0.52], [lx + 30, base - h * 0.75], [lx + 40, base - h * 0.72], [lx + 10, base - h * 0.45], [lx + 14, base + 80]], 1, cxw, 8, trunk);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const bx = lx + Math.cos(a) * h * 0.32 + (hash(cxw + i) - 0.5) * 30;
      const by = base - h * 0.82 + Math.sin(a) * h * 0.2;
      cutPath(blobPts(bx, by, h * 0.2, h * 0.15, cxw + i, 0.12, 22, a), 1, cxw + i, 7, i % 3 ? crowns : crownsDk);
    }
    for (let i = 0; i < 11; i++) {
      const a = hash(cxw * 2 + i) * TAU;
      const d = Math.sqrt(hash(cxw * 3 + i)) * h * 0.38;
      fruits.push({ x: lx + Math.cos(a) * d * 1.2, y: base - h * 0.8 + Math.sin(a) * d * 0.6 + 14, r: 13 + hash(i + cxw) * 6, p: hash(i * 5 + cxw) * TAU });
    }
  };
  treeAt(980, 140, 360);
  treeAt(1520, 40, 330);
  treeAt(2380, 260, 300);
  const shrubs = new Path2D();
  for (let x = -1200; x < 5200; x += 50 + rng() * 80) {
    const base = 1010 + 0.45 * (groundY(camAt(x, foreP)) - 600);
    cutPath(blobPts(x, base, 50 + rng() * 40, 34 + rng() * 20, x, 0.12, 20), 1, x, 7, shrubs);
  }
  fd.push({ path: trunk, color: '#5a3d2b', depth: 12, seed: 91, edge: 0.4 });
  fd.push({ path: crownsDk, color: '#3e5e37', depth: 10, seed: 92, edge: 0.4 });
  fd.push({ path: crowns, color: '#557a43', depth: 10, seed: 93, edge: 0.5 });
  fd.push({ path: shrubs, color: P.fore, depth: 12, seed: 94, edge: 0.4 });
  const fore = bakePlate(r, foreP, clipRect(viewRect(views, foreP), { x: -1e4, y: 300, w: 2e4, h: 2e4 }), (g) => {
    for (const s of fd) sheet(g, k, s.path, s.color, { depth: s.depth, edge: s.edge ?? 0.5, seed: s.seed });
  });

  /* the closing carpet frame (screen space) */
  const B = 64;
  const frameBands: { path: Path2D; color: string; from: Pt; seed: number }[] = [];
  const bandPath = (x0: number, y0: number, x1: number, y1: number, seed: number) => {
    const p = new Path2D();
    cutPath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 1, seed, 14, p);
    return p;
  };
  const zigH = (y: number, x0: number, x1: number, up: boolean) => {
    const p = new Path2D();
    for (let x = x0; x < x1; x += 40) {
      const s = up ? -1 : 1;
      cutPath([[x, y], [x + 20, y - 18 * s], [x + 40, y], [x + 32, y], [x + 20, y - 8 * s], [x + 8, y]], 0.5, x + y, 5, p);
    }
    return p;
  };
  const zigV = (x: number, y0: number, y1: number) => {
    const p = new Path2D();
    for (let y = y0; y < y1; y += 40) cutPath([[x, y], [x - 18, y + 20], [x, y + 40], [x, y + 32], [x - 8, y + 20], [x, y + 8]], 0.5, x + y, 5, p);
    return p;
  };
  frameBands.push(
    { path: bandPath(-40, -40, 1640, B, 210), color: P.indigo, from: [0, -120], seed: 210 },
    { path: bandPath(-40, 900 - B, 1640, 940, 211), color: P.indigo, from: [0, 120], seed: 211 },
    { path: bandPath(-40, -40, B, 940, 212), color: P.indigo, from: [-120, 0], seed: 212 },
    { path: bandPath(1600 - B, -40, 1640, 940, 213), color: P.indigo, from: [120, 0], seed: 213 },
    { path: zigH(B - 14, 0, 1600, false), color: P.cream, from: [0, -120], seed: 214 },
    { path: zigH(900 - B + 14, 0, 1600, true), color: P.cream, from: [0, 120], seed: 215 },
    { path: zigV(B - 14, 0, 900), color: P.cream, from: [-120, 0], seed: 216 },
    { path: zigV(1600 - B + 32, 0, 900), color: P.cream, from: [120, 0], seed: 217 },
    { path: bandPath(B, B, 1600 - B, B + 9, 218), color: P.gold, from: [0, -120], seed: 218 },
    { path: bandPath(B, 900 - B - 9, 1600 - B, 900 - B, 219), color: P.gold, from: [0, 120], seed: 219 }
  );
  // Medallion around the sun: an eight-point star outline and a ring of small diamonds
  const medallion: { path: Path2D; color: string; seed: number; r: number }[] = [];
  const starRing = (rad: number, w: number, seed: number) => {
    const p = new Path2D();
    const outer: Pt[] = [];
    const inner: Pt[] = [];
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * TAU;
      const rr = i % 2 ? rad * 0.8 : rad;
      outer.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      inner.push([Math.cos(a) * (rr - w), Math.sin(a) * (rr - w)]);
    }
    // Outer clockwise, inner reversed: a hollow star
    cutPath(outer, 0.8, seed, 8, p);
    const pts = [...inner].reverse();
    p.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts) p.lineTo(q[0], q[1]);
    p.closePath();
    return p;
  };
  {
    const fill = new Path2D();
    const pts: Pt[] = [];
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * TAU;
      const rr = i % 2 ? 196 : 245;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    cutPath(pts, 0.8, 229, 8, fill);
    medallion.push({ path: fill, color: 'rgba(248,238,220,0.42)', seed: 229, r: 245 });
  }
  medallion.push({ path: starRing(250, 26, 230), color: P.cream, seed: 230, r: 250 });
  medallion.push({ path: starRing(240, 14, 232), color: P.indigo, seed: 232, r: 240 });
  const dia = new Path2D();
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (i / 16) * TAU + Math.PI / 16;
    const cx = Math.cos(a) * 150;
    const cy = Math.sin(a) * 150;
    cutPath([[cx, cy - 11], [cx + 8, cy], [cx, cy + 11], [cx - 8, cy]].map(([x, y]) => [x, y] as Pt), 0.4, 240 + i, 4, dia);
  }
  medallion.push({ path: dia, color: P.gold, seed: 240, r: 160 });

  return {
    k,
    far: layers.filter((L) => L.p <= 0.2),
    open: open.plate,
    openSheets: open.sheets,
    target: { x: open.target.x, y: open.target.y, r: open.target.r },
    targetPath: open.targetPath,
    sky,
    plates,
    ground,
    fore,
    person: makeStamp(190, 280, res, 0.86),
    sheep: makeStamp(160, 120, res, 0.82),
    dog: makeStamp(250, 210, res, 0.86),
    fruits,
    chimneys,
    sunCut: blobPts(0, 0, 1, 1, 9, 0.022, 64),
    frames: ([[0, -120], [0, 120], [-120, 0], [120, 0]] as Pt[]).map((from) => {
      const rect = from[1] < 0 ? { x: -60, y: -60, w: 1720, h: B + 100 } : from[1] > 0 ? { x: -60, y: 900 - B - 40, w: 1720, h: B + 100 } : from[0] < 0 ? { x: -60, y: -60, w: B + 100, h: 1020 } : { x: 1600 - B - 40, y: -60, w: B + 100, h: 1020 };
      const mine = frameBands.filter((b) => b.from[0] === from[0] && b.from[1] === from[1]);
      return { from, plate: bakePlate(r, 0, rect, (g) => mine.forEach((b) => sheet(g, k, b.path, b.color, { depth: 8, edge: 0.5, seed: b.seed })), 1.25) };
    }),
    medallion: medallion.map((m) => bakePlate(r, 0, { x: -290, y: -290, w: 580, h: 580 }, (g) => sheet(g, k, m.path, m.color, { depth: 6, edge: 0.5, seed: m.seed }), 1.25)),
  };
};

/* ---------- the flock ---------- */

const FLOCK = [
  { dx: 0, dy: 0, s: 1, ph: 0.1 },
  { dx: -120, dy: 10, s: 0.95, ph: 0.6 },
  { dx: -230, dy: -4, s: 1.05, ph: 0.3 },
  { dx: -330, dy: 14, s: 0.9, ph: 0.8 },
  { dx: -60, dy: 30, s: 1.1, ph: 0.45 },
  { dx: -420, dy: 22, s: 1, ph: 0.15 },
];
const FLOCK_V = 120;
const flockX = (t: number) => 1780 + FLOCK_V * (t - 9.6);

/* ---------- film ---------- */

export const paperCaucasusFilm: RisoFilm<State> = {
  id: 'paper-caucasus',
  title: 'Caucasus',
  caption: 'A cut-paper descent from the high Caucasus, through a stone village, to the Caspian.',
  theme: 'Origins',
  motif: 'A pomegranate seed: a seed, the sun, the fruit, the heart of a carpet',
  duration: DURATION,
  series: 'Paper cut',
  mode: 'direct',
  paper: '#efe5d1',
  paperTexture: true,
  grain: 0.12,
  inks: [{ color: P.seed }, { color: P.indigo }, { color: P.gold }, { color: P.peakB }, { color: P.sea2 }],
  scenes: [
    { at: 0, label: 'Nar' },
    { at: T_PEAKS, label: 'The peaks' },
    { at: T_VILLAGE, label: 'Stone village' },
    { at: T_PASTURE, label: 'Pasture' },
    { at: T_SEA, label: 'Caspian' },
  ],
  posterTime: 17.6,

  setup(r) {
    return build(r);
  },

  draw(r, t, s) {
    const c = r.layers[0];
    const k = s.k;

    /* ----- opening: the split fruit, then a dive into one seed ----- */
    if (t < T_SWAP) {
      const push = tween(t, 0, 2.6, ease.inOutSine);
      const base: View = { x: lerp(800, 830, push), y: lerp(450, 470, push), z: lerp(1, 1.18, push) };
      const rot = lerp(0.04, 0, push);
      // Where the target seed sits on screen under the base camera
      const dx = s.target.x - base.x;
      const dy = s.target.y - base.y;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const px = 800 + (dx * cs - dy * sn) * base.z;
      const py = 450 + (dx * sn + dy * cs) * base.z;
      const dive = ease.inCubic(seg(t, 2.4, T_SWAP));
      const Z = Math.exp(Math.log(95) * dive);
      const wx = base.x + (px - 800) / base.z;
      const wy = base.y + (py - 450) / base.z;
      r.camera(wx + (base.x - wx) / Z, wy + (base.y - wy) / Z, base.z * Z, rot);
      // Past a little zoom the plate would go soft, so the sheets are cut live; their fibre
      // fades as we fall in, or it would swell into streaks
      if (Z < 1.4) drawPlate(c, s.open);
      else {
        const tx = 0.85 / Math.max(1, Z / 2);
        for (const d of s.openSheets) sheet(c, k, d.path, d.color, { depth: d.depth, edge: (d.edge ?? 0.5) / Math.max(1, Z / 3), seed: d.seed, tex: (d.tex ?? 0.85) * tx / 0.85 });
      }
      // The chosen seed, drawn live so its gloss can fade as we fall into it
      sheet(c, k, s.targetPath, P.seed, { depth: 3, edge: 0.5 * (1 - dive), seed: 999, tex: 0.85 / Math.max(1, Z / 2) });
      const gloss = (1 - seg(dive, 0.2, 0.7)) * (0.75 + 0.25 * Math.sin(t * 4));
      if (gloss > 0.02) {
        c.save();
        c.globalAlpha = gloss;
        c.fillStyle = P.seedLit;
        c.beginPath();
        c.ellipse(s.target.x - s.target.r * 0.32, s.target.y - s.target.r * 0.34, s.target.r * 0.28, s.target.r * 0.18, -0.6, 0, TAU);
        c.fill();
        c.restore();
      }
      // A few seeds glint on the open half
      c.save();
      for (let i = 0; i < 4; i++) {
        const a = Math.max(0, Math.sin(t * 2.3 + i * 1.9));
        c.globalAlpha = a * 0.7 * (1 - dive);
        c.fillStyle = '#fff3ec';
        c.beginPath();
        c.arc(760 + i * 40 - (i % 2) * 70, 420 + i * 33, 3, 0, TAU);
        c.fill();
      }
      c.restore();
      warmLight(c, 700, 300, 0.8);
      return;
    }

    /* ----- the descent ----- */
    const C = camera(t);
    const sun = sunAt(t);
    const Z = sunZoom(t);
    const eve = tween(t, T_PASTURE, T_FRAME, ease.inOutSine);
    const cam = (p: number) => lensCam(r, layerView(C, p), Z, sun.x, sun.y);

    r.camera(800, 450, 1);
    c.save();
    drawPlate(c, s.sky[0]);
    if (eve > 0) {
      c.globalAlpha = eve;
      drawPlate(c, s.sky[1]);
    }
    c.restore();

    // The sun: same red as the seed; its lighter heart only shows once we are out of it
    const sunPath = (rad: number, dx = 0, dy = 0) => {
      const p = new Path2D();
      s.sunCut.forEach(([x, y], i) => {
        const X = sun.x + (dx + x * rad) * Z;
        const Y = sun.y + (dy + y * rad) * Z;
        if (i) p.lineTo(X, Y);
        else p.moveTo(X, Y);
      });
      p.closePath();
      return p;
    };
    const halo = seg(Z, 6, 1.5);
    if (halo > 0) {
      c.save();
      c.globalAlpha = halo;
      sheet(c, k, sunPath(sun.r * 1.42 * (1 + 0.02 * Math.sin(t * 1.5))), mix(P.sunHalo, '#f0a27c', eve), { depth: 3, edge: 0.3, seed: 301, tex: 0.6 });
      c.restore();
    }
    sheet(c, k, sunPath(sun.r), P.sun, { depth: 5, edge: 0.6, seed: 302 });
    const heart = seg(Z, 3, 1.2);
    if (heart > 0) {
      c.save();
      c.globalAlpha = heart;
      sheet(c, k, sunPath(sun.r * 0.6, -sun.r * 0.13, -sun.r * 0.13), '#e4615a', { depth: 2, edge: 0.3, seed: 303 });
      c.restore();
    }

    // While we are still deep in the sun the far sheets are cut live, so they stay crisp
    const live = Z > 1.25;
    for (const pl of s.plates) {
      cam(pl.p);
      const L = live ? s.far.find((f) => f.p === pl.p) : undefined;
      if (L) for (const d of L.sheets) sheet(c, k, d.path, d.color, { depth: d.depth, edge: d.edge ?? 0.5, seed: d.seed, tex: d.tex ?? 0.85, shade: d.shade });
      else drawPlate(c, pl);
    }

    /* ----- ground plane, smoke, the flock ----- */
    cam(1);
    /* ----- near water: live waves with torn foam ----- */
    if (C.x > 2300) {
      for (let j = 0; j < 3; j++) {
        const y0 = 850 + j * 26;
        const top = (x: number) => y0 + 5 * Math.sin(x / 50 + t * (1.2 + j * 0.3) + j * 2) + 3 * Math.sin(x / 17 - t * 1.7);
        const x0 = SHORE - 300 + j * 40;
        const x1 = C.x + 1200;
        c.save();
        const foam = tornRidge(top, x0, x1, 1080, 3, 320 + j);
        sheet(c, k, foam, P.foam, { depth: 2, edge: 0, seed: 320 + j, tex: 0.4 });
        sheet(c, k, cutRidge(top, x0, x1, 1080, 330 + j, 1, 10), [P.sea1, P.sea2, P.sea3][j], { depth: 5, edge: 0.6, seed: 330 + j });
        c.restore();
      }
      // The sun's path on the water
      const glint = tween(t, T_SEA, T_SEA + 1.2);
      if (glint > 0) {
        const wx = C.x + (sun.x - 800) / C.z;
        c.save();
        c.globalAlpha = glint;
        for (let i = 0; i < 5; i++) {
          const y = 846 + i * 15;
          const w = (150 - i * 22) * (0.8 + 0.25 * Math.sin(t * 2.6 + i * 1.3));
          const x = wx + Math.sin(t * 1.9 + i * 2.3) * 9;
          sheet(c, k, cutPath([[x - w / 2, y], [x + w / 2, y - 1], [x + w / 2 - 6, y + 8], [x - w / 2 + 5, y + 9]], 0.6, 340 + i, 6), i % 2 ? '#f08a76' : '#e4615a', { depth: 1.5, tex: 0.5, seed: 340 + i });
        }
        c.restore();
      }
    }

    drawPlate(c, s.ground);
    if (C.x < 2300) {
      const smoke = new Path2D();
      s.chimneys.forEach(([x, y], i) => {
        for (let j = 0; j < 5; j++) {
          const f = (t * 0.3 + j / 5 + i * 0.13) % 1;
          const rr = (9 + f * 26) * Math.min(1, f * 6) * (1 - f * f);
          if (rr < 2) continue;
          cutPath(blobPts(x + Math.sin(f * 4 + i) * 16 + f * 50, y - 6 - f * 170, rr, rr * 0.78, i * 10 + j, 0.14, 16), 0.5, i * 10 + j, 5, smoke);
        }
      });
      c.save();
      c.globalAlpha = 0.7;
      sheet(c, k, smoke, '#f4efe4', { depth: 3, edge: 0, seed: 310, tex: 0.5 });
      c.restore();
    }
    if (C.x > 900 && C.x < 3300) {
      const fx = flockX(t);
      FLOCK.forEach((sh, i) => {
        const x = fx + sh.dx;
        const graze = 0.5 + 0.5 * Math.sin(t * 0.9 + i * 2.1);
        const walk = 1 - 0.6 * graze;
        const ph = (x / 70) * walk + sh.ph;
        stampDraw(c, k, s.sheep, x, groundY(x) + 6 + sh.dy, (g) => sheepArt(g, ph, i * 13 + 3, graze * 0.8), {
          scale: 0.9 * sh.s,
          rot: Math.atan((groundY(x + 20) - groundY(x - 20)) / 40) * 0.8,
          depth: 5,
          seed: 20 + i,
        });
      });
      const hx = fx - 540;
      stampDraw(c, k, s.person, hx, groundY(hx) + 4, (g) =>
        personArt(g, { q: hx / 150, stride: 0.75, sit: 0, lean: 0.06 }, SHEPHERD), { depth: 7, seed: 30 });
      const dxp = fx - 380 + 40 * Math.sin(t * 0.8);
      const dv = FLOCK_V + 32 * Math.cos(t * 0.8);
      const pose = blendPose(STAND, lope(dxp / 120, 0.55), clamp(dv / 120));
      stampDraw(c, k, s.dog, dxp, groundY(dxp) + 6, (g) => dogArt(g, pose, SHEEPDOG), { scale: 0.95, depth: 6, seed: 31 });
    }

    /* ----- foreground: pomegranate trees, fruit swaying ----- */
    cam(s.fore.p);
    drawPlate(c, s.fore);
    const fruit = new Path2D();
    const crowns = new Path2D();
    for (const f of s.fruits) {
      const sw = Math.sin(t * 1.3 + f.p) * 4;
      const x = f.x + sw;
      const y = f.y + Math.abs(sw) * 0.3;
      fruit.moveTo(x + f.r, y);
      fruit.ellipse(x, y, f.r, f.r * 0.95, 0, 0, TAU);
      crowns.moveTo(x - 5, y - f.r + 2);
      crowns.lineTo(x - 6, y - f.r - 7);
      crowns.lineTo(x - 1, y - f.r - 3);
      crowns.lineTo(x + 3, y - f.r - 8);
      crowns.lineTo(x + 6, y - f.r + 2);
      crowns.closePath();
    }
    sheet(c, k, fruit, P.blush, { depth: 6, edge: 0.6, seed: 350 });
    sheet(c, k, crowns, P.crown, { depth: 2, edge: 0, seed: 351 });

    warmLight(c, sun.x, sun.y, 0.8 + 0.5 * eve, '255,200,140');

    /* ----- the carpet closes around the view ----- */
    const fk = tween(t, T_FRAME, T_FRAME + 1.1, ease.outCubic);
    if (fk > 0) {
      r.camera(800, 450, 1);
      // Medallion rings grow around the sun
      const mk = ease.outBack(seg(t, T_FRAME + 0.5, T_FRAME + 1.5));
      if (mk > 0) {
        s.medallion.forEach((m, i) => {
          c.save();
          c.translate(sun.x, sun.y);
          c.rotate((1 - mk) * (i % 2 ? -0.5 : 0.5) + Math.sin(t * 0.3) * 0.01);
          c.scale(mk, mk);
          drawPlate(c, m);
          c.restore();
        });
        // The seed at the heart sits on top of the medallion's vellum
        sheet(c, k, sunPath(sun.r), P.sun, { depth: 4, edge: 0.6, seed: 302 });
        sheet(c, k, sunPath(sun.r * 0.6, -sun.r * 0.13, -sun.r * 0.13), '#e4615a', { depth: 2, edge: 0.3, seed: 303 });
      }
      // Border bands slide in from the edges
      // Sides first, so the top and bottom bands lie over them like a real border
      for (const f of [s.frames[2], s.frames[3], s.frames[0], s.frames[1]]) {
        const kk = ease.outCubic(seg(t, T_FRAME + (f.from[1] ? 0.1 : 0), T_FRAME + 1.0 + (f.from[1] ? 0.1 : 0)));
        if (kk <= 0) continue;
        c.save();
        c.translate(f.from[0] * (1 - kk), f.from[1] * (1 - kk));
        drawPlate(c, f.plate);
        c.restore();
      }
      const tk = ease.outBack(seg(t, T_FRAME + 1.3, T_FRAME + 2.1));
      if (tk > 0) {
        c.save();
        c.translate(800, 900 - 32);
        c.scale(tk, tk);
        const cart = cutPath([[-210, -34], [210, -36], [222, 0], [210, 36], [-210, 34], [-222, 0]], 1, 260, 8);
        sheet(c, k, cart, P.cream, { depth: 8, edge: 0.4, seed: 260 });
        c.font = `400 44px ${DISPLAY}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = P.carpet;
        castShadow(c, 2, 0.3);
        const word = 'CAUCASUS';
        const sp = 9;
        const ws = Array.from(word).map((ch) => c.measureText(ch).width);
        const tot = ws.reduce((a, b) => a + b, 0) + sp * (word.length - 1);
        let x = -tot / 2;
        Array.from(word).forEach((ch, i) => {
          c.fillText(ch, x + ws[i] / 2, 3);
          x += ws[i] + sp;
        });
        c.restore();
      }
    }
  },
};
