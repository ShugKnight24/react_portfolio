import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import {
  TAU,
  circlePts,
  clamp,
  ease,
  hash,
  lerp,
  morph,
  morphPair,
  mulberry,
  noise1,
  tween,
  type Pt,
} from '../riso/kit';
import {
  UK,
  block,
  bokashi,
  cartouche,
  claws,
  grainOver,
  kasumi,
  kasumiPath,
  keyline,
  mix,
  poly,
  printBorder,
  rgba,
  ribbon,
  ribbonPts,
  sampleSmooth,
  woodGrain,
} from '../styles/ukiyo';

/*
 * Wave off the Caspian: the curling claw is the motif. A gust of the city of winds curls into a
 * hook, the hook swells into a great wave over small boats, we glide past the crest to the old
 * walled city and its round stone tower, gold mist closes and opens on the fire temple whose
 * flame tongues curl the same way, and the flame rises as a sun with one last wave before it.
 */

const T_HOOK0 = 1.9;
const T_HOOK1 = 3.7;
const T_ZOOM0 = 6.7;
const T_ZOOM1 = 9.1;
const T_CLOUD0 = 10.6;
const T_SWAP = 11.3;
const T_CLOUD1 = 12.8;
const T_SUN0 = 14.3;
const T_SUN1 = 15.4;
const T_SINK0 = 14.5;
const T_SINK1 = 15.6;
const T_CREST0 = 15.0;
const T_CREST1 = 16.4;
const T_TITLE = 16.4;

/* city anchor in the wave world, and its scale there */
const CITY_X = 1380;
const CITY_Y = 600;
const CITY_S = 0.2;
const Z_END = 5;

/* the great wave, fully curled (screen coords at zoom 1) */
const WAVE_CP: Pt[] = [
  [-140, 900],
  [-140, 650],
  [-10, 520],
  [120, 405],
  [255, 300],
  [395, 222],
  [535, 182],
  [665, 190],
  [778, 236],
  [858, 300],
  [896, 372],
  [884, 428],
  [842, 446],
  [814, 410],
  [800, 364],
  [760, 334],
  [700, 334],
  [642, 372],
  [606, 452],
  [612, 548],
  [662, 640],
  [760, 718],
  [900, 778],
  [1060, 818],
  [1240, 858],
  [1420, 900],
];
/* the hook: a comma of wind with the same control points, so it grows into the wave */
const HOOK_CP: Pt[] = [
  [575, 590],
  [592, 560],
  [610, 520],
  [630, 470],
  [655, 420],
  [690, 365],
  [740, 322],
  [800, 302],
  [860, 316],
  [902, 356],
  [914, 406],
  [896, 452],
  [856, 472],
  [826, 446],
  [846, 408],
  [836, 368],
  [800, 356],
  [764, 374],
  [744, 412],
  [734, 456],
  [716, 500],
  [692, 540],
  [664, 574],
  [636, 598],
  [610, 608],
  [588, 604],
];
const PER = 8;
const LIP0 = 5; // crest edge runs from CP 5 to CP 12
const LIP1 = 12;

interface City {
  hills: Path2D;
  houses: Path2D;
  housesB: Path2D;
  windows: Path2D;
  minaret: Path2D;
  minaretCap: Path2D;
  domeBase: Path2D;
  dome: Path2D;
  tower: Path2D;
  towerShade: Path2D;
  towerRibs: Path2D;
  towerSlits: Path2D;
  buttress: Path2D;
  wall: Path2D;
  bastions: Path2D;
  courses: Path2D;
  gate: Path2D;
  shore: Path2D;
}

interface Temple {
  wall: Path2D;
  cells: Path2D;
  ground: Path2D;
  flags: Path2D;
  body: Path2D;
  arch: Path2D;
  niches: Path2D;
  cornice: Path2D;
  dome: Path2D;
  chimneys: Path2D;
  altar: Path2D;
  courses: Path2D;
}

interface State {
  gBlue: CanvasPattern;
  gWarm: CanvasPattern;
  gStone: CanvasPattern;
  winds: Pt[][];
  hook: Pt[];
  kas: Path2D[];
  cloudRows: Path2D[];
  city: City;
  temple: Temple;
  stars: Pt[];
  sun: Pt[];
}

/* ---------- small geometry ---------- */

const rect = (x: number, y: number, w: number, h: number, p: Path2D = new Path2D()) => {
  p.rect(x, y, w, h);
  return p;
};

/** pointed (ogee-ish) arch: base y, apex y, from x0 to x1 */
const archPts = (
  x0: number,
  x1: number,
  base: number,
  spring: number,
  apex: number,
  n = 14
): Pt[] => {
  const cx = (x0 + x1) / 2;
  const pts: Pt[] = [
    [x0, base],
    [x0, spring],
  ];
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    pts.push([lerp(x0, cx, k), spring - (spring - apex) * Math.sin((k * Math.PI) / 2)]);
  }
  for (let i = n - 1; i >= 1; i--) {
    const k = i / n;
    pts.push([lerp(x1, cx, k), spring - (spring - apex) * Math.sin((k * Math.PI) / 2)]);
  }
  pts.push([x1, spring], [x1, base]);
  return pts;
};

/** crenellated top edge as an outline from x0 to x1 at height y, merlon size m */
const crenPts = (
  x0: number,
  x1: number,
  y: number,
  bottom: number,
  m: number,
  gap: number
): Pt[] => {
  const pts: Pt[] = [
    [x0, bottom],
    [x0, y - m],
  ];
  let x = x0;
  while (x < x1) {
    const xe = Math.min(x1, x + m);
    pts.push([xe, y - m], [xe, y]);
    const xg = Math.min(x1, xe + gap);
    pts.push([xg, y], [xg, y - m]);
    x = xg;
  }
  pts.push([x1, y - m], [x1, bottom]);
  return pts;
};

const wavePts = (t: number, curl: number, grow = 1, hookS = 1): Pt[] => {
  const pivot = WAVE_CP[7];
  const rot = (1 - curl) * -0.5;
  const sc = lerp(0.82, 1, curl);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const cp = WAVE_CP.map((p, i) => {
    let [x, y] = p;
    if (i >= 8 && i <= 19) {
      const w = i <= 15 ? 1 : 1 - (i - 15) / 5;
      const dx = (x - pivot[0]) * lerp(1, sc, w);
      const dy = (y - pivot[1]) * lerp(1, sc, w);
      x = lerp(x, pivot[0] + dx * c - dy * s, w);
      y = lerp(y, pivot[1] + dx * s + dy * c, w);
    }
    if (i > 0 && i < WAVE_CP.length - 1) {
      x += noise1(t * 0.7 + i * 0.37, 3) * 5;
      y += Math.sin(t * 1.3 + i * 0.45) * 5;
    }
    if (grow < 1) {
      const h = HOOK_CP[i];
      const hx = 585 + (h[0] - 585) * hookS + Math.sin(t * 2 + i * 0.5) * 3;
      const hy = 600 + (h[1] - 600) * hookS;
      x = lerp(hx, x, grow);
      y = lerp(hy, y, grow);
    }
    return [x, y] as Pt;
  });
  return sampleSmooth(cp, PER, true);
};

