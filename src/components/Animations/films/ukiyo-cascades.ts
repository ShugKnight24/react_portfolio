import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import {
  TAU,
  clamp,
  ease,
  hash,
  lerp,
  mulberry,
  noise1,
  resample,
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
  sampleSmooth,
  woodGrain,
} from '../styles/ukiyo';

/*
 * Views of the Cascades: the snowy volcano is the motif, seen from four places like a set of
 * prints. Tiny between the claws of a Puget Sound wave as a ferry crosses; the crest becomes the
 * lip of a great waterfall whose spray frames the peak above travellers at the lookout; the
 * white water becomes the upper tier of a tall two-tier falls, where walkers cross a stone
 * footbridge and the mountain shows through its arch; through the arch we arrive at evening,
 * the peak turning pink under a band of cloud.
 */

const T_A1 = 3.7; // zoom into the crest
const T_SWAP_AB = 4.55;
const T_B1 = 7.8; // zoom into the falling water
const T_SWAP_BC = 8.6;
const T_C1 = 11.9; // into the arch
const T_ARCH = 13.5;
const T_TITLE = 15.8;
const DURATION = 18.5;

/* ---------- shared pieces ---------- */

interface Mountain {
  body: Pt[];
  snow: Pt[];
  ridges: Pt[][];
}

interface State {
  gBlue: CanvasPattern;
  gWarm: CanvasPattern;
  gStone: CanvasPattern;
  mtn: Mountain;
  kas: Path2D[];
  firs: { a: Path2D; b: Path2D; c: Path2D; d: Path2D };
  basalt: Path2D;
  cliffL: Path2D;
  cliffR: Path2D;
  cliffC: Path2D;
  arch: Path2D;
  bridge: Path2D;
  bridgeStones: Path2D;
  lookout: Path2D;
  rail: Path2D;
}

/** a broad snowy volcano in unit coords: base from x -0.5..0.5 at y 0, rounded summit at y -1 */
function buildMountain(): Mountain {
  const N = 90;
  const prof = (x: number) => {
    const u = Math.abs(x) / 0.5;
    let y = -Math.pow(Math.max(0, 1 - Math.pow(u, 1.45)), 1.25);
    y -= 0.07 * Math.exp(-(((x + 0.14) / 0.05) ** 2)); // the rounded cap on the left shoulder
    y -= 0.05 * Math.exp(-(((x - 0.21) / 0.025) ** 2)); // a rocky spur on the right flank
    y += noise1(x * 40, 4) * 0.008;
    return y * 0.98;
  };
  const body: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const x = -0.5 + i / N;
    body.push([x, Math.min(0, prof(x))]);
  }
  // snow down to a ragged line, with glacier tongues reaching lower
  const sl = (x: number) => {
    let y = -0.36 + 0.05 * Math.sin(x * 37) * Math.abs(Math.sin(x * 11));
    for (const [gx, ga, gw] of [
      [-0.3, 0.06, 0.03],
      [-0.17, 0.09, 0.018],
      [-0.02, 0.05, 0.035],
      [0.12, 0.1, 0.02],
      [0.27, 0.05, 0.03],
    ])
      y += ga * Math.exp(-(((x - gx) / gw) ** 2));
    return y;
  };
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  for (let i = 0; i <= N * 2; i++) {
    const x = -0.5 + i / (N * 2);
    const y = Math.min(0, prof(x));
    const l = sl(x);
    if (y < l - 0.005) {
      top.push([x, y]);
      bottom.push([x, l]);
    }
  }
  const snow = [...top, ...bottom.reverse()];
  // dark rock cleavers splitting the snowfields, and glacier flow lines
  const ridges: Pt[][] = [];
  for (const x0 of [-0.25, -0.1, 0.04, 0.18, 0.31]) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      const x = x0 * (1 - k * 0.55);
      pts.push([
        x + noise1(k * 4 + x0 * 20, 3) * 0.01,
        lerp(sl(x0) + 0.02, prof(x) + 0.1, k * 0.8),
      ]);
    }
    ridges.push(pts);
  }
  return { body, snow, ridges };
}

/** Draw the volcano: x, base y, width, height; pink = alpenglow 0..1 */
function drawMountain(
  c: Ctx,
  s: State,
  x: number,
  by: number,
  w: number,
  h: number,
  pink: number,
  lw: number,
  haze = 0
) {
  const M = s.mtn;
  const tr = (p: Pt): Pt => [x + p[0] * w, by + p[1] * h];
  const body = poly(M.body.map(tr));
  c.fillStyle = mix(mix(UK.blue, UK.indigo, 0.35), UK.vermilion, pink * 0.22);
  c.fill(body);
  grainOver(c, body, s.gBlue, 0.6, 1.2);
  c.save();
  c.clip(body);
  bokashi(c, x - w, by, w * 2, by - h * 0.5, mix(UK.pale, UK.pink, pink), 0.6, 0);
  c.restore();
  const snow = poly(M.snow.map(tr));
  c.fillStyle = mix(UK.washiLight, UK.pink, pink * 0.55);
  c.fill(snow);
  c.save();
  c.clip(snow);
  // shadowed east faces in pale blue; the glow climbs to the summit
  const sh = c.createLinearGradient(x - w * 0.05, 0, x + w * 0.4, 0);
  sh.addColorStop(0, rgba(mix(UK.pale, UK.vermilion, pink * 0.5), 0));
  sh.addColorStop(1, rgba(mix(UK.pale, UK.vermilion, pink * 0.5), 0.6));
  c.fillStyle = sh;
  c.fillRect(x - w * 0.05, by - h * 1.2, w * 0.6, h * 1.2);
  bokashi(c, x - w, by - h * 1.02, w * 2, by - h * 0.4, UK.vermilion, pink * 0.55, 0);
  // rock cleavers
  c.fillStyle = mix(UK.indigo, UK.vermilion, pink * 0.2);
  for (const r of M.ridges) {
    const pts = r.map(tr);
    c.fill(ribbon(pts, w * 0.022, w * 0.002, 7, 0.4));
  }
  c.restore();
  keyline(c, snow, lw * 0.5, 3);
  keyline(c, body, lw, 4);
  if (haze > 0) {
    c.save();
    c.fillStyle = rgba(UK.washiLight, haze);
    c.fill(body);
    c.restore();
  }
}

