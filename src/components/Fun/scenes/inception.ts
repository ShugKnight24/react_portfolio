import type { Hum, Pool } from './heroes-kit';
import {
  emit,
  freeCanvas,
  glow,
  glowSprite,
  layer,
  makePool,
  mulberry,
  setHum,
  startHum,
  stepPool,
  stopHum,
} from './heroes-kit';
import { capsule, drawGrain, grainTile, keepAwake, smooth } from './nolan-kit';
import type { AudioBus, SceneEnv } from './runtime';
import {
  clamp,
  createCanvasScene,
  damp,
  easeInOutCubic,
  lerp,
  noise,
  rand,
  TAU,
  tone,
} from './runtime';
import type { MountScene } from './types';

/**
 * Dream Within a Dream: a fan tribute to Inception, five dreams deep.
 *
 * Paris is a construct: a street of Haussmann blocks seen from a café, and holding (or dragging
 * up) bends it. The far end of the street lifts off the ground and curls up over the top until
 * the city hangs upside down overhead, cars and people and all, while the café blows apart in
 * slow motion. The city is a real little 3D model: both sides of the street are baked once into
 * long façade textures, sliced into vertical strips, pushed through a cylindrical curl and drawn
 * back to front with clipped affine mapping, so the fold keeps true perspective.
 *
 * A tap, Space or Enter is the kick and drops a level, each one slower than the last: the city
 * in the rain at night (it bends too), the hotel corridor whose gravity rolls round while a
 * figure runs along the walls and a projection tumbles past him, the snow fortress that you
 * hold to blow and that pancakes in slow motion before the dream rebuilds it, and limbo, where
 * holding makes the shoreline towers calve into the sea like ice. The kick out of limbo wakes
 * you at a kitchen table with the top spinning, and it wobbles... Kicks fall in a van into
 * water or drop in a lift; the horn is a synthesised low brass swell. The spinning top in the
 * corner is the totem: perfectly steady in a dream, wobbling when awake.
 */

/* ---------- levels ---------- */

const PARIS = 0;
const CITY = 1;
const HOTEL = 2;
const FORT = 3;
const LIMBO = 4;
const AWAKE = 5;

const LEVELS = [
  { tag: 'THE CONSTRUCT', name: 'PARIS', time: 1, x: 'TIME ×1' },
  { tag: 'LEVEL ONE', name: 'THE CITY', time: 0.62, x: 'TIME ×20' },
  { tag: 'LEVEL TWO', name: 'THE HOTEL', time: 0.42, x: 'TIME ×400' },
  { tag: 'LEVEL THREE', name: 'THE FORTRESS', time: 0.3, x: 'TIME ×8,000' },
  { tag: 'UNCONSTRUCTED DREAM SPACE', name: 'LIMBO', time: 0.2, x: 'TIME ∞' },
  { tag: '', name: 'AWAKE', time: 1, x: '' },
];
const LADDER = ['Paris', 'City', 'Hotel', 'Fortress', 'Limbo'];

const TK_VAN = 0;
const TK_LIFT = 1;
const TK_WAKE = 2;
const TK_FADE = 3;
const T_DUR = [2.7, 2.5, 3.1, 1.7];
const T_SWITCH = [0.5, 0.5, 0.55, 0.42];

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

/* ---------- the folding city: config and geometry ---------- */

interface CityCfg {
  kind: number;
  half: number;
  walk: number;
  R: number;
  zh: number;
  z0: number;
  len: number;
  sw: number;
  ppm: number;
  texH: number;
  roofD: number;
  fogD: number;
}

const PARIS_CFG: CityCfg = {
  kind: 0,
  half: 12,
  walk: 4,
  R: 26,
  zh: 56,
  z0: 2,
  len: 192,
  sw: 2,
  ppm: 18,
  texH: 26.5,
  roofD: 14,
  fogD: 320,
};
const CITY_CFG: CityCfg = {
  kind: 1,
  half: 13,
  walk: 4,
  R: 64,
  zh: 50,
  z0: 2,
  len: 300,
  sw: 3,
  ppm: 10,
  texH: 62,
  roofD: 22,
  fogD: 170,
};

const F_FACADE = 0;
const F_ROOF = 1;
const F_CAP = 2;
const F_FLAT = 3;

interface Face {
  p: Float32Array;
  kind: number;
  side: number;
  col: number[];
  cull: boolean;
  /** which side of the winding faces out (+1 or -1) */
  ns: number;
  tex: number;
  u0: number;
  du: number;
  v0: number;
  dv: number;
}

interface Bld {
  z0: number;
  z1: number;
  h: number;
  floors: number;
  tone: number;
  style: number;
}

interface Car {
  x: number;
  z: number;
  len: number;
  wid: number;
  col: number[];
  v: number;
}

interface Walker {
  x: number;
  z: number;
  v: number;
  ph: number;
  h: number;
  col: number;
}

interface Table {
  x: number;
  z: number;
  gone: number;
}

interface CityGeo {
  cfg: CityCfg;
  faces: Face[];
  tex: HTMLCanvasElement[];
  /** quarter size copies for strips seen edge on, so distant facades do not shimmer */
  mip: HTMLCanvasElement[];
  /** the quarter copies again with the haze already laid over them, FOG_STEP apart */
  mipFog: HTMLCanvasElement[][];
  /** rooftops, seen only once the street has folded over */
  roof: HTMLCanvasElement[];
  gz: number[];
  cars: Car[];
  walkers: Walker[];
  tables: Table[];
  lamps: number[];
  scr: Float32Array;
  shade: Float32Array;
  dep: Float32Array;
}

/* ---------- curl + camera (module scratch, filled by toScreen) ---------- */

const NEAR = 0.4;
const V = {
  R: 30,
  zh: 40,
  b: 0,
  sb: 0,
  cb: 1,
  L: 0,
  cx: 0,
  cy: 1.6,
  cz: 0,
  sp: 0,
  cp: 1,
  f: 800,
  hx: 0,
  hy: 0,
};
let WX = 0;
let WY = 0;
let WZ = 0;
let CX = 0;
let CY = 0;
let CZ = 0;
let SX = 0;
let SY = 0;
const LW = [0, 0, 0];
const LC = [0, 0, 0];

function setCurl(R: number, zh: number, beta: number) {
  V.R = R;
  V.zh = zh;
  V.b = beta;
  V.sb = Math.sin(beta);
  V.cb = Math.cos(beta);
  V.L = beta * R;
}

/** Bend the flat world: past the hinge the ground wraps round a cylinder of radius R, then carries on straight */
function curl(x: number, y: number, z: number) {
  const d = z - V.zh;
  WX = x;
  if (d <= 0 || V.b <= 0) {
    WY = y;
    WZ = z;
    return;
  }
  const R = V.R;
  if (d <= V.L) {
    const ph = d / R;
    const r = R - y;
    WZ = V.zh + r * Math.sin(ph);
    WY = R - r * Math.cos(ph);
    return;
  }
  const t = d - V.L;
  WZ = V.zh + R * V.sb + t * V.cb - y * V.sb;
  WY = R - R * V.cb + t * V.sb + y * V.cb;
}

function toScreen(x: number, y: number, z: number) {
  curl(x, y, z);
  const dx = WX - V.cx;
  const dy = WY - V.cy;
  const dz = WZ - V.cz;
  CX = dx;
  CY = dy * V.cp - dz * V.sp;
  CZ = dz * V.cp + dy * V.sp;
  if (CZ < NEAR) return false;
  SX = V.hx + (CX / CZ) * V.f;
  SY = V.hy - (CY / CZ) * V.f;
  return true;
}

function setLight(x: number, y: number, z: number) {
  const l = Math.hypot(x, y, z);
  LW[0] = x / l;
  LW[1] = y / l;
  LW[2] = z / l;
  LC[0] = LW[0];
  LC[1] = LW[1] * V.cp - LW[2] * V.sp;
  LC[2] = LW[2] * V.cp + LW[1] * V.sp;
}

/* ---------- draw list ---------- */

interface DItem {
  d: number;
  k: number;
  i: number;
}
const ITEMS: DItem[] = [];
const ORD: number[] = [];
let NI = 0;
function pushItem(d: number, k: number, i: number) {
  let it = ITEMS[NI];
  if (!it) {
    it = { d: 0, k: 0, i: 0 };
    ITEMS[NI] = it;
  }
  it.d = d;
  it.k = k;
  it.i = i;
  NI++;
}
function sortItems() {
  ORD.length = NI;
  for (let i = 0; i < NI; i++) ORD[i] = i;
  ORD.sort((a, b) => ITEMS[b].d - ITEMS[a].d);
}

/* ---------- small colour helpers ---------- */