/** Maps a point from the great-wave frame to the small crest in the final print */
const MINI = { s: 0.5, ox: 600, oy: 900, dx: 120, dy: -60 };
const toMini = (p: Pt): Pt => [
  MINI.ox + (p[0] - MINI.ox) * MINI.s + MINI.dx,
  MINI.oy + (p[1] - MINI.oy) * MINI.s + MINI.dy,
];

/* ---------- setup ---------- */

function buildCity(): City {
  const hillPts = sampleSmooth(
    [
      [-5000, -170],
      [-1700, -230],
      [-1000, -150],
      [-720, -215],
      [-420, -188],
      [-120, -238],
      [180, -205],
      [520, -252],
      [820, -198],
      [1100, -170],
      [1900, -240],
      [5000, -180],
    ],
    10,
    false
  );
  const hills = poly([[-5000, 10], ...hillPts, [5000, 10]]);

  const rng = mulberry(41);
  const houses = new Path2D();
  const housesB = new Path2D();
  const windows = new Path2D();
  let x = -700;
  let i = 0;
  while (x < 720) {
    const w = 48 + rng() * 70;
    const h = 40 + rng() * 110;
    const skip = x > -250 && x < -40; // dome building there
    const towerZone = x > 190 && x < 420;
    if (!skip && !towerZone) {
      const top = -100 - h;
      rect(x, top, w, h + 10, i % 2 ? houses : housesB);
      const nw = Math.max(1, Math.floor(w / 30));
      for (let j = 0; j < nw; j++) {
        const wx = x + ((j + 0.5) * w) / nw - 4;
        const wy = top + 14 + rng() * 12;
        windows.moveTo(wx, wy + 14);
        windows.lineTo(wx, wy + 4);
        windows.arc(wx + 4, wy + 4, 4, Math.PI, 0);
        windows.lineTo(wx + 8, wy + 14);
        windows.closePath();
      }
    }
    x += w - 6 + rng() * 14;
    i++;
  }

  const minaret = new Path2D();
  rect(-372, -400, 24, 310, minaret);
  rect(-385, -342, 50, 14, minaret);
  rect(-366, -432, 12, 34, minaret);
  const minaretCap = poly([
    [-371, -430],
    [-360, -478],
    [-349, -430],
  ]);

  const domeBase = new Path2D();
  rect(-245, -212, 210, 120, domeBase);
  rect(-195, -246, 110, 36, domeBase);
  const dome = new Path2D();
  dome.moveTo(-204, -244);
  dome.bezierCurveTo(-204, -292, -170, -308, -140, -318);
  dome.bezierCurveTo(-110, -308, -76, -292, -76, -244);
  dome.closePath();
  rect(-142, -340, 4, 24, dome);

  /* Maiden Tower */
  const TX = 300;
  const TR = 84;
  const tower = new Path2D();
  tower.moveTo(TX - TR, -60);
  tower.lineTo(TX - TR + 4, -462);
  tower.quadraticCurveTo(TX, -472, TX + TR - 4, -462);
  tower.lineTo(TX + TR, -60);
  tower.closePath();
  const towerShade = new Path2D();
  towerShade.moveTo(TX + 30, -60);
  towerShade.lineTo(TX + 32, -467);
  towerShade.quadraticCurveTo(TX + 60, -466, TX + TR - 4, -462);
  towerShade.lineTo(TX + TR, -60);
  towerShade.closePath();
  const towerRibs = new Path2D();
  for (let y = -430; y < -60; y += 30) {
    towerRibs.moveTo(TX - TR + 3, y);
    towerRibs.quadraticCurveTo(TX, y + 12, TX + TR - 2, y);
  }
  // overhanging top band
  towerRibs.moveTo(TX - TR - 2, -446);
  towerRibs.quadraticCurveTo(TX, -436, TX + TR + 2, -446);
  const towerSlits = new Path2D();
  for (const [sx, sy] of [
    [TX - 20, -380],
    [TX + 6, -300],
    [TX - 34, -220],
    [TX - 4, -150],
  ] as Pt[]) {
    rect(sx, sy, 6, 20, towerSlits);
  }
  const buttress = new Path2D();
  buttress.moveTo(TX + TR - 6, -420);
  buttress.quadraticCurveTo(TX + TR + 30, -418, TX + TR + 34, -380);
  buttress.lineTo(TX + TR + 52, -60);
  buttress.lineTo(TX + TR - 6, -60);
  buttress.closePath();

  /* walls */
  const wall = poly(crenPts(-780, 780, -120, 6, 22, 22));
  const bastions = new Path2D();
  for (const bx of [-560, 610]) {
    const b = crenPts(bx - 58, bx + 58, -168, 8, 18, 14);
    poly(b, bastions);
  }
  const courses = new Path2D();
  for (let y = -100; y < 0; y += 22) {
    courses.moveTo(-780, y);
    courses.lineTo(780, y);
  }
  for (let y = -150; y < 0; y += 22)
    for (const bx of [-560, 610]) {
      courses.moveTo(bx - 58, y);
      courses.lineTo(bx + 58, y);
    }
  const gate = poly(archPts(-100, -30, 6, -60, -96));

  const shore = new Path2D();
  shore.moveTo(-3500, 2);
  for (let sx = -3500; sx <= 3500; sx += 24) shore.lineTo(sx, 2 + hash(sx) * 10);
  shore.lineTo(3500, 22);
  shore.lineTo(-3500, 22);
  shore.closePath();

  return {
    hills,
    houses,
    housesB,
    windows,
    minaret,
    minaretCap,
    domeBase,
    dome,
    tower,
    towerShade,
    towerRibs,
    towerSlits,
    buttress,
    wall,
    bastions,
    courses,
    gate,
    shore,
  };
}

function buildTemple(): Temple {
  const wall = poly(crenPts(-200, 1800, 520, 700, 20, 18));
  const cells = new Path2D();
  for (let x = -160; x < 1800; x += 132) {
    if (x > 470 && x < 1080) continue;
    poly(archPts(x, x + 56, 690, 610, 575), cells);
  }
  const ground = rect(-400, 690, 2400, 600);
  const flags = new Path2D();
  for (let y = 730; y < 1300; y += 46) {
    flags.moveTo(-400, y);
    flags.lineTo(2000, y);
  }
  for (let x = -400; x < 2000; x += 120) {
    for (let y = 690; y < 1300; y += 92) {
      flags.moveTo(x + ((y / 46) % 2) * 60, y);
      flags.lineTo(x + ((y / 46) % 2) * 60, y + 40);
    }
  }
  const body = rect(560, 360, 480, 342);
  const arch = poly(archPts(672, 928, 702, 500, 372));
  const niches = new Path2D();
  poly(archPts(594, 642, 640, 500, 466), niches);
  poly(archPts(958, 1006, 640, 500, 466), niches);
  const cornice = rect(548, 340, 504, 24);
  const dome = new Path2D();
  dome.moveTo(680, 341);
  dome.bezierCurveTo(680, 278, 744, 252, 800, 230);
  dome.bezierCurveTo(856, 252, 920, 278, 920, 341);
  dome.closePath();
  rect(797, 196, 6, 36, dome);
  const chimneys = new Path2D();
  for (const cx of [578, 1022]) rect(cx - 18, 300, 36, 42, chimneys);
  const altar = rect(742, 640, 116, 62);
  const courses = new Path2D();
  for (let y = 390; y < 700; y += 26) {
    courses.moveTo(560, y);
    courses.lineTo(1040, y);
  }
  for (let y = 548; y < 690; y += 28) {
    courses.moveTo(-200, y);
    courses.lineTo(1800, y);
  }
  return {
    wall,
    cells,
    ground,
    flags,
    body,
    arch,
    niches,
    cornice,
    dome,
    chimneys,
    altar,
    courses,
  };
}