/** a stylised fir: drooping tiers, one Path2D added per tree */
const firPath = (x: number, y: number, h: number, seed: number, p: Path2D) => {
  const tiers = 7;
  const w = h * 0.36;
  for (let i = 0; i < tiers; i++) {
    const k = i / tiers;
    const ty = y - h * (1 - k);
    const ww = w * (0.25 + k * 0.85) * (0.85 + hash(seed + i) * 0.3);
    const by = ty + h * 0.2;
    p.moveTo(x, ty);
    p.quadraticCurveTo(x + ww * 0.4, ty + h * 0.08, x + ww, by);
    p.quadraticCurveTo(x + ww * 0.3, by - h * 0.03, x, by - h * 0.02);
    p.quadraticCurveTo(x - ww * 0.3, by - h * 0.03, x - ww, by);
    p.quadraticCurveTo(x - ww * 0.4, ty + h * 0.08, x, ty);
    p.closePath();
  }
  p.rect(x - h * 0.02, y - h * 0.1, h * 0.04, h * 0.1);
};

function drawFirs(c: Ctx, p: Path2D, col: string, lw: number) {
  c.fillStyle = col;
  c.fill(p);
  c.strokeStyle = rgba(UK.sumi, 0.55);
  c.lineWidth = lw * 0.5;
  c.lineJoin = 'round';
  c.stroke(p);
}

/* ---------- travellers ---------- */

interface Walker {
  walk: number;
  amp: number;
  point: number;
  sit: number;
  coat: string;
  hatCol: string;
  pack: boolean;
  t: number;
}

/** A small traveller in the Edo manner: wide hat, coat, pack and staff. Feet at (x, y), height ~ 100 * sc */
function drawWalker(
  c: Ctx,
  s: State,
  x: number,
  y: number,
  sc: number,
  dir: number,
  w: Walker,
  lw: number
) {
  c.save();
  c.translate(x, y);
  c.scale(sc * dir, sc);
  const L = lw / sc;
  const sw = Math.sin(w.walk) * w.amp;
  const bob = -Math.abs(Math.cos(w.walk)) * 2 * w.amp;
  const sit = w.sit;
  c.translate(0, bob + sit * 26);

  /* legs: leggings and straw sandals */
  const legs = new Path2D();
  const leg = (hx: number, fx: number, fy: number, kneeOut: number) => {
    const pts = sampleSmooth(
      [
        [hx, -46],
        [lerp(hx, fx, 0.5) + kneeOut, -24 + sit * 8],
        [fx, fy],
      ],
      4,
      false
    );
    ribbon(pts, 11, 7, 5, 0.05, legs);
  };
  if (sit > 0.5) {
    leg(4, 30, -6, 6);
    leg(-4, 22, -2, 10);
  } else {
    leg(4, 8 + sw * 14, -2, 3);
    leg(-4, -6 - sw * 14, -2, 2);
  }
  c.fillStyle = mix(UK.indigo, UK.sumi, 0.3);
  c.fill(legs);
  keyline(c, legs, L * 0.6, 81);
  c.fillStyle = UK.sand;
  c.fillRect(sit > 0.5 ? 26 : 2 + sw * 14, -4, 12, 4);
  c.fillRect(sit > 0.5 ? 18 : -12 - sw * 14, -4, 12, 4);

  /* pack with a bedroll, on the back */
  if (w.pack) {
    const pack = new Path2D();
    pack.roundRect(-30, -86, 22, 34, 5);
    const roll = new Path2D();
    roll.ellipse(-19, -90, 14, 6, 0, 0, TAU);
    c.fillStyle = UK.ochre;
    c.fill(pack);
    grainOver(c, pack, s.gWarm, 0.8);
    keyline(c, pack, L * 0.7, 82);
    c.strokeStyle = UK.sumi;
    c.lineWidth = L * 0.5;
    c.beginPath();
    c.moveTo(-29, -72);
    c.lineTo(-9, -72);
    c.stroke();
    c.fillStyle = UK.vermilion;
    c.fill(roll);
    keyline(c, roll, L * 0.6, 83);
  }

  /* coat: an A-line travelling coat with folds, tucked at the waist */
  const coat = poly(
    sampleSmooth(
      [
        [-12, -92],
        [12, -92],
        [17, -70],
        [20, -44],
        [4, -40],
        [-16, -42],
        [-18, -66],
      ],
      4,
      true
    )
  );
  block(c, coat, w.coat, s.gBlue, 0.6, Math.PI / 2);
  c.save();
  c.clip(coat);
  c.strokeStyle = rgba(UK.sumi, 0.55);
  c.lineWidth = L * 0.55;
  c.beginPath();
  c.moveTo(2, -90);
  c.quadraticCurveTo(8, -66, 10, -42);
  c.moveTo(-6, -84);
  c.quadraticCurveTo(-10, -62, -8, -42);
  c.stroke();
  c.fillStyle = UK.washiLight;
  c.fillRect(-16, -58, 36, 4); // sash
  c.restore();
  keyline(c, coat, L * 0.8, 84);

  /* head */
  const head = new Path2D();
  head.ellipse(2, -100, 7, 8, 0, 0, TAU);
  c.fillStyle = '#efd6b8';
  c.fill(head);
  keyline(c, head, L * 0.5, 85);
  c.fillStyle = UK.sumi;
  c.beginPath();
  c.arc(6, -100, 1.1, 0, TAU);
  c.fill();

  /* arm: holding the staff, or pointing at the view */
  const sh: Pt = [6, -88];
  const hand: Pt = [lerp(16, 34, w.point), lerp(-60, -104, w.point)];
  const arm = ribbon(
    sampleSmooth([sh, [lerp(14, 22, w.point), lerp(-74, -94, w.point)], hand], 4, false),
    9,
    6,
    86,
    0.05
  );
  if (w.point < 0.5) {
    c.strokeStyle = mix(UK.sand, UK.sumi, 0.3);
    c.lineWidth = L * 2.2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(hand[0] + 2, hand[1] - 20);
    c.lineTo(hand[0] + 6 + sw * 4, 0);
    c.stroke();
  }
  c.fillStyle = mix(w.coat, UK.sumi, 0.25);
  c.fill(arm);
  keyline(c, arm, L * 0.6, 87);
  c.fillStyle = '#efd6b8';
  c.beginPath();
  c.arc(hand[0], hand[1], 3, 0, TAU);
  c.fill();

  /* wide hat */
  const hat = new Path2D();
  hat.moveTo(-24, -104);
  hat.quadraticCurveTo(-8, -118, 2, -122);
  hat.quadraticCurveTo(12, -118, 28, -104);
  hat.quadraticCurveTo(2, -108, -24, -104);
  hat.closePath();
  c.fillStyle = w.hatCol;
  c.fill(hat);
  c.strokeStyle = rgba(UK.sumi, 0.4);
  c.lineWidth = L * 0.4;
  c.beginPath();
  for (let i = 0; i <= 6; i++) {
    c.moveTo(2, -122);
    c.lineTo(lerp(-22, 26, i / 6), -105);
  }
  c.stroke();
  keyline(c, hat, L * 0.7, 88);
  c.restore();
}