const rgb = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;
const rgba = (r: number, g: number, b: number, a: number) =>
  `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;
function mixFog(r: number, g: number, b: number, k: number, fog: number[]) {
  return rgb(lerp(r, fog[0], k), lerp(g, fog[1], k), lerp(b, fog[2], k));
}

/** Base canvas transform, read once per frame so textured quads can compose onto it */
const BT = [1, 0, 0, 1, 0, 0];
function readBase(ctx: CanvasRenderingContext2D) {
  const m = ctx.getTransform();
  BT[0] = m.a;
  BT[1] = m.b;
  BT[2] = m.c;
  BT[3] = m.d;
  BT[4] = m.e;
  BT[5] = m.f;
}

/**
 * Paint a texture rectangle onto a screen quad (TL, TR, BR, BL in q from o): clip to the exact
 * quad, then map the texture with the best fitting affine so seams and perspective hold.
 */
function texQuad(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  u0: number,
  du: number,
  v0: number,
  dv: number,
  q: Float32Array,
  o: number,
  fog: string | null,
  under: string | null = null
) {
  const x0 = q[o];
  const y0 = q[o + 1];
  const x1 = q[o + 2];
  const y1 = q[o + 3];
  const x2 = q[o + 4];
  const y2 = q[o + 5];
  const x3 = q[o + 6];
  const y3 = q[o + 7];
  // how far the quad is from a parallelogram: when it is tiny the clip is not worth its cost
  const skew =
    Math.abs(x1 - x0 - x2 + x3) +
    Math.abs(y1 - y0 - y2 + y3) +
    Math.abs(x3 - x0 - x2 + x1) +
    Math.abs(y3 - y0 - y2 + y1);
  const clip = skew > 8 || !!under;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  if (clip) ctx.clip();
  if (under) {
    ctx.fillStyle = under;
    ctx.fill();
  }
  const ux = (x1 - x0 + x2 - x3) * 0.5;
  const uy = (y1 - y0 + y2 - y3) * 0.5;
  const vx = (x3 - x0 + x2 - x1) * 0.5;
  const vy = (y3 - y0 + y2 - y1) * 0.5;
  const ox = (x0 + x1 + x2 + x3) * 0.25 - ux * 0.5 - vx * 0.5;
  const oy = (y0 + y1 + y2 + y3) * 0.25 - uy * 0.5 - vy * 0.5;
  const a = ux / du;
  const b = uy / du;
  const c = vx / dv;
  const d = vy / dv;
  const e = ox - a * u0 - c * v0;
  const f = oy - b * u0 - d * v0;
  ctx.setTransform(
    BT[0] * a + BT[2] * b,
    BT[1] * a + BT[3] * b,
    BT[0] * c + BT[2] * d,
    BT[1] * c + BT[3] * d,
    BT[0] * e + BT[2] * f + BT[4],
    BT[1] * e + BT[3] * f + BT[5]
  );
  // a margin round the source rect covers what the affine misses at the corners
  const mu = clip ? du * 0.08 + 1 : 0;
  const mv = clip ? dv * 0.08 + 1 : 0;
  const su = Math.max(0, u0 - mu);
  const sv = Math.max(0, v0 - mv);
  const eu = Math.min(img.width, u0 + du + mu);
  const ev = Math.min(img.height, v0 + dv + mv);
  if (eu > su && ev > sv) ctx.drawImage(img, su, sv, eu - su, ev - sv, su, sv, eu - su, ev - sv);
  ctx.restore();
  if (fog) {
    ctx.fillStyle = fog;
    ctx.fill();
  }
}

/* ---------- city construction ---------- */

function quadFace(
  pts: number[],
  want: number[],
  kind: number,
  side: number,
  col: number[],
  cull: boolean
): Face {
  const ax = pts[3] - pts[0];
  const ay = pts[4] - pts[1];
  const az = pts[5] - pts[2];
  const bx = pts[6] - pts[0];
  const by = pts[7] - pts[1];
  const bz = pts[8] - pts[2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  let p = pts;
  if (nx * want[0] + ny * want[1] + nz * want[2] < 0)
    p = [
      pts[0],
      pts[1],
      pts[2],
      pts[9],
      pts[10],
      pts[11],
      pts[6],
      pts[7],
      pts[8],
      pts[3],
      pts[4],
      pts[5],
    ];
  return {
    p: new Float32Array(p),
    kind,
    side,
    col,
    cull,
    ns: 1,
    tex: 0,
    u0: 0,
    du: 1,
    v0: 0,
    dv: 1,
  };
}

function buildCity(cfg: CityCfg, seed: number): CityGeo {
  const rnd = mulberry(seed);
  const faces: Face[] = [];
  const tex: HTMLCanvasElement[] = [];
  const roof: HTMLCanvasElement[] = [];
  const rppm = paris0(cfg) ? 8 : 5;
  const end = cfg.z0 + cfg.len;
  const paris = cfg.kind === 0;
  for (let si = 0; si < 2; si++) {
    const side = si === 0 ? -1 : 1;
    const list: Bld[] = [];
    let z = cfg.z0;
    while (z < end - 0.01) {
      let w: number;
      let h: number;
      let floors = 0;
      if (paris) {
        w = 12 + 2 * Math.floor(rnd() * 5);
        floors = rnd() < 0.3 ? 4 : 5;
        h = 4.6 + floors * 3.15 + 3.4;
      } else if (list.length && list[list.length - 1].h > 0 && rnd() < 0.2) {
        w = 6;
        h = 0;
      } else {
        w = 3 * (4 + Math.floor(rnd() * 7));
        h = 22 + Math.floor(rnd() * 11) * 3.6;
      }
      w = Math.min(w, end - z);
      list.push({ z0: z, z1: z + w, h, floors, tone: rnd(), style: rnd() });
      z += w;
    }
    tex[si] = paris ? bakeParis(cfg, list, side, rnd) : bakeTowers(cfg, list, rnd);
    roof[si] = bakeRoofs(cfg, list, rppm, rnd);
    const x = side * cfg.half;
    const xo = side * (cfg.half + cfg.roofD);
    const roofCol = paris ? [104, 112, 126] : [30, 32, 38];
    const capCol = paris ? [196, 182, 160] : [38, 42, 52];
    for (const b of list) {
      if (b.h <= 0) continue;
      const top = b.h + (paris ? 1.6 : 0.6);
      for (let zz = b.z0; zz < b.z1 - 0.01; zz += cfg.sw) {
        const z1 = Math.min(b.z1, zz + cfg.sw);
        const ze = Math.min(b.z1, z1 + 0.04);
        faces.push({
          p: new Float32Array([x, top, zz, x, top, ze, x, 0, ze, x, 0, zz]),
          kind: F_FACADE,
          side,
          col: capCol,
          cull: false,
          ns: 1,
          tex: si,
          u0: (zz - cfg.z0) * cfg.ppm,
          du: (ze - zz) * cfg.ppm,
          v0: (cfg.texH - top) * cfg.ppm,
          dv: top * cfg.ppm,
        });
        // TL at the street edge, u along the street and v away from it; the winding flips with the side
        faces.push({
          p: new Float32Array([x, b.h, zz, x, b.h, ze, xo, b.h, ze, xo, b.h, zz]),
          kind: F_ROOF,
          side,
          col: roofCol,
          cull: true,
          ns: side < 0 ? -1 : 1,
          tex: si,
          u0: (zz - cfg.z0) * rppm,
          du: (ze - zz) * rppm,
          v0: 0,
          dv: cfg.roofD * rppm,
        });
      }
    }
    for (let i = 0; i <= list.length; i++) {
      const ha = i > 0 ? list[i - 1].h : 0;
      const hb = i < list.length ? list[i].h : 0;
      if (Math.abs(ha - hb) < 0.05) continue;
      const zb = i < list.length ? list[i].z0 : list[i - 1].z1;
      const lo = Math.min(ha, hb);
      const hi = Math.max(ha, hb);
      faces.push(
        quadFace(
          [x, lo, zb, x, hi, zb, xo, hi, zb, xo, lo, zb],
          [0, 0, ha > hb ? 1 : -1],
          F_CAP,
          side,
          capCol,
          true
        )
      );
    }
  }

  // café awning on the sunny side, striped
  if (paris) {
    const xa = cfg.half;
    const xb = cfg.half - 2.4;
    for (let k = 0; k < 14; k++) {
      const za = 6 + k;
      const col = k % 2 ? [228, 220, 200] : [168, 34, 36];
      faces.push(
        quadFace(
          [xa, 3.5, za, xa, 3.5, za + 1.02, xb, 2.8, za + 1.02, xb, 2.8, za],
          [0, -1, 0],
          F_FLAT,
          1,
          col,
          false
        )
      );
      faces.push(
        quadFace(
          [xb, 2.8, za, xb, 2.8, za + 1.02, xb, 2.5, za + 1.02, xb, 2.5, za],
          [-1, 0, 0],
          F_FLAT,
          1,
          k % 2 ? [210, 200, 182] : [140, 26, 30],
          false
        )
      );
    }
  }

  // ground strips, finer close to the camera
  const gz: number[] = [];
  let zz = 0.6;
  while (zz < end) {
    gz.push(zz);
    zz += zz < cfg.zh ? clamp(zz * 0.1, 0.5, 2.5) : 2.5;
  }
  gz.push(end);

  const cars: Car[] = [];
  const carCols = paris
    ? [
        [214, 206, 188],
        [40, 52, 82],
        [120, 30, 34],
        [170, 174, 178],
        [30, 30, 32],
        [96, 110, 90],
      ]
    : [
        [60, 64, 72],
        [20, 22, 26],
        [110, 30, 30],
        [140, 146, 152],
        [36, 48, 70],
      ];
  for (const side of [-1, 1]) {
    let cz = paris ? 17 : 16;
    while (cz < end - 6) {
      const len = rand(4, 4.6);
      if (!(paris && side > 0 && cz < 26) && rnd() < 0.8)
        cars.push({
          x: side * (cfg.half - cfg.walk - 1.05),
          z: cz,
          len,
          wid: 1.75,
          col: carCols[Math.floor(rnd() * carCols.length)],
          v: 0,
        });
      cz += len + (paris ? rand(1.5, 5) : rand(4, 12));
    }
  }
  if (!paris) {
    for (let i = 0; i < 9; i++) {
      const dir = i % 2 ? 1 : -1;
      cars.push({
        x: dir * 2.8,
        z: rand(cfg.z0 + 6, end - 6),
        len: 4.4,
        wid: 1.8,
        col: carCols[i % carCols.length],
        v: dir * rand(9, 13),
      });
    }
  }

  const walkers: Walker[] = [];
  for (let i = 0; i < (paris ? 34 : 22); i++) {
    const side = i % 2 ? 1 : -1;
    walkers.push({
      x: side * (cfg.half - cfg.walk * rand(0.3, 0.6)),
      z: rand(5, end - 4),
      v: (rnd() < 0.5 ? -1 : 1) * rand(1.1, 1.5),
      ph: rnd() * TAU,
      h: rand(1.62, 1.86),
      col: Math.floor(rnd() * 4),
    });
  }

  const tables: Table[] = [];
  if (paris)
    for (let i = 0; i < 5; i++)
      tables.push({ x: cfg.half - 1.3 - (i % 2) * 0.25, z: 8.2 + i * 2.6, gone: 0 });

  const lamps: number[] = [];
  for (let lz = 12; lz < end - 4; lz += paris ? 20 : 26) {
    lamps.push(-(cfg.half - cfg.walk + 0.35), lz);
    lamps.push(cfg.half - cfg.walk + 0.35, lz + (paris ? 10 : 13));
  }

  const geo: CityGeo = {
    cfg,
    faces,
    tex,
    mip: [],
    mipFog: [],
    roof,
    gz,
    cars,
    walkers,
    tables,
    lamps,
    scr: new Float32Array(faces.length * 8),
    shade: new Float32Array(faces.length),
    dep: new Float32Array(faces.length),
  };
  geo.mip = tex.map(quarter);
  const fog = paris ? PARIS_FOG : CITY_FOG;
  geo.mipFog = geo.mip.map((m) => {
    const out: HTMLCanvasElement[] = [m];
    for (let k = 1; k < FOG_LEVELS; k++) {
      const cv = document.createElement('canvas');
      cv.width = m.width;
      cv.height = m.height;
      const c = cv.getContext('2d');
      if (c) {
        c.drawImage(m, 0, 0);
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = rgba(fog[0], fog[1], fog[2], k * FOG_STEP);
        c.fillRect(0, 0, cv.width, cv.height);
      }
      out.push(cv);
    }
    return out;
  });
  return geo;
}

const FOG_LEVELS = 6;
const FOG_STEP = 0.1;

/* ---------- façade bakes ---------- */

function quarter(src: HTMLCanvasElement) {
  let cur = src;
  for (let i = 0; i < 2; i++) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(cur.width / 2));
    cv.height = Math.max(1, Math.round(cur.height / 2));
    const c = cv.getContext('2d');
    if (c) {
      c.imageSmoothingQuality = 'high';
      c.drawImage(cur, 0, 0, cv.width, cv.height);
    }
    if (cur !== src) cur.width = cur.height = 0;
    cur = cv;
  }
  return cur;
}

function bakeParis(cfg: CityCfg, blds: Bld[], side: number, rnd: () => number) {
  const ppm = cfg.ppm;
  const W = Math.ceil(cfg.len * ppm);
  const H = Math.ceil(cfg.texH * ppm);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return cv;
  const lit = side > 0;
  const tr = lit ? 1.04 : 0.6;
  const tg = lit ? 1 : 0.66;
  const tb = lit ? 0.93 : 0.82;
  const T = (r: number, g: number, b: number, a = 1) =>
    a >= 1 ? rgb(r * tr, g * tg, b * tb) : rgba(r * tr, g * tg, b * tb, a);
  const Y = (m: number) => H - m * ppm;
  const X = (z: number) => (z - cfg.z0) * ppm;
  const P = (m: number) => m * ppm;
  const signs = [
    [34, 66, 50],
    [96, 28, 34],
    [30, 40, 66],
    [26, 26, 28],
    [120, 90, 40],
  ];
  for (const b of blds) {
    const x0 = X(b.z0);
    const bw = X(b.z1) - x0;
    const wM = b.z1 - b.z0;
    const cor = 4.6 + b.floors * 3.15;
    const tn = b.tone - 0.5;
    const sr = 228 + tn * 22;
    const sg = 214 + tn * 16;
    const sb = 188 + tn * 26;
    const cafe = lit && b.z0 <= 12 && b.z1 >= 12;
    // masonry
    const gr = c.createLinearGradient(0, Y(cor), 0, Y(0));
    gr.addColorStop(0, T(sr + 4, sg + 4, sb + 4));
    gr.addColorStop(0.7, T(sr - 6, sg - 8, sb - 8));
    gr.addColorStop(1, T(sr - 40, sg - 42, sb - 40));
    c.fillStyle = gr;
    c.fillRect(x0, Y(cor + 0.5), bw, P(cor + 0.5));
    // rustication on the ground floor
    c.fillStyle = T(120, 108, 90, 0.18);
    for (let y = 0.5; y < 4.6; y += 0.55) c.fillRect(x0, Y(y), bw, Math.max(1, P(0.04)));
    // shops
    const bays = Math.max(2, Math.round(wM / 4));
    const bayW = wM / bays;
    const sc = cafe ? [128, 26, 30] : signs[Math.floor(rnd() * signs.length)];
    c.fillStyle = T(sc[0], sc[1], sc[2]);
    c.fillRect(x0 + P(0.3), Y(4.15), bw - P(0.6), P(0.7));
    for (let k = 0; k < bays; k++) {
      const za = b.z0 + k * bayW + 0.4;
      const zb = b.z0 + (k + 1) * bayW - 0.4;
      const sx = X(za);
      const sw = X(zb) - sx;
      c.fillStyle = cafe ? T(110, 34, 26) : T(sc[0] * 0.8, sc[1] * 0.8, sc[2] * 0.8);
      c.fillRect(sx - P(0.08), Y(3.4), sw + P(0.16), P(3.2));
      const ig = c.createLinearGradient(0, Y(3.3), 0, Y(0.3));
      const warm = cafe || rnd() < 0.55;
      ig.addColorStop(0, warm ? 'rgba(255,196,120,0.95)' : 'rgba(70,80,92,1)');
      ig.addColorStop(0.5, warm ? 'rgba(170,110,60,1)' : 'rgba(40,46,54,1)');
      ig.addColorStop(1, 'rgba(30,26,24,1)');
      c.fillStyle = ig;
      c.fillRect(sx, Y(3.3), sw, P(3.0));
      // sky reflection across the glass
      c.fillStyle = lit ? 'rgba(220,230,240,0.18)' : 'rgba(150,170,200,0.12)';
      c.beginPath();
      c.moveTo(sx, Y(3.3));
      c.lineTo(sx + sw * 0.45, Y(3.3));
      c.lineTo(sx + sw * 0.15, Y(0.3));
      c.lineTo(sx, Y(0.3));
      c.fill();
      c.fillStyle = 'rgba(20,16,14,0.8)';
      c.fillRect(sx + sw / 2 - 1, Y(3.3), 2, P(3.0));
      c.fillRect(sx, Y(2.5), sw, Math.max(1, P(0.05)));
    }
    c.fillStyle = T(sr + 8, sg + 8, sb + 8);
    c.fillRect(x0, Y(4.6), bw, P(0.35));
    c.fillStyle = 'rgba(30,24,18,0.35)';
    c.fillRect(x0, Y(4.25), bw, P(0.1));
    // floors
    const nc = Math.max(2, Math.round(wM / 2.7));
    const sp = wM / nc;
    for (let f = 0; f < b.floors; f++) {
      const fy = 4.6 + f * 3.15;
      c.fillStyle = T(sr + 10, sg + 10, sb + 8);
      c.fillRect(x0, Y(fy + 0.1), bw, P(0.1));
      const cont = f === 1 || f === b.floors - 1;
      for (let j = 0; j < nc; j++) {
        const cz = b.z0 + sp * (j + 0.5);
        const wx = X(cz - 0.6);
        const ww = P(1.2);
        const wt = fy + 0.5 + 2.15;
        // surround and lintel
        c.fillStyle = T(sr + 14, sg + 12, sb + 10);
        c.fillRect(wx - P(0.14), Y(wt + 0.28), ww + P(0.28), P(2.43));
        c.fillStyle = T(120, 100, 80, 0.35);
        c.fillRect(wx - P(0.14), Y(wt + 0.06), ww + P(0.28), P(0.05));
        const gg = c.createLinearGradient(0, Y(wt), 0, Y(fy + 0.5));
        if (lit) {
          gg.addColorStop(0, 'rgb(150,170,186)');
          gg.addColorStop(0.45, 'rgb(70,82,96)');
          gg.addColorStop(1, 'rgb(34,38,44)');
        } else {
          gg.addColorStop(0, 'rgb(84,98,118)');
          gg.addColorStop(1, 'rgb(22,26,34)');
        }
        c.fillStyle = gg;
        c.fillRect(wx, Y(wt), ww, P(2.15));
        if (rnd() < 0.4) {
          c.fillStyle = lit ? 'rgba(238,232,220,0.35)' : 'rgba(200,200,205,0.18)';
          c.fillRect(wx + P(0.08), Y(wt - 0.08), ww - P(0.16), P(1.6));
        }
        c.fillStyle = 'rgba(232,226,214,0.85)';
        c.fillRect(wx + ww / 2 - Math.max(0.5, P(0.03)), Y(wt), Math.max(1, P(0.06)), P(2.15));
        c.fillRect(wx, Y(wt - 0.55), ww, Math.max(1, P(0.05)));
        if (!cont) {
          // balconette
          c.strokeStyle = 'rgba(22,22,26,0.9)';
          c.lineWidth = Math.max(1, P(0.05));
          c.beginPath();
          c.moveTo(wx - P(0.1), Y(fy + 1.25));
          c.lineTo(wx + ww + P(0.1), Y(fy + 1.25));
          for (let q = 0; q <= 8; q++) {
            const bx = wx - P(0.1) + ((ww + P(0.2)) * q) / 8;
            c.moveTo(bx, Y(fy + 1.25));
            c.lineTo(bx, Y(fy + 0.55));
          }
          c.stroke();
        }
      }
      if (cont) {
        // continuous wrought iron balcony on the slab
        c.fillStyle = T(sr - 10, sg - 12, sb - 12);
        c.fillRect(x0, Y(fy + 0.55), bw, P(0.16));
        c.fillStyle = 'rgba(30,24,20,0.4)';
        c.fillRect(x0, Y(fy + 0.39), bw, P(0.14));
        c.strokeStyle = 'rgba(20,20,24,0.92)';
        c.lineWidth = Math.max(1, P(0.07));
        c.beginPath();
        c.moveTo(x0, Y(fy + 1.5));
        c.lineTo(x0 + bw, Y(fy + 1.5));
        c.stroke();
        c.lineWidth = Math.max(0.7, P(0.035));
        c.beginPath();
        for (let bx = x0; bx < x0 + bw; bx += P(0.19)) {
          c.moveTo(bx, Y(fy + 1.5));
          c.lineTo(bx, Y(fy + 0.6));
        }
        c.stroke();
      }
    }
    // cornice with its shadow
    c.fillStyle = T(sr + 16, sg + 14, sb + 12);
    c.fillRect(x0, Y(cor + 0.45), bw, P(0.45));
    c.fillStyle = 'rgba(30,24,18,0.45)';
    c.fillRect(x0, Y(cor), bw, P(0.16));
    // mansard in zinc with dormers
    const mg = c.createLinearGradient(0, Y(b.h), 0, Y(cor + 0.45));
    mg.addColorStop(0, T(150, 160, 176));
    mg.addColorStop(1, T(98, 108, 124));
    c.fillStyle = mg;
    c.fillRect(x0, Y(b.h), bw, P(b.h - cor - 0.45));
    c.fillStyle = 'rgba(40,46,60,0.18)';
    for (let sx = x0; sx < x0 + bw; sx += P(0.55)) c.fillRect(sx, Y(b.h), 1, P(b.h - cor - 0.45));
    for (let j = 0; j < nc; j++) {
      const cz = b.z0 + sp * (j + 0.5);
      const dx = X(cz - 0.5);
      c.fillStyle = T(sr + 10, sg + 8, sb + 6);
      c.beginPath();
      c.moveTo(dx - P(0.1), Y(cor + 0.6));
      c.lineTo(dx - P(0.1), Y(cor + 2.2));
      c.lineTo(dx + P(0.5), Y(cor + 2.75));
      c.lineTo(dx + P(1.1), Y(cor + 2.2));
      c.lineTo(dx + P(1.1), Y(cor + 0.6));
      c.fill();
      c.fillStyle = lit ? 'rgb(60,70,82)' : 'rgb(30,34,44)';
      c.fillRect(dx + P(0.08), Y(cor + 2.05), P(0.84), P(1.35));
    }
    // chimney stacks on the party walls
    for (const cxm of [b.z0 + 0.2, b.z1 - 1.4]) {
      if (rnd() < 0.3) continue;
      c.fillStyle = T(176, 104, 74);
      c.fillRect(X(cxm), Y(b.h + 1.1), P(1.2), P(1.6));
      c.fillStyle = T(150, 84, 58);
      c.fillRect(X(cxm), Y(b.h + 1.1), P(1.2), P(0.15));
      c.fillStyle = T(200, 120, 70);
      for (let q = 0; q < 3; q++)
        c.fillRect(X(cxm + 0.15 + q * 0.35), Y(b.h + 1.5), P(0.2), P(0.4));
    }
    // party wall line
    c.fillStyle = 'rgba(40,30,22,0.35)';
    c.fillRect(x0, Y(b.h), Math.max(1, P(0.08)), P(b.h));
  }
  // weathering
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = `rgba(70,60,50,${(rnd() * 0.06).toFixed(3)})`;
    c.fillRect(rnd() * W, H - rnd() * rnd() * H, 1 + rnd() * 3, 1 + rnd() * 6);
  }
  return cv;
}

const paris0 = (cfg: CityCfg) => cfg.kind === 0;

/** The roofscape behind each frontage: zinc and chimney pots in Paris, tar and plant in the city */
function bakeRoofs(cfg: CityCfg, blds: Bld[], rppm: number, rnd: () => number) {
  const W = Math.ceil(cfg.len * rppm);
  const H = Math.ceil(cfg.roofD * rppm);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return cv;
  const X = (z: number) => (z - cfg.z0) * rppm;
  const P = (m: number) => m * rppm;
  const paris = paris0(cfg);
  c.fillStyle = paris ? 'rgb(70,64,60)' : 'rgb(12,14,18)';
  c.fillRect(0, 0, W, H);
  for (const b of blds) {
    if (b.h <= 0) continue;
    const x0 = X(b.z0);
    const bw = X(b.z1) - x0;
    if (paris) {
      const zr = 128 + b.tone * 30;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgb(zr + 20, zr + 26, zr + 36));
      g.addColorStop(0.3, rgb(zr, zr + 6, zr + 16));
      g.addColorStop(1, rgb(zr - 30, zr - 26, zr - 18));
      c.fillStyle = g;
      c.fillRect(x0, 0, bw, H);
      c.fillStyle = 'rgba(40,46,60,0.22)';
      for (let x = x0; x < x0 + bw; x += P(0.6)) c.fillRect(x, P(3.4), 1, H);
      // light well
      if (rnd() < 0.6) {
        c.fillStyle = 'rgb(46,42,40)';
        c.fillRect(x0 + bw * rand(0.2, 0.5), P(7), bw * 0.3, P(rand(3, 5)));
      }
      // skylights and chimney stacks with their pots
      for (let k = 0; k < 3; k++) {
        c.fillStyle = 'rgb(44,56,70)';
        c.fillRect(x0 + rnd() * (bw - P(1.2)), P(rand(4, 12)), P(1), P(1.4));
      }
      for (const zx of [x0 + P(0.2), x0 + bw - P(1.6)]) {
        for (let k = 0; k < 2; k++) {
          const vy = P(rand(2, 11));
          c.fillStyle = 'rgb(176,104,74)';
          c.fillRect(zx, vy, P(1.4), P(0.8));
          c.fillStyle = 'rgb(214,128,72)';
          for (let q = 0; q < 3; q++)
            c.fillRect(zx + P(0.15 + q * 0.42), vy + P(0.2), P(0.3), P(0.3));
        }
      }
      c.fillStyle = 'rgba(255,250,240,0.25)';
      c.fillRect(x0, 0, bw, Math.max(1, P(0.15)));
    } else {
      const t = 26 + b.tone * 12;
      c.fillStyle = rgb(t, t + 2, t + 6);
      c.fillRect(x0, 0, bw, H);
      c.fillStyle = rgb(t + 26, t + 28, t + 34);
      c.fillRect(x0, 0, bw, Math.max(1, P(0.4)));
      for (let k = 0; k < 4; k++) {
        c.fillStyle = rgb(60, 64, 72);
        c.fillRect(x0 + rnd() * (bw - P(3)), P(rand(2, 16)), P(rand(1.5, 3)), P(rand(1.5, 3)));
      }
      c.fillStyle = 'rgb(255,70,60)';
      c.fillRect(x0 + P(0.4), P(0.4), P(0.6), P(0.6));
      c.fillRect(x0 + bw - P(1), P(0.4), P(0.6), P(0.6));
    }
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x0, 0, Math.max(1, P(0.25)), H);
  }
  return cv;
}

function bakeTowers(cfg: CityCfg, blds: Bld[], rnd: () => number) {
  const ppm = cfg.ppm;
  const W = Math.ceil(cfg.len * ppm);
  const H = Math.ceil(cfg.texH * ppm);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return cv;
  const Y = (m: number) => H - m * ppm;
  const X = (z: number) => (z - cfg.z0) * ppm;
  const P = (m: number) => m * ppm;
  for (const b of blds) {
    if (b.h <= 0) continue;
    const x0 = X(b.z0);
    const bw = X(b.z1) - x0;
    const base = 24 + b.tone * 22;
    const bg = c.createLinearGradient(0, Y(b.h), 0, Y(0));
    bg.addColorStop(0, rgb(base + 8, base + 12, base + 20));
    bg.addColorStop(1, rgb(base * 0.6, base * 0.62, base * 0.7));
    c.fillStyle = bg;
    c.fillRect(x0, Y(b.h), bw, P(b.h));
    const banded = b.style < 0.45;
    const colW = banded ? 1.5 : 1.25;
    for (let fy = 6.2; fy < b.h - 1.6; fy += 3.6) {
      const rowLit = rnd();
      for (let cz = b.z0 + 0.4; cz < b.z1 - 0.9; cz += colW) {
        const r = rnd();
        const on = r < 0.14 + rowLit * 0.16;
        let col: string;
        if (on)
          col = rnd() < 0.78 ? rgb(255, 196 + rnd() * 30, 120 + rnd() * 40) : rgb(180, 210, 255);
        else col = r < 0.6 ? rgb(46, 54, 70) : rgb(28, 32, 42);
        c.fillStyle = col;
        c.fillRect(X(cz), Y(fy + 2.5), P(colW - 0.3), P(banded ? 1.9 : 2.5));
      }
      if (banded) {
        c.fillStyle = rgba(base * 0.5, base * 0.5, base * 0.6, 0.9);
        c.fillRect(x0, Y(fy + 0.6), bw, P(0.6));
      }
    }
    // podium and lobby
    c.fillStyle = rgb(58, 58, 64);
    c.fillRect(x0, Y(6), bw, P(6));
    const lg = c.createLinearGradient(0, Y(5), 0, Y(0.3));
    lg.addColorStop(0, 'rgba(255,214,150,1)');
    lg.addColorStop(1, 'rgba(150,96,50,1)');
    c.fillStyle = lg;
    c.fillRect(x0 + P(1), Y(5), bw - P(2), P(4.7));
    c.fillStyle = 'rgba(20,20,24,0.7)';
    for (let cz = b.z0 + 1; cz < b.z1 - 1; cz += 2.2)
      c.fillRect(X(cz), Y(5), Math.max(1, P(0.12)), P(4.7));
    // crown and aviation light
    c.fillStyle = rgb(base + 30, base + 34, base + 42);
    c.fillRect(x0, Y(b.h), bw, P(0.7));
    c.fillStyle = 'rgb(255,60,50)';
    c.fillRect(x0 + P(0.5), Y(b.h + 0.5), P(0.5), P(0.5));
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(x0, Y(b.h), Math.max(1, P(0.2)), P(b.h));
  }
  return cv;
}

/* ---------- hotel corridor ---------- */

const HW = 1.3;
const HL = 36;
const HPPM = 56;

interface HotelTex {
  wall: HTMLCanvasElement;
  floor: HTMLCanvasElement;
  ceil: HTMLCanvasElement;
}

function bakeHotel(): HotelTex {
  const W = HL * HPPM;
  const H = Math.round(2 * HW * HPPM);
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    return cv;
  };
  const wall = mk();
  const floor = mk();
  const ceil = mk();
  const P = (m: number) => m * HPPM;
  const V0 = (y: number) => (HW - y) * HPPM;
  const w = wall.getContext('2d');
  if (w) {
    w.fillStyle = 'rgb(196,164,118)';
    w.fillRect(0, 0, W, H);
    w.fillStyle = 'rgba(120,90,50,0.12)';
    for (let x = 0; x < W; x += P(0.12)) w.fillRect(x, 0, 2, H);
    w.fillStyle = 'rgba(255,240,210,0.08)';
    for (let x = P(0.06); x < W; x += P(0.24)) w.fillRect(x, 0, 1, H);
    // crown moulding and wainscot
    w.fillStyle = 'rgb(226,210,180)';
    w.fillRect(0, 0, W, P(0.12));
    w.fillStyle = 'rgba(60,40,20,0.35)';
    w.fillRect(0, P(0.12), W, P(0.04));
    const wy = V0(-HW + 0.95);
    w.fillStyle = 'rgb(96,60,36)';
    w.fillRect(0, wy, W, H - wy);
    w.fillStyle = 'rgba(40,24,12,0.5)';
    for (let x = 0; x < W; x += P(0.8)) w.strokeRect(x + P(0.08), wy + P(0.12), P(0.64), P(0.62));
    w.fillStyle = 'rgb(150,104,62)';
    w.fillRect(0, wy - P(0.05), W, P(0.07));
    // doors and sconces
    for (let z = 1.6; z < HL; z += 4.4) {
      const dx = P(z);
      const top = V0(-HW + 2.15);
      w.fillStyle = 'rgb(126,88,52)';
      w.fillRect(dx - P(0.09), top - P(0.09), P(1.18), H - top + P(0.09));
      w.fillStyle = 'rgb(64,38,24)';
      w.fillRect(dx, top, P(1.0), H - top);
      w.strokeStyle = 'rgba(28,16,8,0.7)';
      w.lineWidth = 2;
      w.strokeRect(dx + P(0.14), top + P(0.16), P(0.72), P(0.8));
      w.strokeRect(dx + P(0.14), top + P(1.12), P(0.72), P(0.85));
      w.fillStyle = 'rgb(226,184,96)';
      w.beginPath();
      w.arc(dx + P(0.86), V0(-HW + 1.0), P(0.04), 0, TAU);
      w.fill();
      w.fillRect(dx + P(0.46), top + P(0.05), P(0.08), P(0.05));
      // sconce between doors
      const sx = P(z + 2.7);
      w.fillStyle = 'rgb(176,140,70)';
      w.fillRect(sx - P(0.05), V0(0.62), P(0.1), P(0.22));
      w.fillStyle = 'rgb(250,226,180)';
      w.beginPath();
      w.moveTo(sx - P(0.11), V0(0.5));
      w.lineTo(sx + P(0.11), V0(0.5));
      w.lineTo(sx + P(0.15), V0(0.28));
      w.lineTo(sx - P(0.15), V0(0.28));
      w.fill();
    }
    w.fillStyle = 'rgb(54,32,20)';
    w.fillRect(0, H - P(0.1), W, P(0.1));
  }
  const f = floor.getContext('2d');
  if (f) {
    f.fillStyle = 'rgb(122,46,30)';
    f.fillRect(0, 0, W, H);
    f.fillStyle = 'rgb(176,120,52)';
    f.fillRect(0, P(0.16), W, P(0.06));
    f.fillRect(0, H - P(0.22), W, P(0.06));
    f.fillStyle = 'rgb(84,28,20)';
    f.fillRect(0, 0, W, P(0.14));
    f.fillRect(0, H - P(0.14), W, P(0.14));
    f.strokeStyle = 'rgba(206,150,70,0.55)';
    f.lineWidth = 2;
    const cell = P(0.62);
    const y0 = P(0.3);
    const rows = Math.floor((H - 2 * y0) / cell);
    const oy = (H - rows * cell) / 2;
    for (let x = 0; x < W; x += cell) {
      for (let r = 0; r < rows; r++) {
        const cx = x + cell / 2;
        const cy = oy + r * cell + cell / 2;
        f.beginPath();
        f.moveTo(cx, cy - cell * 0.42);
        f.lineTo(cx + cell * 0.42, cy);
        f.lineTo(cx, cy + cell * 0.42);
        f.lineTo(cx - cell * 0.42, cy);
        f.closePath();
        f.stroke();
        f.fillStyle = 'rgba(220,170,80,0.5)';
        f.fillRect(cx - 2, cy - 2, 4, 4);
      }
    }
    f.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 4000; i++) f.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  const c = ceil.getContext('2d');
  if (c) {
    c.fillStyle = 'rgb(214,202,180)';
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(80,60,40,0.25)';
    c.fillRect(0, 0, W, P(0.1));
    c.fillRect(0, H - P(0.1), W, P(0.1));
    for (let z = 1.2; z < HL; z += 3.2) {
      c.fillStyle = 'rgb(236,228,210)';
      c.fillRect(P(z) - P(0.35), H / 2 - P(0.35), P(0.7), P(0.7));
      c.fillStyle = 'rgb(255,250,236)';
      c.fillRect(P(z) - P(0.25), H / 2 - P(0.25), P(0.5), P(0.5));
    }
  }
  return { wall, floor, ceil };
}

/** Square cross-section perimeter: s runs floor → right wall → ceiling → left wall */
const PER = 8 * HW;
function perim(s: number, out: number[]) {
  s = ((s % PER) + PER) % PER;
  const seg = Math.floor(s / (2 * HW));
  const t = s - seg * 2 * HW - HW;
  if (seg === 0) {
    out[0] = t;
    out[1] = -HW;
  } else if (seg === 1) {
    out[0] = HW;
    out[1] = t;
  } else if (seg === 2) {
    out[0] = -t;
    out[1] = HW;
  } else {
    out[0] = -HW;
    out[1] = -t;
  }
  // inward normal, blended round the corners
  const k = clamp((t + HW) / 0.5, 0, 1);
  const k2 = clamp((HW - t) / 0.5, 0, 1);
  const N = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ];
  const a = N[seg];
  const prev = N[(seg + 3) % 4];
  const next = N[(seg + 1) % 4];
  let nx = a[0];
  let ny = a[1];
  if (k < 1) {
    const m = 0.5 + 0.5 * k;
    nx = lerp(prev[0], a[0], m);
    ny = lerp(prev[1], a[1], m);
  } else if (k2 < 1) {
    const m = 0.5 + 0.5 * k2;
    nx = lerp(next[0], a[0], m);
    ny = lerp(next[1], a[1], m);
  }
  const l = Math.hypot(nx, ny) || 1;
  out[2] = nx / l;
  out[3] = ny / l;
}
function perimOf(x: number, y: number) {
  if (Math.abs(y + HW) < 1e-3 || (y <= -Math.abs(x) && y < 0)) return x + HW;
  if (x >= Math.abs(y)) return 2 * HW + y + HW;
  if (y >= Math.abs(x)) return 4 * HW + (HW - x);
  return 6 * HW + (HW - y);
}
const wrapS = (d: number) => {
  d = (d + PER / 2) % PER;
  if (d < 0) d += PER;
  return d - PER / 2;
};

/* ---------- figures (suits, in profile) ---------- */

const POSE_N = 10;
function runPose(out: number[], ph: number) {
  out[0] = 0.32;
  out[1] = -0.15;
  const s0 = Math.sin(ph);
  const s1 = Math.sin(ph + Math.PI);
  out[6] = 0.85 * s0 - 0.05;
  out[7] = -(0.25 + 1.25 * Math.max(0, Math.cos(ph)));
  out[8] = 0.85 * s1 - 0.05;
  out[9] = -(0.25 + 1.25 * Math.max(0, Math.cos(ph + Math.PI)));
  out[2] = -0.9 * s0;
  out[3] = 1.4;
  out[4] = -0.9 * s1;
  out[5] = 1.4;
}
function guardPose(out: number[], punch: number, reel: number) {
  out[0] = 0.12 - reel * 0.35;
  out[1] = reel * 0.3;
  out[6] = 0.35;
  out[7] = -0.3;
  out[8] = -0.3;
  out[9] = -0.08;
  out[2] = lerp(0.9, 1.55, punch);
  out[3] = lerp(1.9, 0.08, punch);
  out[4] = 0.55 + reel * 0.6;
  out[5] = 2.0;
}
function tumblePose(out: number[], t: number) {
  out[0] = 0.2 + Math.sin(t * 2) * 0.3;
  out[1] = 0.3;
  out[6] = 0.7 + Math.sin(t * 3) * 0.3;
  out[7] = -0.9;
  out[8] = -0.6;
  out[9] = -0.5;
  out[2] = 2.4 + Math.sin(t * 2.6) * 0.4;
  out[3] = 0.5;
  out[4] = -2.0;
  out[5] = 0.6;
}

function drawFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sc: number,
  ang: number,
  face: number,
  P: number[],
  light: number,
  ground = true
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(face * sc, sc);
  const hipX = 0;
  let hipY = -0.95;
  if (ground) {
    // plant the lower foot on the floor
    const foot = (th: number, sh: number) => Math.cos(th) * 0.47 + Math.cos(th + sh) * 0.47;
    hipY = -Math.max(foot(P[6], P[7]), foot(P[8], P[9])) - 0.03;
  }
  const lean = P[0];
  const neckX = hipX + Math.sin(lean) * 0.6;
  const neckY = hipY - Math.cos(lean) * 0.6;
  const shX = hipX + Math.sin(lean) * 0.54;
  const shY = hipY - Math.cos(lean) * 0.54;
  const leg = (th: number, sh: number, col: string) => {
    const kx = hipX + Math.sin(th) * 0.47;
    const ky = hipY + Math.cos(th) * 0.47;
    const fx = kx + Math.sin(th + sh) * 0.47;
    const fy = ky + Math.cos(th + sh) * 0.47;
    ctx.fillStyle = col;
    capsule(ctx, hipX, hipY, kx, ky, 0.085, 0.07);
    ctx.fill();
    capsule(ctx, kx, ky, fx, fy, 0.07, 0.055);
    ctx.fill();
    ctx.fillStyle = 'rgb(10,10,12)';
    capsule(
      ctx,
      fx - 0.02,
      fy,
      fx + 0.13 * Math.cos(th + sh),
      fy - 0.13 * Math.sin(th + sh) * 0.2,
      0.05,
      0.045
    );
    ctx.fill();
  };
  const arm = (ua: number, la: number, col: string) => {
    const ex = shX + Math.sin(ua) * 0.3;
    const ey = shY + Math.cos(ua) * 0.3;
    const hx = ex + Math.sin(ua + la) * 0.28;
    const hy = ey + Math.cos(ua + la) * 0.28;
    ctx.fillStyle = col;
    capsule(ctx, shX, shY, ex, ey, 0.065, 0.055);
    ctx.fill();
    capsule(ctx, ex, ey, hx, hy, 0.055, 0.045);
    ctx.fill();
    ctx.fillStyle = 'rgb(150,110,88)';
    ctx.beginPath();
    ctx.arc(hx, hy, 0.05, 0, TAU);
    ctx.fill();
  };
  const back = rgb(18 + light * 10, 18 + light * 9, 22 + light * 8);
  const front = rgb(34 + light * 22, 33 + light * 20, 38 + light * 18);
  leg(P[8], P[9], back);
  arm(P[4], P[5], back);
  ctx.fillStyle = front;
  capsule(ctx, hipX, hipY + 0.02, neckX, neckY, 0.13, 0.15);
  ctx.fill();
  // shirt and tie
  ctx.fillStyle = 'rgb(226,224,218)';
  ctx.beginPath();
  ctx.moveTo(neckX + 0.02, neckY);
  ctx.lineTo(neckX + 0.12 + Math.sin(lean) * 0.0, neckY + 0.05);
  ctx.lineTo(neckX + 0.04 + Math.sin(lean) * 0.2, neckY + 0.24);
  ctx.fill();
  const hx = neckX + Math.sin(lean + P[1]) * 0.15;
  const hy = neckY - Math.cos(lean + P[1]) * 0.15;
  ctx.fillStyle = rgb(170 + light * 30, 126 + light * 24, 100 + light * 18);
  ctx.beginPath();
  ctx.ellipse(hx, hy, 0.1, 0.12, lean + P[1], 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgb(28,22,18)';
  ctx.beginPath();
  ctx.ellipse(hx - 0.02, hy - 0.04, 0.1, 0.085, lean + P[1], Math.PI, TAU);
  ctx.fill();
  leg(P[6], P[7], front);
  arm(P[2], P[3], front);
  ctx.restore();
}

/* ---------- the totem ---------- */

/** The spinning top, standing on its tip at (x, y), S tall */
function drawTop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  S: number,
  spin: number,
  tilt: number,
  warm: number
) {
  ctx.save();
  ctx.translate(x, y);
  // contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(Math.sin(tilt) * S * 0.3, 0, S * 0.36, S * 0.06, 0, 0, TAU);
  ctx.fill();
  ctx.rotate(tilt);
  const r = S * 0.42;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(S * 0.08, -S * 0.08, r * 0.9, -S * 0.3, r, -S * 0.42);
  ctx.bezierCurveTo(r * 1.02, -S * 0.5, r * 0.6, -S * 0.6, S * 0.1, -S * 0.63);
  ctx.lineTo(S * 0.075, -S * 0.66);
  ctx.lineTo(S * 0.07, -S * 0.93);
  ctx.quadraticCurveTo(S * 0.07, -S * 0.99, 0, -S * 0.99);
  ctx.quadraticCurveTo(-S * 0.07, -S * 0.99, -S * 0.07, -S * 0.93);
  ctx.lineTo(-S * 0.075, -S * 0.66);
  ctx.lineTo(-S * 0.1, -S * 0.63);
  ctx.bezierCurveTo(-r * 0.6, -S * 0.6, -r * 1.02, -S * 0.5, -r, -S * 0.42);
  ctx.bezierCurveTo(-r * 0.9, -S * 0.3, -S * 0.08, -S * 0.08, 0, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(-r, 0, r, 0);
  g.addColorStop(0, rgb(34, 34, 38));
  g.addColorStop(0.28, rgb(120 + warm * 30, 118 + warm * 20, 116));
  g.addColorStop(0.42, rgb(236, 232, 224));
  g.addColorStop(0.55, rgb(140, 138, 136));
  g.addColorStop(1, rgb(26, 26, 30));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // engraved facets sweep round as it spins
  ctx.strokeStyle = 'rgba(20,20,24,0.32)';
  ctx.lineWidth = Math.max(0.6, S * 0.006);
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const th = spin + (k * TAU) / 8;
    if (Math.cos(th) < 0) continue;
    const sx = Math.sin(th);
    ctx.moveTo(sx * r * 0.98, -S * 0.42);
    ctx.quadraticCurveTo(sx * r * 0.7, -S * 0.25, sx * S * 0.05, -S * 0.05);
    ctx.moveTo(sx * r * 0.98, -S * 0.43);
    ctx.lineTo(sx * S * 0.12, -S * 0.61);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -S * 0.42, r, S * 0.03, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/* ---------- 3D debris (Paris) ---------- */

interface P3 {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  kind: number;
  rot: number;
  spin: number;
  c: number;
}
const K_FIRE = 0;
const K_SMOKE = 1;
const K_SHARD = 2;
const K_PAPER = 3;
const K_FRUIT = 4;
const K_DISC = 5;
const SHARD_COLS = [
  [196, 220, 236],
  [112, 72, 44],
  [206, 196, 176],
  [168, 36, 34],
  [92, 150, 64],
  [232, 146, 44],
  [242, 238, 228],
  [60, 56, 54],
];

/* ---------- state ---------- */

interface Chunk {
  ti: number;
  col: number;
  row: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  /** offset from the slab's pivot, so a slab tips as one piece */
  ox: number;
  oy: number;
  on: boolean;
}

interface Tower {
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
  /** 0 attached, 1 falling, 2 gone */
  st: Uint8Array;
  fade: Float32Array;
  img: HTMLCanvasElement | null;
  sc: number;
}

interface Drop {
  x: number;
  y: number;
  l: number;
  k: number;
}

interface State {
  level: number;
  levelT: number;
  clock: number;
  ts: number;
  // input
  holding: boolean;
  keyHold: boolean;
  holdT: number;
  moved: boolean;
  downX: number;
  downY: number;
  lastX: number;
  lastY: number;
  downAt: number;
  holdDir: number;
  touched: boolean;
  idle: number;
  auto: boolean;
  autoHold: boolean;
  px: number;
  py: number;
  // transition
  tOn: boolean;
  tT: number;
  tKind: number;
  tFrom: number;
  tTo: number;
  tSwitched: boolean;
  snap: HTMLCanvasElement | null;
  snapA: number;
  flash: number;
  // city levels
  paris: CityGeo | null;
  city: CityGeo | null;
  bend: number;
  bendT: number;
  boomT: number;
  p3: P3[];
  p3n: number;
  fx: Pool;
  drops: Drop[];
  // hotel
  hotel: HotelTex | null;
  hCache: HTMLCanvasElement | null;
  hKey: string;
  rot: number;
  rotV: number;
  aS: number;
  aAng: number;
  qx: number;
  qy: number;
  qvx: number;
  qvy: number;
  qSpin: number;
  qRot: number;
  qMode: number;
  qT: number;
  runPh: number;
  punch: number;
  fightT: number;
  pose: number[];
  pose2: number[];
  // fortress
  fortKey: string;
  fFar: HTMLCanvasElement | null;
  fMid: HTMLCanvasElement | null;
  fNear: HTMLCanvasElement | null;
  fY: number;
  fc: number;
  fGo: boolean;
  fRest: number;
  fBlast: number;
  // limbo
  limKey: string;
  lSky: HTMLCanvasElement | null;
  towers: Tower[];
  chunks: Chunk[];
  lHoldGap: number;
  calveT: number;
  waveT: number;
  // awake
  topPh: number;
  // audio
  hum: Hum | null;
  // layout
  m: number;
  u: number;
  f: number;
  vignette: CanvasGradient | null;
  grain: HTMLCanvasElement;
  warm: HTMLCanvasElement;
  cool: HTMLCanvasElement;
  white: HTMLCanvasElement;
  smoke: HTMLCanvasElement;
  fire: HTMLCanvasElement;
  sodium: HTMLCanvasElement;
  poster: boolean;
}

/* ---------- audio ---------- */

let BRASS: Float32Array<ArrayBuffer> | null = null;
function brassCurve() {
  if (BRASS) return BRASS;
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 2.6);
  }
  BRASS = c;
  return c;
}

/** The horn: detuned low brass with a filter that blares open and slowly closes, plus a sub and rumble */
function braam(bus: AudioBus, depth: number) {
  const { ctx, out } = bus;
  const t0 = ctx.currentTime + 0.01;
  const root = 55 * Math.pow(2, (-depth * 2) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.34, t0 + 0.16);
  g.gain.setTargetAtTime(0.24, t0 + 0.4, 0.5);
  g.gain.setTargetAtTime(0.0001, t0 + 1.7, 0.55);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2.5;
  lp.frequency.setValueAtTime(110, t0);
  lp.frequency.exponentialRampToValueAtTime(1500, t0 + 0.26);
  lp.frequency.exponentialRampToValueAtTime(320, t0 + 2.8);
  const shaper = ctx.createWaveShaper();
  shaper.curve = brassCurve();
  shaper.connect(lp).connect(g).connect(out);
  const voices: [number, OscillatorType, number][] = [
    [root, 'sawtooth', 0.32],
    [root * 1.006, 'sawtooth', 0.3],
    [root * 0.994, 'sawtooth', 0.26],
    [root * 2.003, 'sawtooth', 0.16],
    [root * 3, 'sawtooth', 0.06],
    [root * 0.5, 'square', 0.2],
  ];
  for (const [f, type, gain] of voices) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f * 0.94, t0);
    o.frequency.exponentialRampToValueAtTime(f, t0 + 0.22);
    const og = ctx.createGain();
    og.gain.value = gain;
    o.connect(og).connect(shaper);
    o.start(t0);
    o.stop(t0 + 4.2);
  }
  tone(bus, root / 2, { type: 'sine', attack: 0.12, decay: 3, gain: 0.32 });
  noise(bus, { duration: 2.4, gain: 0.2, freq: 110, q: 0.6, type: 'lowpass' });
}

function boom(bus: AudioBus, big: number) {
  noise(bus, { duration: 1.2 + big, gain: 0.22 + big * 0.1, freq: 160, q: 0.5, type: 'lowpass' });
  tone(bus, 72, { type: 'sine', attack: 0.01, decay: 1.1, gain: 0.25, glideTo: 30 });
  for (let i = 0; i < 4; i++)
    tone(bus, rand(2600, 4200), {
      type: 'triangle',
      attack: 0.002,
      decay: 0.12,
      gain: 0.02,
      delay: 0.2 + i * rand(0.08, 0.2),
    });
}

/* ---------- layout ---------- */

function layout(s: State, env: SceneEnv) {
  const { w, h } = env;
  s.m = Math.min(w, h);
  s.u = clamp(s.m / 620, 0.45, 2);
  s.f = Math.min(w * 0.98, h * 1.18);
  const v = env.ctx.createRadialGradient(
    w / 2,
    h * 0.5,
    s.m * 0.35,
    w / 2,
    h * 0.5,
    Math.hypot(w, h) * 0.62
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  s.vignette = v;
  s.drops = [];
  for (let i = 0; i < 260; i++)
    s.drops.push({ x: Math.random() * w, y: Math.random() * h, l: rand(0.5, 1), k: i % 3 });
  s.fortKey = '';
  s.limKey = '';
}

/* ---------- level entry and the kick ---------- */

function freeCity(g: CityGeo | null) {
  if (g) for (const list of [g.tex, g.roof, ...g.mipFog]) freeCanvas(...list);
  return null;
}

function enterLevel(s: State, lv: number) {
  // the façade bakes are big; keep only the city being dreamt
  if (lv !== PARIS && s.paris) s.paris = freeCity(s.paris);
  if (lv !== CITY && s.city) s.city = freeCity(s.city);
  if (lv !== HOTEL && s.hCache) {
    freeCanvas(s.hCache);
    s.hCache = null;
    s.hKey = '';
  }
  s.level = lv;
  s.levelT = 0;
  s.holdT = 0;
  s.autoHold = false;
  if (lv === PARIS) {
    s.bend = s.bendT = s.poster ? 0.84 : 0.0;
    s.boomT = 1.4;
    for (const p of s.p3) p.life = 0;
    if (s.paris) for (const t of s.paris.tables) t.gone = 0;
  } else if (lv === CITY) {
    s.bend = s.bendT = 0;
  } else if (lv === HOTEL) {
    s.rot = 0;
    s.rotV = 0;
    s.aS = HW;
    s.aAng = 0;
    s.qMode = 0;
    s.fightT = 0;
  } else if (lv === FORT) {
    s.fc = 0;
    s.fGo = false;
    s.fRest = 0;
    s.fBlast = 0;
  } else if (lv === LIMBO) {
    s.limKey = '';
    s.chunks.length = 0;
    s.calveT = 1;
    s.lHoldGap = 0;
  } else if (lv === AWAKE) {
    s.topPh = 0;
  }
}

/** Hold the current picture (without the HUD) so reduced motion can crossfade out of it */
function takeSnap(s: State, env: SceneEnv) {
  const cv = s.snap ?? document.createElement('canvas');
  cv.width = env.canvas.width;
  cv.height = env.canvas.height;
  const c = cv.getContext('2d');
  s.snap = cv;
  s.snapA = 1;
  if (!c) return;
  c.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  renderScene(s, { ...env, ctx: c }, s.clock);
}

function renderScene(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  ctx.save();
  if (s.tOn && !env.reducedMotion) drawTransition(s, env, t);
  else drawLevel(s, env, s.level, t);
  ctx.restore();
  if (s.flash > 0.01) {
    ctx.fillStyle = `rgba(255,248,236,${(s.flash * 0.35).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (s.vignette) {
    ctx.fillStyle = s.vignette;
    ctx.fillRect(0, 0, w, h);
  }
  drawGrain(ctx, s.grain, w, h, 0.05);
}

function kick(s: State, env: SceneEnv) {
  if (s.tOn) return;
  const from = s.level;
  const to = from === AWAKE ? PARIS : from === LIMBO ? AWAKE : from + 1;
  const kind =
    from === AWAKE ? TK_FADE : from === LIMBO ? TK_WAKE : from % 2 === 0 ? TK_VAN : TK_LIFT;
  const bus = env.audio();
  if (bus) {
    if (kind === TK_FADE) tone(bus, 220, { type: 'sine', attack: 0.4, decay: 1.6, gain: 0.05 });
    else braam(bus, Math.min(to, 4));
    if (kind === TK_LIFT) {
      tone(bus, 1318, { type: 'sine', attack: 0.004, decay: 0.9, gain: 0.05 });
      noise(bus, { duration: 0.5, gain: 0.12, freq: 300, q: 1.2, type: 'bandpass' });
    }
  }
  if (from === PARIS && s.paris)
    for (let i = 0; i < 4; i++) explode(s, env, i % 2 ? 1 : -1, rand(10, 40), false);
  if (env.reducedMotion) {
    takeSnap(s, env);
    enterLevel(s, to);
    env.wake(1200);
    return;
  }
  s.tOn = true;
  s.tT = 0;
  s.tKind = kind;
  s.tFrom = from;
  s.tTo = to;
  s.tSwitched = false;
}

/* ---------- Paris explosions ---------- */

function spawn3(
  s: State,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  life: number,
  size: number,
  kind: number,
  c: number
) {
  const p = s.p3[s.p3n];
  s.p3n = (s.p3n + 1) % s.p3.length;
  p.x = x;
  p.y = y;
  p.z = z;
  p.vx = vx;
  p.vy = vy;
  p.vz = vz;
  p.life = p.max = life;
  p.size = size;
  p.kind = kind;
  p.rot = Math.random() * TAU;
  p.spin = rand(-3, 3);
  p.c = c;
}

function explode(s: State, env: SceneEnv, side: number, z: number, sound = true) {
  const g = s.paris;
  if (!g) return;
  const x = side * (g.cfg.half - 0.4);
  const out = -side;
  for (let i = 0; i < 14; i++)
    spawn3(
      s,
      x,
      rand(0.4, 3),
      z + rand(-1.5, 1.5),
      out * rand(0.5, 4),
      rand(0.3, 2.5),
      rand(-1.5, 1.5),
      rand(1.4, 2.6),
      rand(0.9, 1.8),
      K_FIRE,
      0
    );
  for (let i = 0; i < 12; i++)
    spawn3(
      s,
      x,
      rand(0.3, 3.2),
      z + rand(-2, 2),
      out * rand(0.4, 3),
      rand(0.2, 1.6),
      rand(-1.2, 1.2),
      rand(4, 7),
      rand(1.6, 3),
      K_SMOKE,
      0
    );
  for (let i = 0; i < 40; i++)
    spawn3(
      s,
      x,
      rand(0.3, 3.5),
      z + rand(-2, 2),
      out * rand(1.5, 11),
      rand(0.5, 6),
      rand(-4, 4),
      rand(6, 10),
      rand(0.07, 0.26),
      K_SHARD,
      Math.floor(Math.random() * SHARD_COLS.length)
    );
  for (let i = 0; i < 10; i++)
    spawn3(
      s,
      x,
      rand(0.5, 3),
      z + rand(-2, 2),
      out * rand(1, 6),
      rand(1, 4),
      rand(-3, 3),
      rand(8, 11),
      rand(0.14, 0.22),
      K_PAPER,
      6
    );
  for (let i = 0; i < 10; i++)
    spawn3(
      s,
      x,
      rand(0.6, 1.2),
      z + rand(-1.5, 1.5),
      out * rand(2, 7),
      rand(1, 5),
      rand(-3, 3),
      rand(7, 10),
      rand(0.07, 0.11),
      K_FRUIT,
      3 + Math.floor(Math.random() * 3)
    );
  for (const t of g.tables) {
    if (t.gone > 0 || side < 0 || Math.abs(t.z - z) > 5) continue;
    t.gone = 10;
    spawn3(s, t.x, 0.75, t.z, out * rand(2, 4), rand(2, 4), rand(-1, 1), 9, 0.4, K_DISC, 6);
    for (let i = 0; i < 2; i++)
      spawn3(
        s,
        t.x + rand(-0.5, 0.5),
        0.5,
        t.z + rand(-0.6, 0.6),
        out * rand(1, 3),
        rand(1.5, 3.5),
        rand(-1.5, 1.5),
        9,
        0.3,
        K_DISC,
        1
      );
    for (let i = 0; i < 6; i++)
      spawn3(
        s,
        t.x,
        0.8,
        t.z,
        out * rand(1, 4),
        rand(1, 4),
        rand(-2, 2),
        9,
        rand(0.05, 0.09),
        K_SHARD,
        0
      );
  }
  s.flash = Math.max(s.flash, 0.35);
  const bus = sound ? env.audio() : null;
  if (bus) boom(bus, 0.3);
}

/* ---------- update ---------- */

function setHold(s: State, on: boolean) {
  if (on && !s.holding) {
    s.holdT = 0;
    s.holdDir = s.level === PARIS || s.level === CITY ? (s.bendT > 0.6 ? -1 : 1) : s.holdDir;
  }
  s.holding = on;
}

function update(s: State, env: SceneEnv, dt: number) {
  s.clock += dt;
  s.idle += dt;
  s.auto = !env.interactive || s.idle > (s.touched ? 10 : 2.5);
  if (env.pointer.inside && env.interactive) {
    s.px = damp(s.px, (env.pointer.x / Math.max(1, env.w)) * 2 - 1, 3, dt);
    s.py = damp(s.py, (env.pointer.y / Math.max(1, env.h)) * 2 - 1, 3, dt);
  } else if (s.auto && !env.reducedMotion) {
    s.px = damp(s.px, Math.sin(s.clock * 0.21) * 0.5, 1, dt);
    s.py = damp(s.py, Math.sin(s.clock * 0.17) * 0.3, 1, dt);
  }

  // the transition owns the clock while it runs; time sags into slow motion round the switch
  let slow = 1;
  if (s.tOn) {
    s.tT += dt;
    const dur = T_DUR[s.tKind];
    const k = s.tT / dur;
    slow = 1 - 0.88 * Math.sin(Math.PI * clamp(k, 0, 1));
    if (!s.tSwitched && k >= T_SWITCH[s.tKind]) {
      s.tSwitched = true;
      enterLevel(s, s.tTo);
      s.flash = s.tKind === TK_FADE ? 0 : 0.8;
      if (s.tKind === TK_VAN || s.tKind === TK_WAKE)
        for (let i = 0; i < 90; i++)
          emit(
            s.fx,
            rand(0.1, 0.9) * env.w,
            env.h * rand(0.85, 1.05),
            rand(-160, 160) * s.u,
            -rand(200, 700) * s.u,
            rand(0.8, 1.6),
            rand(2, 6) * s.u,
            1,
            0.6,
            600 * s.u
          );
    }
    if (k >= 1) s.tOn = false;
  }
  s.levelT += dt;
  s.ts = LEVELS[s.level].time * slow;
  const dtw = dt * s.ts;

  if (s.holding || s.keyHold) s.holdT += dt;
  const live = (s.holding && (s.holdT > 0.2 || s.moved)) || s.keyHold || s.autoHold;

  if (s.auto) autopilot(s, env);

  switch (s.level) {
    case PARIS:
    case CITY: {
      if (live && !s.moved) s.bendT = clamp(s.bendT + s.holdDir * 0.34 * dt, 0, 1);
      s.bend = env.reducedMotion ? s.bendT : damp(s.bend, s.bendT, 3.2, dt);
      const g = s.level === PARIS ? s.paris : s.city;
      if (g) updateCity(s, env, g, dt, dtw);
      break;
    }
    case HOTEL:
      updateHotel(s, env, dt, dtw, live);
      break;
    case FORT:
      updateFort(s, env, dt, dtw, live);
      break;
    case LIMBO:
      updateLimbo(s, env, dt, dtw, live);
      break;
    case AWAKE:
      s.topPh += dt * 26;
      if (!env.reducedMotion && s.levelT > 7.2 && !s.tOn) kick(s, env);
      break;
  }

  stepPool(s.fx, dt * (s.tOn ? 0.5 : 1));
  s.flash = Math.max(0, s.flash - dt * 1.6);
  if (s.snapA > 0) s.snapA = Math.max(0, s.snapA - dt / 0.9);

  // ambience
  const bus = env.audio();
  if (bus && !s.hum) s.hum = startHum(bus, { type: 'sine', freq: 46, cutoff: 400, noiseAmt: 0.9 });
  if (s.hum) {
    let lv = 0.012;
    let cut = 380;
    if (s.tOn) {
      lv = 0.05;
      cut = 240;
    } else if (s.level === CITY) {
      lv = 0.05;
      cut = 2600;
    } else if (s.level === HOTEL) {
      lv = 0.02 + Math.min(0.06, Math.abs(s.rotV) * 0.04);
      cut = 260 + Math.abs(s.rotV) * 900;
    } else if (s.level === FORT) {
      lv = 0.03 + 0.02 * Math.sin(s.clock * 0.7) + (s.fGo && s.fc < 1 ? 0.05 : 0);
      cut = 800;
    } else if (s.level === LIMBO) {
      lv = 0.03 + 0.03 * (0.5 + 0.5 * Math.sin(s.waveT * 1.3));
      cut = 420;
    } else if (s.level === AWAKE) {
      lv = s.levelT > 6.2 ? 0.0001 : 0.006;
      cut = 200;
    }
    setHum(s.hum, 46, lv, cut);
    if (bus && s.level === AWAKE && s.levelT < 6.2 && !s.tOn && Math.random() < dt * 9)
      tone(bus, rand(880, 940), { type: 'sine', attack: 0.004, decay: 0.05, gain: 0.006 });
  }

  if (s.tOn || s.holding || s.keyHold || s.snapA > 0 || s.flash > 0) keepAwake(env, 300);
}

function autopilot(s: State, env: SceneEnv) {
  const T = s.levelT;
  const canKick = !env.interactive || s.idle > 18;
  s.autoHold = false;
  switch (s.level) {
    case PARIS: {
      // a slow breath of folding and unfolding, starting from wherever the street is
      const tgt = 0.5 - 0.46 * Math.cos(T * 0.42);
      s.bendT = s.poster && T < 4 ? Math.max(s.bendT, tgt) : tgt;
      if (canKick && T > 12.5) kick(s, env);
      break;
    }
    case CITY:
      s.bendT = T < 1.5 ? 0 : T < 6.5 ? 0.9 : 0.5;
      if (canKick && T > 10) kick(s, env);
      break;
    case HOTEL:
      s.autoHold = T > 1.2 && T < 6.8;
      if (canKick && T > 10.5) kick(s, env);
      break;
    case FORT:
      s.autoHold = T > 1.6 && T < 2.2;
      if (canKick && T > 11) kick(s, env);
      break;
    case LIMBO:
      s.autoHold = (T > 1.2 && T < 3.6) || (T > 6 && T < 7.2);
      if (canKick && T > 10.5) kick(s, env);
      break;
  }
}

function updateCity(s: State, env: SceneEnv, g: CityGeo, dt: number, dtw: number) {
  const end = g.cfg.z0 + g.cfg.len;
  if (!env.reducedMotion || s.holding) {
    for (const c of g.cars) {
      if (!c.v) continue;
      c.z += c.v * dtw;
      if (c.z > end - 4) c.z = g.cfg.z0 + 6;
      if (c.z < g.cfg.z0 + 6) c.z = end - 4;
    }
    for (const w of g.walkers) {
      w.z += w.v * dtw;
      w.ph += dtw * 7;
      if (w.z > end - 2) w.z = 4;
      if (w.z < 4) w.z = end - 2;
    }
  }
  if (s.level === PARIS) {
    s.boomT -= dtw;
    if (s.boomT <= 0) {
      s.boomT = rand(3.2, 5.5);
      explode(s, env, Math.random() < 0.6 ? 1 : -1, rand(9, 52));
    }
    for (const t of g.tables) if (t.gone > 0) t.gone = Math.max(0, t.gone - dtw);
    // debris floats: the explosions run in deep slow motion
    const k = dtw * 0.3;
    for (const p of s.p3) {
      if (p.life <= 0) continue;
      p.life -= p.kind === K_FIRE || p.kind === K_SMOKE ? dtw * 0.6 : dtw * 0.8;
      const drag = p.kind === K_SMOKE ? 0.6 : p.kind === K_PAPER ? 0.5 : 0.08;
      const e = Math.exp(-drag * k);
      p.vx *= e;
      p.vy *= e;
      p.vz *= e;
      p.vy +=
        (p.kind === K_SMOKE || p.kind === K_FIRE ? 0.6 : p.kind === K_PAPER ? -0.8 : -3.2) * k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.z += p.vz * k;
      p.rot += p.spin * k;
      if (p.y < 0.02 && p.kind !== K_SMOKE && p.kind !== K_FIRE) {
        p.y = 0.02;
        p.vy *= -0.25;
        p.vx *= 0.5;
        p.vz *= 0.5;
        p.spin *= 0.5;
      }
    }
  } else if (!env.reducedMotion) {
    for (const d of s.drops) {
      const sp = (0.9 + d.k * 0.5) * env.h * 2.2;
      d.y += sp * dtw * d.l;
      d.x -= sp * 0.12 * dtw * d.l;
      if (d.y > env.h + 20) {
        d.y = -rand(10, 80);
        d.x = Math.random() * (env.w + 80);
      }
      if (d.x < -20) d.x += env.w + 40;
    }
    if (Math.random() < dt * 30)
      emit(
        s.fx,
        Math.random() * env.w,
        env.h * rand(0.75, 1),
        rand(-15, 15) * s.u,
        -rand(30, 70) * s.u,
        rand(0.15, 0.3),
        rand(1.5, 3) * s.u,
        1,
        0,
        400 * s.u
      );
  }
}

function updateHotel(s: State, env: SceneEnv, dt: number, dtw: number, live: boolean) {
  const rm = env.reducedMotion;
  if (!rm) {
    if (live) s.rotV = damp(s.rotV, s.holdDir * 1.9, 1.6, dt);
    else {
      s.rotV = damp(s.rotV, 0, 1.2, dt);
      if (Math.abs(s.rotV) < 0.35) {
        const tgt = Math.round(s.rot / (Math.PI / 2)) * (Math.PI / 2);
        s.rotV += (tgt - s.rot) * 4 * dt;
      }
    }
    s.rot += s.rotV * dtw * 2.2;
  }
  // gravity in corridor coordinates, and the lowest point of the cross-section
  const gx = -Math.sin(s.rot);
  const gy = -Math.cos(s.rot);
  const tq = HW / Math.max(Math.abs(gx), Math.abs(gy));
  const sT = perimOf(gx * tq, gy * tq);
  s.aS = rm ? sT : s.aS + wrapS(sT - s.aS) * (1 - Math.exp(-8 * dt));
  const fast = Math.abs(s.rotV) > 0.55;
  s.runPh += dtw * (fast ? 9 + Math.abs(s.rotV) * 4 : 0);
  // the projection loses its footing when the room turns quickly and tumbles round it
  if (s.qMode === 0 && fast && !rm) {
    s.qMode = 1;
    const tmp = [0, 0, 0, 0];
    perim(s.aS + 0.7, tmp);
    s.qx = tmp[0] + tmp[2] * 0.5;
    s.qy = tmp[1] + tmp[3] * 0.5;
    s.qvx = tmp[2] * 2;
    s.qvy = tmp[3] * 2;
    s.qT = 0;
  }
  if (s.qMode === 1) {
    s.qT += dt;
    const G = 6;
    s.qvx += gx * G * dtw;
    s.qvy += gy * G * dtw;
    // the walls carry it round as they turn
    const w = s.rotV * 2.2;
    s.qvx += -w * s.qy * dtw * 0.6;
    s.qvy += w * s.qx * dtw * 0.6;
    s.qx += s.qvx * dtw;
    s.qy += s.qvy * dtw;
    const lim = HW - 0.45;
    if (Math.abs(s.qx) > lim) {
      s.qx = Math.sign(s.qx) * lim;
      s.qvx *= -0.45;
    }
    if (Math.abs(s.qy) > lim) {
      s.qy = Math.sign(s.qy) * lim;
      s.qvy *= -0.45;
    }
    s.qSpin = damp(s.qSpin, 2.4 * Math.sign(s.rotV || 1), 2, dt);
    s.qRot += s.qSpin * dtw;
    if (!fast && s.qT > 1.2 && Math.hypot(s.qvx, s.qvy) < 1.2) s.qMode = 0;
  }
  if (!fast) {
    s.fightT += dtw;
    const cyc = s.fightT % 1.6;
    s.punch = cyc < 0.25 ? smooth(cyc / 0.12) * (1 - smooth((cyc - 0.15) / 0.1)) : 0;
    if (cyc - dtw < 0.12 && cyc >= 0.12) {
      const bus = env.audio();
      if (bus) noise(bus, { duration: 0.08, gain: 0.12, freq: 380, q: 1, type: 'lowpass' });
    }
  } else s.punch = 0;
}

const FORT_BLOCKS = [
  [-11, -4.6, 0, 2.6, 2.2],
  [4.6, 12, 0, 2.2, 2.2],
  [-5.2, 5.2, 0, 3.3, 3],
  [-4.3, 4.3, 3.3, 5.9, 2.6],
  [-3.5, 3.5, 5.9, 8.3, 2.3],
  [-2.7, 2.7, 8.3, 10.5, 2],
  [-1.8, 1.8, 10.5, 12.4, 1.6],
];
const FORT_START = [0.04, 0.1, 0, 0.16, 0.28, 0.4, 0.52];

function updateFort(s: State, env: SceneEnv, dt: number, dtw: number, live: boolean) {
  if (live && !s.fGo && s.fc <= 0.001) {
    s.fGo = true;
    s.fRest = 0;
    s.fBlast = 0;
  }
  // the collapse runs on its own slow clock so it reads as slow motion without dragging on
  if (s.fGo) {
    if (s.fc < 1) s.fc = Math.min(1, s.fc + dt * 0.19);
    else {
      s.fRest += dt;
      if (s.fRest > 2.4) s.fGo = false;
    }
  } else if (s.fc > 0) s.fc = Math.max(0, s.fc - dt * 0.26);
  // charges go off block by block from the base up
  const U = s.m * 0.021;
  const fx = fortX(s, env.w);
  const fy = s.fY;
  for (let i = 0; i < FORT_BLOCKS.length; i++) {
    const bit = 1 << i;
    if (s.fGo && s.fc >= FORT_START[i] && !(s.fBlast & bit)) {
      s.fBlast |= bit;
      const b = FORT_BLOCKS[i];
      const bx = fx + ((b[0] + b[1]) / 2) * U;
      const by = fy - ((b[2] + b[3]) / 2) * U;
      for (let k = 0; k < 18; k++)
        emit(
          s.fx,
          bx + rand(-1, 1) * (b[1] - b[0]) * U * 0.5,
          by,
          rand(-60, 60) * s.u,
          rand(-60, 10) * s.u,
          rand(0.5, 1),
          rand(10, 22) * s.u,
          4,
          1.5,
          0
        );
      for (let k = 0; k < 14; k++)
        emit(
          s.fx,
          bx,
          by,
          rand(-140, 140) * s.u,
          rand(-160, -20) * s.u,
          rand(1.5, 3),
          rand(1.5, 3.5) * s.u,
          6,
          0.3,
          120 * s.u
        );
      s.flash = Math.max(s.flash, 0.25);
      const bus = env.audio();
      if (bus) boom(bus, 0.6);
    }
  }
  if (s.fGo && s.fc > 0 && s.fc < 1 && !env.reducedMotion && Math.random() < dt * 40) {
    const x = fx + rand(-10, 11) * U;
    emit(
      s.fx,
      x,
      fy + rand(-1, 1) * U,
      rand(-20, 20) * s.u,
      -rand(10, 40) * s.u,
      rand(3, 5),
      rand(20, 46) * s.u,
      5,
      0.4,
      -4 * s.u
    );
  }
  if (!env.reducedMotion) {
    for (const d of s.drops) {
      const sp = (0.25 + d.k * 0.22) * env.h * 0.35;
      d.y += sp * dtw * d.l * 2;
      d.x += Math.sin(s.clock * 0.6 + d.l * 9) * sp * 0.5 * dtw + sp * 0.35 * dtw;
      if (d.y > env.h + 10) {
        d.y = -10;
        d.x = Math.random() * env.w;
      }
      if (d.x > env.w + 10) d.x -= env.w + 20;
    }
  }
}

function updateLimbo(s: State, env: SceneEnv, dt: number, dtw: number, live: boolean) {
  s.waveT += dtw;
  if (!s.towers.length) return;
  s.lHoldGap = live ? 0 : s.lHoldGap + dt;
  const rate = live ? 4.5 : env.reducedMotion ? 0 : 0.18;
  s.calveT -= dt * rate;
  if (s.calveT <= 0) {
    s.calveT += 1;
    calve(s, env);
  }
  const g = s.m * 0.55;
  for (const c of s.chunks) {
    if (!c.on) continue;
    const T = s.towers[c.ti];
    c.vy += g * T.sc * dtw * 1.6;
    c.x += c.vx * dtw * 1.6;
    c.y += c.vy * dtw * 1.6;
    c.rot += c.spin * dtw;
    const cy = c.y + c.ox * Math.sin(c.rot) + c.oy * Math.cos(c.rot);
    if (cy > T.y + T.h * 0.02) {
      c.on = false;
      T.st[c.row * T.cols + c.col] = 2;
      const n = Math.round(6 + 10 * T.sc);
      const sx = c.x + c.ox * Math.cos(c.rot) - c.oy * Math.sin(c.rot);
      for (let k = 0; k < n; k++)
        emit(
          s.fx,
          sx + rand(-1, 1) * (T.w / T.cols) * 0.5,
          T.y,
          rand(-60, 60) * T.sc * s.u,
          -rand(60, 220) * T.sc * s.u,
          rand(0.8, 1.6),
          rand(2, 5) * T.sc * s.u + 1,
          1,
          0.8,
          260 * T.sc * s.u
        );
      emit(s.fx, sx, T.y, 0, 0, 1.4, (T.w / T.cols) * 1.2, 7, 0, 0);
      const bus = env.audio();
      if (bus && Math.random() < 0.5)
        noise(bus, {
          duration: 0.7,
          gain: 0.08 * T.sc + 0.02,
          freq: 700,
          q: 0.7,
          type: 'bandpass',
        });
    }
  }
  // unsupported blocks follow the ones beneath them down
  for (let ti = 0; ti < s.towers.length; ti++) {
    const T = s.towers[ti];
    for (let r = 0; r < T.rows - 1; r++) {
      for (let c = 0; c < T.cols; c++) {
        const i = r * T.cols + c;
        if (T.st[i] !== 0) continue;
        if (T.st[(r + 1) * T.cols + c] !== 0 && Math.random() < dt * 2.2)
          drop(s, ti, c, r, 0, rand(5, 20) * T.sc * s.u, rand(-0.15, 0.15));
      }
    }
    // the dream rebuilds from the waterline up once you let go
    if (s.lHoldGap > 2.2 || env.reducedMotion) {
      for (let c = 0; c < T.cols; c++) {
        for (let r = T.rows - 1; r >= 0; r--) {
          const i = r * T.cols + c;
          if (T.st[i] === 2) {
            if (Math.random() < dt * (env.reducedMotion ? 60 : 1.6)) {
              T.st[i] = 0;
              T.fade[i] = env.reducedMotion ? 1 : 0;
            }
            break;
          }
          if (T.st[i] !== 0) break;
        }
      }
    }
    for (let i = 0; i < T.fade.length; i++)
      if (T.fade[i] < 1) T.fade[i] = Math.min(1, T.fade[i] + dt * 0.7);
  }
}

function drop(
  s: State,
  ti: number,
  col: number,
  row: number,
  push: number,
  vx = NaN,
  spin = NaN,
  px = NaN,
  py = NaN
) {
  const T = s.towers[ti];
  T.st[row * T.cols + col] = 1;
  let c = s.chunks.find((k) => !k.on);
  if (!c) {
    if (s.chunks.length > 260) return;
    c = { ti, col, row, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, ox: 0, oy: 0, on: false };
    s.chunks.push(c);
  }
  const cw = T.w / T.cols;
  const ch = T.h / T.rows;
  c.ti = ti;
  c.col = col;
  c.row = row;
  const cx = T.x - T.w / 2 + (col + 0.5) * cw;
  const cy = T.y - T.h + (row + 0.5) * ch;
  c.x = Number.isNaN(px) ? cx : px;
  c.y = Number.isNaN(py) ? cy : py;
  c.ox = cx - c.x;
  c.oy = cy - c.y;
  c.vx = Number.isNaN(vx) ? (push + rand(10, 40)) * T.sc * s.u : vx;
  c.vy = Number.isNaN(vx) ? rand(-10, 10) * T.sc * s.u : 0;
  c.rot = 0;
  c.spin = Number.isNaN(spin) ? rand(0.05, 0.5) : spin;
  c.on = true;
}

function calve(s: State, env: SceneEnv) {
  // seaward faces break away in slabs, bigger towers more often
  const ti = Math.random() < 0.55 ? 0 : 1 + Math.floor(Math.random() * (s.towers.length - 1));
  const T = s.towers[ti];
  const row = Math.floor(rand(0.08, 0.7) * T.rows);
  let col = -1;
  for (let c = T.cols - 1; c >= 0; c--) {
    if (T.st[row * T.cols + c] === 0) {
      col = c;
      break;
    }
  }
  if (col < 0) return;
  const hgt = 1 + Math.floor(Math.random() * 3);
  const wid = 1 + Math.floor(Math.random() * 2);
  // a slab leaves as one piece: shared drift and a slow shared lean
  const vx = rand(20, 45) * T.sc * s.u;
  const spin = rand(0.1, 0.35);
  const cw = T.w / T.cols;
  const ch = T.h / T.rows;
  // pivot on the slab's outer bottom corner, so it tips out over the water
  const px = T.x - T.w / 2 + (col + 1) * cw;
  const py = T.y - T.h + Math.min(T.rows - 1, row + hgt) * ch;
  for (let r = row; r < Math.min(T.rows - 1, row + hgt); r++)
    for (let c = col; c > col - wid && c >= 0; c--)
      if (T.st[r * T.cols + c] === 0) drop(s, ti, c, r, 30, vx, spin, px, py);
  for (let k = 0; k < 8; k++)
    emit(
      s.fx,
      T.x + T.w / 2,
      T.y - T.h + (row / T.rows) * T.h,
      rand(0, 30) * T.sc * s.u,
      rand(-10, 10) * s.u,
      rand(1, 2),
      rand(8, 16) * T.sc * s.u,
      5,
      0.6,
      0
    );
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.18, gain: 0.06, freq: 2400, q: 0.8, type: 'bandpass' });
    noise(bus, { duration: 1.4, gain: 0.08, freq: 140, q: 0.6, type: 'lowpass' });
  }
}