/* ---------- drawing pieces ---------- */

function drawSky(c: Ctx, horizon: number, warm: number, night: number) {
  // base: washi by day, deep indigo at night
  if (night > 0) {
    c.fillStyle = rgba(UK.indigo, night);
    c.fillRect(-50, -50, 1700, 1000);
  }
  bokashi(c, -50, -50, 1700, 300, mix(UK.prussian, UK.night, night), 0.92, 0);
  bokashi(c, -50, horizon + 2, 1700, horizon - 220, UK.pink, 0.55 + warm * 0.3, 0);
  if (warm > 0) bokashi(c, -50, horizon + 2, 1700, horizon - 110, UK.ochre, warm * 0.45, 0);
}

function drawCity(c: Ctx, s: State, t: number, lw: number, detail: number, hills = true) {
  const C = s.city;
  const g = s.gWarm;
  if (hills) {
    block(c, C.hills, mix(UK.sand, UK.pink, 0.35), g, 0.8);
    c.save();
    c.clip(C.hills);
    bokashi(c, -5000, -260, 10000, -120, UK.washiLight, 0.5, 0);
    c.restore();
    keyline(c, C.hills, lw * 0.7, 3);
  }
  block(c, C.minaret, UK.stone, g, 0.9);
  block(c, C.minaretCap, UK.prussian, null);
  keyline(c, C.minaret, lw * 0.8, 4);
  keyline(c, C.minaretCap, lw * 0.8, 5);
  block(c, C.housesB, UK.sand, g, 0.9);
  block(c, C.houses, UK.washiLight, g, 0.9);
  keyline(c, C.housesB, lw * 0.8, 6);
  keyline(c, C.houses, lw * 0.8, 7);
  if (detail > 0.2) {
    c.fillStyle = UK.indigo;
    c.fill(C.windows);
  }
  block(c, C.domeBase, UK.washiLight, g, 0.9);
  keyline(c, C.domeBase, lw * 0.8, 8);
  block(c, C.dome, UK.ochre, g, 1);
  keyline(c, C.dome, lw * 0.8, 9);

  /* Maiden Tower */
  block(c, C.buttress, mix(UK.stone, UK.sumi, 0.25), g, 1, Math.PI / 2);
  keyline(c, C.buttress, lw, 10);
  block(c, C.tower, mix(UK.stone, UK.washiLight, 0.25), g, 1, Math.PI / 2);
  c.fillStyle = rgba(UK.sumi, 0.18);
  c.fill(C.towerShade);
  c.strokeStyle = rgba(UK.sumi, 0.55);
  c.lineWidth = lw * 0.5;
  c.stroke(C.towerRibs);
  c.fillStyle = UK.sumi;
  if (detail > 0.2) c.fill(C.towerSlits);
  keyline(c, C.tower, lw * 1.1, 11);

  /* walls */
  block(c, C.bastions, mix(UK.sand, UK.stone, 0.55), g, 1);
  block(c, C.wall, UK.sand, g, 1);
  c.strokeStyle = rgba(UK.sumi, 0.35);
  c.lineWidth = lw * 0.45;
  c.save();
  c.clip(C.wall);
  c.stroke(C.courses);
  c.restore();
  c.save();
  c.clip(C.bastions);
  c.stroke(C.courses);
  c.restore();
  keyline(c, C.bastions, lw, 12);
  keyline(c, C.wall, lw, 13);
  c.fillStyle = UK.indigo;
  c.fill(C.gate);
  keyline(c, C.gate, lw * 0.8, 14);
  c.fillStyle = mix(UK.stone, UK.sumi, 0.35);
  c.fill(C.shore);

  /* flag on the tower, streaming in the wind */
  const fx = 300;
  const fy = -470;
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 0.7;
  c.beginPath();
  c.moveTo(fx, fy);
  c.lineTo(fx, fy - 70);
  c.stroke();
  const flag: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    flag.push([fx + k * 80, fy - 66 + Math.sin(k * 5 - t * 9) * 6 * k + k * 6]);
  }
  const fp = ribbon(flag, 22, 8, 2, 0.05);
  c.fillStyle = UK.vermilion;
  c.fill(fp);
  keyline(c, fp, lw * 0.5, 15);
}

/** gentle shore waves under the city, in city space */
function drawShoreWaves(c: Ctx, s: State, t: number, lw: number) {
  const rows = [
    { y: 34, a: 10, sp: 96, col: UK.blue, v: 9 },
    { y: 78, a: 14, sp: 132, col: mix(UK.blue, UK.prussian, 0.5), v: -12 },
    { y: 136, a: 18, sp: 176, col: UK.prussian, v: 16 },
  ];
  rows.forEach((row, ri) => {
    const edge: Pt[] = [];
    const off = (t * row.v) % row.sp;
    for (let x = -3500; x <= 3500; x += 10) {
      const ph = (x - off) / row.sp;
      const f = ph - Math.floor(ph);
      edge.push([
        x,
        row.y -
          row.a * Math.pow(Math.sin(f * Math.PI), 0.7) +
          Math.sin(t * 1.6 + x * 0.01 + ri) * 3,
      ]);
    }
    const body = poly([...edge, [3500, 600], [-3500, 600]]);
    block(c, body, row.col, s.gBlue, 0.9);
    const foam = ribbon(edge, 7, 7, 30 + ri, 0.4);
    c.fillStyle = UK.washiLight;
    c.fill(foam);
    const cl = claws(edge, Math.round(7000 / row.sp), row.a * 1.6, t, 50 + ri, new Path2D(), 1);
    c.fill(cl);
    const open = new Path2D();
    edge.forEach(([x, y], i) => (i ? open.lineTo(x, y) : open.moveTo(x, y)));
    keyline(c, open, lw * 0.45, 31 + ri);
  });
}

function drawBoat(
  c: Ctx,
  x: number,
  y: number,
  rot: number,
  sc: number,
  t: number,
  seed: number,
  lw: number
) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(sc, sc);
  // rowers: hunched backs in a row, oars dipping
  const rowers = new Path2D();
  const oars = new Path2D();
  for (let i = 0; i < 6; i++) {
    const rx = -92 + i * 34;
    const bob = Math.sin(t * 3 + i * 0.7 + seed) * 2;
    rowers.moveTo(rx - 15, -10);
    rowers.ellipse(rx, -12 + bob, 15, 20, -0.5, Math.PI, TAU);
    rowers.closePath();
    rowers.moveTo(rx + 19, -30 + bob);
    rowers.arc(rx + 11, -30 + bob, 8, 0, TAU);
    const oa = 0.9 + Math.sin(t * 3 + i * 0.7 + seed) * 0.25;
    oars.moveTo(rx, -16);
    oars.lineTo(rx - Math.cos(oa) * 46, -16 + Math.sin(oa) * 46);
  }
  c.fillStyle = UK.indigo;
  c.fill(rowers);
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 0.6;
  c.stroke(rowers);
  c.lineWidth = lw * 0.7;
  c.stroke(oars);
  const hull = new Path2D();
  hull.moveTo(-140, -12);
  hull.quadraticCurveTo(0, -4, 120, -14);
  hull.quadraticCurveTo(150, -18, 166, -46);
  hull.quadraticCurveTo(150, 4, 110, 10);
  hull.quadraticCurveTo(0, 18, -120, 8);
  hull.quadraticCurveTo(-140, 4, -140, -12);
  hull.closePath();
  c.fillStyle = UK.sand;
  c.fill(hull);
  c.fillStyle = rgba(UK.sumi, 0.15);
  c.fillRect(-140, 2, 310, 20);
  keyline(c, hull, lw * 0.8, seed);
  c.restore();
}