/* ---------- scene A: wave on the Sound ---------- */

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
const WSC = 0.82;
const WDX = -60;
const WDY = 150;
const wavePts = (t: number): Pt[] =>
  sampleSmooth(
    WAVE_CP.map(([x, y], i) => {
      const edge = i === 0 || i === WAVE_CP.length - 1;
      return [
        x * WSC + WDX + (edge ? 0 : noise1(t * 0.7 + i * 0.37, 3) * 5),
        y * WSC + WDY + (edge ? 0 : Math.sin(t * 1.3 + i * 0.45) * 5),
      ] as Pt;
    }),
    8,
    true
  );

function drawSound(c: Ctx, s: State, t: number, lw: number, lipFall: number) {
  // horizon, distant shore and the mountain between the claws
  const HZ = 600;
  bokashi(c, -400, -400, 2400, 260, UK.prussian, 0.9, 0);
  bokashi(c, -400, HZ + 2, 2400, HZ - 180, UK.pink, 0.5, 0);
  kasumi(c, s.kas[0], 1250 - t * 12, 170, UK.washiLight, 0.8, UK.pink);
  drawMountain(c, s, 800, HZ - 6, 330, 110, 0, lw * 0.7, 0.12);
  // far shore with firs
  const shore = new Path2D();
  shore.moveTo(-400, HZ);
  for (let x = -400; x <= 2000; x += 40)
    shore.lineTo(x, HZ - 10 - Math.abs(noise1(x / 160, 4)) * 22);
  shore.lineTo(2000, HZ + 4);
  shore.lineTo(-400, HZ + 4);
  shore.closePath();
  c.fillStyle = mix(UK.green, UK.indigo, 0.55);
  c.fill(shore);
  keyline(c, shore, lw * 0.5, 9);
  // the Sound
  const sea = new Path2D();
  sea.rect(-400, HZ, 2400, 600);
  block(c, sea, UK.indigo, s.gBlue, 0.8);
  c.strokeStyle = rgba(UK.pale, 0.55);
  c.lineWidth = lw * 0.7;
  c.beginPath();
  for (let j = 0; j < 9; j++) {
    const y = HZ + 12 + j * j * 5.5;
    const sp = 40 + j * 16;
    const off = (t * (8 + j * 3)) % sp;
    for (let x = -400 - off; x < 2000; x += sp) {
      c.moveTo(x, y);
      c.quadraticCurveTo(x + sp * 0.21, y - 3 - j * 0.6, x + sp * 0.42, y);
    }
  }
  c.stroke();

  /* ferry crossing */
  const fx = lerp(1640, 1180, tween(t, 0, 5, ease.linear));
  const fy = HZ + 44 + Math.sin(t * 1.6) * 3;
  drawFerry(c, s, fx, fy, 1, t, lw);

  /* the great wave */
  const pts = wavePts(t);
  const body = poly(pts);
  block(c, body, UK.prussian, s.gBlue, 1, 0.6);
  c.save();
  c.clip(body);
  c.strokeStyle = rgba(UK.pale, 0.85);
  c.lineWidth = lw * 1.1;
  c.lineCap = 'round';
  const n = pts.length;
  const tip = 12 * 8;
  const rb = resample(pts.slice(16, tip + 1), 60, false);
  const rf = resample(pts.slice(tip, n - 16).reverse(), 60, false);
  for (const k of [0.12, 0.24, 0.38, 0.52, 0.66]) {
    c.beginPath();
    for (let i = 6; i < 57; i++) {
      const x = lerp(rb[i][0], rf[i][0], k);
      const y = lerp(rb[i][1], rf[i][1], k);
      if (i === 6) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  c.restore();
  keyline(c, body, lw * 1.3, 1);
  const lip = pts.slice(5 * 8, 12 * 8 + 2);
  const foam = new Path2D();
  ribbon(lip, 8, 40, 2, 0.35, foam, 0.7);
  claws(lip.slice(Math.floor(lip.length * 0.3)), 14, 66, t, 3, foam, 1);
  // as we near the crest the foam starts to pour, the lip of a waterfall
  if (lipFall > 0) {
    for (let i = 0; i < 18; i++) {
      const p = lip[Math.floor(lerp(lip.length * 0.45, lip.length - 1, i / 17))];
      const len = lipFall * (120 + hash(i) * 200);
      ribbon(
        [
          [p[0], p[1]],
          [p[0] + 6, p[1] + len * 0.5],
          [p[0] + 4, p[1] + len],
        ],
        8,
        2,
        10 + i,
        0.2,
        foam
      );
    }
  }
  c.fillStyle = UK.washiLight;
  c.fill(foam);
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 0.6;
  c.stroke(foam);
}

function drawFerry(c: Ctx, s: State, x: number, y: number, sc: number, t: number, lw: number) {
  c.save();
  c.translate(x, y);
  c.scale(sc, sc);
  const hull = new Path2D();
  hull.moveTo(-110, -14);
  hull.lineTo(110, -14);
  hull.quadraticCurveTo(118, 0, 100, 10);
  hull.lineTo(-96, 10);
  hull.quadraticCurveTo(-116, 0, -110, -14);
  hull.closePath();
  c.fillStyle = UK.washiLight;
  c.fill(hull);
  c.fillStyle = UK.green;
  c.fillRect(-104, -2, 210, 6);
  keyline(c, hull, lw * 0.7, 91);
  const deck = new Path2D();
  deck.rect(-80, -32, 150, 18);
  deck.rect(-50, -46, 90, 14);
  c.fillStyle = UK.washiLight;
  c.fill(deck);
  c.fillStyle = UK.indigo;
  for (let i = 0; i < 9; i++) c.fillRect(-74 + i * 16, -27, 8, 6);
  for (let i = 0; i < 5; i++) c.fillRect(-44 + i * 16, -42, 7, 5);
  keyline(c, deck, lw * 0.6, 92);
  const funnel = new Path2D();
  funnel.rect(-6, -62, 14, 16);
  c.fillStyle = UK.green;
  c.fill(funnel);
  keyline(c, funnel, lw * 0.6, 93);
  // smoke drifting off as a little kasumi
  c.fillStyle = rgba(UK.washiLight, 0.8);
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.5 + i * 0.25) % 1;
    c.beginPath();
    c.ellipse(4 + k * 60, -70 - k * 30, 6 + k * 12, 4 + k * 6, 0, 0, TAU);
    c.fill();
  }
  c.restore();
}