/* ---------- drawing: the cities ---------- */

function cityCamera(s: State, env: SceneEnv, g: CityGeo) {
  const { w, h } = env;
  const b = smooth(s.bend);
  const cfg = g.cfg;
  setCurl(cfg.R, cfg.zh, b * Math.PI * 0.995);
  const portrait = h > w * 1.1;
  V.f = Math.min(w * 0.7, h * 0.85);
  V.hx = w / 2 - s.px * w * 0.015;
  V.hy = h * lerp(portrait ? 0.6 : 0.62, portrait ? 0.7 : 0.8, b) + s.py * h * 0.02;
  V.cx = (cfg.kind === 0 ? -1.5 : 0) + s.px * 0.9;
  V.cy = (cfg.kind === 0 ? 1.7 : 2.2) + b * 0.4 - s.py * 0.25;
  V.cz = -b * 3;
  const pitch = lerp(0.02, cfg.kind === 0 ? 0.12 : 0.16, b);
  V.sp = Math.sin(pitch);
  V.cp = Math.cos(pitch);
  if (cfg.kind === 0) setLight(-0.62, 0.62, -0.48);
  else setLight(0.2, 0.9, -0.3);
}

const GP = new Float32Array(16);
const SPANS: number[] = [];
const FV = new Float32Array(12);
const PARIS_FOG = [234, 222, 204];
const CITY_FOG = [26, 30, 42];