/** The great wave (or the small crest at the end): body, inner band, flow lines, foam, claws */
function drawWave(
  c: Ctx,
  s: State,
  pts: Pt[],
  t: number,
  lw: number,
  clawK: number,
  seed: number,
  foamK = 1
) {
  const body = poly(pts);
  block(c, body, UK.prussian, s.gBlue, 1, 0.6);
  const n = pts.length;
  const iTip = LIP1 * PER;
  const back = pts.slice(PER * 2, iTip + 1);
  const face = pts.slice(iTip, n - PER * 2).reverse();
  const rb = resampleOpen(back, 70);
  const rf = resampleOpen(face, 70);
  // lighter band along the back of the crest
  const bandPath = ribbon(rb, 30, 300, seed + 5, 0.15, new Path2D(), 1.6);
  c.save();
  c.clip(body);
  c.fillStyle = rgba(UK.blue, 0.85);
  c.fill(bandPath);
  c.strokeStyle = rgba(UK.pale, 0.9);
  c.lineWidth = lw * 1.1;
  c.lineCap = 'round';
  for (const k of [0.1, 0.19, 0.38, 0.5, 0.62, 0.74]) {
    const line = morph(rb, rf, k);
    c.beginPath();
    const st = Math.floor(line.length * 0.12);
    c.moveTo(line[st][0], line[st][1]);
    for (let i = st + 1; i < line.length - 3; i++) c.lineTo(line[i][0], line[i][1]);
    c.stroke();
  }
  c.restore();
  keyline(c, body, lw * 1.3, seed);
  if (foamK <= 0) return;
  // foam along the lip
  const lip = pts.slice(LIP0 * PER, LIP1 * PER + 2);
  const foam = new Path2D();
  ribbon(lip, 8, 44 * foamK, seed + 1, 0.35, foam, 0.7);
  if (clawK > 0)
    claws(lip.slice(Math.floor(lip.length * 0.3)), 15, 74 * clawK, t, seed + 2, foam, 1);
  c.fillStyle = UK.washiLight;
  c.fill(foam);
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 0.6;
  c.stroke(foam);
  void n;
}

const resampleOpen = (pts: Pt[], m: number): Pt[] => {
  const lens = [0];
  for (let i = 1; i < pts.length; i++)
    lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lens[lens.length - 1] || 1;
  const out: Pt[] = [];
  let j = 1;
  for (let i = 0; i < m; i++) {
    const target = (i / (m - 1)) * total;
    while (j < lens.length - 1 && lens[j] < target) j++;
    const sl = lens[j] - lens[j - 1] || 1;
    const k = (target - lens[j - 1]) / sl;
    out.push([lerp(pts[j - 1][0], pts[j][0], k), lerp(pts[j - 1][1], pts[j][1], k)]);
  }
  return out;
};

/** spray falling from the claws */
function drawSpray(c: Ctx, pts: Pt[], t: number, k: number) {
  if (k <= 0) return;
  const p = new Path2D();
  const lip = pts.slice(9 * PER, 12 * PER);
  for (let i = 0; i < 46; i++) {
    const h = hash(i * 3.3 + 1);
    const base = lip[Math.floor(h * (lip.length - 1))];
    const life = (t * (0.35 + hash(i) * 0.3) + hash(i * 7.1)) % 1;
    const x = base[0] + 30 + hash(i * 1.9) * 60 + life * 30;
    const y = base[1] + life * life * 260 + 10;
    const r = (2 + hash(i * 5.7) * 4) * (1 - life * 0.6);
    p.moveTo(x + r, y);
    p.arc(x, y, r, 0, TAU);
  }
  c.save();
  c.globalAlpha = k;
  c.fillStyle = UK.washiLight;
  c.fill(p);
  c.restore();
}

/* the secondary wave in front, curling left */
const NEAR_CP: Pt[] = [
  [900, 940],
  [980, 820],
  [1060, 740],
  [1150, 680],
  [1250, 650],
  [1330, 662],
  [1420, 700],
  [1520, 740],
  [1640, 760],
  [1760, 780],
  [1760, 940],
];
function nearPts(t: number): Pt[] {
  return sampleSmooth(
    NEAR_CP.map(
      ([x, y], i) => [x + noise1(t * 0.6 + i, 9) * 6, y + Math.sin(t * 1.5 + i * 0.6 + 1) * 7] as Pt
    ),
    8,
    true
  );
}

function drawNearWave(c: Ctx, s: State, t: number, lw: number) {
  const pts = nearPts(t);
  const body = poly(pts);
  block(c, body, mix(UK.prussian, UK.indigo, 0.35), s.gBlue, 1, -0.3);
  c.save();
  c.clip(body);
  c.strokeStyle = rgba(UK.pale, 0.75);
  c.lineWidth = lw;
  for (let j = 1; j <= 4; j++) {
    c.beginPath();
    for (let i = 8; i < 72; i++) {
      const p = pts[i];
      const y = p[1] + j * 34;
      if (i === 8) c.moveTo(p[0], y);
      else c.lineTo(p[0], y);
    }
    c.stroke();
  }
  c.restore();
  keyline(c, body, lw * 1.2, 21);
  const crest = pts.slice(12, 70).reverse();
  const foam = new Path2D();
  ribbon(crest, 4, 4, 22, 0.3, foam);
  ribbon(crest.slice(18, 46), 4, 18, 23, 0.3, foam);
  claws(crest.slice(10, 40), 6, 30, t, 24, foam, -1);
  c.fillStyle = UK.washiLight;
  c.fill(foam);
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 0.5;
  c.stroke(foam);
}

function drawSea(c: Ctx, s: State, top: number, t: number, lw: number, x0 = -6000, x1 = 9000) {
  const sea = rect(x0, top, x1 - x0, 4000);
  block(c, sea, UK.indigo, s.gBlue, 0.8);
  // horizon bokashi: paler at the far edge
  const g = c.createLinearGradient(0, top, 0, top + 40);
  g.addColorStop(0, rgba(UK.blue, 0.9));
  g.addColorStop(1, rgba(UK.blue, 0));
  c.fillStyle = g;
  c.fillRect(x0, top, x1 - x0, 40);
  // far swells
  c.strokeStyle = rgba(UK.pale, 0.55);
  c.lineWidth = lw * 0.7;
  c.beginPath();
  for (let j = 0; j < 9; j++) {
    const y = top + 12 + j * j * 5.5;
    const sp = 40 + j * 16;
    const off = (t * (8 + j * 3)) % sp;
    for (let x = 400 - off; x < 1800; x += sp) {
      const w = sp * 0.42;
      c.moveTo(x, y);
      c.quadraticCurveTo(x + w / 2, y - 3 - j * 0.6, x + w, y);
    }
  }
  c.stroke();
  keyline(
    c,
    (() => {
      const p = new Path2D();
      p.moveTo(x0, top);
      p.lineTo(x1, top);
      return p;
    })(),
    lw * 0.7,
    40
  );
}