/* ---------- scene B: the great falls ---------- */

const LIP_Y = 300;
const FALL_X0 = 660;
const FALL_X1 = 940;

function fallsCurtain(x0: number, x1: number, y0: number, y1: number, spread: number) {
  return poly([
    [x0, y0],
    [x1, y0],
    [x1 + spread, y1],
    [x0 - spread, y1],
  ]);
}

function drawWater(
  c: Ctx,
  s: State,
  path: Path2D,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  t: number,
  lw: number,
  seed: number
) {
  c.fillStyle = mix(UK.pale, UK.washiLight, 0.35);
  c.fill(path);
  c.save();
  c.clip(path);
  bokashi(c, x0 - 100, y0, x1 - x0 + 200, y0 + (y1 - y0) * 0.5, UK.blue, 0.4, 0);
  // falling streaks
  c.strokeStyle = UK.washiLight;
  c.lineCap = 'round';
  const W = x1 - x0;
  for (let i = 0; i < 26; i++) {
    const x = x0 - 40 + (i / 25) * (W + 80) + hash(i + seed) * 8;
    const sp = 260 + hash(i * 3.1 + seed) * 220;
    const seg = 60 + hash(i * 1.7 + seed) * 110;
    const off = (t * sp + hash(i * 7.3 + seed) * 400) % (seg * 2.4);
    c.lineWidth = lw * (1.2 + hash(i * 5.5 + seed) * 2.2);
    c.beginPath();
    for (let y = y0 - seg * 2.4 + off; y < y1; y += seg * 2.4) {
      c.moveTo(x, Math.max(y0, y));
      c.lineTo(x + (y - y0) * 0.02, Math.min(y1, y + seg));
    }
    c.stroke();
  }
  c.strokeStyle = rgba(UK.blue, 0.5);
  c.lineWidth = lw * 0.7;
  c.beginPath();
  for (let i = 0; i < 12; i++) {
    const x = x0 + (i / 11) * W;
    c.moveTo(x, y0);
    c.lineTo(x + (i - 5.5) * 3, y1);
  }
  c.stroke();
  c.restore();
  keyline(c, path, lw, seed);
}