function drawCity(s: State, env: SceneEnv, g: CityGeo, t: number) {
  const { ctx, w, h } = env;
  const cfg = g.cfg;
  const paris = cfg.kind === 0;
  cityCamera(s, env, g);
  const fog = paris ? PARIS_FOG : CITY_FOG;
  readBase(ctx);

  // sky, anchored to the horizon
  const hzY = V.hy + (V.sp / V.cp) * V.f;
  const sky = ctx.createLinearGradient(0, hzY - h * 1.3, 0, hzY);
  if (paris) {
    sky.addColorStop(0, '#6f8fae');
    sky.addColorStop(0.55, '#b7c4cc');
    sky.addColorStop(1, '#efe2c9');
  } else {
    sky.addColorStop(0, '#05070c');
    sky.addColorStop(0.6, '#121827');
    sky.addColorStop(1, '#2a2c38');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  if (paris) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, s.warm, w * 0.12, hzY - h * 0.7, s.m * 0.9, 0.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ground, far to near
  const xs = [-cfg.half, -cfg.half + cfg.walk, cfg.half - cfg.walk, cfg.half];
  const gzs = g.gz;
  const bands = paris
    ? [
        [184, 172, 154],
        [98, 94, 94],
        [184, 172, 154],
      ]
    : [
        [44, 46, 54],
        [24, 26, 32],
        [44, 46, 54],
      ];
  const curb: number[] = [];
  // strips close to the lens, the flat stretch before the hinge as one plane, then the curl
  SPANS.length = 0;
  let k = 0;
  while (k < gzs.length - 1 && gzs[k] < 1.4) {
    SPANS.push(gzs[k], gzs[k + 1]);
    k++;
  }
  let k2 = k;
  while (k2 < gzs.length - 1 && gzs[k2 + 1] <= V.zh) k2++;
  if (k2 > k) {
    SPANS.push(gzs[k], gzs[k2]);
    k = k2;
  }
  for (; k < gzs.length - 1; k++) SPANS.push(gzs[k], gzs[k + 1]);
  for (let i = SPANS.length - 2; i >= 0; i -= 2) {
    const z0 = SPANS[i];
    const z1 = Math.min(gzs[gzs.length - 1], SPANS[i + 1] + 0.15);
    let ok = true;
    let dist = 0;
    for (let k = 0; k < 4 && ok; k++) {
      ok = toScreen(xs[k], 0, z0);
      GP[k * 2] = SX;
      GP[k * 2 + 1] = SY;
      if (ok) {
        ok = toScreen(xs[k], 0, z1);
        GP[8 + k * 2] = SX;
        GP[8 + k * 2 + 1] = SY;
        if (k === 1) dist = Math.hypot(CX, CY, CZ);
      }
    }
    if (!ok) continue;
    const zm = (z0 + z1) / 2;
    const d = zm - V.zh;
    const ph = d <= 0 || V.b <= 0 ? 0 : Math.min(d / V.R, V.b);
    const nl = LW[1] * Math.cos(ph) - LW[2] * Math.sin(ph);
    const lb = paris ? 0.62 + 0.42 * Math.max(0, nl) : 0.85 + 0.15 * Math.max(0, nl);
    const fk = 1 - Math.exp(-dist / cfg.fogD);
    const pave = paris && i & 2 ? 0.965 : 1;
    for (let b = 0; b < 3; b++) {
      const c = bands[b];
      ctx.fillStyle = mixFog(c[0] * lb * pave, c[1] * lb * pave, c[2] * lb * pave, fk, fog);
      ctx.beginPath();
      ctx.moveTo(GP[b * 2], GP[b * 2 + 1]);
      ctx.lineTo(GP[b * 2 + 2], GP[b * 2 + 3]);
      ctx.lineTo(GP[8 + b * 2 + 2], GP[8 + b * 2 + 3]);
      ctx.lineTo(GP[8 + b * 2], GP[8 + b * 2 + 1]);
      ctx.closePath();
      ctx.fill();
    }
    curb.push(GP[2], GP[3], GP[10], GP[11], GP[4], GP[5], GP[12], GP[13]);
  }
  ctx.strokeStyle = paris ? 'rgba(70,60,50,0.55)' : 'rgba(120,130,150,0.35)';
  ctx.lineWidth = Math.max(1, 1.5 * s.u);
  ctx.beginPath();
  for (let i = 0; i < curb.length; i += 8) {
    ctx.moveTo(curb[i], curb[i + 1]);
    ctx.lineTo(curb[i + 2], curb[i + 3]);
    ctx.moveTo(curb[i + 4], curb[i + 5]);
    ctx.lineTo(curb[i + 6], curb[i + 7]);
  }
  ctx.stroke();

  // road markings
  ctx.fillStyle = paris ? 'rgba(236,232,222,0.8)' : 'rgba(220,200,120,0.55)';
  const mark = (x0: number, x1: number, z0: number, z1: number) => {
    if (!toScreen(x0, 0.01, z0)) return;
    const ax = SX;
    const ay = SY;
    if (!toScreen(x1, 0.01, z0)) return;
    const bx = SX;
    const by = SY;
    if (!toScreen(x1, 0.01, z1)) return;
    const cx = SX;
    const cy = SY;
    if (!toScreen(x0, 0.01, z1)) return;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.lineTo(SX, SY);
    ctx.closePath();
    ctx.fill();
  };
  if (paris) {
    // setts: courses of stone across the carriageway, fading out with distance
    const rx = cfg.half - cfg.walk;
    ctx.lineWidth = 1;
    for (let z = 1.5; z < V.zh; z += z < 12 ? 0.45 : z < 30 ? 0.9 : 1.8) {
      if (!toScreen(-rx, 0, z)) continue;
      const ax = SX;
      const ay = SY;
      if (!toScreen(rx, 0, z)) continue;
      ctx.strokeStyle = `rgba(40,36,34,${(0.16 * Math.exp(-z / 30)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(SX, SY);
      ctx.stroke();
    }
    for (const cz of [30, 112])
      for (let x = -cfg.half + cfg.walk + 0.5; x < cfg.half - cfg.walk - 0.4; x += 1.1)
        mark(x, x + 0.55, cz, cz + 3.2);
  } else {
    for (let z = 8; z < cfg.z0 + cfg.len - 4; z += 9) mark(-0.08, 0.08, z, z + 4.5);
  }

  // wet street: the lights smear down into the asphalt
  if (!paris) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < g.lamps.length; i += 2) {
      const lx = g.lamps[i];
      const lz = g.lamps[i + 1];
      if (lz > V.zh - 2 && V.b > 0.2) continue;
      if (!toScreen(lx * 0.92, 0, lz)) continue;
      const r = (3.2 / CZ) * V.f;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(s.sodium, SX - r * 0.35, SY - r * 0.15, r * 0.7, r * 3.2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // everything that stands up, sorted
  NI = 0;
  const faces = g.faces;
  for (let i = 0; i < faces.length; i++) {
    const fc = faces[i];
    const p = fc.p;
    let ok = true;
    let dsum = 0;
    const o = i * 8;
    for (let k = 0; k < 4; k++) {
      if (!toScreen(p[k * 3], p[k * 3 + 1], p[k * 3 + 2])) {
        ok = false;
        break;
      }
      g.scr[o + k * 2] = SX;
      g.scr[o + k * 2 + 1] = SY;
      FV[k * 3] = CX;
      FV[k * 3 + 1] = CY;
      FV[k * 3 + 2] = CZ;
      dsum += Math.hypot(CX, CY, CZ);
    }
    if (!ok) continue;
    const ax = FV[3] - FV[0];
    const ay = FV[4] - FV[1];
    const az = FV[5] - FV[2];
    const bx = FV[6] - FV[0];
    const by = FV[7] - FV[1];
    const bz = FV[8] - FV[2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    if (fc.cull && fc.ns * (nx * FV[0] + ny * FV[1] + nz * FV[2]) >= 0) continue;
    const nl = (Math.hypot(nx, ny, nz) || 1) * fc.ns;
    g.shade[i] = (nx * LC[0] + ny * LC[1] + nz * LC[2]) / nl;
    g.dep[i] = dsum / 4;
    // facades sit just behind anything standing in front of them at the same depth
    pushItem(g.dep[i] + (fc.kind === F_FACADE ? 0.6 : 0), 0, i);
  }
  for (let i = 0; i < g.cars.length; i++) {
    const c = g.cars[i];
    if (toScreen(c.x, 0.8, c.z)) pushItem(Math.hypot(CX, CY, CZ), 1, i);
  }
  for (let i = 0; i < g.walkers.length; i++) {
    const wk = g.walkers[i];
    if (toScreen(wk.x, 0.9, wk.z)) pushItem(Math.hypot(CX, CY, CZ), 2, i);
  }
  for (let i = 0; i < g.lamps.length; i += 2)
    if (toScreen(g.lamps[i], 2, g.lamps[i + 1])) pushItem(Math.hypot(CX, CY, CZ), 3, i);
  for (let i = 0; i < g.tables.length; i++) {
    const tb = g.tables[i];
    if (tb.gone > 8.6) continue;
    if (toScreen(tb.x, 0.5, tb.z)) pushItem(Math.hypot(CX, CY, CZ), 4, i);
  }
  sortItems();
  for (let n = 0; n < NI; n++) {
    const it = ITEMS[ORD[n]];
    if (it.k === 0) drawFace(ctx, g, it.i, fog);
    else if (it.k === 1) drawCar(ctx, s, g, g.cars[it.i], fog);
    else if (it.k === 2) drawWalker(ctx, s, g, g.walkers[it.i], fog, t);
    else if (it.k === 3) drawLamp(ctx, s, g, it.i, fog);
    else drawTable(ctx, s, g.tables[it.i]);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  if (paris) drawDebris(ctx, s, t);
  else drawRain(ctx, s, env);

  // grade
  if (paris) {
    const lg = ctx.createLinearGradient(0, 0, w, h);
    lg.addColorStop(0, 'rgba(255,190,120,0.12)');
    lg.addColorStop(1, 'rgba(30,60,90,0.12)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = 'rgba(20,40,70,0.12)';
    ctx.fillRect(0, 0, w, h);
  }
}

function drawFace(ctx: CanvasRenderingContext2D, g: CityGeo, i: number, fog: number[]) {
  const fc = g.faces[i];
  const fk = 1 - Math.exp(-g.dep[i] / g.cfg.fogD);
  if (fc.kind === F_FACADE) {
    const q = g.scr;
    const o = i * 8;
    const sw = Math.hypot(q[o + 2] - q[o], q[o + 3] - q[o + 1]) + 0.01;
    const sh = Math.hypot(q[o + 6] - q[o], q[o + 7] - q[o + 1]) + 0.01;
    if (fc.du / sw > 2.5 || fc.dv / sh > 2.5) {
      // distant strips: the pre-hazed quarter copy, no extra fill
      const lv = Math.min(FOG_LEVELS - 1, Math.round(fk / FOG_STEP));
      const rest = fk - lv * FOG_STEP;
      texQuad(
        ctx,
        g.mipFog[fc.tex][lv],
        fc.u0 / 4,
        fc.du / 4,
        fc.v0 / 4,
        fc.dv / 4,
        q,
        o,
        rest > 0.04 ? rgba(fog[0], fog[1], fog[2], rest) : null
      );
    } else {
      const fs = fk > 0.06 ? rgba(fog[0], fog[1], fog[2], fk) : null;
      texQuad(ctx, g.tex[fc.tex], fc.u0, fc.du, fc.v0, fc.dv, q, o, fs);
    }
    return;
  }
  if (fc.kind === F_ROOF) {
    const lb = 0.72 + 0.28 * Math.max(0, g.shade[i]);
    const A = Math.min(1, fk + (1 - lb) * (1 - fk));
    const k = A > 0.001 ? fk / A : 0;
    texQuad(
      ctx,
      g.roof[fc.tex],
      fc.u0,
      fc.du,
      fc.v0,
      fc.dv,
      g.scr,
      i * 8,
      A > 0.01 ? rgba(fog[0] * k, fog[1] * k, fog[2] * k, A) : null
    );
    return;
  }
  const paris = g.cfg.kind === 0;
  let lb: number;
  if (fc.kind === F_FLAT) lb = 0.75 + 0.25 * Math.abs(g.shade[i]);
  else lb = paris ? 0.55 + 0.5 * Math.max(0, g.shade[i]) : 0.8 + 0.2 * Math.max(0, g.shade[i]);
  const c = fc.col;
  ctx.fillStyle = mixFog(c[0] * lb, c[1] * lb, c[2] * lb, fk, fog);
  const q = g.scr;
  const o = i * 8;
  ctx.beginPath();
  ctx.moveTo(q[o], q[o + 1]);
  ctx.lineTo(q[o + 2], q[o + 3]);
  ctx.lineTo(q[o + 4], q[o + 5]);
  ctx.lineTo(q[o + 6], q[o + 7]);
  ctx.closePath();
  ctx.fill();
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  col: number[],
  fog: number[],
  fk: number,
  paris: boolean,
  top: number[] | null = null
) {
  // corners 0..7: bit0 x, bit1 y, bit2 z
  const C = [0, 0, 0, 0, 0, 0, 0, 0].map(() => [0, 0, 0, 0, 0]);
  for (let k = 0; k < 8; k++) {
    const ok = toScreen(k & 1 ? x1 : x0, k & 2 ? y1 : y0, k & 4 ? z1 : z0);
    if (!ok) return;
    C[k][0] = SX;
    C[k][1] = SY;
    C[k][2] = CX;
    C[k][3] = CY;
    C[k][4] = CZ;
  }
  // faces with outward winding: +y, -x, +x, -z, +z
  const F = [
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
    [0, 2, 3, 1],
    [4, 5, 7, 6],
  ];
  for (const f of F) {
    const a = C[f[0]];
    const b = C[f[1]];
    const c = C[f[2]];
    const ux = b[2] - a[2];
    const uy = b[3] - a[3];
    const uz = b[4] - a[4];
    const vx = c[2] - a[2];
    const vy = c[3] - a[3];
    const vz = c[4] - a[4];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (nx * a[2] + ny * a[3] + nz * a[4] >= 0) continue;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const dl = (nx * LC[0] + ny * LC[1] + nz * LC[2]) / nl;
    const lb = paris ? 0.5 + 0.55 * Math.max(0, dl) : 0.3 + 0.3 * Math.max(0, dl);
    const cc = top && f === F[0] ? top : col;
    ctx.fillStyle = mixFog(cc[0] * lb, cc[1] * lb, cc[2] * lb, fk, fog);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.lineTo(C[f[3]][0], C[f[3]][1]);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCar(ctx: CanvasRenderingContext2D, s: State, g: CityGeo, c: Car, fog: number[]) {
  const paris = g.cfg.kind === 0;
  toScreen(c.x, 0.8, c.z);
  const fk = 1 - Math.exp(-Math.hypot(CX, CY, CZ) / g.cfg.fogD);
  const hw = c.wid / 2;
  const hl = c.len / 2;
  const tyre = [22, 22, 24];
  const near = (c.len / Math.hypot(CX, CY, CZ)) * V.f > 36;
  if (near)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const wx = c.x + sx * (hw - 0.16);
        const wz = c.z + sz * (hl - 0.8);
        drawBox(ctx, wx - 0.13, wx + 0.13, 0, 0.62, wz - 0.32, wz + 0.32, tyre, fog, fk, paris);
      }
  drawBox(ctx, c.x - hw, c.x + hw, 0.3, 0.92, c.z - hl, c.z + hl, c.col, fog, fk, paris);
  const glass = paris ? [92, 108, 124] : [40, 46, 58];
  drawBox(
    ctx,
    c.x - hw + 0.12,
    c.x + hw - 0.12,
    0.92,
    1.4,
    c.z - hl * 0.45,
    c.z + hl * 0.3,
    glass,
    fog,
    fk,
    paris,
    c.col
  );
  if (!paris && c.v) {
    ctx.globalCompositeOperation = 'lighter';
    const dir = Math.sign(c.v);
    const head = dir < 0;
    const zz = c.z + (head ? -hl : hl);
    for (const sx of [-0.65, 0.65]) {
      if (!toScreen(c.x + sx, 0.62, zz)) continue;
      const r = ((head ? 1.6 : 0.9) / CZ) * V.f;
      glow(ctx, head ? s.white : s.fire, SX, SY, r, head ? 0.9 : 0.6);
      if (c.z < V.zh) {
        ctx.globalAlpha = head ? 0.35 : 0.3;
        ctx.drawImage(head ? s.sodium : s.fire, SX - r * 0.25, SY, r * 0.5, r * 2.6);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

const WALK_COLS = [
  [40, 38, 40],
  [70, 54, 44],
  [34, 40, 58],
  [120, 104, 86],
];
function drawWalker(
  ctx: CanvasRenderingContext2D,
  s: State,
  g: CityGeo,
  wk: Walker,
  fog: number[],
  t: number
) {
  if (!toScreen(wk.x, 0, wk.z)) return;
  const fx = SX;
  const fy = SY;
  const d = Math.hypot(CX, CY, CZ);
  if (!toScreen(wk.x, wk.h, wk.z)) return;
  const hx = SX;
  const hy = SY;
  const sc = V.f / d;
  if (sc * wk.h < 2) return;
  const fk = 1 - Math.exp(-d / g.cfg.fogD);
  const c = WALK_COLS[wk.col];
  const paris = g.cfg.kind === 0;
  const col = mixFog(c[0], c[1], c[2], fk, fog);
  const ux = (hx - fx) / wk.h;
  const uy = (hy - fy) / wk.h;
  const bob = Math.abs(Math.sin(wk.ph)) * 0.03;
  const sw = Math.sin(wk.ph) * 0.22;
  ctx.fillStyle = col;
  // legs
  const hipX = fx + ux * 0.9;
  const hipY = fy + uy * 0.9;
  const px = -uy;
  const py = ux;
  capsule(ctx, hipX, hipY, fx + px * sw, fy + py * sw, 0.09 * sc, 0.06 * sc);
  ctx.fill();
  capsule(ctx, hipX, hipY, fx - px * sw, fy - py * sw, 0.09 * sc, 0.06 * sc);
  ctx.fill();
  capsule(ctx, hipX, hipY, fx + ux * (1.45 + bob), fy + uy * (1.45 + bob), 0.2 * sc, 0.22 * sc);
  ctx.fill();
  ctx.fillStyle = mixFog(150, 116, 96, fk, fog);
  ctx.beginPath();
  ctx.arc(fx + ux * (1.62 + bob), fy + uy * (1.62 + bob), 0.11 * sc, 0, TAU);
  ctx.fill();
  if (!paris) {
    // umbrella
    ctx.fillStyle = mixFog(14, 14, 18, fk, fog);
    const cx = fx + ux * 2.05;
    const cy = fy + uy * 2.05;
    const a = Math.atan2(uy, ux) + Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 0.55 * sc, 0.22 * sc, a, Math.PI, TAU);
    ctx.fill();
  }
  void t;
}

function drawLamp(ctx: CanvasRenderingContext2D, s: State, g: CityGeo, i: number, fog: number[]) {
  const paris = g.cfg.kind === 0;
  const x = g.lamps[i];
  const z = g.lamps[i + 1];
  const H = paris ? 4.4 : 7.5;
  if (!toScreen(x, 0, z)) return;
  const bx = SX;
  const by = SY;
  const d = Math.hypot(CX, CY, CZ);
  if (!toScreen(x, H, z)) return;
  const fk = 1 - Math.exp(-d / g.cfg.fogD);
  ctx.strokeStyle = mixFog(28, 30, 30, fk, fog);
  ctx.lineWidth = Math.max(0.6, (0.13 / d) * V.f);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(SX, SY);
  ctx.stroke();
  const r = (0.28 / d) * V.f;
  ctx.fillStyle = mixFog(30, 32, 34, fk, fog);
  ctx.fillRect(SX - r, SY - r * 1.8, r * 2, r * 1.8);
  if (!paris) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, s.sodium, SX, SY - r, (3.4 / d) * V.f, 0.8 * (1 - fk * 0.6));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

function drawTable(ctx: CanvasRenderingContext2D, s: State, tb: Table) {
  const fade =
    tb.gone > 0
      ? clamp((8.6 - tb.gone) / 0.1, 0, 1) * 0 + (tb.gone > 0 ? clamp(1 - tb.gone / 1.4, 0, 1) : 1)
      : 1;
  if (fade <= 0.01) return;
  ctx.globalAlpha = fade;
  // two bistro chairs then the round marble top
  for (const dz of [-0.62, 0.62]) {
    if (!toScreen(tb.x + 0.15, 0, tb.z + dz)) continue;
    const fx = SX;
    const fy = SY;
    const sc = V.f / CZ;
    ctx.strokeStyle = 'rgb(48,30,20)';
    ctx.lineWidth = Math.max(1, 0.05 * sc);
    ctx.beginPath();
    ctx.moveTo(fx - 0.18 * sc, fy);
    ctx.lineTo(fx - 0.16 * sc, fy - 0.46 * sc);
    ctx.moveTo(fx + 0.18 * sc, fy);
    ctx.lineTo(fx + 0.16 * sc, fy - 0.46 * sc);
    ctx.moveTo(fx + 0.18 * sc, fy - 0.46 * sc);
    ctx.lineTo(fx + 0.2 * sc, fy - 0.92 * sc);
    ctx.stroke();
    ctx.fillStyle = 'rgb(150,104,60)';
    ctx.beginPath();
    ctx.ellipse(fx, fy - 0.46 * sc, 0.22 * sc, 0.07 * sc, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgb(120,80,44)';
    ctx.lineWidth = Math.max(1, 0.07 * sc);
    ctx.beginPath();
    ctx.ellipse(
      fx + 0.05 * sc,
      fy - 0.8 * sc,
      0.2 * sc,
      0.08 * sc,
      0,
      Math.PI * 1.05,
      Math.PI * 1.95
    );
    ctx.stroke();
  }
  if (toScreen(tb.x, 0, tb.z)) {
    const fx = SX;
    const fy = SY;
    const sc = V.f / CZ;
    ctx.fillStyle = 'rgb(30,26,24)';
    ctx.fillRect(fx - 0.03 * sc, fy - 0.74 * sc, 0.06 * sc, 0.74 * sc);
    ctx.fillRect(fx - 0.2 * sc, fy - 0.03 * sc, 0.4 * sc, 0.04 * sc);
    ctx.fillStyle = 'rgb(236,232,224)';
    ctx.beginPath();
    ctx.ellipse(fx, fy - 0.76 * sc, 0.38 * sc, 0.1 * sc, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(fx - 0.38 * sc, fy - 0.76 * sc, 0.76 * sc, 0.03 * sc);
    // two cups
    ctx.fillStyle = 'rgb(250,250,246)';
    ctx.fillRect(fx - 0.15 * sc, fy - 0.86 * sc, 0.08 * sc, 0.09 * sc);
    ctx.fillRect(fx + 0.08 * sc, fy - 0.86 * sc, 0.08 * sc, 0.09 * sc);
  }
  ctx.globalAlpha = 1;
  void s;
}

function drawDebris(ctx: CanvasRenderingContext2D, s: State, t: number) {
  // fire and smoke first, then the solid pieces
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 0) ctx.globalCompositeOperation = 'source-over';
    for (const p of s.p3) {
      if (p.life <= 0) continue;
      const solid = p.kind >= K_SHARD;
      if ((pass === 0) === solid) continue;
      if (!toScreen(p.x, p.y, p.z)) continue;
      const sc = V.f / CZ;
      const lf = p.life / p.max;
      if (p.kind === K_FIRE) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.fire, SX, SY, p.size * sc * (1 + (1 - lf) * 1.2), lf * lf * 0.9);
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === K_SMOKE) {
        glow(ctx, s.smoke, SX, SY, p.size * sc * (1 + (1 - lf) * 1.6), Math.min(1, lf * 1.6) * 0.5);
      } else {
        ctx.globalAlpha = Math.min(1, lf * 3);
        const r = Math.max(0.8, p.size * sc);
        const c = SHARD_COLS[p.c];
        if (p.kind === K_FRUIT) {
          ctx.fillStyle = rgb(c[0], c[1], c[2]);
          ctx.beginPath();
          ctx.arc(SX, SY, r, 0, TAU);
          ctx.fill();
        } else if (p.kind === K_DISC) {
          ctx.fillStyle = rgb(c[0], c[1], c[2]);
          ctx.beginPath();
          ctx.ellipse(SX, SY, r, r * 0.3 * Math.abs(Math.cos(p.rot)) + 0.8, p.rot * 0.4, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(60,50,40,0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          const fl =
            p.kind === K_PAPER
              ? 0.5 + 0.5 * Math.abs(Math.sin(p.rot * 2 + t))
              : 0.75 + 0.25 * Math.cos(p.rot * 3);
          ctx.fillStyle = rgb(c[0] * fl, c[1] * fl, c[2] * fl);
          const cs = Math.cos(p.rot) * r;
          const sn = Math.sin(p.rot) * r;
          ctx.beginPath();
          ctx.moveTo(SX + cs, SY + sn);
          ctx.lineTo(SX - sn * 0.5, SY + cs * 0.5);
          ctx.lineTo(SX - cs, SY - sn);
          ctx.lineTo(SX + sn * 0.7, SY - cs * 0.7);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawRain(ctx: CanvasRenderingContext2D, s: State, env: SceneEnv) {
  const slowK = clamp(1 - s.ts, 0, 1);
  for (let k = 0; k < 3; k++) {
    ctx.strokeStyle = `rgba(190,205,230,${(0.12 + k * 0.08).toFixed(2)})`;
    ctx.lineWidth = (0.6 + k * 0.5) * s.u + 0.3;
    ctx.beginPath();
    const len = (10 + k * 12) * s.u * (1 - slowK * 0.7);
    for (const d of s.drops) {
      if (d.k !== k) continue;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + len * 0.12 * d.l, d.y - len * d.l);
    }
    ctx.stroke();
  }
  drawFx(ctx, s);
  void env;
}

/* ---------- drawing: the hotel ---------- */

const HQ = new Float32Array(8);
const PT = [0, 0, 0, 0];

const hotelF = (w: number, h: number) => Math.min(w * 0.95, h * 1.3) * 0.82;

/**
 * The corridor only ever rolls about the view axis, so it is rendered once, unrolled, into a
 * square big enough to cover the frame at any angle, with fine perspective subdivision and its
 * lights baked in. Each frame then just turns that image and draws the fighters over it.
 */
function bakeCorridor(s: State, env: SceneEnv) {
  const { w, h } = env;
  if (!s.hotel) s.hotel = bakeHotel();
  const H = s.hotel;
  const dpr = Math.min(env.dpr, 1.5);
  const D = Math.ceil(Math.hypot(w, h)) + 4;
  const L = layer(s.hCache, D, D, dpr);
  s.hCache = L.cv;
  const c = L.c;
  s.hKey = `${w}x${h}x${env.dpr}`;
  if (!c) return;
  readBase(c);
  const f = hotelF(w, h);
  const cx = D / 2;
  const cy = D / 2;
  const P = (x: number, y: number, z: number, o: number) => {
    HQ[o] = cx + (x / z) * f;
    HQ[o + 1] = cy - (y / z) * f;
  };
  c.fillStyle = 'rgb(20,12,8)';
  c.fillRect(0, 0, D, D);
  // the far end: a frosted window throwing light back down the hall
  const quad = (pts: number[], col: string) => {
    for (let k = 0; k < 4; k++) P(pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2], k * 2);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(HQ[0], HQ[1]);
    c.lineTo(HQ[2], HQ[3]);
    c.lineTo(HQ[4], HQ[5]);
    c.lineTo(HQ[6], HQ[7]);
    c.closePath();
    c.fill();
  };
  quad([-HW, HW, HL, HW, HW, HL, HW, -HW, HL, -HW, -HW, HL], 'rgb(90,64,40)');
  quad([-0.45, 0.85, HL, 0.45, 0.85, HL, 0.45, -0.35, HL, -0.45, -0.35, HL], 'rgb(255,236,200)');
  const surf: [number, number, number, number, HTMLCanvasElement, number, string][] = [
    [-HW, HW, HW, HW, H.ceil, 0, 'rgb(214,202,180)'],
    [HW, HW, HW, -HW, H.wall, 1.7, 'rgb(170,136,96)'],
    [HW, -HW, -HW, -HW, H.floor, 0, 'rgb(122,46,30)'],
    [-HW, HW, -HW, -HW, H.wall, 0, 'rgb(170,136,96)'],
  ];
  const R = D / 2 + 2;
  const off = (x: number, y: number) => Math.abs(x - cx) > R || Math.abs(y - cy) > R;
  let z0 = 0.3;
  while (z0 < HL) {
    const z1 = Math.min(HL, z0 * 1.035 + 0.02);
    const fk = 0.82 * (1 - Math.exp(-((z0 + z1) / 2) / 15));
    // enough cells across each wall that perspective error stays under a couple of pixels
    const ext = (2 * HW * f) / z0;
    const n = clamp(Math.ceil((ext * (z1 / z0 - 1)) / 2.5), 1, 40);
    for (const [ax, ay, bx, by, img, o, under] of surf) {
      const u0 = ((z0 + o) % HL) * HPPM;
      const u1 = u0 + (z1 - z0) * HPPM;
      const vh = img.height;
      for (let k = 0; k < n; k++) {
        const ka = k / n;
        const kb = (k + 1) / n;
        const xa = lerp(ax, bx, ka);
        const ya = lerp(ay, by, ka);
        const xb = lerp(ax, bx, kb);
        const yb = lerp(ay, by, kb);
        P(xa, ya, z0, 0);
        P(xa, ya, z1, 2);
        P(xb, yb, z1, 4);
        P(xb, yb, z0, 6);
        if (off(HQ[0], HQ[1]) && off(HQ[6], HQ[7]) && off(HQ[2], HQ[3]) && off(HQ[4], HQ[5])) {
          // fully outside only if the whole cell is on one side; cheap and conservative
          const minX = Math.min(HQ[0], HQ[2], HQ[4], HQ[6]);
          const maxX = Math.max(HQ[0], HQ[2], HQ[4], HQ[6]);
          const minY = Math.min(HQ[1], HQ[3], HQ[5], HQ[7]);
          const maxY = Math.max(HQ[1], HQ[3], HQ[5], HQ[7]);
          if (maxX < cx - R || minX > cx + R || maxY < cy - R || minY > cy + R) continue;
        }
        texQuad(c, img, u0, u1 - u0, ka * vh, (kb - ka) * vh, HQ, 0, null, under);
      }
      if (fk > 0.02) {
        P(ax, ay, z0, 0);
        P(ax, ay, z1, 2);
        P(bx, by, z1, 4);
        P(bx, by, z0, 6);
        c.fillStyle = rgba(26, 14, 8, fk);
        c.beginPath();
        c.moveTo(HQ[0], HQ[1]);
        c.lineTo(HQ[2], HQ[3]);
        c.lineTo(HQ[4], HQ[5]);
        c.lineTo(HQ[6], HQ[7]);
        c.closePath();
        c.fill();
      }
    }
    z0 = z1;
  }
  // lights: wall sconces and ceiling pots
  c.globalCompositeOperation = 'lighter';
  const pr = (x: number, y: number, z: number) => {
    P(x, y, z, 0);
    return (1 / z) * f;
  };
  for (let z = 1.6 + 2.7; z < HL; z += 4.4) {
    const k = Math.exp(-z / 16);
    let sc = pr(-HW + 0.02, 0.4, z);
    glow(c, s.warm, HQ[0], HQ[1], 0.9 * sc, 0.75 * k);
    const zr = z - 1.7;
    sc = pr(HW - 0.02, 0.4, zr);
    glow(c, s.warm, HQ[0], HQ[1], 0.9 * sc, 0.75 * Math.exp(-zr / 16));
  }
  for (let z = 1.2; z < HL; z += 3.2) {
    const sc = pr(0, HW - 0.02, z);
    glow(c, s.warm, HQ[0], HQ[1], 0.8 * sc, 0.55 * Math.exp(-z / 14));
  }
  P(0, 0.2, HL, 0);
  glow(c, s.warm, HQ[0], HQ[1], (3.2 / HL) * f * 3, 0.5);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
}

function drawHotel(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  if (!s.hCache || s.hKey !== `${w}x${h}x${env.dpr}`) bakeCorridor(s, env);
  const f = hotelF(w, h);
  const hx = w / 2 + s.px * w * 0.01;
  const hy = h / 2 + s.py * h * 0.01;
  const cr = Math.cos(s.rot);
  const sr = Math.sin(s.rot);
  const P = (x: number, y: number, z: number, o: number) => {
    const xr = x * cr - y * sr;
    const yr = x * sr + y * cr;
    HQ[o] = hx + (xr / z) * f;
    HQ[o + 1] = hy - (yr / z) * f;
  };
  ctx.fillStyle = 'rgb(20,12,8)';
  ctx.fillRect(0, 0, w, h);
  if (s.hCache) {
    const D = Math.ceil(Math.hypot(w, h)) + 4;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-s.rot);
    ctx.drawImage(s.hCache, -D / 2, -D / 2, D, D);
    ctx.restore();
  }

  // the fight: Arthur keeps his feet; the projection goes round the room
  const zf = 5.4;
  const sc = f / zf;
  const figAt = (sp: number) => {
    perim(sp, PT);
    P(PT[0], PT[1], zf, 0);
    const nxr = PT[2] * cr - PT[3] * sr;
    const nyr = PT[2] * sr + PT[3] * cr;
    return Math.atan2(nxr, nyr);
  };
  const fast = Math.abs(s.rotV) > 0.55 && !env.reducedMotion;
  const aS = s.aS - (fast ? 0 : 0.42);
  const aAng = figAt(aS);
  const ax = HQ[0];
  const ay = HQ[1];
  if (fast) runPose(s.pose, s.runPh);
  else guardPose(s.pose, s.punch, 0);
  const faceA = fast ? -Math.sign(s.rotV) : 1;
  // shadow pool under him
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(ax, ay, 0.45 * sc, 0.1 * sc, aAng, 0, TAU);
  ctx.fill();
  if (s.qMode === 1) {
    P(s.qx, s.qy, zf + 0.3, 0);
    tumblePose(s.pose2, s.clock);
    drawFigure(ctx, HQ[0], HQ[1], (f / (zf + 0.3)) * 1, s.qRot, 1, s.pose2, 0.6, false);
  } else {
    const qAng = figAt(s.aS + 0.42);
    guardPose(s.pose2, 0, s.punch);
    drawFigure(ctx, HQ[0], HQ[1], sc * 0.98, qAng, -1, s.pose2, 0.5);
  }
  drawFigure(ctx, ax, ay, sc, aAng, faceA, s.pose, 0.8);
  void t;
}

/* ---------- drawing: the fortress ---------- */

function ridge(rnd: () => number, n: number, rough: number) {
  const a = new Float32Array(n + 1);
  a[0] = rnd();
  a[n] = rnd();
  let step = n;
  let amp = 1;
  while (step > 1) {
    const half = step >> 1;
    for (let i = half; i < n; i += step)
      a[i] = (a[i - half] + a[i + half]) / 2 + (rnd() - 0.5) * amp;
    amp *= rough;
    step = half;
  }
  return a;
}

/** A mountain range: a few sharp massifs, sun from the left, the right flanks in blue shadow */
function bakeRange(
  c: CanvasRenderingContext2D,
  W: number,
  H: number,
  base: number,
  amp: number,
  seed: number,
  nPeaks: number,
  cols: string[],
  shadow: string,
  rock: string,
  flatAt = -1,
  flatY = 0
) {
  const rnd = mulberry(seed);
  const peaks: { x: number; y: number; sl: number; sr: number }[] = [];
  for (let i = 0; i < nPeaks; i++)
    peaks.push({
      x: ((i + 0.15 + rnd() * 0.7) / nPeaks) * W,
      y: base - amp * (0.5 + rnd() * 0.5),
      sl: 0.5 + rnd() * 0.5,
      sr: 0.55 + rnd() * 0.6,
    });
  const n = 256;
  const r = ridge(rnd, n, 0.62);
  const ys = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * W;
    let y = H;
    for (const p of peaks) y = Math.min(y, p.y + (x < p.x ? (p.x - x) * p.sl : (x - p.x) * p.sr));
    y += (r[i] - 0.5) * amp * 0.12;
    if (flatAt >= 0) {
      const d = Math.abs(x - flatAt) / (W * 0.1);
      if (d < 1) y = lerp(flatY, y, smooth(d * d));
    }
    ys[i] = Math.min(y, base + amp * 0.2);
  }
  const outline = () => {
    c.beginPath();
    c.moveTo(0, H);
    for (let i = 0; i <= n; i++) c.lineTo((i / n) * W, ys[i]);
    c.lineTo(W, H);
    c.closePath();
  };
  const g = c.createLinearGradient(0, base - amp, 0, H);
  cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
  c.fillStyle = g;
  outline();
  c.fill();
  c.save();
  outline();
  c.clip();
  // each massif's shaded flank: from the summit down a slanting spine to the base
  for (const p of peaks) {
    const sg = c.createLinearGradient(0, p.y, 0, H);
    sg.addColorStop(0, shadow);
    sg.addColorStop(1, 'rgba(150,170,205,0.15)');
    c.fillStyle = sg;
    c.beginPath();
    c.moveTo(p.x, p.y - 2);
    c.lineTo(p.x + (H - p.y) * p.sr * 1.4, H);
    c.lineTo(p.x + (H - p.y) * 0.25, H);
    c.closePath();
    c.fill();
    // couloirs of bare rock running down from the ridge
    c.strokeStyle = rock;
    c.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const side = rnd() < 0.6 ? 1 : -1;
      const sx = p.x + side * rnd() * (H - p.y) * 0.3;
      const i = clamp(Math.round((sx / W) * n), 0, n);
      const sy = ys[i] + 2;
      const len = (H - sy) * rand(0.08, 0.28);
      c.lineWidth = rand(0.8, 2);
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo(sx + side * len * 0.15, sy + len * 0.5, sx + side * len * 0.35, sy + len);
      c.stroke();
    }
  }
  // sunlit snow along the crest
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 1.5;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * W;
    if (i === 0) c.moveTo(x, ys[i] + 1);
    else c.lineTo(x, ys[i] + 1);
  }
  c.stroke();
  c.restore();
}

const fortX = (s: State, w: number) => w * 0.6 - s.px * w * 0.025;

function bakeFort(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const W = Math.ceil(w * 1.12);
  const far = layer(s.fFar, W, h, dpr);
  const mid = layer(s.fMid, W, h, dpr);
  const near = layer(s.fNear, W, h, dpr);
  s.fFar = far.cv;
  s.fMid = mid.cv;
  s.fNear = near.cv;
  const portrait = h > w;
  s.fY = h * (portrait ? 0.58 : 0.62);
  if (far.c) {
    far.c.clearRect(0, 0, W, h);
    bakeRange(
      far.c,
      W,
      h,
      h * 0.56,
      h * 0.42,
      11,
      portrait ? 3 : 5,
      ['#f1f4f9', '#cdd6e3', '#a7b6cb'],
      'rgba(112,132,170,0.55)',
      'rgba(80,92,116,0.35)'
    );
  }
  if (mid.c) {
    mid.c.clearRect(0, 0, W, h);
    bakeRange(
      mid.c,
      W,
      h,
      h * 0.8,
      h * 0.34,
      23,
      portrait ? 2 : 4,
      ['#ffffff', '#e4eaf3', '#bccadd'],
      'rgba(118,140,184,0.6)',
      'rgba(48,56,72,0.55)',
      w * 0.66,
      s.fY
    );
  }
  if (near.c) {
    const c = near.c;
    c.clearRect(0, 0, W, h);
    const rnd = mulberry(5);
    const r = ridge(rnd, 64, 0.5);
    const g = c.createLinearGradient(0, h * 0.78, 0, h);
    g.addColorStop(0, '#fbfcff');
    g.addColorStop(1, '#c8d4e6');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, h);
    for (let i = 0; i <= 64; i++)
      c.lineTo((i / 64) * W, h * (0.84 + 0.08 * (i / 64)) - r[i] * h * 0.05);
    c.lineTo(W, h);
    c.fill();
    // pines on the near slope, thicker at the edges of frame
    for (let i = 0; i < 30; i++) {
      const x = rnd() * W;
      if (x > W * 0.28 && x < W * 0.8 && rnd() < 0.8) continue;
      const y = h * (0.86 + 0.08 * (x / W)) + rnd() * h * 0.06;
      const th = (0.07 + rnd() * 0.1) * h;
      const tw = th * 0.3;
      for (let k = 0; k < 5; k++) {
        const ty = y - th + (k * th) / 5.2;
        const kw = tw * (0.3 + k * 0.2);
        c.fillStyle = 'rgb(22,34,32)';
        c.beginPath();
        c.moveTo(x, ty);
        c.lineTo(x + kw, ty + th * 0.3);
        c.lineTo(x - kw, ty + th * 0.3);
        c.fill();
        c.fillStyle = 'rgba(240,246,255,0.92)';
        c.beginPath();
        c.moveTo(x, ty);
        c.lineTo(x - kw * 0.85, ty + th * 0.24);
        c.lineTo(x - kw * 0.15, ty + th * 0.16);
        c.fill();
      }
      c.fillStyle = 'rgb(40,30,24)';
      c.fillRect(x - tw * 0.06, y - th * 0.08, tw * 0.12, th * 0.1);
    }
  }
  s.fortKey = `${w}x${h}x${dpr}`;
}

function drawFortress(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h, dpr } = env;
  if (s.fortKey !== `${w}x${h}x${dpr}`) bakeFort(s, env);
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, '#7f8ea6');
  sky.addColorStop(0.6, '#c3ccd8');
  sky.addColorStop(1, '#e6eaf0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, s.white, w * 0.22, h * 0.2, s.m * 0.6, 0.3);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const base = -w * 0.06;
  const W = Math.ceil(w * 1.12);
  if (s.fFar) ctx.drawImage(s.fFar, base - s.px * w * 0.01, 0, W, h);
  // valley haze between the ranges
  const hz = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.75);
  hz.addColorStop(0, 'rgba(226,232,242,0)');
  hz.addColorStop(1, 'rgba(226,232,242,0.7)');
  ctx.fillStyle = hz;
  ctx.fillRect(0, h * 0.35, w, h * 0.4);
  if (s.fMid) ctx.drawImage(s.fMid, base - s.px * w * 0.025, 0, W, h);

  // the fortress on its shelf
  const U = s.m * 0.021;
  const fx = fortX(s, w);
  const fy = s.fY;
  ctx.fillStyle = 'rgba(120,136,170,0.35)';
  ctx.beginPath();
  ctx.ellipse(fx + U * 2, fy + U * 0.2, U * 14, U * 1.1, 0, 0, TAU);
  ctx.fill();
  for (let i = 0; i < FORT_BLOCKS.length; i++) {
    const b = FORT_BLOCKS[i];
    const k = smooth((s.fc - FORT_START[i]) / 0.42);
    const rest = i < 2 ? 0 : (i - 2) * 0.45;
    const y0 = lerp(b[2], rest, k * k);
    const hh = (b[3] - b[2]) * (1 - 0.6 * k);
    const tilt = env.reducedMotion ? 0 : k * (i % 2 ? 0.1 : -0.08);
    const X0 = fx + b[0] * U;
    const X1 = fx + b[1] * U;
    const Yb = fy - y0 * U;
    const Yt = Yb - hh * U;
    const dx = b[4] * U * 0.55;
    const dy = -b[4] * U * 0.32;
    ctx.save();
    ctx.translate((X0 + X1) / 2, Yb);
    ctx.rotate(tilt);
    ctx.translate(-(X0 + X1) / 2, -Yb);
    // shaded side
    ctx.fillStyle = rgb(112 - k * 30, 120 - k * 30, 136 - k * 30);
    ctx.beginPath();
    ctx.moveTo(X1, Yb);
    ctx.lineTo(X1 + dx, Yb + dy);
    ctx.lineTo(X1 + dx, Yt + dy);
    ctx.lineTo(X1, Yt);
    ctx.fill();
    // concrete front, with a cantilevered lip
    const fg = ctx.createLinearGradient(X0, 0, X1, 0);
    fg.addColorStop(0, rgb(204 - k * 40, 208 - k * 40, 214 - k * 40));
    fg.addColorStop(1, rgb(168 - k * 40, 174 - k * 40, 184 - k * 40));
    ctx.fillStyle = fg;
    ctx.fillRect(X0, Yt, X1 - X0, Yb - Yt);
    ctx.fillStyle = 'rgba(60,66,80,0.35)';
    ctx.fillRect(X0, Yt + U * 0.28, X1 - X0, U * 0.12);
    // snow on the roof
    ctx.fillStyle = 'rgb(248,250,253)';
    ctx.beginPath();
    ctx.moveTo(X0 - U * 0.15, Yt);
    ctx.lineTo(X1 + U * 0.15, Yt);
    ctx.lineTo(X1 + dx, Yt + dy);
    ctx.lineTo(X0 + dx, Yt + dy);
    ctx.fill();
    // ribbon windows
    if (k < 0.9) {
      const rows = Math.max(1, Math.floor((b[3] - b[2]) / 1.05));
      for (let r = 0; r < rows; r++) {
        const wy = Yb - ((r + 0.45) / rows) * (Yb - Yt);
        ctx.fillStyle = 'rgb(38,44,56)';
        ctx.fillRect(X0 + U * 0.3, wy - U * 0.22, X1 - X0 - U * 0.6, U * 0.36);
        ctx.fillStyle = 'rgba(255,204,128,0.95)';
        for (let x = X0 + U * 0.45; x < X1 - U * 0.6; x += U * 0.75)
          if (((x / U) * 7.3 + r * 13 + i * 5) % 3 < 1)
            ctx.fillRect(x, wy - U * 0.16, U * 0.38, U * 0.24);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(X0 + U * 0.3, wy - U * 0.22, X1 - X0 - U * 0.6, U * 0.05);
      }
    }
    ctx.restore();
  }
  // the mast and its blinking light
  const top = smooth((s.fc - FORT_START[6]) / 0.42);
  if (top < 0.6) {
    // the mast rides down on the top block
    const b6 = FORT_BLOCKS[6];
    const y6 = lerp(b6[2], 4 * 0.45, top * top) + (b6[3] - b6[2]) * (1 - 0.6 * top);
    const my = fy - y6 * U;
    const mh = 4 * U * (1 - top / 0.6);
    ctx.strokeStyle = 'rgb(70,76,88)';
    ctx.lineWidth = Math.max(1, U * 0.18);
    ctx.beginPath();
    ctx.moveTo(fx, my);
    ctx.lineTo(fx, my - mh);
    ctx.moveTo(fx - U * 0.6, my - mh * 0.6);
    ctx.lineTo(fx + U * 0.6, my - mh * 0.6);
    ctx.stroke();
    if (Math.sin(t * 3) > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.fire, fx, my - mh, U * 1.4, 0.9);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }
  // snowmobiles crossing the snowfield below
  for (let i = 0; i < 4; i++) {
    const k = (s.clock * 0.025 * LEVELS[FORT].time * (1 + i * 0.3) + i * 0.27) % 1;
    const dir = i % 2 ? 1 : -1;
    const x = lerp(-0.05, 1.05, dir > 0 ? k : 1 - k) * w;
    const y = h * (0.79 + 0.022 * i) + Math.sin(x * 0.01 + i) * h * 0.008;
    const sz = s.u * (3.2 + i * 0.9);
    for (let q = 1; q < 7; q++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.55 * (1 - q / 7)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x - dir * q * sz * 2, y - sz * 0.4 - q * 0.6 * s.u, sz * (0.6 + q * 0.32), 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgb(24,26,32)';
    ctx.beginPath();
    ctx.moveTo(x - dir * sz * 1.8, y - sz * 0.2);
    ctx.lineTo(x + dir * sz * 1.9, y - sz * 0.2);
    ctx.lineTo(x + dir * sz * 1.2, y - sz * 1.1);
    ctx.lineTo(x - dir * sz * 1.4, y - sz * 1.1);
    ctx.fill();
    ctx.fillRect(x - dir * sz * 0.4 - sz * 0.35, y - sz * 2.1, sz * 0.7, sz * 1.1);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, s.white, x + dir * sz * 1.9, y - sz * 0.6, sz * 2.4, 0.7);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  drawFx(ctx, s);
  if (s.fNear) ctx.drawImage(s.fNear, base - s.px * w * 0.05, 0, W, h);
  // snowfall in three depths
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = `rgba(255,255,255,${(0.55 + k * 0.2).toFixed(2)})`;
    ctx.beginPath();
    const r = (0.7 + k * 0.9) * s.u;
    for (const d of s.drops) {
      if (d.k !== k) continue;
      ctx.moveTo(d.x + r, d.y);
      ctx.arc(d.x, d.y, r, 0, TAU);
    }
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(196,212,236,0.1)';
  ctx.fillRect(0, 0, w, h);
}

/* ---------- drawing: limbo ---------- */

const T_DEF: [number, number][] = [
  [0.1, 1],
  [0.4, 0.5],
  [0.6, 0.3],
  [0.74, 0.19],
  [0.84, 0.12],
  [0.91, 0.075],
];

function shore(w: number, h: number, p: number, out: number[]) {
  // the shoreline runs from the bottom left corner to a point on the horizon
  const hz = h * 0.5;
  const ax = -w * 0.02;
  const ay = h * 1.02;
  const bx = w * 0.5;
  const q = 1 - Math.pow(1 - p, 1.6);
  out[0] = lerp(ax, bx, q);
  out[1] = lerp(ay, hz, q);
}

function bakeLimbo(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const sky = layer(s.lSky, w, h, dpr);
  s.lSky = sky.cv;
  const c = sky.c;
  const hz = h * 0.5;
  if (c) {
    const g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#5f6870');
    g.addColorStop(0.6, '#a9a49a');
    g.addColorStop(1, '#e6d6bc');
    c.fillStyle = g;
    c.fillRect(0, 0, w, hz + 2);
    const sg = c.createRadialGradient(w * 0.74, hz, 0, w * 0.74, hz, s.m * 0.6);
    sg.addColorStop(0, 'rgba(255,236,200,0.8)');
    sg.addColorStop(1, 'rgba(255,236,200,0)');
    c.fillStyle = sg;
    c.fillRect(0, 0, w, hz + 2);
    // the endless city on the horizon, three hazy ranks
    const rnd = mulberry(77);
    const ranks: [number, string][] = [
      [0.16, 'rgba(178,172,162,0.9)'],
      [0.11, 'rgba(150,146,140,0.92)'],
      [0.07, 'rgba(120,118,116,0.95)'],
    ];
    for (const [mh, col] of ranks) {
      c.fillStyle = col;
      let x = 0;
      while (x < w) {
        const bw = (4 + rnd() * 16) * s.u;
        const bh = rnd() * rnd() * mh * h + h * 0.01;
        c.fillRect(x, hz - bh, bw, bh + 1);
        if (rnd() < 0.15) c.fillRect(x + bw * 0.3, hz - bh * 1.25, bw * 0.4, bh * 0.3);
        x += bw + rnd() * 3 * s.u;
      }
    }
  }
  // towers along the shore
  s.towers = [];
  const pt = [0, 0];
  for (const [p, sc] of T_DEF) {
    shore(w, h, p, pt);
    const tw = s.m * 0.34 * sc;
    const th = h * 1.35 * sc;
    const cols = sc > 0.6 ? 7 : sc > 0.25 ? 5 : 4;
    const rows = sc > 0.6 ? 22 : sc > 0.25 ? 16 : 12;
    const img = document.createElement('canvas');
    img.width = Math.max(4, Math.ceil(tw * dpr));
    img.height = Math.max(4, Math.ceil(th * dpr));
    const g = img.getContext('2d');
    if (g) {
      g.scale(dpr, dpr);
      const bg = g.createLinearGradient(0, 0, tw, 0);
      bg.addColorStop(0, '#8a8c8e');
      bg.addColorStop(0.7, '#b8b6b0');
      bg.addColorStop(1, '#e2dccf');
      g.fillStyle = bg;
      g.fillRect(0, 0, tw, th);
      const fl = th / (rows * 2);
      const md = tw / (cols * 3);
      g.fillStyle = 'rgba(40,46,54,0.75)';
      for (let y = fl * 0.4; y < th; y += fl) g.fillRect(0, y, tw, fl * 0.55);
      g.fillStyle = 'rgba(210,206,198,0.9)';
      for (let x = 0; x < tw; x += md) g.fillRect(x, 0, Math.max(1, md * 0.22), th);
      g.fillStyle = 'rgba(255,240,210,0.25)';
      g.fillRect(tw * 0.92, 0, tw * 0.08, th);
      g.fillStyle = 'rgba(30,30,34,0.35)';
      g.fillRect(0, 0, tw * 0.05, th);
      // stepped crown
      g.fillStyle = 'rgba(232,226,214,0.9)';
      g.fillRect(0, 0, tw, fl * 0.5);
      // distance haze baked in
      g.fillStyle = `rgba(214,204,186,${(0.65 * (1 - sc)).toFixed(3)})`;
      g.fillRect(0, 0, tw, th);
    }
    s.towers.push({
      x: pt[0] - tw * 0.05,
      y: pt[1],
      w: tw,
      h: th,
      cols,
      rows,
      st: new Uint8Array(cols * rows),
      fade: new Float32Array(cols * rows).fill(1),
      img,
      sc,
    });
  }
  s.chunks.length = 0;
  s.limKey = `${w}x${h}x${dpr}`;
}

function drawLimbo(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h, dpr } = env;
  if (s.limKey !== `${w}x${h}x${dpr}`) bakeLimbo(s, env);
  const hz = h * 0.5;
  ctx.fillStyle = '#5f6870';
  ctx.fillRect(0, 0, w, h);
  if (s.lSky) ctx.drawImage(s.lSky, 0, 0, w, h);
  const pt = [0, 0];
  // sea
  const sea = ctx.createLinearGradient(0, hz, 0, h);
  sea.addColorStop(0, '#c9c2b4');
  sea.addColorStop(0.25, '#7d8686');
  sea.addColorStop(1, '#27363c');
  ctx.fillStyle = sea;
  ctx.fillRect(0, hz, w, h - hz);
  // sun path on the water
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const y = hz + Math.pow(i / 26, 1.8) * (h - hz);
    const ww = (8 + i * 6) * s.u * (0.6 + 0.4 * Math.sin(s.waveT * 1.4 + i * 1.7));
    ctx.fillStyle = `rgba(255,236,200,${(0.18 * (1 - i / 26)).toFixed(3)})`;
    ctx.fillRect(
      w * 0.74 - ww / 2 + Math.sin(i * 3.1) * ww * 0.3,
      y,
      ww,
      Math.max(1, 1.5 * s.u * (1 + i * 0.1))
    );
  }
  ctx.globalCompositeOperation = 'source-over';
  // swells rolling in toward the shore
  for (let i = 0; i < 14; i++) {
    const ph = (s.waveT * 0.12 + i / 14) % 1;
    const d = 1 - ph;
    const y = hz + Math.pow(d, 1.7) * (h - hz) * 1.05;
    if (y > h + 4) continue;
    const a = 0.08 + 0.22 * (1 - d);
    ctx.strokeStyle = `rgba(235,236,230,${a.toFixed(3)})`;
    ctx.lineWidth = Math.max(0.6, (1 + (1 - d) * 3) * s.u);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 24) {
      const yy = y + Math.sin(x * 0.012 + i * 2 + s.waveT * 0.8) * (2 + (1 - d) * 6) * s.u;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // land: the city side of the shoreline, pale concrete
  ctx.fillStyle = '#9b958a';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let p = 0; p <= 1.001; p += 0.05) {
    shore(w, h, p, pt);
    ctx.lineTo(pt[0], pt[1]);
  }
  ctx.lineTo(0, hz);
  ctx.closePath();
  ctx.fill();
  // wet sand along the waterline and the stumps of towers that already went
  ctx.strokeStyle = 'rgba(70,72,72,0.35)';
  ctx.lineJoin = 'round';
  for (let p = 0; p < 1; p += 0.04) {
    shore(w, h, p, pt);
    const sw = Math.pow(1 - p, 1.3);
    ctx.lineWidth = (4 + sw * 40) * s.u;
    ctx.beginPath();
    ctx.moveTo(pt[0] - sw * 14 * s.u, pt[1]);
    shore(w, h, p + 0.04, pt);
    ctx.lineTo(pt[0] - sw * 14 * s.u, pt[1]);
    ctx.stroke();
  }
  const rr = mulberry(9);
  for (let i = 0; i < 9; i++) {
    const p = 0.05 + rr() * 0.8;
    shore(w, h, p, pt);
    const sc = Math.pow(1 - p, 1.5);
    const bw = (20 + rr() * 50) * sc * s.u + 2;
    const bh = (8 + rr() * 40) * sc * s.u + 1;
    const x = pt[0] - (40 + rr() * 160) * sc * s.u;
    ctx.fillStyle = rgb(118 + rr() * 30, 114 + rr() * 26, 106 + rr() * 20);
    ctx.fillRect(x, pt[1] - bh - 6 * sc * s.u, bw, bh);
    ctx.fillStyle = 'rgba(40,44,50,0.5)';
    ctx.fillRect(x, pt[1] - bh - 6 * sc * s.u + bh * 0.3, bw, bh * 0.15);
  }
  // foam where the sea meets it
  ctx.strokeStyle = 'rgba(245,244,238,0.75)';
  ctx.lineCap = 'round';
  for (let p = 0; p < 1; p += 0.02) {
    shore(w, h, p, pt);
    const sw = Math.pow(1 - p, 1.4);
    const wob = 0.5 + 0.5 * Math.sin(s.waveT * 1.6 - p * 18);
    ctx.lineWidth = (2 + sw * 12 * wob) * s.u;
    ctx.beginPath();
    ctx.moveTo(pt[0], pt[1]);
    shore(w, h, p + 0.02, pt);
    ctx.lineTo(pt[0] + sw * 6 * s.u, pt[1]);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // towers, far to near
  for (let ti = s.towers.length - 1; ti >= 0; ti--) {
    const T = s.towers[ti];
    if (!T.img) continue;
    const cw = T.w / T.cols;
    const ch = T.h / T.rows;
    const x0 = T.x - T.w / 2;
    const y0 = T.y - T.h;
    const iw = T.img.width / T.cols;
    const ih = T.img.height / T.rows;
    let whole = true;
    for (let i = 0; i < T.st.length; i++) if (T.st[i] !== 0 || T.fade[i] < 1) whole = false;
    if (whole) ctx.drawImage(T.img, x0, y0, T.w, T.h);
    else
      for (let r = 0; r < T.rows; r++)
        for (let c = 0; c < T.cols; c++) {
          const i = r * T.cols + c;
          if (T.st[i] !== 0) continue;
          ctx.globalAlpha = T.fade[i];
          ctx.drawImage(
            T.img,
            c * iw,
            r * ih,
            iw,
            ih,
            x0 + c * cw,
            y0 + r * ch,
            cw + 0.5,
            ch + 0.5
          );
        }
    ctx.globalAlpha = 1;
    // falling slabs of this tower
    for (const k of s.chunks) {
      if (!k.on || k.ti !== ti) continue;
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.rotate(k.rot);
      ctx.drawImage(
        T.img,
        k.col * iw,
        k.row * ih,
        iw,
        ih,
        k.ox - cw / 2,
        k.oy - ch / 2,
        cw + 0.5,
        ch + 0.5
      );
      ctx.restore();
    }
  }
  drawFx(ctx, s);
  // haze
  const hg = ctx.createLinearGradient(0, hz - h * 0.2, 0, hz + h * 0.1);
  hg.addColorStop(0, 'rgba(226,214,190,0)');
  hg.addColorStop(0.7, 'rgba(226,214,190,0.25)');
  hg.addColorStop(1, 'rgba(226,214,190,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, hz - h * 0.2, w, h * 0.3);
  void t;
}

/* ---------- drawing: awake ---------- */

function drawAwake(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const T = s.levelT;
  if (T > 6.2 && !env.reducedMotion) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  // a quiet room, out of focus
  const bg = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  bg.addColorStop(0, '#1d1714');
  bg.addColorStop(1, '#4a3a2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  // morning through a tall window on the left, a lamp far right
  ctx.globalAlpha = 0.5;
  ctx.drawImage(s.cool, w * 0.04, -h * 0.15, w * 0.26, h * 0.9);
  ctx.globalAlpha = 0.35;
  ctx.drawImage(s.cool, w * 0.16, -h * 0.1, w * 0.12, h * 0.8);
  glow(ctx, s.warm, w * 0.86, h * 0.34, s.m * 0.22, 0.4);
  for (let i = 0; i < 9; i++)
    glow(
      ctx,
      s.warm,
      w * (0.32 + i * 0.075),
      h * (0.42 + Math.sin(i * 2.3) * 0.05),
      s.m * (0.025 + (i % 3) * 0.012),
      0.22
    );
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // the table: dark walnut planks running away from us
  const ty = h * 0.6;
  const tg = ctx.createLinearGradient(0, ty, 0, h);
  tg.addColorStop(0, '#2c1c12');
  tg.addColorStop(0.35, '#4a2e1c');
  tg.addColorStop(1, '#6a4428');
  ctx.fillStyle = tg;
  ctx.fillRect(0, ty, w, h - ty);
  const vx = w / 2;
  const vy = ty - h * 0.9;
  ctx.strokeStyle = 'rgba(14,8,4,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -6; i <= 6; i++) {
    const bx = w / 2 + i * w * 0.2;
    const k = (ty - vy) / (h - vy);
    ctx.moveTo(lerp(vx, bx, k), ty);
    ctx.lineTo(bx, h);
  }
  ctx.stroke();
  // window light sliding across the varnish
  const sh = ctx.createLinearGradient(0, ty, w, h);
  sh.addColorStop(0, 'rgba(200,220,255,0.16)');
  sh.addColorStop(0.5, 'rgba(255,220,180,0.04)');
  sh.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, ty, w, h - ty);
  ctx.fillStyle = 'rgba(255,226,190,0.22)';
  ctx.fillRect(0, ty, w, Math.max(1, 1.5 * s.u));
  const S = s.m * 0.3;
  const tx = w / 2 + Math.sin(T * 1.3) * S * 0.03;
  const tyy = h * 0.83;
  const wob = env.reducedMotion
    ? 0.03
    : (0.012 + 0.12 * smooth((T - 2.2) / 3.8)) * Math.sin(T * (5 + T * 0.9));
  // its reflection in the varnish
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, tyy, w, h - tyy);
  ctx.clip();
  ctx.globalAlpha = 0.16;
  ctx.translate(tx, tyy);
  ctx.scale(1, -0.6);
  drawTop(ctx, 0, 0, S, s.topPh, -wob, 0.7);
  ctx.restore();
  ctx.globalAlpha = 1;
  drawTop(ctx, tx, tyy, S, s.topPh, wob, 0.7);
  void t;
}

/* ---------- shared 2D effects ---------- */

function drawFx(ctx: CanvasRenderingContext2D, s: State) {
  for (const p of s.fx.items) {
    if (p.life <= 0) continue;
    const lf = p.life / p.max;
    if (p.kind === 1) {
      ctx.fillStyle = `rgba(240,244,246,${(lf * 0.8).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    } else if (p.kind === 3) {
      ctx.strokeStyle = `rgba(220,240,255,${(lf * 0.6).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.stroke();
    } else if (p.kind === 4) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.fire, p.x, p.y, p.size * (1.6 - lf * 0.6), lf);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    } else if (p.kind === 5) {
      glow(ctx, s.white, p.x, p.y, p.size * (1.8 - lf), lf * 0.55);
      ctx.globalAlpha = 1;
    } else if (p.kind === 6) {
      ctx.fillStyle = `rgba(70,74,84,${Math.min(1, lf * 2).toFixed(3)})`;
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    } else if (p.kind === 7) {
      ctx.strokeStyle = `rgba(245,245,240,${(lf * 0.7).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * (1.6 - lf), p.size * 0.25 * (1.6 - lf), 0, 0, TAU);
      ctx.stroke();
    } else if (p.kind === 2) {
      ctx.fillStyle = `rgba(230,240,250,${lf.toFixed(3)})`;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size, -p.size * 0.3, p.size * 2, p.size * 0.6);
      ctx.restore();
    }
  }
}

function drawLevel(s: State, env: SceneEnv, lv: number, t: number) {
  if (lv === PARIS || lv === CITY) {
    if (lv === PARIS && !s.paris) s.paris = buildCity(PARIS_CFG, 7);
    if (lv === CITY && !s.city) s.city = buildCity(CITY_CFG, 21);
    const g = lv === PARIS ? s.paris : s.city;
    if (g) drawCity(s, env, g, t);
  } else if (lv === HOTEL) drawHotel(s, env, t);
  else if (lv === FORT) drawFortress(s, env, t);
  else if (lv === LIMBO) drawLimbo(s, env, t);
  else drawAwake(s, env, t);
}

/* ---------- transitions ---------- */

function drawVan(
  ctx: CanvasRenderingContext2D,
  s: State,
  x: number,
  y: number,
  W: number,
  rot: number
) {
  const H = W * 0.42;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  // the box of a van in three quarter view: side panel, nose and the roof edge catching light
  const body = ctx.createLinearGradient(0, -H / 2, 0, H * 0.35);
  body.addColorStop(0, 'rgb(64,70,78)');
  body.addColorStop(0.12, 'rgb(30,33,38)');
  body.addColorStop(1, 'rgb(10,11,13)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-W / 2, H * 0.3);
  ctx.lineTo(-W / 2, -H * 0.42);
  ctx.quadraticCurveTo(-W / 2, -H / 2, -W * 0.44, -H / 2);
  ctx.lineTo(W * 0.28, -H / 2);
  ctx.quadraticCurveTo(W * 0.33, -H / 2, W * 0.36, -H * 0.42);
  ctx.lineTo(W * 0.46, -H * 0.06);
  ctx.quadraticCurveTo(W * 0.5, -H * 0.02, W * 0.5, H * 0.08);
  ctx.lineTo(W * 0.5, H * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,210,230,0.35)';
  ctx.lineWidth = Math.max(1, W * 0.004);
  ctx.stroke();
  // glass
  ctx.fillStyle = 'rgba(110,130,150,0.5)';
  ctx.beginPath();
  ctx.moveTo(W * 0.3, -H * 0.43);
  ctx.lineTo(W * 0.43, -H * 0.08);
  ctx.lineTo(W * 0.22, -H * 0.08);
  ctx.lineTo(W * 0.22, -H * 0.43);
  ctx.fill();
  ctx.fillStyle = 'rgba(90,108,126,0.4)';
  ctx.fillRect(-W * 0.12, -H * 0.42, W * 0.3, H * 0.3);
  // sliding door seam and handle
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = Math.max(1, W * 0.004);
  ctx.beginPath();
  ctx.moveTo(-W * 0.15, -H * 0.46);
  ctx.lineTo(-W * 0.15, H * 0.26);
  ctx.moveTo(W * 0.2, -H * 0.46);
  ctx.lineTo(W * 0.2, H * 0.26);
  ctx.stroke();
  ctx.fillStyle = 'rgba(160,170,180,0.6)';
  ctx.fillRect(W * 0.12, -H * 0.02, W * 0.05, H * 0.03);
  // bumper and arches
  ctx.fillStyle = 'rgb(6,6,8)';
  ctx.fillRect(W * 0.44, H * 0.18, W * 0.07, H * 0.12);
  for (const wx of [-0.3, 0.3]) {
    ctx.beginPath();
    ctx.arc(W * wx, H * 0.3, H * 0.2, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgb(70,74,80)';
  for (const wx of [-0.3, 0.3]) {
    ctx.beginPath();
    ctx.arc(W * wx, H * 0.3, H * 0.085, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, s.warm, W * 0.49, H * 0.1, H * 0.6, 0.95);
  glow(ctx, s.fire, -W * 0.49, H * 0.0, H * 0.25, 0.8);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawTransition(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const kind = s.tKind;
  const k = clamp(s.tT / T_DUR[kind], 0, 1);
  const sw = T_SWITCH[kind];
  if (kind === TK_FADE) {
    drawLevel(s, env, s.level, t);
    const a = k < sw ? k / sw : 1 - (k - sw) / (1 - sw);
    ctx.fillStyle = `rgba(0,0,0,${clamp(s.tSwitched ? a : 1, 0, 1).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (kind === TK_LIFT) {
    drawLevel(s, env, s.level, t);
    const close =
      k < 0.3 ? easeInOutCubic(k / 0.3) : k < 0.7 ? 1 : 1 - easeInOutCubic((k - 0.7) / 0.3);
    const drop = k > 0.3 && k < 0.7 ? Math.sin(((k - 0.3) / 0.4) * Math.PI) : 0;
    const half = (w / 2) * close;
    const jitter = drop * 3 * s.u * Math.sin(t * 60);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : w - half;
      const g = ctx.createLinearGradient(x0, 0, x0 + half, 0);
      g.addColorStop(0, '#5b6068');
      g.addColorStop(0.5, '#a9aeb6');
      g.addColorStop(1, '#6a7078');
      ctx.fillStyle = g;
      ctx.fillRect(x0, jitter, half, h);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let y = 0; y < h; y += 3) ctx.fillRect(x0, y + jitter, half, 1);
    }
    if (close > 0.98) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(w / 2 - 1, 0, 2, h);
    }
    // the drop: streaks rush up past the seam and the floor counter runs
    if (drop > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${(drop * 0.18).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 40; i++) {
        const x = ((i * 97.3) % 1) * w + ((i * 37) % w);
        const y = (((t * 2.4 + i * 0.137) % 1) * 1.4 - 0.2) * h;
        ctx.moveTo(x % w, h - y);
        ctx.lineTo(x % w, h - y - h * 0.2 * drop);
      }
      ctx.stroke();
    }
    if (close > 0.2) {
      const bw = Math.min(w * 0.3, 220 * s.u);
      const bx = w / 2 - bw / 2;
      const by = h * 0.08;
      ctx.fillStyle = `rgba(10,10,12,${(close * 0.85).toFixed(3)})`;
      ctx.fillRect(bx, by, bw, 30 * s.u + 8);
      for (let i = 0; i < 5; i++) {
        const on = (s.tSwitched ? s.tTo : s.tFrom) === i;
        ctx.fillStyle = on
          ? `rgba(255,170,60,${close.toFixed(3)})`
          : `rgba(120,70,30,${(close * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(bx + bw * (0.12 + i * 0.19), by + 15 * s.u + 4, 6 * s.u + 2, 0, TAU);
        ctx.fill();
      }
    }
    return;
  }
  // the van into water (and the wake, which is the same plunge without the van)
  if (!s.tSwitched) {
    const a = k / sw;
    const e = a * a;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(0.14 * e * (kind === TK_WAKE ? -1 : 1));
    ctx.scale(1 + e * 0.12, 1 + e * 0.12);
    ctx.translate(-w / 2, -h / 2 - e * h * 0.35);
    drawLevel(s, env, s.level, t);
    ctx.restore();
    ctx.fillStyle = `rgba(0,0,0,${(e * 0.45).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    // water rising to meet us
    const wy = h * (1.2 - 1.25 * e);
    const wg = ctx.createLinearGradient(0, wy, 0, h);
    wg.addColorStop(0, 'rgba(70,110,124,0.95)');
    wg.addColorStop(1, 'rgba(8,24,32,1)');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 20) ctx.lineTo(x, wy + Math.sin(x * 0.02 + t * 2) * 6 * s.u);
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,240,250,0.5)';
    ctx.lineWidth = 2 * s.u;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 20) {
      const y = wy + Math.sin(x * 0.02 + t * 2) * 6 * s.u;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (kind === TK_VAN)
      drawVan(
        ctx,
        s,
        w * 0.5,
        lerp(-h * 0.35, h * 0.62, Math.pow(a, 0.8)),
        Math.min(w * 0.7, s.m * 1.1),
        0.25 + a * 0.4
      );
    // glass hangs in the air around it
    if (Math.random() < 0.6)
      emit(
        s.fx,
        rand(0, w),
        rand(0, h * 0.7),
        rand(-20, 20) * s.u,
        rand(10, 40) * s.u,
        rand(1, 2),
        rand(2, 5) * s.u,
        2,
        0.2,
        0
      );
    drawFx(ctx, s);
    if (kind === TK_WAKE) {
      // the kicks cascade up through every level at once
      const n = Math.floor(a * 6);
      ctx.fillStyle = `rgba(255,255,255,${(0.12 * (1 - ((a * 6) % 1))).toFixed(3)})`;
      if (n > 0) ctx.fillRect(0, 0, w, h);
    }
  } else {
    const b = (k - sw) / (1 - sw);
    drawLevel(s, env, s.level, t);
    const tint = Math.pow(1 - b, 1.4);
    ctx.fillStyle = `rgba(14,48,62,${(tint * 0.88).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = w * (0.15 + i * 0.18) + Math.sin(t * 0.7 + i) * w * 0.03;
      const g = ctx.createLinearGradient(x, 0, x + w * 0.1, h);
      g.addColorStop(0, `rgba(180,230,240,${(tint * 0.16).toFixed(3)})`);
      g.addColorStop(1, 'rgba(180,230,240,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + w * 0.05, 0);
      ctx.lineTo(x + w * 0.2, h);
      ctx.lineTo(x + w * 0.08, h);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (b < 0.6 && Math.random() < 0.8)
      for (let i = 0; i < 3; i++)
        emit(
          s.fx,
          rand(0, w),
          h + 10,
          rand(-10, 10) * s.u,
          -rand(120, 260) * s.u,
          rand(1.5, 2.5),
          rand(2, 7) * s.u,
          3,
          0.1,
          -40 * s.u
        );
    drawFx(ctx, s);
  }
}

/* ---------- HUD ---------- */

function drawHud(s: State, env: SceneEnv, t: number) {
  const { ctx, w, h } = env;
  const lv = s.level;
  const info = LEVELS[lv];
  const small = w < 380 || h < 260;
  const pad = Math.max(10, 18 * s.u);
  const dark = lv === FORT || lv === LIMBO;
  const ink = dark ? '20,24,32' : '240,236,228';
  if (lv !== AWAKE) {
    // soft scrims keep the type legible over bright façades and towers
    const sc = dark ? '236,232,224' : '6,8,12';
    for (const [cx, rx] of [
      [0, small ? 0 : 260 * s.u],
      [w, 180 * s.u],
    ]) {
      if (rx <= 0) continue;
      const g = ctx.createRadialGradient(cx, 0, 0, cx, 0, rx);
      g.addColorStop(0, `rgba(${sc},${dark ? 0.6 : 0.45})`);
      g.addColorStop(1, `rgba(${sc},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - rx, 0, rx * 2, rx);
    }
  }
  if (lv !== AWAKE && !small) {
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const fs = Math.round(clamp(11 * s.u, 9, 13));
    ctx.font = `600 ${fs}px ${FONT}`;
    ctx.fillStyle = `rgba(${ink},0.62)`;
    ctx.fillText(info.tag, pad, pad);
    ctx.font = `700 ${Math.round(fs * 1.9)}px ${FONT}`;
    ctx.fillStyle = `rgba(${ink},0.92)`;
    ctx.fillText(info.name, pad, pad + fs * 1.5);
    ctx.font = `500 ${fs}px ${FONT}`;
    ctx.fillStyle = `rgba(${ink},0.55)`;
    ctx.fillText(info.x, pad, pad + fs * 4.2);
  }
  // the depth ladder
  if (lv !== AWAKE) {
    const x = w - pad;
    const y0 = pad + 4;
    const step = clamp(16 * s.u, 10, 22);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const fs = Math.round(clamp(10 * s.u, 8, 12));
    ctx.font = `600 ${fs}px ${FONT}`;
    for (let i = 0; i < 5; i++) {
      const y = y0 + i * step;
      const on = i === lv;
      const past = i < lv;
      ctx.fillStyle = `rgba(${ink},${on ? 0.95 : past ? 0.45 : 0.22})`;
      ctx.fillRect(x - (on ? 22 : 12) * s.u, y - 1, (on ? 22 : 12) * s.u, on ? 3 : 2);
      if (!small && (on || w > 700)) {
        ctx.fillStyle = `rgba(${ink},${on ? 0.9 : 0.35})`;
        ctx.fillText(LADDER[i].toUpperCase(), x - 30 * s.u, y);
      }
    }
  }
  // the totem in the corner: steady in a dream
  if (lv !== AWAKE) {
    const S = clamp(46 * s.u, 26, 64);
    const x = pad + S * 0.5;
    const y = h - pad - S * 0.12;
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, S * 0.62, S * 0.16, 0, 0, TAU);
    ctx.fill();
    const wob = s.tOn && !env.reducedMotion ? Math.sin(t * 40) * 0.05 : 0;
    drawTop(ctx, x, y, S, s.clock * 22, wob, 0.6);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'grab',
    touchAction: 'none',
    posterTime: 2.6,
    init: (env) => {
      const p3: P3[] = [];
      for (let i = 0; i < 700; i++)
        p3.push({
          x: 0,
          y: 0,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          life: 0,
          max: 1,
          size: 1,
          kind: 0,
          rot: 0,
          spin: 0,
          c: 0,
        });
      const s: State = {
        level: PARIS,
        levelT: 0,
        clock: 0,
        ts: 1,
        holding: false,
        keyHold: false,
        holdT: 0,
        moved: false,
        downX: 0,
        downY: 0,
        lastX: 0,
        lastY: 0,
        downAt: 0,
        holdDir: 1,
        touched: false,
        idle: 0,
        auto: true,
        autoHold: false,
        px: 0,
        py: 0,
        tOn: false,
        tT: 0,
        tKind: 0,
        tFrom: 0,
        tTo: 0,
        tSwitched: false,
        snap: null,
        snapA: 0,
        flash: 0,
        paris: null,
        city: null,
        bend: 0,
        bendT: 0,
        boomT: 1,
        p3,
        p3n: 0,
        fx: makePool(520),
        drops: [],
        hotel: null,
        hCache: null,
        hKey: '',
        rot: 0,
        rotV: 0,
        aS: HW,
        aAng: 0,
        qx: 0,
        qy: 0,
        qvx: 0,
        qvy: 0,
        qSpin: 0,
        qRot: 0,
        qMode: 0,
        qT: 0,
        runPh: 0,
        punch: 0,
        fightT: 0,
        pose: new Array(POSE_N).fill(0),
        pose2: new Array(POSE_N).fill(0),
        fortKey: '',
        fFar: null,
        fMid: null,
        fNear: null,
        fY: 0,
        fc: 0,
        fGo: false,
        fRest: 0,
        fBlast: 0,
        limKey: '',
        lSky: null,
        towers: [],
        chunks: [],
        lHoldGap: 0,
        calveT: 1,
        waveT: 0,
        topPh: 0,
        hum: null,
        m: 100,
        u: 1,
        f: 800,
        vignette: null,
        grain: grainTile(128, 9, 1),
        warm: glowSprite(128, [
          [0, 'rgba(255,214,150,0.9)'],
          [0.35, 'rgba(255,170,90,0.3)'],
          [1, 'rgba(255,140,60,0)'],
        ]),
        cool: glowSprite(128, [
          [0, 'rgba(220,236,255,0.9)'],
          [0.4, 'rgba(150,190,240,0.3)'],
          [1, 'rgba(120,160,240,0)'],
        ]),
        white: glowSprite(64, [
          [0, 'rgba(255,255,255,1)'],
          [0.4, 'rgba(255,255,255,0.4)'],
          [1, 'rgba(255,255,255,0)'],
        ]),
        smoke: glowSprite(64, [
          [0, 'rgba(150,138,124,0.85)'],
          [0.5, 'rgba(170,158,142,0.4)'],
          [1, 'rgba(190,178,160,0)'],
        ]),
        fire: glowSprite(64, [
          [0, 'rgba(255,240,200,1)'],
          [0.3, 'rgba(255,150,50,0.7)'],
          [0.7, 'rgba(200,60,20,0.2)'],
          [1, 'rgba(120,20,0,0)'],
        ]),
        sodium: glowSprite(64, [
          [0, 'rgba(255,200,120,0.9)'],
          [0.4, 'rgba(255,160,70,0.3)'],
          [1, 'rgba(255,130,40,0)'],
        ]),
        poster: env.reducedMotion || !env.interactive,
      };
      s.paris = buildCity(PARIS_CFG, 7);
      enterLevel(s, PARIS);
      if (s.poster) {
        // a still worth stopping on: the street folded overhead and the café mid blast
        explode(s, env, 1, 12, false);
        explode(s, env, -1, 26, false);
        s.boomT = 4;
      }
      return s;
    },
    resize: (s, env) => layout(s, env),
    update: (s, env, dt) => update(s, env, dt),
    draw: (s, env, t) => {
      const { ctx } = env;
      renderScene(s, env, t);
      if (s.snapA > 0 && s.snap) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = smooth(s.snapA);
        ctx.drawImage(s.snap, 0, 0);
        ctx.restore();
      }
      drawHud(s, env, t);
    },
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      s.idle = 0;
      s.auto = false;
      s.autoHold = false;
      s.moved = false;
      s.downX = s.lastX = x;
      s.downY = s.lastY = y;
      s.downAt = s.clock;
      setHold(s, true);
    },
    onPointerMove: (s, env, x, y) => {
      if (!s.holding) return;
      const dx = x - s.lastX;
      const dy = y - s.lastY;
      s.lastX = x;
      s.lastY = y;
      s.idle = 0;
      if (!s.moved && Math.hypot(x - s.downX, y - s.downY) > 10) s.moved = true;
      if (!s.moved) return;
      if (s.level === PARIS || s.level === CITY)
        s.bendT = clamp(s.bendT - dy / (env.h * 0.6), 0, 1);
      else if (s.level === HOTEL) {
        if (Math.abs(dx) > 0.5) s.holdDir = Math.sign(dx);
        if (!env.reducedMotion) s.rot += (dx / env.w) * 2.4;
      }
    },
    onPointerUp: (s, env) => {
      const quick = !s.moved && s.clock - s.downAt < 0.3;
      setHold(s, false);
      if (quick) kick(s, env);
      else if (env.reducedMotion && s.level === HOTEL) {
        // no turning in reduced motion: the room steps round a quarter with a crossfade
        takeSnap(s, env);
        s.rot += (Math.PI / 2) * (s.holdDir || 1);
      }
    },
    onPointerLeave: () => {},
    onKey: (s, env, e, down) => {
      const k = e.key;
      if (k === ' ' || k === 'Enter') {
        if (down && !e.repeat) {
          s.touched = true;
          s.idle = 0;
          s.auto = false;
          kick(s, env);
        }
        return true;
      }
      if (k === 'b' || k === 'B') {
        if (down && !e.repeat) {
          s.touched = true;
          s.idle = 0;
          s.auto = false;
          s.moved = false;
          s.keyHold = true;
          s.holdT = 0;
          if (s.level === PARIS || s.level === CITY) s.holdDir = s.bendT > 0.6 ? -1 : 1;
        } else if (!down) {
          s.keyHold = false;
          if (env.reducedMotion && s.level === HOTEL) {
            takeSnap(s, env);
            s.rot += Math.PI / 2;
          }
        }
        return true;
      }
      return false;
    },
    dispose: (s) => {
      stopHum(s.hum);
      s.hum = null;
      const texs: (HTMLCanvasElement | null)[] = [];
      for (const g of [s.paris, s.city])
        if (g) for (const list of [g.tex, g.roof, ...g.mipFog]) texs.push(...list);
      if (s.hotel) texs.push(s.hotel.wall, s.hotel.floor, s.hotel.ceil);
      texs.push(s.hCache);
      for (const T of s.towers) texs.push(T.img);
      freeCanvas(
        ...texs,
        s.snap,
        s.fFar,
        s.fMid,
        s.fNear,
        s.lSky,
        s.grain,
        s.warm,
        s.cool,
        s.white,
        s.smoke,
        s.fire,
        s.sodium
      );
    },
  });