/* ---------- flame ---------- */

interface Tongue {
  pts: Pt[];
  layer: number;
}

const tonguePts = (
  bx: number,
  by: number,
  h: number,
  w: number,
  dir: number,
  ph: number,
  t: number,
  seed: number
): Pt[] => {
  const n = 34;
  const mid: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const q = i / (n - 1);
    let x = bx + Math.sin(q * 3.2 + t * 6.5 + ph) * w * 0.28 * q;
    let y = by - h * q;
    if (q > 0.55) {
      const u = (q - 0.55) / 0.45;
      // the tip hooks over, like the wave lip
      const a = u * u * 1.7;
      x += dir * h * 0.24 * Math.sin(a) * u;
      y += h * 0.2 * (1 - Math.cos(a)) * u;
    }
    mid.push([x, y]);
  }
  return ribbonPts(mid, w, 1.5, seed, 0.18, 0.85);
};

function flameTongues(t: number, bx: number, by: number, shrink: number): Tongue[] {
  const fl = (a: number) => 1 + 0.08 * Math.sin(t * 7 + a) + 0.05 * noise1(t * 3 + a, 5);
  const others = 1 - shrink;
  const T: Tongue[] = [];
  const add = (
    dx: number,
    h: number,
    w: number,
    dir: number,
    ph: number,
    layer: number,
    seed: number,
    keep = false
  ) => {
    const hh = h * fl(ph) * (keep ? 1 : others);
    if (hh < 4) return;
    T.push({
      pts: tonguePts(bx + dx, by, hh, w * (keep ? 1 : lerp(1, 0.4, shrink)), dir, ph, t, seed),
      layer,
    });
  };
  // outer vermilion: the main tongue first (it becomes the sun)
  add(0, 250, 120, 1, 0, 0, 1, true);
  add(-44, 176, 92, -1, 1.7, 0, 2);
  add(46, 150, 84, 1, 3.1, 0, 3);
  add(-80, 104, 64, -1, 4.4, 0, 4);
  add(84, 92, 58, 1, 5.2, 0, 5);
  // ochre middle
  add(-18, 160, 74, -1, 2.3, 1, 6);
  add(22, 126, 62, 1, 0.9, 1, 7);
  // gold core (becomes the wave)
  add(4, 96, 46, 1, 0.4, 2, 8, true);
  return T;
}

/* ---------- film ---------- */

export const ukiyoCaspianFilm: RisoFilm<State> = {
  id: 'ukiyo-caspian',
  title: 'Wave off the Caspian',
  caption: 'A gust of the city of winds curls into a wave, a flame and a sunrise over Baku.',
  theme: 'Origins',
  motif: 'The curling claw: wind, wave, flame',
  duration: 18.5,
  series: 'Ukiyo-e',
  mode: 'direct',
  paper: UK.washi,
  paperTexture: true,
  grain: 0.18,
  inks: [
    { color: UK.prussian },
    { color: UK.indigo },
    { color: UK.vermilion },
    { color: UK.ochre },
    { color: UK.sumi },
  ],
  scenes: [
    { at: 0, label: 'City of winds' },
    { at: 3.4, label: 'Great wave' },
    { at: 8.4, label: 'Old city' },
    { at: 11.5, label: 'Fire temple' },
    { at: 15.2, label: 'Sunrise' },
  ],
  posterTime: 6.2,

  setup(r: Riso) {
    const gBlue = woodGrain(r, 11, 420, 1.2);
    const gWarm = woodGrain(r, 23, 380, 1);
    const gStone = woodGrain(r, 37, 300, 1.4);

    /* wind strokes: long gusts that end in curls */
    const mkWind = (
      y0: number,
      x1: number,
      y1: number,
      R: number,
      turns: number,
      amp: number
    ): Pt[] => {
      const pts: Pt[] = [];
      const lead = 60;
      for (let i = 0; i < lead; i++) {
        const k = i / (lead - 1);
        const x = lerp(-220, x1 - R, k);
        pts.push([x, lerp(y0, y1 + R, k) + Math.sin(k * Math.PI * 1.4) * amp]);
      }
      // curl clockwise from the bottom of the circle centred above the end point
      const cx = x1 - R;
      const cy = y1;
      const n = 50;
      for (let i = 1; i < n; i++) {
        const k = i / (n - 1);
        const a = Math.PI / 2 - k * turns * TAU;
        const rr = R * (1 - 0.72 * k);
        pts.push([cx + Math.cos(a) * rr * -1 + R * 0, cy + Math.sin(a) * rr]);
      }
      return pts;
    };
    const gust: Pt[] = [];
    for (let i = 0; i < 70; i++) {
      const k = i / 69;
      gust.push([lerp(-240, 585, k), lerp(760, 600, k) - Math.sin(k * Math.PI) * 90]);
    }
    const winds = [gust, mkWind(700, 1300, 640, 70, 1.1, 30), mkWind(200, 560, 170, 52, 1.05, 24)];
    const hook = HOOK_CP;
    const kas = [kasumiPath(900, 46, 3), kasumiPath(700, 40, 8), kasumiPath(1100, 52, 12)];
    const cloudRows = [0, 1, 2, 3, 4].map((i) => kasumiPath(2400, 210, 60 + i));
    const rng = mulberry(77);
    const stars = Array.from({ length: 40 }, () => [rng() * 1600, rng() * 300] as Pt);
    const sun = circlePts(800, 400, 200, 120);
    return {
      gBlue,
      gWarm,
      gStone,
      winds,
      hook,
      kas,
      cloudRows,
      city: buildCity(),
      temple: buildTemple(),
      stars,
      sun,
    };
  },

  draw(r, t, s) {
    const c = r.layers[0];
    const base = new DOMMatrix().scale(r.scale, r.scale);

    if (t < T_SWAP) drawSeaWorld(c, s, t, base);
    else drawTempleWorld(c, s, t, base);

    c.setTransform(base);
    if (t > T_CLOUD0 && t < T_CLOUD1) drawCloudWipe(c, s, t);
    printBorder(c, 16, 0.9);
  },
};

/* ---------- scene A-C: wind, wave, city ---------- */