function drawMist(c: Ctx, cx: number, cy: number, w: number, h: number, t: number, a: number) {
  for (let i = 0; i < 9; i++) {
    const ph = t * 0.5 + i * 0.7;
    const x = cx + Math.sin(ph) * w * 0.3 + (hash(i) - 0.5) * w;
    const y = cy - ((t * 30 + i * 40) % h) * 0.6;
    const r = (0.25 + hash(i * 3.3) * 0.25) * w;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(UK.washiLight, 0.75 * a));
    g.addColorStop(1, rgba(UK.washiLight, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function drawFalls(c: Ctx, s: State, t: number, lw: number) {
  // sky and the peak framed above the gorge
  bokashi(c, -800, -600, 3200, 120, UK.prussian, 0.9, 0);
  kasumi(c, s.kas[1], 600 + t * 8, 90, UK.washiLight, 0.7, UK.pink);
  drawMountain(c, s, 800, 236, 520, 150, 0, lw * 0.8, 0.18);
  kasumi(c, s.kas[0], 800 + Math.sin(t * 0.4) * 30, 250, UK.washiLight, 0.95, UK.washiLight);
  drawMist(c, 800, 330, 700, 200, t, 0.5);
  // gorge walls
  block(c, s.cliffL, mix(UK.green, UK.indigo, 0.5), s.gStone, 1, Math.PI / 2);
  block(c, s.cliffR, mix(UK.green, UK.indigo, 0.5), s.gStone, 1, Math.PI / 2);
  c.save();
  c.clip(s.cliffL);
  bokashi(c, -800, 1200, 1500, 300, UK.night, 0.6, 0);
  c.restore();
  c.save();
  c.clip(s.cliffR);
  bokashi(c, 900, 1200, 1500, 300, UK.night, 0.6, 0);
  c.restore();
  c.strokeStyle = rgba(UK.sumi, 0.4);
  c.lineWidth = lw * 0.6;
  c.save();
  c.clip(s.cliffL);
  c.stroke(s.basalt);
  c.restore();
  c.save();
  c.clip(s.cliffR);
  c.stroke(s.basalt);
  c.restore();
  keyline(c, s.cliffL, lw, 21);
  keyline(c, s.cliffR, lw, 22);
  drawFirs(c, s.firs.a, mix(UK.green, UK.night, 0.45), lw);
  // the falls
  const curtain = fallsCurtain(FALL_X0, FALL_X1, LIP_Y, 960, 70);
  drawWater(c, s, curtain, FALL_X0, FALL_X1, LIP_Y, 960, t, lw, 23);
  // lip foam with small claws: the wave's crest, now poured over rock
  const lip: Pt[] = [];
  for (let x = FALL_X0 - 10; x <= FALL_X1 + 10; x += 10)
    lip.push([x, LIP_Y + Math.sin(x * 0.05 + t * 3) * 3]);
  const foam = ribbon(lip, 18, 18, 24, 0.4);
  claws(lip, 9, 26, t, 25, foam, -1);
  c.fillStyle = UK.washiLight;
  c.fill(foam);
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 0.6;
  c.stroke(foam);
  // spray rising from the plunge pool
  drawMist(c, 800, 900, 900, 400, t, 1);
  drawMist(c, 800, 820, 600, 400, t + 3, 0.8);
  // the lookout with travellers
  block(c, s.lookout, mix(UK.sand, UK.stone, 0.5), s.gWarm, 1);
  keyline(c, s.lookout, lw, 26);
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 1.4;
  c.stroke(s.rail);
  drawWalker(
    c,
    s,
    1150,
    560,
    1.15,
    -1,
    {
      walk: 0,
      amp: 0,
      point: tween(t, 5.6, 6.2, ease.outBack),
      sit: 0,
      coat: UK.indigo,
      hatCol: mix(UK.sand, UK.ochre, 0.4),
      pack: false,
      t,
    },
    lw
  );
  drawWalker(
    c,
    s,
    1250,
    560,
    1.1,
    -1,
    {
      walk: 0,
      amp: 0,
      point: 0,
      sit: 0,
      coat: mix(UK.vermilion, UK.sumi, 0.25),
      hatCol: mix(UK.sand, UK.ochre, 0.2),
      pack: true,
      t,
    },
    lw
  );
  const wx = lerp(1560, 1360, tween(t, 4.8, 7.6, ease.inOutSine));
  drawWalker(
    c,
    s,
    wx,
    560,
    1.05,
    -1,
    {
      walk: (wx / 30) * Math.PI,
      amp: tween(t, 4.8, 5.2) * (1 - tween(t, 7.3, 7.6)),
      point: 0,
      sit: 0,
      coat: mix(UK.green, UK.indigo, 0.3),
      hatCol: mix(UK.sand, UK.ochre, 0.5),
      pack: true,
      t,
    },
    lw
  );
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 1.4;
  c.stroke(s.rail);
  drawFirs(c, s.firs.b, mix(UK.green, UK.night, 0.6), lw);
}

/* ---------- scene C: two-tier falls and the footbridge ---------- */

const ARCH_C: Pt = [1000, 660];
const ARCH_R = 190;
const DECK = 440;

function drawTwoTier(c: Ctx, s: State, t: number, lw: number) {
  bokashi(c, -800, -600, 3200, 140, UK.prussian, 0.9, 0);
  block(c, s.cliffC, mix(UK.green, UK.indigo, 0.55), s.gStone, 1, Math.PI / 2);
  c.save();
  c.clip(s.cliffC);
  c.strokeStyle = rgba(UK.sumi, 0.35);
  c.lineWidth = lw * 0.6;
  c.stroke(s.basalt);
  // moss
  c.fillStyle = rgba(UK.green, 0.55);
  for (let i = 0; i < 40; i++) {
    c.beginPath();
    c.ellipse(
      -200 + hash(i * 2.3) * 1600,
      -300 + hash(i * 4.1) * 1000,
      30 + hash(i) * 50,
      10 + hash(i * 7) * 12,
      0,
      0,
      TAU
    );
    c.fill();
  }
  c.restore();
  keyline(c, s.cliffC, lw, 31);
  drawFirs(c, s.firs.c, mix(UK.green, UK.night, 0.45), lw);
  // upper tier: tall and narrow; lower tier: short and wider
  const upper = fallsCurtain(560, 650, -400, 470, 18);
  drawWater(c, s, upper, 560, 650, -400, 470, t, lw, 33);
  const lower = fallsCurtain(520, 700, 500, 960, 40);
  drawWater(c, s, lower, 520, 700, 500, 960, t + 1, lw, 34);
  drawMist(c, 610, 900, 520, 260, t + 2, 0.9);
}

/** the stone footbridge, with the view through its arch drawn by the caller */
function drawBridge(c: Ctx, s: State, t: number, lw: number) {
  c.save();
  c.fillStyle = mix(UK.stone, UK.washiLight, 0.25);
  c.fill(s.bridge);
  c.clip(s.bridge);
  grainOver(c, s.bridge, s.gStone, 1);
  c.strokeStyle = rgba(UK.sumi, 0.4);
  c.lineWidth = lw * 0.6;
  c.stroke(s.bridgeStones);
  c.restore();
  keyline(c, s.bridge, lw * 1.1, 35);
  // walkers crossing the deck, one either way
  const k = (t - T_SWAP_BC) / 4;
  const x1 = lerp(700, 1300, clamp(k * 0.9));
  const x2 = lerp(1500, 1050, clamp(k * 0.8));
  drawWalker(
    c,
    s,
    x1,
    DECK - 2,
    0.9,
    1,
    {
      walk: (x1 / 26) * Math.PI,
      amp: 1,
      point: 0,
      sit: 0,
      coat: UK.indigo,
      hatCol: mix(UK.sand, UK.ochre, 0.4),
      pack: true,
      t,
    },
    lw
  );
  drawWalker(
    c,
    s,
    x2,
    DECK - 2,
    0.85,
    -1,
    {
      walk: (x2 / 26) * Math.PI,
      amp: 1,
      point: 0,
      sit: 0,
      coat: mix(UK.vermilion, UK.sumi, 0.25),
      hatCol: mix(UK.sand, UK.ochre, 0.2),
      pack: false,
      t,
    },
    lw
  );
  drawFirs(c, s.firs.d, mix(UK.green, UK.night, 0.6), lw);
}

/* ---------- scene D: evening ---------- */

function drawEvening(c: Ctx, s: State, t: number, lw: number) {
  const glow = tween(t, 13.4, 16.6, ease.inOutSine);
  c.fillStyle = mix(UK.washi, UK.pink, 0.25 + glow * 0.3);
  c.fillRect(-1600, -1200, 4800, 3300);
  bokashi(c, -1600, -1200, 4800, 300, mix(UK.indigo, UK.night, glow * 0.4), 0.95, 0);
  bokashi(c, -1600, 660, 4800, 380, UK.vermilion, 0.25 + glow * 0.25, 0);
  // the volcano, glowing pink from the summit down
  drawMountain(c, s, 800, 664, 1400, 420, glow, lw);
  // cloud band across its shoulders
  const kx = 800 + Math.sin(t * 0.2) * 40 - (t - 13) * 10;
  kasumi(c, s.kas[2], kx, 450, mix(UK.washiLight, UK.pink, 0.5 + glow * 0.3), 0.92, UK.washiLight);
  kasumi(
    c,
    s.kas[0],
    1200 - (t - 13) * 16,
    300,
    mix(UK.washiLight, UK.pink, 0.7),
    0.6,
    UK.washiLight
  );
  // the lake, with the mountain's reflection broken into lines
  const lake = new Path2D();
  lake.rect(-1600, 660, 4800, 1200);
  block(c, lake, mix(UK.prussian, UK.indigo, 0.4), s.gBlue, 0.8);
  c.fillStyle = rgba(mix(UK.washiLight, UK.pink, glow), 0.5);
  for (let y = 670; y < 860; y += 9) {
    const k = (y - 660) / 200;
    const w = 420 * (1 - k) * (0.7 + 0.3 * Math.sin(y * 0.3 + t * 2));
    c.fillRect(800 - w / 2 + Math.sin(y * 0.2 - t) * 10, y, w, 3.5);
  }
  c.strokeStyle = rgba(UK.pale, 0.6);
  c.lineWidth = lw * 0.8;
  c.beginPath();
  for (let j = 0; j < 8; j++) {
    const y = 680 + j * j * 4 + j * 10;
    const sp = 70 + j * 14;
    const off = (t * (6 + j * 2)) % sp;
    for (let x = -200 - off; x < 1800; x += sp) {
      c.moveTo(x, y);
      c.quadraticCurveTo(x + sp * 0.2, y - 3, x + sp * 0.4, y);
    }
  }
  c.stroke();
  keyline(
    c,
    (() => {
      const p = new Path2D();
      p.moveTo(-1600, 660);
      p.lineTo(3200, 660);
      return p;
    })(),
    lw * 0.7,
    41
  );
  // birds heading home
  c.strokeStyle = UK.sumi;
  c.lineWidth = lw * 1.1;
  c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const bx = 1500 - (((t - 12 + i * 0.6) * 50) % 1900);
    const by = 200 + i * 26 + Math.sin(t + i) * 8;
    const f = Math.sin(t * 6 + i) * 5;
    c.moveTo(bx - 12, by - f);
    c.quadraticCurveTo(bx - 5, by - 5, bx, by);
    c.quadraticCurveTo(bx + 5, by - 5, bx + 12, by - f);
  }
  c.stroke();
  // foreground: firs and a traveller resting, looking at the peak
  drawFirs(c, s.firs.c, mix(UK.green, UK.night, 0.7), lw);
  const rock = new Path2D();
  rock.moveTo(170, 830);
  rock.quadraticCurveTo(190, 760, 280, 770);
  rock.quadraticCurveTo(360, 780, 370, 840);
  rock.lineTo(170, 840);
  rock.closePath();
  block(c, rock, mix(UK.stone, UK.indigo, 0.4), s.gStone, 1);
  keyline(c, rock, lw, 42);
  drawWalker(
    c,
    s,
    262,
    790,
    1.15,
    1,
    {
      walk: 0,
      amp: 0,
      point: 0,
      sit: 1,
      coat: UK.indigo,
      hatCol: mix(UK.sand, UK.ochre, 0.4),
      pack: true,
      t,
    },
    lw
  );
}

/* ---------- film ---------- */

export const ukiyoCascadesFilm: RisoFilm<State> = {
  id: 'ukiyo-cascades',
  title: 'Views of the Cascades',
  caption: 'One snowy volcano seen four ways: from the Sound, two waterfalls and an evening lake.',
  theme: 'Travel',
  motif: 'The snowy volcano, seen from different places',
  duration: DURATION,
  series: 'Ukiyo-e',
  mode: 'direct',
  paper: UK.washi,
  paperTexture: true,
  grain: 0.18,
  inks: [
    { color: UK.prussian },
    { color: UK.green },
    { color: UK.pink },
    { color: UK.ochre },
    { color: UK.sumi },
  ],
  scenes: [
    { at: 0, label: 'The Sound' },
    { at: 4.5, label: 'Great falls' },
    { at: 8.6, label: 'Two-tier falls' },
    { at: 12.6, label: 'Evening' },
  ],
  posterTime: 2.4,

  setup(r: Riso) {
    const rng = mulberry(31);
    const firs = { a: new Path2D(), b: new Path2D(), c: new Path2D(), d: new Path2D() };
    // B: on the clifftops and the near slope
    for (let i = 0; i < 9; i++)
      firPath(40 + i * 64 + rng() * 20, 300 - Math.sin(i) * 10, 90 + rng() * 60, i, firs.a);
    for (let i = 0; i < 9; i++)
      firPath(990 + i * 70 + rng() * 20, 300 - Math.cos(i) * 10, 90 + rng() * 60, 20 + i, firs.a);
    for (let i = 0; i < 4; i++) firPath(1360 + i * 70, 940, 300 + rng() * 120, 40 + i, firs.b);
    firPath(80, 960, 380, 50, firs.b);
    // C/D foreground firs at the edges
    for (let i = 0; i < 4; i++)
      firPath(1400 + i * 80 + rng() * 30, 920, 360 + rng() * 140, 60 + i, firs.c);
    for (let i = 0; i < 3; i++) firPath(30 + i * 70, 930, 340 + rng() * 140, 70 + i, firs.c);
    for (let i = 0; i < 3; i++) firPath(1420 + i * 90, 930, 420 + rng() * 80, 80 + i, firs.d);

    const cliffL = poly([
      [-800, 1200],
      [-800, 270],
      [200, 260],
      [480, 280],
      [FALL_X0, LIP_Y - 4],
      [FALL_X0 - 10, 520],
      [FALL_X0 - 70, 1200],
    ]);
    const cliffR = poly([
      [FALL_X1, LIP_Y - 4],
      [1180, 270],
      [2400, 280],
      [2400, 1200],
      [FALL_X1 + 70, 1200],
      [FALL_X1 + 12, 520],
    ]);
    const cliffC = poly([
      [-800, -600],
      [2400, -600],
      [2400, 1200],
      [-800, 1200],
    ]);
    const basalt = new Path2D();
    for (let x = -800; x < 2400; x += 26) {
      basalt.moveTo(x, -600);
      for (let y = -600; y < 1200; y += 60) basalt.lineTo(x + noise1(y / 90 + x, 6) * 8, y);
    }
    for (let y = -560; y < 1200; y += 120) {
      basalt.moveTo(-800, y);
      for (let x = -800; x < 2400; x += 60) basalt.lineTo(x, y + noise1(x / 70, 8) * 14);
    }
    // a slender stone footbridge between the tiers: deck, parapet, one round arch on two piers
    const bridge = new Path2D();
    bridge.rect(300, DECK, 1400, 46);
    bridge.rect(300, DECK - 22, 1400, 10);
    const ax0 = ARCH_C[0] - ARCH_R - 44;
    const ax1 = ARCH_C[0] + ARCH_R + 44;
    bridge.moveTo(ax0, DECK + 46);
    bridge.lineTo(ax1, DECK + 46);
    bridge.lineTo(ax1, 960);
    bridge.lineTo(ARCH_C[0] + ARCH_R, 960);
    bridge.lineTo(ARCH_C[0] + ARCH_R, ARCH_C[1]);
    bridge.arc(ARCH_C[0], ARCH_C[1], ARCH_R, 0, Math.PI, true);
    bridge.lineTo(ARCH_C[0] - ARCH_R, 960);
    bridge.lineTo(ax0, 960);
    bridge.closePath();
    const bridgeStones = new Path2D();
    for (let x = 300; x < 1700; x += 34) {
      bridgeStones.moveTo(x, DECK - 12);
      bridgeStones.lineTo(x, DECK);
    }
    for (let y = DECK + 80; y < 960; y += 36)
      for (let x = ax0 + ((y / 36) % 2) * 22; x < ax1; x += 44) {
        bridgeStones.moveTo(x, y);
        bridgeStones.lineTo(x + 44, y);
        bridgeStones.moveTo(x, y);
        bridgeStones.lineTo(x, y + 36);
      }
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI + (i / 14) * Math.PI;
      bridgeStones.moveTo(ARCH_C[0] + Math.cos(a) * ARCH_R, ARCH_C[1] + Math.sin(a) * ARCH_R);
      bridgeStones.lineTo(
        ARCH_C[0] + Math.cos(a) * (ARCH_R + 40),
        ARCH_C[1] + Math.sin(a) * (ARCH_R + 40)
      );
    }
    bridgeStones.moveTo(300, DECK + 23);
    bridgeStones.lineTo(1700, DECK + 23);
    const lookout = poly([
      [1060, 560],
      [1600, 560],
      [1600, 600],
      [1100, 600],
    ]);
    const rail = new Path2D();
    rail.moveTo(1060, 520);
    rail.lineTo(1600, 520);
    for (let x = 1060; x <= 1600; x += 45) {
      rail.moveTo(x, 520);
      rail.lineTo(x, 560);
    }
    return {
      gBlue: woodGrain(r, 61, 420, 1.1),
      gWarm: woodGrain(r, 62, 380, 1),
      gStone: woodGrain(r, 63, 300, 1.3),
      mtn: buildMountain(),
      kas: [kasumiPath(900, 44, 2), kasumiPath(700, 40, 5), kasumiPath(1500, 62, 9)],
      firs,
      basalt,
      cliffL,
      cliffR,
      cliffC,
      arch: (() => {
        const p = new Path2D();
        p.moveTo(ARCH_C[0] - ARCH_R, 960);
        p.lineTo(ARCH_C[0] - ARCH_R, ARCH_C[1]);
        p.arc(ARCH_C[0], ARCH_C[1], ARCH_R, Math.PI, 0);
        p.lineTo(ARCH_C[0] + ARCH_R, 960);
        p.closePath();
        return p;
      })(),
      bridge,
      bridgeStones,
      lookout,
      rail,
    };
  },

  draw(r, t, s) {
    const c = r.layers[0];
    const base = new DOMMatrix().scale(r.scale, r.scale);
    const view = (cx: number, cy: number, z: number) =>
      base.multiply(new DOMMatrix().translate(800, 450).scale(z, z).translate(-cx, -cy));

    if (t < T_SWAP_AB) {
      /* A: the Sound, then into the crest */
      const k = tween(t, T_A1, T_SWAP_AB, ease.inCubic);
      const drift = tween(t, 0, T_A1, ease.inOutSine);
      const z = lerp(1, 1.06, drift) * Math.exp(Math.log(2.6) * k);
      const cx = lerp(lerp(800, 830, drift), 700, k);
      const cy = lerp(450, 470, k);
      c.setTransform(view(cx, cy, z));
      drawSound(c, s, t, 2.4 / z, tween(t, T_A1 - 0.2, T_SWAP_AB, ease.inSine));
    } else if (t < T_SWAP_BC) {
      /* B: out from the lip to the whole falls, then into the falling water */
      const out = tween(t, T_SWAP_AB, 6.2, ease.outCubic);
      const k = tween(t, T_B1, T_SWAP_BC, ease.inCubic);
      const z = Math.exp(lerp(Math.log(2.6), 0, out)) * Math.exp(Math.log(6) * k);
      const cx = 800;
      const cy = lerp(LIP_Y + 10, 450, out) + (600 - 450) * k;
      c.setTransform(view(cx, cy, z));
      drawFalls(c, s, t, 2.4 / z);
    } else {
      /* C: out from the upper tier to the footbridge, then through its arch */
      const out = tween(t, T_SWAP_BC, 10.4, ease.outCubic);
      const k = tween(t, T_C1, T_ARCH, ease.inOutCubic);
      const z = Math.exp(lerp(Math.log(6), 0, out)) * Math.exp(Math.log(5.4) * k);
      const cx = lerp(605, 800, out) + (ARCH_C[0] - 800) * k;
      const cy = lerp(150, 450, out) + (ARCH_C[1] + 40 - 450) * k;
      const archS = 1 - tween(t, T_ARCH - 0.05, T_ARCH + 0.05);
      // the evening view, held in the arch until it fills the frame
      const sx = 800 + (ARCH_C[0] - cx) * z;
      const sy = 450 + (ARCH_C[1] + 30 - cy) * z;
      const zD = lerp(0.3, 1, k);
      const evening = base.multiply(
        new DOMMatrix()
          .translate(lerp(sx, 800, k), lerp(sy, 450, k))
          .scale(zD, zD)
          .translate(-800, lerp(-560, -450, k))
      );
      if (archS > 0) {
        c.setTransform(view(cx, cy, z));
        drawTwoTier(c, s, t, 2.4 / z);
        c.save();
        c.clip(s.arch);
        c.setTransform(evening);
        drawEvening(c, s, t, 2.4 / zD);
        c.restore();
        c.setTransform(view(cx, cy, z));
        drawBridge(c, s, t, 2.4 / z);
      } else {
        c.setTransform(evening);
        drawEvening(c, s, t, 2.4);
      }
    }

    /* mist that carries one print into the next */
    c.setTransform(base);
    const mistAB = Math.exp(-(((t - T_SWAP_AB) / 0.35) ** 2));
    const mistBC = Math.exp(-(((t - T_SWAP_BC) / 0.3) ** 2));
    const m = Math.max(mistAB, mistBC * 0.85);
    if (m > 0.01) {
      c.fillStyle = rgba(UK.washiLight, m * 0.95);
      c.fillRect(0, 0, 1600, 900);
      kasumi(c, s.kas[2], 800 + (t - T_SWAP_AB) * 400, 300, UK.washiLight, m, UK.washiLight);
      kasumi(c, s.kas[2], 800 - (t - T_SWAP_AB) * 300, 640, UK.washiLight, m, UK.washiLight);
    }

    const tk = tween(t, T_TITLE, T_TITLE + 0.6, ease.outCubic);
    if (tk > 0) cartouche(c, 1470, 260, 66, 380, 'Views of the Cascades', tk, 'PNW');
    printBorder(c, 16, 0.9);
  },
};