function drawSeaWorld(c: Ctx, s: State, t: number, base: DOMMatrix) {
  /* camera from the wave to the city */
  const zk = tween(t, T_ZOOM0, T_ZOOM1, ease.inOutCubic);
  const drift = tween(t, T_ZOOM1, T_SWAP + 0.5, ease.linear);
  const z = Math.exp(lerp(0, Math.log(Z_END), zk)) * (1 + 0.07 * drift);
  const sx = lerp(CITY_X, 800, zk);
  const sy = lerp(CITY_Y, 660, zk) - drift * 20;
  const camX = CITY_X - (sx - 800) / z;
  const camY = CITY_Y - (sy - 450) / z;
  const world = base.multiply(
    new DOMMatrix().translate(800, 450).scale(z, z).translate(-camX, -camY)
  );
  const toScreenY = (y: number) => 450 + (y - camY) * z;

  /* sea rises during the hook */
  const rise = tween(t, T_HOOK0 - 0.1, T_HOOK1 - 0.2, ease.inOutCubic);
  const seaTop = lerp(960, CITY_Y, rise);

  /* sky (screen space) */
  c.setTransform(base);
  const horizon = toScreenY(seaTop);
  drawSky(c, Math.min(horizon, 900), zk * 0.6, 0);

  /* kasumi bands drifting */
  const kx = (t * 14) % 2400;
  kasumi(c, s.kas[0], 1500 - kx * 0.6, 120, UK.pink, 0.8);
  kasumi(c, s.kas[1], -200 + ((t * 22) % 2200), 250 + zk * 40, UK.washiLight, 0.9, UK.pink);

  /* wind gusts (scene A), drawn on and blowing past */
  const windOut = tween(t, 2.6, 4.4, ease.inCubic);
  if (windOut < 1) {
    s.winds.forEach((w, i) => {
      const a0 = -0.9 + i * 0.3;
      const k = tween(t, a0, a0 + 1.6, ease.inOutSine);
      if (k <= 0) return;
      const tailK = i === 0 ? tween(t, 0.9, T_HOOK0 + 0.4, ease.inSine) : windOut;
      const from = Math.floor(
        lerp(
          0,
          w.length - 2,
          Math.max(tailK, i === 0 ? 0 : tween(t, a0 + 1.2, a0 + 3.4, ease.inSine) * 0.92)
        )
      );
      const to = Math.max(from + 2, Math.floor(k * w.length));
      const seg = w.slice(from, to);
      if (seg.length < 2) return;
      const p = ribbon(seg, 6, i === 0 ? 30 : 18, 70 + i, 0.3, new Path2D(), 1.4);
      c.fillStyle = i === 0 ? UK.prussian : mix(UK.prussian, UK.indigo, 0.5);
      c.globalAlpha = i === 0 ? 1 : 1 - windOut;
      c.fill(p);
      c.globalAlpha = 1;
    });
  }

  /* the world */
  c.setTransform(world);
  const lwW = 2.4 / z;
  // the city sits on the horizon
  if (seaTop < 700) {
    c.save();
    c.translate(CITY_X, CITY_Y);
    c.scale(CITY_S, CITY_S);
    const seff = CITY_S * z;
    const lwC = lerp(0.7, 2.6, clamp((seff - CITY_S) / (1 - CITY_S))) / seff;
    drawCity(c, s, t, lwC, clamp((seff - 0.35) / 0.3));
    c.restore();
  }
  drawSea(c, s, seaTop, t, lwW);
  if (zk > 0.4) {
    c.save();
    c.translate(CITY_X, CITY_Y);
    c.scale(CITY_S, CITY_S);
    const seff = CITY_S * z;
    drawShoreWaves(c, s, t, 2.4 / seff);
    c.restore();
  }

  /* hook -> great wave */
  const curl = tween(t, T_HOOK1 - 0.4, 7.2, ease.inOutSine);
  const wp = wavePts(t, lerp(0.25, 1, curl));
  if (t < T_HOOK1) {
    const hk = tween(t, 0.75, T_HOOK0 - 0.1, ease.outBack);
    const mk = tween(t, T_HOOK0, T_HOOK1, ease.inOutCubic);
    if (hk > 0.01) {
      const pts = wavePts(t, lerp(0.25, 1, curl), mk, Math.max(0.02, hk));
      const p = poly(pts);
      block(c, p, UK.prussian, s.gBlue, 1, 0.6);
      keyline(c, p, lwW * 1.3, 1);
      if (mk > 0.6) {
        c.save();
        c.globalAlpha = (mk - 0.6) / 0.4;
        drawWave(c, s, wp, t, lwW, 0, 1, (mk - 0.6) / 0.4);
        c.restore();
      }
    }
  } else {
    const ck = tween(t, T_HOOK1 - 0.2, T_HOOK1 + 1.0, ease.outCubic);
    drawWave(c, s, wp, t, lwW, ck, 1);
    drawSpray(c, wp, t, ck);
  }

  /* boats */
  const bIn = tween(t, 3.0, 4.6, ease.outCubic);
  if (bIn > 0) {
    const bob = Math.sin(t * 1.4) * 8;
    drawBoat(
      c,
      lerp(560, 800, bIn),
      742 + bob,
      -0.24 + Math.sin(t * 1.4 + 1) * 0.05,
      1.25,
      t,
      3,
      lwW
    );
  }

  /* near wave with its own parallax: it rushes down and out as we glide in */
  const zn = Math.pow(z, 1.35);
  const camXn = CITY_X - (sx - 800) / zn;
  const camYn = CITY_Y - (sy - 450) / zn - zk * zk * 140;
  c.setTransform(
    base.multiply(new DOMMatrix().translate(800, 450).scale(zn, zn).translate(-camXn, -camYn))
  );
  const nearRise = tween(t, T_HOOK0 + 0.6, T_HOOK1 + 0.7, ease.outCubic);
  if (nearRise > 0 && zk < 0.85) {
    c.save();
    c.translate(0, (1 - nearRise) * 380);
    const lwN = 2.4 / zn;
    drawNearWave(c, s, t, lwN);
    if (bIn > 0)
      drawBoat(
        c,
        lerp(1560, 1420, bIn),
        690 + Math.sin(t * 1.5 + 2) * 8,
        0.2 + Math.sin(t * 1.5) * 0.05,
        0.85,
        t,
        9,
        lwN
      );
    c.restore();
  }

  /* city of winds: gusts and gulls stream across the close-up */
  c.setTransform(base);
  const cityK = tween(t, T_ZOOM1 - 0.8, T_ZOOM1 + 0.2);
  if (cityK > 0) {
    c.save();
    c.globalAlpha = cityK;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.32 + i * 0.37) % 1;
      const y0 = 150 + i * 120 + Math.sin(i * 2.1) * 30;
      const pts: Pt[] = [];
      for (let j = 0; j < 30; j++) {
        const k = j / 29;
        pts.push([lerp(-500, 1900, ph) - 600 + k * 600, y0 + Math.sin(k * 5 + t * 2 + i) * 14]);
      }
      // curl at the head of each gust
      const hx = pts[29][0];
      const hy = pts[29][1];
      for (let j = 1; j < 22; j++) {
        const k = j / 21;
        const a = Math.PI / 2 - k * 1.2 * TAU;
        const rr = 30 * (1 - 0.7 * k);
        pts.push([hx + Math.cos(a) * rr * -1 + 0, hy - 30 + Math.sin(a) * rr + 0]);
      }
      c.fillStyle = rgba(UK.prussian, 0.85);
      c.fill(ribbon(pts, 4, 16, 90 + i, 0.3, new Path2D(), 1.2));
    }
    // gulls
    const gulls = new Path2D();
    for (let i = 0; i < 5; i++) {
      const gx = ((t * (40 + i * 9) + i * 330) % 1900) - 150;
      const gy = 120 + i * 46 + Math.sin(t * 1.2 + i) * 16;
      const f = Math.sin(t * 7 + i * 1.3) * 7;
      gulls.moveTo(gx - 18, gy - f);
      gulls.quadraticCurveTo(gx - 8, gy - 8, gx, gy);
      gulls.quadraticCurveTo(gx + 8, gy - 8, gx + 18, gy - f);
    }
    c.strokeStyle = UK.sumi;
    c.lineWidth = 2.6;
    c.lineCap = 'round';
    c.stroke(gulls);
    c.restore();
  }
}

/* ---------- gold mist wipe ---------- */

function drawCloudWipe(c: Ctx, s: State, t: number) {
  const ys = [80, 270, 450, 630, 820];
  const band = (path: Path2D, x: number, y: number, col: string) => {
    kasumi(c, path, x, y, col, 1);
    c.save();
    c.translate(x, y);
    grainOver(c, path, s.gWarm, 0.9, 0, x * 0.3);
    c.restore();
  };
  // the mist parts around the flame first, then drifts off
  const hole = tween(t, T_SWAP + 0.02, T_SWAP + 0.6, ease.outCubic);
  c.save();
  if (hole > 0) {
    const cut = new Path2D();
    cut.rect(-100, -100, 1800, 1100);
    cut.ellipse(800, 530, 30 + hole * 260, 20 + hole * 190, 0, 0, TAU);
    c.clip(cut, 'evenodd');
  }
  ys.forEach((y, i) => {
    const dir = i % 2 ? 1 : -1;
    const st = Math.abs(i - 2) * 0.08;
    const kin = tween(t, T_CLOUD0 + st, T_SWAP - 0.08 + st * 0.2, ease.outCubic);
    const kout = tween(t, T_SWAP + 0.35 + st, T_CLOUD1 + st * 0.5 - 0.15, ease.inOutCubic);
    const col = i % 2 ? UK.gold : mix(UK.gold, UK.ochre, 0.45);
    if (i === 2) {
      // the middle band meets from both sides and parts on the flame
      const gapIn = (1 - kin) * 900;
      const gapOut = kout * 1500;
      const gap = Math.max(gapIn, gapOut);
      band(s.cloudRows[i], 800 - gap - 1200, y, col);
      band(s.cloudRows[(i + 2) % 5], 800 + gap + 1200, y + 8, col);
      return;
    }
    const x = 800 + dir * ((1 - kin) * 2500 - kout * 2700);
    band(s.cloudRows[i], x, y, col);
  });
  c.restore();
}

/* ---------- scene D-E: fire temple, sunrise ---------- */

function drawTempleWorld(c: Ctx, s: State, t: number, base: DOMMatrix) {
  const push = tween(t, T_SWAP, T_SUN0 + 0.1, ease.inOutSine);
  const back = tween(t, T_SUN0 + 0.2, T_SINK1, ease.inOutCubic);
  const z = 1 + 0.42 * push - 0.42 * back;
  const camX = 800;
  const camY = lerp(450, 545, push * (1 - back)) + 0;
  const sink = tween(t, T_SINK0, T_SINK1, ease.inOutCubic);
  const dawn = tween(t, T_SINK0, T_SINK1 + 0.3, ease.inOutSine);
  const cam = new DOMMatrix().translate(800, 450).scale(z, z).translate(-camX, -camY);
  const world = base.multiply(cam);
  const toScreen = (p: Pt): Pt => [800 + (p[0] - camX) * z, 450 + (p[1] - camY) * z];

  /* sky: night lifting into dawn */
  c.setTransform(base);
  const night = 1 - dawn;
  drawSky(c, lerp(640, 612, dawn), 0.8 * night + 0.2, night);
  if (night > 0) {
    c.save();
    c.globalAlpha = night;
    c.fillStyle = UK.washiLight;
    for (const [x, y] of s.stars) {
      c.beginPath();
      c.arc(x, y, 1.6 + hash(x) * 1.4, 0, TAU);
      c.fill();
    }
    // crescent moon
    const m = new Path2D();
    m.arc(260, 150, 44, 0, TAU);
    const cut = new Path2D();
    cut.rect(0, 0, 1600, 900);
    cut.arc(282, 136, 40, 0, TAU);
    c.save();
    c.clip(cut, 'evenodd');
    c.fillStyle = UK.washiLight;
    c.fill(m);
    c.restore();
    c.restore();
  }
  // kasumi in the night sky
  kasumi(
    c,
    s.kas[2],
    1200 - (t - T_SWAP) * 18,
    240,
    mix(UK.pink, UK.indigo, 0.25 * night),
    0.75 * night + 0.25,
    UK.pink
  );

  const shrink = tween(t, T_SUN0, T_SUN0 + 0.7, ease.inCubic);
  const tongues = flameTongues(t, 800, 646, shrink);
  const morphK = tween(t, T_SUN0, T_SUN1, ease.inOutCubic);
  const crestK = tween(t, T_CREST0, T_CREST1, ease.inOutCubic);
  /* temple, until it has sunk away */
  if (sink < 0.999) {
    c.setTransform(world);
    c.translate(0, sink * 900);
    const T = s.temple;
    const lw = 2.6 / z;
    block(c, T.wall, mix(UK.sand, UK.stone, 0.5), s.gStone, 1);
    c.fillStyle = rgba(UK.night, 0.35);
    c.fill(T.wall);
    c.fillStyle = UK.night;
    c.fill(T.cells);
    c.save();
    c.clip(T.wall);
    c.strokeStyle = rgba(UK.sumi, 0.35);
    c.lineWidth = lw * 0.5;
    c.stroke(T.courses);
    c.restore();
    keyline(c, T.wall, lw, 2);
    keyline(c, T.cells, lw * 0.7, 3);
    block(c, T.ground, mix(UK.stone, UK.indigo, 0.45), s.gStone, 0.55);
    c.strokeStyle = rgba(UK.sumi, 0.4);
    c.lineWidth = lw * 0.6;
    c.stroke(T.flags);
    // firelight on the ground
    const glow = c.createRadialGradient(800, 700, 10, 800, 700, 520);
    glow.addColorStop(0, rgba(UK.ochre, 0.55));
    glow.addColorStop(1, rgba(UK.ochre, 0));
    c.fillStyle = glow;
    c.fillRect(200, 520, 1200, 600);

    // arch interior
    c.fillStyle = UK.night;
    c.fill(T.arch);
    const ig = c.createRadialGradient(800, 640, 10, 800, 600, 220);
    ig.addColorStop(0, rgba(UK.vermilion, 0.9));
    ig.addColorStop(1, rgba(UK.vermilion, 0));
    c.save();
    c.clip(T.arch);
    c.fillStyle = ig;
    c.fillRect(600, 340, 400, 380);
    c.restore();

    /* flame */
    const fills = [UK.vermilion, UK.ochre, UK.gold];
    const drawTongues = (skipMain: boolean) => {
      for (let L = 0; L < 3; L++) {
        const path = new Path2D();
        tongues.forEach((tg, i) => {
          if (tg.layer !== L) return;
          if (skipMain && (i === 0 || tg.layer === 2)) return;
          poly(tg.pts, path);
        });
        if (L === 0) {
          c.strokeStyle = UK.sumi;
          c.lineWidth = lw * 2.4;
          c.lineJoin = 'round';
          c.stroke(path);
          const bw = 70 * (1 - shrink * 0.9);
          if (bw > 2) path.ellipse(800, 650, bw, 22, 0, 0, TAU);
        }
        c.fillStyle = fills[L];
        c.fill(path);
      }
    };
    drawTongues(morphK > 0);
    block(c, T.altar, UK.stone, s.gStone, 1);
    keyline(c, T.altar, lw, 4);

    /* pavilion */
    const bodyHole = new Path2D();
    bodyHole.addPath(T.body);
    bodyHole.addPath(T.arch);
    c.save();
    c.fillStyle = mix(UK.sand, UK.washiLight, 0.3);
    c.fill(bodyHole, 'evenodd');
    c.clip(bodyHole, 'evenodd');
    grainOver(c, T.body, s.gStone, 1, Math.PI / 2);
    c.strokeStyle = rgba(UK.sumi, 0.3);
    c.lineWidth = lw * 0.5;
    c.stroke(T.courses);
    // firelight spilling onto the face around the arch
    const fg = c.createRadialGradient(800, 560, 60, 800, 560, 300);
    fg.addColorStop(0, rgba(UK.ochre, 0.35));
    fg.addColorStop(1, rgba(UK.ochre, 0));
    c.fillStyle = fg;
    c.fillRect(560, 360, 480, 342);
    c.restore();
    c.fillStyle = mix(UK.indigo, UK.night, 0.4);
    c.fill(T.niches);
    keyline(c, T.niches, lw * 0.8, 5);
    keyline(c, T.body, lw * 1.2, 6);
    keyline(c, T.arch, lw * 1.2, 7);
    block(c, T.cornice, UK.stone, s.gStone, 1);
    keyline(c, T.cornice, lw, 8);
    block(c, T.dome, mix(UK.sand, UK.stone, 0.4), s.gStone, 1, 0.3);
    c.save();
    c.clip(T.dome);
    c.fillStyle = rgba(UK.sumi, 0.16);
    c.fillRect(800, 190, 140, 152);
    c.restore();
    keyline(c, T.dome, lw * 1.1, 9);
    block(c, T.chimneys, UK.stone, s.gStone, 1);
    keyline(c, T.chimneys, lw, 10);
    // small flames on the corner chimneys
    const small = new Path2D();
    for (const [i, cx] of [578, 1022].entries()) {
      const h = (40 + Math.sin(t * 8 + i * 2) * 6) * (1 - shrink);
      if (h > 3) poly(tonguePts(cx, 302, h, 26, i ? 1 : -1, i * 2, t, 20 + i), small);
    }
    c.strokeStyle = UK.sumi;
    c.lineWidth = lw * 2.2;
    c.stroke(small);
    c.fillStyle = UK.vermilion;
    c.fill(small);

    /* sparks */
    const sparks = new Path2D();
    for (let i = 0; i < 26; i++) {
      const life = (t * (0.3 + hash(i) * 0.25) + hash(i * 3.1)) % 1;
      const x = 800 + (hash(i * 7.7) - 0.5) * 160 + Math.sin(life * 6 + i) * 20;
      const y = 600 - life * 260;
      const rr = 2.6 * (1 - life);
      sparks.moveTo(x + rr, y);
      sparks.arc(x, y, rr, 0, TAU);
    }
    c.save();
    c.globalAlpha = 1 - shrink;
    c.fillStyle = UK.gold;
    c.fill(sparks);
    c.restore();
  }

  /* sea of the final print rises over the sinking temple */
  c.setTransform(base);
  const seaTop = lerp(960, 612, tween(t, T_SINK0 + 0.1, T_SINK1 - 0.1, ease.inOutCubic));

  /* flame -> sun, core -> crest */
  if (morphK > 0) {
    const main = tongues[0].pts.map(toScreen);
    const [a, b] = morphPair(main, s.sun, 150);
    const sunP = poly(morph(a, b, morphK));
    c.fillStyle = UK.vermilion;
    c.fill(sunP);
    grainOver(c, sunP, s.gWarm, 0.9);
    if (morphK < 1) keyline(c, sunP, 2.6 * (1 - morphK), 11);
  }

  if (seaTop < 940) {
    // distant city on the far shore, the tower small against the dawn
    c.save();
    c.globalAlpha = clamp((700 - seaTop) / 80);
    c.beginPath();
    c.rect(0, 0, 1600, seaTop + 1);
    c.clip();
    c.translate(1180, seaTop + 2);
    c.scale(0.17, 0.17);
    drawCity(c, s, t, 1.1 / 0.17, 0, false);
    c.restore();
    drawSea(c, s, seaTop, t, 2.4, -100, 1700);
  }

  const core = tongues.find((tg) => tg.layer === 2);
  if (core && crestK > 0) {
    const coreS = core.pts.map(toScreen);
    const mini = wavePts(t, 1).map(toMini);
    if (crestK < 1) {
      const [a, b] = morphPair(coreS, mini, 180);
      const p = poly(morph(a, b, crestK));
      c.fillStyle = mix(UK.gold, UK.prussian, ease.outCubic(clamp(crestK * 1.6)));
      c.fill(p);
      keyline(c, p, 2.4, 12);
    }
    if (crestK > 0.8) {
      c.save();
      c.globalAlpha = clamp((crestK - 0.8) / 0.2);
      const ck = tween(t, T_CREST1 - 0.3, T_CREST1 + 0.8, ease.outCubic);
      drawWave(c, s, mini, t, 2, ck * 0.6, 13);
      c.restore();
    }
  }

  /* a front swell the crest rises out of */
  if (seaTop < 940) {
    const top = seaTop + 136;
    const edge: Pt[] = [];
    const sp = 230;
    const off = (t * 14) % sp;
    for (let x = -60; x <= 1660; x += 8) {
      const ph = (x - off + 40) / sp;
      const f = ph - Math.floor(ph);
      edge.push([
        x,
        top - 20 * Math.pow(Math.sin(f * Math.PI), 0.7) + Math.sin(t * 1.3 + x * 0.008) * 4,
      ]);
    }
    const body = poly([...edge, [1660, 960], [-60, 960]]);
    block(c, body, mix(UK.prussian, UK.indigo, 0.4), s.gBlue, 0.9, 0.2);
    c.save();
    c.clip(body);
    c.strokeStyle = rgba(UK.pale, 0.6);
    c.lineWidth = 2;
    for (let j = 1; j < 5; j++) {
      c.beginPath();
      edge.forEach(([x, y], i) => (i ? c.lineTo(x, y + j * 26) : c.moveTo(x, y + j * 26)));
      c.stroke();
    }
    c.restore();
    const foam = ribbon(edge, 8, 8, 61, 0.4);
    claws(edge, 16, 46, t, 62, foam, 1);
    c.fillStyle = UK.washiLight;
    c.fill(foam);
    c.strokeStyle = UK.sumi;
    c.lineWidth = 1.2;
    c.stroke(foam);
  }

  /* title */
  const tk = tween(t, T_TITLE, T_TITLE + 0.6, ease.outCubic);
  if (tk > 0) cartouche(c, 1452, 300, 66, 400, 'Wave off the Caspian', tk, 'BAKU');
}
