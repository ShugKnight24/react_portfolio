/**
 * Aura: shonen energy as a riso poster.
 * Motif: a ring of light. The full moon over the rooftops becomes the halo of an aura
 * igniting around a hero, condenses into an orb between his hands, bursts into a sun over
 * the mountains, and settles back into the moon.
 */
import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import {
  TAU,
  clamp,
  lerp,
  seg,
  ease,
  tween,
  hash,
  noise1,
  mulberry,
  polarPts,
  morphPair,
  morph,
  smoothPath,
  polyPath,
  DISPLAY,
  type Pt,
} from '../riso/kit';

const Y = 0;
const P = 1;
const A = 2;
const V = 3;

/** Hero anchor (neck base) in world space */
const HX = 800;
const HY = 500;
/** Head centre and right eye, hero space */
const HEAD: Pt = [0, -128];
const EYE: Pt = [31, -90];
/** Orb centre, hero space */
const ORB: Pt = [0, 215];
const ORB_R = 70;
/** Moon at the start */
const MOON: Pt = [1060, 250];
const MOON_R = 130;
/** Sun / moon over the mountains */
const SUN: Pt = [800, 395];
const SUN_R = 135;

interface Mountain {
  path: Path2D;
  /** Distance from the blast centre at which the wave lights it */
  dist: number;
}

interface State {
  cityFar: Path2D;
  cityNear: Path2D;
  winFar: Path2D;
  winNear: Path2D;
  wires: Path2D;
  stars: Pt[];
  craters: Path2D;
  face: Path2D;
  neck: Path2D;
  torso: Path2D;
  arms: Path2D;
  hands: Path2D;
  lines: Path2D;
  eyes: Path2D;
  collar: Path2D;
  speed: { a: number; w: number; r0: number }[];
  mts: Mountain[];
  peakY: number;
  petal: Pt[];
  spark: Pt[];
  petals: { x: number; d: number; s: number; ph: number; sp: number }[];
  motes: { x: number; y: number; s: number; sp: number }[];
}

/* ---------- small helpers ---------- */

const fillD = (r: Riso, ctx: Ctx, path: Path2D, d: number) => {
  if (d <= 0.012) return;
  ctx.fillStyle = d >= 0.985 ? '#000' : r.tone(ctx, d);
  ctx.fill(path);
};

const knock = (ctx: Ctx, fn: () => void) => {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  fn();
  ctx.restore();
};

const circle = (x: number, y: number, rad: number, p: Path2D = new Path2D()) => {
  p.moveTo(x + rad, y);
  p.arc(x, y, Math.max(0.1, rad), 0, TAU);
  return p;
};

const annulus = (x: number, y: number, r0: number, r1: number) => {
  const p = new Path2D();
  p.arc(x, y, Math.max(0.1, r1), 0, TAU);
  if (r0 > 0.5) {
    p.moveTo(x + r0, y);
    p.arc(x, y, r0, 0, TAU, true);
  }
  return p;
};

const shake = (t: number, a: number, b: number, amp: number, seed: number) => {
  if (t < a || t > b) return 0;
  const k = 1 - seg(t, a, b);
  return noise1(t * 38, seed) * amp * k * k;
};

/** Hair outline (hero space), spikes swept by the wind */
const hairPts = (t: number, wind: number): Pt[] => {
  const [hx, hy] = HEAD;
  const spikes: [number, number, number][] = [
    [-196, 54, 17],
    [-164, 92, 17],
    [-130, 132, 17],
    [-96, 150, 17],
    [-62, 136, 17],
    [-28, 104, 17],
    [6, 66, 15],
  ];
  const pts: Pt[] = [[-64, -92]];
  const d2r = Math.PI / 180;
  spikes.forEach(([a, len, hw], i) => {
    const sway = 22 + wind * (12 + 9 * noise1(t * 3.2 + i * 1.7, 3));
    const l = len * (1 + 0.08 * wind * noise1(t * 4.1 + i * 2.3, 8));
    const b0 = (a - hw) * d2r;
    const tip = (a + sway) * d2r;
    const mid = (a + hw * 0.2) * d2r;
    pts.push([hx + Math.cos(b0) * 68, hy + Math.sin(b0) * 64]);
    pts.push([hx + Math.cos(mid) * (68 + l * 0.55), hy + Math.sin(mid) * (64 + l * 0.55)]);
    pts.push([hx + Math.cos(tip) * (68 + l), hy + Math.sin(tip) * (64 + l)]);
  });
  pts.push([hx + Math.cos(30 * d2r) * 70, hy + Math.sin(30 * d2r) * 66]);
  pts.push([66, -92]);
  // Fringe over the forehead
  const fr: Pt[] = [
    [52, -120],
    [44, -84],
    [26, -118],
    [12, -80],
    [-6, -116],
    [-22, -84],
    [-36, -118],
    [-54, -88],
  ];
  fr.forEach(([x, y], i) => pts.push([x + (i % 2 ? wind * 5 * noise1(t * 5 + i, 4) : 0), y]));
  return pts;
};

/** Scarf: band round the neck and two tails streaming right */
const scarfPath = (t: number, wind: number, path = new Path2D()) => {
  path.moveTo(-50, -14);
  path.lineTo(50, -14);
  path.quadraticCurveTo(56, 8, 50, 30);
  path.lineTo(-50, 30);
  path.quadraticCurveTo(-56, 8, -50, -14);
  path.closePath();
  const tail = (len: number, ph: number, w0: number) => {
    const n = 16;
    const top: Pt[] = [];
    const bot: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const amp = (6 + 34 * k) * (0.4 + 0.6 * wind);
      const x = 34 + k * 520 * len * (0.55 + 0.45 * wind);
      const y = 12 - k * 70 * wind + Math.sin(k * 6.5 - t * 11 + ph) * amp;
      const y2 = 12 - (k + 0.02) * 70 * wind + Math.sin((k + 0.02) * 6.5 - t * 11 + ph) * amp;
      const ang = Math.atan2(y2 - y, 0.02 * 520 * len) + Math.PI / 2;
      const w = w0 * (1 - k * 0.45);
      top.push([x + Math.cos(ang) * w * 0.5, y + Math.sin(ang) * w * 0.5]);
      bot.push([x - Math.cos(ang) * w * 0.5, y - Math.sin(ang) * w * 0.5]);
    }
    const end = top[n];
    const endB = bot[n];
    const notch: Pt = [(end[0] + endB[0]) / 2 - 22, (end[1] + endB[1]) / 2];
    polyPath([...top, notch, ...bot.reverse()], true, path);
  };
  tail(1, 0, 40);
  tail(0.78, 1.9, 32);
  return path;
};

/** Small standing hero for the landscape, feet at (0,0) */
const miniHero = (t: number, wind: number) => {
  const body = new Path2D();
  polyPath(
    [
      [-9, 0],
      [-6, -30],
      [-10, -34],
      [-11, -62],
      [-6, -67],
      [6, -67],
      [11, -62],
      [12, -40],
      [22 + wind * 10 * (1 + noise1(t * 6, 2)), -30 + wind * 4 * noise1(t * 7, 5)],
      [9, -32],
      [7, -30],
      [10, 0],
      [4, 0],
      [1, -26],
      [-2, -26],
      [-4, 0],
    ],
    true,
    body
  );
  circle(0, -76, 8.5, body);
  const hair: Pt[] = [];
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + (i / 6) * Math.PI;
    const b = a + 0.22;
    hair.push([Math.cos(a) * 8, -78 + Math.sin(a) * 8]);
    const sway = wind * 0.5 * (0.6 + 0.4 * noise1(t * 5 + i, 1));
    hair.push([Math.cos(b + sway) * 17, -78 + Math.sin(b + sway) * 17]);
  }
  hair.push([9, -76]);
  polyPath(hair, true, body);
  const scarf = new Path2D();
  const sp: Pt[] = [[-3, -66]];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    sp.push([4 + k * 46 * (0.6 + 0.4 * wind), -66 - k * 6 + Math.sin(k * 6 - t * 12) * 4 * k]);
  }
  for (let i = 8; i >= 0; i--) {
    const k = i / 8;
    sp.push([4 + k * 46 * (0.6 + 0.4 * wind), -61 - k * 4 + Math.sin(k * 6 - t * 12) * 4 * k]);
  }
  sp.push([-3, -61]);
  polyPath(sp, true, scarf);
  return { body, scarf };
};

/* ---------- film ---------- */

export const auraFilm: RisoFilm<State> = {
  id: 'aura',
  title: 'Aura',
  caption: 'A ring of light, from moonrise to blast wave and back.',
  theme: 'Anime',
  motif: 'A ring of light',
  duration: 19.5,
  paper: '#f3ead8',
  inks: [
    { color: '#ffe800', offset: [0, 0], angle: 0 },
    { color: '#ff48b0', offset: [1.5, -1], angle: 15 },
    { color: '#5ec8e5', offset: [-1.2, 0.8], angle: 75 },
    { color: '#765ba7', offset: [0.6, 1.2], angle: 45 },
  ],
  scenes: [
    { at: 0, label: 'Moon over the rooftops' },
    { at: 3.4, label: 'The aura ignites' },
    { at: 8.0, label: 'The orb' },
    { at: 11.1, label: 'Blast wave' },
    { at: 14.8, label: 'Moonrise' },
  ],
  posterTime: 9.7,

  setup() {
    const rng = mulberry(4242);

    /* city */
    const cityFar = new Path2D();
    const winFar = new Path2D();
    let x = -60;
    while (x < 1700) {
      const w = 70 + rng() * 120;
      const top = 560 + rng() * 120;
      cityFar.rect(x, top, w + 1, 900 - top + 400);
      if (rng() < 0.35) {
        // stepped roof
        cityFar.rect(x + w * 0.2, top - 22, w * 0.5, 23);
      }
      if (rng() < 0.3) {
        // antenna
        cityFar.rect(x + w * 0.7, top - 60, 3, 60);
        cityFar.rect(x + w * 0.7 - 10, top - 48, 23, 3);
      }
      for (let wy = top + 18; wy < 860; wy += 26) {
        for (let wx = x + 10; wx < x + w - 14; wx += 20) {
          if (rng() < 0.18) winFar.rect(wx, wy, 9, 13);
        }
      }
      x += w + 4 + rng() * 10;
    }
    // water tower on a far roof
    const tw = 300;
    const tTop = 520;
    cityFar.rect(tw, tTop, 70, 56);
    cityFar.moveTo(tw - 6, tTop);
    cityFar.lineTo(tw + 35, tTop - 34);
    cityFar.lineTo(tw + 76, tTop);
    cityFar.closePath();
    cityFar.rect(tw + 6, tTop + 56, 6, 90);
    cityFar.rect(tw + 58, tTop + 56, 6, 90);

    const cityNear = new Path2D();
    const winNear = new Path2D();
    // Near roofs: a tiled house with upturned eaves on the left, flat roofs to the right
    const house = (cx: number, top: number, w: number) => {
      const eave = top + 60;
      cityNear.moveTo(cx - w / 2 - 40, eave - 14);
      cityNear.quadraticCurveTo(cx - w / 2 + 10, eave, cx - w * 0.18, top + 8);
      cityNear.lineTo(cx - w * 0.12, top);
      cityNear.lineTo(cx + w * 0.12, top);
      cityNear.lineTo(cx + w * 0.18, top + 8);
      cityNear.quadraticCurveTo(cx + w / 2 - 10, eave, cx + w / 2 + 40, eave - 14);
      cityNear.lineTo(cx + w / 2 + 20, eave + 10);
      cityNear.lineTo(cx + w / 2, eave + 10);
      cityNear.lineTo(cx + w / 2, 1300);
      cityNear.lineTo(cx - w / 2, 1300);
      cityNear.lineTo(cx - w / 2, eave + 10);
      cityNear.lineTo(cx - w / 2 - 20, eave + 10);
      cityNear.closePath();
      for (let i = 0; i < 3; i++) winNear.rect(cx - w * 0.3 + i * w * 0.24, eave + 40, w * 0.14, 34);
    };
    house(260, 690, 360);
    house(1430, 720, 300);
    cityNear.rect(470, 770, 300, 600);
    cityNear.rect(760, 742, 210, 600);
    cityNear.rect(960, 790, 300, 600);
    // rail on the flat roofs
    for (let rx = 470; rx < 1260; rx += 26) cityNear.rect(rx, 750 + (rx > 760 && rx < 970 ? -28 : 0), 4, 22);
    cityNear.rect(470, 748, 290, 4);
    cityNear.rect(960, 770, 300, 4);
    winNear.rect(800, 790, 26, 34);
    winNear.rect(850, 790, 26, 34);
    winNear.rect(1020, 830, 40, 30);

    const wires = new Path2D();
    wires.moveTo(-20, 600);
    wires.quadraticCurveTo(600, 700, 1640, 590);
    wires.moveTo(-20, 618);
    wires.quadraticCurveTo(620, 724, 1640, 610);
    wires.rect(1180, 560, 6, 340);
    wires.rect(1160, 580, 46, 5);

    const stars: Pt[] = [];
    for (let i = 0; i < 70; i++) stars.push([rng() * 1600, rng() * 520]);

    const craters = new Path2D();
    (
      [
        [-34, -24, 24],
        [28, 18, 32],
        [-12, 44, 15],
        [44, -42, 12],
        [-56, 22, 11],
        [6, -58, 9],
      ] as [number, number, number][]
    ).forEach(([cx, cy, cr]) => circle(cx, cy, cr, craters));

    /* hero (hero space, origin at neck base) */
    const face = smoothPath(
      [
        [-63, -150],
        [-64, -100],
        [-52, -60],
        [-26, -28],
        [0, -18],
        [26, -28],
        [52, -60],
        [64, -100],
        [63, -150],
        [0, -190],
      ],
      true,
      0.5
    );
    const neck = new Path2D();
    neck.rect(-25, -50, 50, 80);
    const torso = smoothPath(
      [
        [-40, -4],
        [-150, 22],
        [-206, 64],
        [-224, 140],
        [-232, 470],
        [232, 470],
        [224, 140],
        [206, 64],
        [150, 22],
        [40, -4],
      ],
      true,
      0.25
    );
    const arms = new Path2D();
    arms.moveTo(-190, 80);
    arms.quadraticCurveTo(-272, 190, -246, 296);
    arms.quadraticCurveTo(-170, 290, -96, 252);
    arms.moveTo(190, 80);
    arms.quadraticCurveTo(272, 190, 246, 296);
    arms.quadraticCurveTo(170, 290, 96, 252);
    const hands = new Path2D();
    const [ox, oy] = ORB;
    hands.moveTo(ox + Math.cos(2.15) * 84, oy + Math.sin(2.15) * 84);
    hands.arc(ox, oy, 84, 2.15, 3.9);
    hands.moveTo(ox + Math.cos(-0.76) * 84, oy + Math.sin(-0.76) * 84);
    hands.arc(ox, oy, 84, -0.76, 0.99);
    // thumbs
    hands.moveTo(ox - 62, oy + 66);
    hands.lineTo(ox - 26, oy + 80);
    hands.moveTo(ox + 62, oy + 66);
    hands.lineTo(ox + 26, oy + 80);

    const collar = new Path2D();
    polyPath(
      [
        [-28, -40],
        [-98, -2],
        [-124, 66],
        [-62, 44],
        [-24, 10],
      ],
      true,
      collar
    );
    polyPath(
      [
        [28, -40],
        [98, -2],
        [124, 66],
        [62, 44],
        [24, 10],
      ],
      true,
      collar
    );
    const lines = new Path2D();
    lines.moveTo(-18, 40);
    lines.lineTo(-30, 470);
    lines.moveTo(18, 40);
    lines.lineTo(30, 470);
    // jaw shadow
    lines.moveTo(-30, -36);
    lines.quadraticCurveTo(0, -24, 30, -36);

    const eyes = new Path2D();
    polyPath(
      [
        [-52, -100],
        [-14, -95],
        [-18, -82],
        [-44, -86],
      ],
      true,
      eyes
    );
    polyPath(
      [
        [52, -100],
        [14, -95],
        [18, -82],
        [44, -86],
      ],
      true,
      eyes
    );

    const speed: State['speed'] = [];
    for (let i = 0; i < 110; i++) {
      speed.push({ a: (i / 110) * TAU + rng() * 0.05, w: 0.003 + rng() * 0.01, r0: 300 + rng() * 260 });
    }

    /* mountains */
    let peakY = 700;
    const ridge = (y0: number, amp: number, freq: number, seed: number, valley: number, peakX = -1, peakH = 0) => {
      const pts: Pt[] = [];
      for (let mx = -260; mx <= 1860; mx += 14) {
        const n1 = 1 - Math.abs(noise1(mx / freq, seed));
        const n2 = 1 - Math.abs(noise1(mx / (freq * 0.4), seed + 3));
        let y = y0 - amp * n1 * n1 - amp * 0.3 * n2 * n2;
        y += valley * Math.exp(-(((mx - 800) / 320) ** 2));
        if (peakX > 0) y -= peakH * Math.exp(-(((mx - peakX) / 120) ** 2));
        pts.push([mx, y]);
      }
      if (peakX > 0) peakY = pts.reduce((b, p) => (Math.abs(p[0] - peakX) < Math.abs(b[0] - peakX) ? p : b))[1];
      pts.push([1860, 1300], [-260, 1300]);
      return polyPath(pts, true);
    };
    const mts: Mountain[] = [
      { path: ridge(640, 170, 170, 11, 110), dist: 360 },
      { path: ridge(730, 140, 240, 21, 50), dist: 760 },
      { path: ridge(880, 110, 320, 31, 30, 1180, 120), dist: 1150 },
    ];

    /* petal and glint */
    const petalSrc: Pt[] = [
      [-4, -16],
      [0, -11],
      [4, -16],
      [9, -11],
      [11, -2],
      [8, 8],
      [3, 14],
      [0, 15],
      [-3, 14],
      [-8, 8],
      [-11, -2],
      [-9, -11],
    ];
    const sparkSrc = polarPts(0, 0, (a) => 3 + 17 * Math.pow(Math.abs(Math.cos(a * 2)), 9), 120);
    const [petal, spark] = morphPair(petalSrc, sparkSrc, 120);

    const petals: State['petals'] = [];
    for (let i = 0; i < 8; i++) {
      petals.push({ x: 120 + rng() * 1500, d: rng() * 2.2, s: 0.8 + rng() * 0.6, ph: rng() * TAU, sp: 70 + rng() * 60 });
    }
    const motes: State['motes'] = [];
    for (let i = 0; i < 46; i++) motes.push({ x: (rng() - 0.5) * 760, y: rng() * 900, s: 3 + rng() * 6, sp: 120 + rng() * 260 });

    return {
      cityFar,
      cityNear,
      winFar,
      winNear,
      wires,
      stars,
      craters,
      face,
      neck,
      torso,
      arms,
      hands,
      lines,
      eyes,
      collar,
      speed,
      mts,
      peakY,
      petal,
      spark,
      petals,
      motes,
    };
  },

  draw(r, t, s) {
    if (t < 11.1) drawHeroAct(r, t, s);
    else drawLand(r, t, s);
  },
};

/* ---------- act one: rooftops, aura, orb ---------- */

function drawHeroAct(r: Riso, t: number, s: State) {
  const L = r.layers;
  const night = 1 - tween(t, 3.5, 4.7, ease.inOutSine);
  const bgK = tween(t, 3.6, 4.9, ease.inOutSine);

  /* camera */
  let cx = 800;
  let cy = 450;
  let z = 1;
  if (t < 3.5) {
    z = 1 + 0.03 * ease.inOutSine(seg(t, 0, 3.5));
    cy = 450 - 10 * seg(t, 0, 3.5);
  } else if (t < 8.6) {
    const k = tween(t, 4.8, 8.6, ease.inOutSine);
    z = lerp(1.03, 1.08, k);
    cy = lerp(440, 430, k);
  } else {
    const k1 = tween(t, 8.6, 10.1, ease.inOutCubic);
    const k2 = seg(t, 10.1, 11.1);
    const zA = lerp(1.08, 1.22, k1);
    z = k2 > 0 ? Math.exp(lerp(Math.log(zA), Math.log(17), ease.inCubic(k2))) : zA;
    const ocy = HY + ORB[1];
    cy = lerp(lerp(430, 630, k1), ocy, ease.outCubic(k2));
  }
  cx += shake(t, 6.4, 7.4, 16, 1) + shake(t, 9.2, 10.6, 4 + 6 * seg(t, 9.2, 10.4), 7);
  cy += shake(t, 6.4, 7.4, 12, 2) + shake(t, 9.2, 10.6, 3 + 5 * seg(t, 9.2, 10.4), 9);
  r.camera(cx, cy, z);

  const headW: Pt = [HX + HEAD[0], HY + HEAD[1]];

  /* backgrounds */
  const big = new Path2D();
  big.rect(-4000, -4000, 9600, 9000);
  if (night > 0.01) {
    r.gradient(L[V], big, { kind: 'linear', x0: 0, y0: -40, x1: 0, y1: 760, from: 0.9 * night, to: 0.3 * night }, 12);
    fillD(r, L[A], big, 0.4 * night);
    // stars
    const st = new Path2D();
    s.stars.forEach(([sx, sy], i) => {
      const tw = 0.6 + 0.4 * Math.sin(t * 3 + i);
      circle(sx, sy, 1.2 + 1.4 * hash(i) * tw, st);
    });
    knock(L[V], () => L[V].fill(st));
    knock(L[A], () => L[A].fill(st));
  }
  if (bgK > 0.01) {
    r.gradient(L[P], big, { kind: 'radial', cx: headW[0], cy: headW[1], r0: 120, r1: 900, from: 0.08 * bgK, to: 0.8 * bgK }, 10);
    r.gradient(L[A], big, { kind: 'radial', cx: headW[0], cy: headW[1], r0: 500, r1: 1100, from: 0, to: 0.45 * bgK }, 6);
    // speed lines, boiling at 12 fps
    const f = Math.floor(t * 12);
    const conv = seg(t, 8.0, 9.4);
    const ccx = lerp(headW[0], HX + ORB[0], ease.inOutCubic(conv));
    const ccy = lerp(headW[1], HY + ORB[1], ease.inOutCubic(conv));
    const sl = new Path2D();
    const grow = ease.outCubic(bgK);
    s.speed.forEach((l, i) => {
      const a = l.a + (hash(i * 7.3 + f) - 0.5) * 0.03;
      const r0 = l.r0 * (0.75 + 0.5 * hash(i * 3.1 + f)) * lerp(1, 0.55, conv);
      const r1 = lerp(r0, 1400, grow);
      const w = l.w * (0.7 + 0.6 * hash(i + f * 1.3));
      sl.moveTo(ccx + Math.cos(a) * r0, ccy + Math.sin(a) * r0);
      sl.lineTo(ccx + Math.cos(a - w) * r1, ccy + Math.sin(a - w) * r1);
      sl.lineTo(ccx + Math.cos(a + w) * r1, ccy + Math.sin(a + w) * r1);
      sl.closePath();
    });
    L[V].fillStyle = '#000';
    L[V].fill(sl);
  }

  /* moon -> ring */
  const mk = tween(t, 3.0, 4.6, ease.inOutCubic);
  const ringC: Pt = [lerp(MOON[0], headW[0], mk), lerp(MOON[1], headW[1], mk)];
  let ringR = lerp(MOON_R, 178, mk);
  const condense = tween(t, 8.0, 9.3, ease.inOutCubic);
  const orbW: Pt = [HX + ORB[0], HY + ORB[1]];
  ringC[0] = lerp(ringC[0], orbW[0], condense);
  ringC[1] = lerp(ringC[1], orbW[1], condense);
  ringR = lerp(ringR, ORB_R * 1.0, condense);
  const hole = ringR * 0.8 * tween(t, 3.9, 4.8, ease.inOutCubic);
  const ignite = tween(t, 4.4, 5.4, ease.outCubic);
  // a beat of extra power after the impact frame
  const power = ignite * (1 + 0.25 * tween(t, 6.5, 7.0, ease.outCubic));

  // moon glow and disc
  if (t < 9.4) {
    const ring = annulus(ringC[0], ringC[1], hole, ringR);
    if (night > 0.01) {
      knock(L[V], () => {
        r.gradient(L[V], circle(ringC[0], ringC[1], ringR * 2.4), { kind: 'radial', cx: ringC[0], cy: ringC[1], r0: ringR, r1: ringR * 2.4, from: 0.7 * night, to: 0 }, 8);
      });
      knock(L[A], () => {
        r.gradient(L[A], circle(ringC[0], ringC[1], ringR * 2.0), { kind: 'radial', cx: ringC[0], cy: ringC[1], r0: ringR, r1: ringR * 2.0, from: 0.8 * night, to: 0 }, 6);
      });
    }
    for (const i of [P, A, V]) knock(L[i], () => L[i].fill(ring));
    L[Y].fillStyle = '#000';
    L[Y].fill(ring);
    // crater shading fades as the moon turns into a ring
    if (mk < 0.9) {
      L[P].save();
      L[P].clip(ring);
      L[P].translate(ringC[0], ringC[1]);
      L[P].scale(ringR / 100, ringR / 100);
      fillD(r, L[P], s.craters, 0.28 * (1 - mk));
      r.gradient(L[P], null, { kind: 'linear', x0: -60, y0: -60, x1: 100, y1: 100, from: 0, to: 0.3 * (1 - mk) }, 6);
      L[P].restore();
    }
    // clouds drifting across the moon
    if (night > 0.01) {
      const cl = new Path2D();
      for (let i = 0; i < 4; i++) {
        const w = 220 + i * 70;
        const xx = ((1500 - t * (24 + i * 9) + i * 430) % 1900) - 150;
        const yy = 180 + i * 62;
        cl.roundRect(xx, yy, w, 14 + (i % 2) * 8, 12);
        cl.roundRect(xx + w * 0.3, yy - 10, w * 0.4, 12, 8);
      }
      fillD(r, L[P], cl, 0.5 * night);
      fillD(r, L[V], cl, 0.35 * night);
    }
  }

  /* city, sinking away */
  if (t < 4.9) {
    const drop = 700 * tween(t, 3.2, 4.8, ease.inCubic);
    for (const i of [Y, P, A, V]) {
      L[i].save();
      L[i].translate(0, drop);
    }
    fillD(r, L[V], s.cityFar, 0.75);
    fillD(r, L[A], s.cityFar, 0.5);
    for (const i of [V, A]) knock(L[i], () => L[i].fill(s.winFar));
    const flick = new Path2D();
    flick.rect(0, 0, 1600, 900);
    L[Y].fillStyle = '#000';
    L[Y].fill(s.winFar);
    L[V].lineWidth = 2.4;
    L[V].stroke(s.wires);
    L[V].fill(s.wires);
    fillD(r, L[V], s.cityNear, 1);
    fillD(r, L[A], s.cityNear, 1);
    for (const i of [Y, P]) knock(L[i], () => L[i].fill(s.cityNear));
    const wn = 0.7 + 0.3 * Math.sin(t * 2.3);
    for (const i of [V, A]) knock(L[i], () => L[i].fill(s.winNear));
    fillD(r, L[Y], s.winNear, wn);
    fillD(r, L[P], s.winNear, 0.3);
    for (const i of [Y, P, A, V]) L[i].restore();
  }

  /* hero */
  const rise = tween(t, 3.25, 4.75, ease.outCubic);
  if (rise > 0) {
    const dy = lerp(640, 0, rise);
    const wind = 0.35 + 0.65 * ignite;
    for (const i of [Y, P, A, V]) {
      L[i].save();
      L[i].translate(HX, HY + dy);
    }
    drawHero(r, L, t, s, wind, power, condense, mk, hole, ringR, ringC, dy);
    for (const i of [Y, P, A, V]) L[i].restore();
  }

  /* falling petal -> eye glint */
  drawPetal(r, L, t, s);

  /* impact frames */
  const imp = (t >= 6.42 && t < 6.52) || (t >= 6.6 && t < 6.68);
  if (imp) impactFrame(r, t, s, ignite);
}

function drawHero(
  r: Riso,
  L: Ctx[],
  t: number,
  s: State,
  wind: number,
  power: number,
  condense: number,
  mk: number,
  hole: number,
  ringR: number,
  ringC: Pt,
  dy: number
) {
  const [hx, hy] = HEAD;
  const ringLocal: Pt = [ringC[0] - HX, ringC[1] - HY - dy];

  /* aura flames, shrinking into the orb */
  const fScale = power * (1 - condense);
  if (fScale > 0.01) {
    const cxF = lerp(0, ORB[0], condense);
    const cyF = lerp(-40, ORB[1], condense);
    const flame = (sc: number, ph: number) =>
      polarPts(
        cxF,
        cyF,
        (a) => {
          const up = Math.max(0, -Math.sin(a));
          const d = Math.abs(Math.atan2(Math.cos(a), -Math.sin(a)));
          const lick = Math.pow(0.5 + 0.5 * Math.sin(d * 7 + t * 11 + ph), 3);
          const n = noise1(a * 4 - t * 2.5 + ph, 9);
          return (240 + 200 * up + (60 + 120 * up) * lick + 26 * n) * sc;
        },
        200
      );
    const outer = smoothPath(flame(fScale, 0), true, 0.5);
    const mid = smoothPath(flame(fScale * 0.82, 1.7), true, 0.5);
    const inner = smoothPath(flame(fScale * 0.62, 3.1), true, 0.5);
    L[Y].fillStyle = '#000';
    L[Y].fill(outer);
    fillD(r, L[P], outer, 0.22);
    fillD(r, L[P], mid, 0.6);
    fillD(r, L[P], inner, 1);
    // paper streak inside the flame
    knock(L[Y], () => {
      L[Y].lineWidth = 6;
      L[Y].stroke(smoothPath(flame(fScale * 0.92, 0.6), true, 0.5));
    });
  }

  /* the ring (moon turned halo) */
  if (mk > 0.5 && condense < 0.98) {
    const heat = tween(t, 4.6, 5.6, ease.outCubic) * (1 - condense);
    if (heat > 0.01) {
      const w = (ringR - hole) * 0.55 * heat;
      const mid = (ringR + hole) / 2;
      const core = annulus(ringLocal[0], ringLocal[1], mid - w / 2, mid + w / 2);
      for (const i of [Y, P, A, V]) knock(L[i], () => L[i].fill(core));
    }
  }

  /* body */
  const hair = polyPath(hairPts(t, wind));
  const paintBody = (ctx: Ctx, extra: number) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fill(s.torso);
    ctx.fill(s.neck);
    ctx.fill(s.face);
    ctx.fill(hair);
    ctx.fill(s.collar);
    ctx.lineWidth = 80 + extra;
    ctx.stroke(s.arms);
    ctx.lineWidth = 40 + extra;
    ctx.stroke(s.hands);
  };
  for (const i of [Y, P, A]) knock(L[i], () => paintBody(L[i], 2));
  const v = L[V];
  v.save();
  v.fillStyle = '#000';
  v.strokeStyle = '#000';
  v.lineCap = 'round';
  v.lineJoin = 'round';
  v.fill(s.torso);
  v.fill(s.neck);
  v.fill(s.face);
  // collar outline then collar
  knock(v, () => {
    v.lineWidth = 9;
    v.lineJoin = 'round';
    v.stroke(s.collar);
  });
  v.fill(s.collar);
  knock(v, () => {
    v.lineCap = 'round';
    v.lineWidth = 92;
    v.stroke(s.arms);
  });
  v.lineWidth = 80;
  v.stroke(s.arms);
  knock(v, () => {
    v.lineCap = 'round';
    v.lineWidth = 52;
    v.stroke(s.hands);
  });
  v.lineWidth = 40;
  v.stroke(s.hands);
  knock(v, () => {
    v.lineWidth = 4;
    v.lineCap = 'round';
    v.stroke(s.lines);
  });
  // hair with a paper outline over the face
  knock(v, () => {
    v.lineWidth = 7;
    v.lineJoin = 'round';
    v.stroke(hair);
  });
  v.fill(hair);
  v.restore();

  // jacket in indigo, hair in magenta
  const a = L[A];
  a.save();
  a.lineCap = 'round';
  a.lineJoin = 'round';
  a.fillStyle = r.tone(a, 0.55);
  a.fill(s.torso);
  a.fill(s.collar);
  a.strokeStyle = r.tone(a, 0.55);
  a.lineWidth = 80;
  a.stroke(s.arms);
  a.restore();
  L[P].fillStyle = '#000';
  L[P].fill(hair);

  // rim light from the aura: paper edge on the hair and shoulders
  if (power > 0.05) {
    const rimP = new Path2D();
    rimP.moveTo(-206, 64);
    rimP.quadraticCurveTo(-170, 30, -110, 14);
    rimP.moveTo(206, 64);
    rimP.quadraticCurveTo(170, 30, 110, 14);
    knock(L[V], () => {
      L[V].lineWidth = 7 * Math.min(1, power);
      L[V].lineCap = 'round';
      L[V].stroke(rimP);
    });
    for (const i of [A]) knock(L[i], () => {
      L[i].lineWidth = 7 * Math.min(1, power);
      L[i].lineCap = 'round';
      L[i].stroke(rimP);
    });
    L[Y].lineWidth = 7 * Math.min(1, power);
    L[Y].lineCap = 'round';
    L[Y].stroke(rimP);
  }

  // glowing eyes
  const glow = clamp(seg(t, 4.5, 5.0) + 0.2 * Math.sin(t * 20) * seg(t, 5, 5.3));
  if (glow > 0) {
    for (const i of [P, A, V]) knock(L[i], () => L[i].fill(s.eyes));
    fillD(r, L[Y], s.eyes, glow);
  }

  /* scarf */
  const scarf = scarfPath(t, wind);
  for (const i of [Y, A, V]) knock(L[i], () => L[i].fill(scarf));
  L[P].fillStyle = '#000';
  L[P].fill(scarf);
  fillD(r, L[V], scarf, 0.25);
  knock(L[P], () => {
    L[P].lineWidth = 3;
    L[P].beginPath();
    L[P].moveTo(-44, 6);
    L[P].lineTo(44, 4);
    L[P].stroke();
  });

  /* orb glow on the face and hands */
  const orbK = tween(t, 8.4, 9.4, ease.outBack);
  if (orbK > 0.01) {
    const [ox, oy] = ORB;
    const lit = new Path2D();
    lit.addPath(s.face);
    lit.addPath(s.torso);
    const g = clamp(orbK);
    knock(L[V], () => {
      r.gradient(L[V], lit, { kind: 'radial', cx: ox, cy: oy, r0: 60, r1: 420, from: 0.55 * g, to: 0 }, 9);
    });
    knock(L[A], () => {
      r.gradient(L[A], lit, { kind: 'radial', cx: ox, cy: oy, r0: 60, r1: 320, from: 0.9 * g, to: 0 }, 9);
    });
    r.gradient(L[P], lit, { kind: 'radial', cx: ox, cy: oy, r0: 80, r1: 360, from: 0.45 * g, to: 0 }, 8);
    drawOrb(r, L, t, ox, oy, ORB_R * orbK);
    // hands in front of the orb: fingertips over its rim
    const fingers = new Path2D();
    fingers.moveTo(ox + Math.cos(2.5) * 84, oy + Math.sin(2.5) * 84);
    fingers.arc(ox, oy, 84, 2.5, 3.6);
    fingers.moveTo(ox + Math.cos(-0.46) * 84, oy + Math.sin(-0.46) * 84);
    fingers.arc(ox, oy, 84, -0.46, 0.64);
    for (const i of [Y, P, A]) knock(L[i], () => {
      L[i].lineWidth = 40;
      L[i].lineCap = 'round';
      L[i].stroke(fingers);
    });
    L[V].lineWidth = 40;
    L[V].lineCap = 'round';
    L[V].stroke(fingers);
    // finger gaps and a lit inner edge facing the orb
    const gaps = new Path2D();
    for (const a0 of [2.62, 2.9, 3.18, 3.46, -0.34, -0.06, 0.22, 0.5]) {
      gaps.moveTo(ox + Math.cos(a0) * 96, oy + Math.sin(a0) * 96);
      gaps.lineTo(ox + Math.cos(a0) * 80, oy + Math.sin(a0) * 80);
    }
    const edge = new Path2D();
    edge.moveTo(ox + Math.cos(2.5) * 66, oy + Math.sin(2.5) * 66);
    edge.arc(ox, oy, 66, 2.5, 3.6);
    edge.moveTo(ox + Math.cos(-0.46) * 66, oy + Math.sin(-0.46) * 66);
    edge.arc(ox, oy, 66, -0.46, 0.64);
    knock(L[V], () => {
      L[V].lineWidth = 3.5;
      L[V].lineCap = 'round';
      L[V].stroke(gaps);
      L[V].lineWidth = 6 * g;
      L[V].stroke(edge);
    });
    L[Y].lineWidth = 6 * g;
    L[Y].lineCap = 'round';
    L[Y].stroke(edge);
    // keep the hair solid over the lit face
    L[V].fillStyle = '#000';
    L[V].fill(hair);
  }

  /* rising sparks */
  if (power > 0.05) {
    const sp = new Path2D();
    const cxs = lerp(0, ORB[0], condense);
    s.motes.forEach((m, i) => {
      const yy = 420 - ((t * m.sp + m.y) % 900);
      const pull = condense;
      const mx = lerp(m.x * 1.1, cxs + m.x * 0.08, pull);
      const my = lerp(yy, ORB[1] + (yy - 300) * 0.08, pull);
      const ss = m.s * Math.min(1, power) * (1 - 0.6 * pull);
      if (hash(i) < 0.4 && Math.abs(m.x) < 200 && yy > -200 && yy < 420 && pull < 0.1) return;
      sp.moveTo(mx, my - ss * 2.2);
      sp.lineTo(mx + ss * 0.6, my);
      sp.lineTo(mx, my + ss * 2.2);
      sp.lineTo(mx - ss * 0.6, my);
      sp.closePath();
    });
    for (const i of [Y, P, A, V]) knock(L[i], () => L[i].fill(sp));
  }
}

function drawOrb(r: Riso, L: Ctx[], t: number, ox: number, oy: number, rad: number) {
  if (rad < 1) return;
  const pulse = 1 + 0.04 * Math.sin(t * 18) * seg(t, 9.2, 9.6);
  const R = rad * pulse;
  const dive = seg(t, 10.1, 11.1);
  // spinning ring around the orb (the motif, tilted like a planet ring)
  const ringA = 1 - seg(t, 10.2, 10.7);
  const rot = -0.32;
  const spin = t * 3.2;
  const ringPath = (front: boolean) => {
    const p = new Path2D();
    const a0 = front ? 0 : Math.PI;
    p.ellipse(ox, oy, R * 1.75, R * 0.42, rot, a0, a0 + Math.PI);
    return p;
  };
  const strokeRing = (front: boolean) => {
    if (ringA <= 0.01) return;
    const p = ringPath(front);
    for (const i of [P, A, V]) knock(L[i], () => {
      L[i].lineWidth = 9 * ringA;
      L[i].stroke(p);
    });
    L[Y].lineWidth = 9 * ringA;
    L[Y].stroke(p);
    // a bright bead running around the ring
    const ba = spin % TAU;
    const isFront = Math.sin(ba) > 0;
    if (isFront === front) {
      const bx = ox + Math.cos(ba) * R * 1.75 * Math.cos(rot) - Math.sin(ba) * R * 0.42 * Math.sin(rot);
      const by = oy + Math.cos(ba) * R * 1.75 * Math.sin(rot) + Math.sin(ba) * R * 0.42 * Math.cos(rot);
      const bead = circle(bx, by, 9 * ringA);
      for (const i of [Y, P, A, V]) knock(L[i], () => L[i].fill(bead));
    }
  };
  strokeRing(false);
  // halo
  const halo = circle(ox, oy, R * 2.1);
  r.gradient(L[Y], halo, { kind: 'radial', cx: ox, cy: oy, r0: R, r1: R * 2.1, from: 0.7, to: 0 }, 6);
  const disc = circle(ox, oy, R);
  for (const i of [P, A, V]) knock(L[i], () => L[i].fill(disc));
  L[Y].fillStyle = '#000';
  L[Y].fill(disc);
  r.gradient(L[P], disc, { kind: 'radial', cx: ox, cy: oy, r0: R * 0.3, r1: R, from: 0, to: 0.7 }, 10);
  // swirl inside the orb
  const sw = new Path2D();
  for (let k = 0; k < 3; k++) {
    const a0 = t * 4 + (k * TAU) / 3;
    sw.moveTo(ox + Math.cos(a0) * R * 0.45, oy + Math.sin(a0) * R * 0.45);
    sw.arc(ox, oy, R * (0.55 + 0.12 * k), a0, a0 + 1.6);
  }
  knock(L[P], () => {
    L[P].lineWidth = Math.max(1, R * 0.06);
    L[P].lineCap = 'round';
    L[P].stroke(sw);
  });
  const core = circle(ox, oy, R * 0.35);
  for (const i of [Y, P, A, V]) knock(L[i], () => L[i].fill(core));
  strokeRing(true);
  // crackling lightning
  if (t > 9.0 && dive < 0.6) {
    const f = Math.floor(t * 14);
    const bolt = new Path2D();
    for (let k = 0; k < 4; k++) {
      let a = hash(f * 3.7 + k) * TAU;
      let rr = R * 1.02;
      bolt.moveTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr);
      for (let j = 0; j < 5; j++) {
        rr += R * (0.18 + 0.2 * hash(f + k * 11 + j));
        a += (hash(f * 1.9 + k * 5 + j * 3) - 0.5) * 0.7;
        bolt.lineTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr);
      }
    }
    L[A].lineWidth = 4;
    L[A].lineJoin = 'miter';
    L[A].stroke(bolt);
    knock(L[Y], () => {
      L[Y].lineWidth = 4;
      L[Y].stroke(bolt);
    });
    L[V].lineWidth = 2;
    L[V].stroke(bolt);
  }
}

function drawPetal(r: Riso, L: Ctx[], t: number, s: State) {
  if (t > 6.2) return;
  // path in screen space past the moon, then to the eye
  const p = t / 3.2;
  const x0 = 1330 - 360 * p + 46 * Math.sin(p * 6.5);
  const y0 = -30 + 400 * p + 14 * Math.sin(p * 9);
  const k = tween(t, 3.2, 4.75, ease.inOutCubic);
  const eye: Pt = [HX + EYE[0], HY + EYE[1]];
  const p3 = 3.2 / 3.2;
  const xa = 1330 - 360 * p3 + 46 * Math.sin(p3 * 6.5);
  const ya = -30 + 400 * p3 + 14 * Math.sin(p3 * 9);
  const x = t < 3.2 ? x0 : lerp(xa, eye[0], k) + Math.sin(k * Math.PI) * 60;
  const y = t < 3.2 ? y0 : lerp(ya, eye[1], k) - Math.sin(k * Math.PI) * 30;
  const mk = tween(t, 4.3, 4.9, ease.inOutCubic);
  const pts = morph(s.petal, s.spark, mk);
  const tumble = t * 2.4;
  const sc = lerp(1.6, 1, mk) * (mk > 0.99 ? 1 + 0.35 * Math.sin(seg(t, 4.9, 6.2) * Math.PI) : 1);
  const fade = 1 - seg(t, 5.6, 6.2);
  const m = new DOMMatrix()
    .translate(x, y)
    .rotate(lerp((tumble * 180) / Math.PI, 45, mk))
    .scale(sc * fade, sc * lerp(Math.abs(Math.cos(tumble * 0.7)) * 0.6 + 0.4, 1, mk) * fade);
  const path = new Path2D();
  path.addPath(smoothPath(pts, true, 0.4), m);
  for (const i of [Y, A, V]) knock(L[i], () => L[i].fill(path));
  if (mk < 1) {
    knock(L[P], () => L[P].fill(path));
    fillD(r, L[P], path, 1 - mk);
  } else {
    knock(L[P], () => L[P].fill(path));
  }
}

function impactFrame(r: Riso, t: number, s: State, ignite: number) {
  const L = r.layers;
  for (const ctx of L) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
  const second = t >= 6.6;
  const ink = second ? P : V;
  const big = new Path2D();
  big.rect(-4000, -4000, 9600, 9000);
  L[ink].fillStyle = '#000';
  L[ink].fill(big);
  // paper speed lines and silhouette
  const f = Math.floor(t * 30);
  const hc: Pt = [HX + HEAD[0], HY + HEAD[1]];
  const sl = new Path2D();
  s.speed.forEach((l, i) => {
    if (i % 2) return;
    const a = l.a + hash(i + f) * 0.02;
    const r0 = l.r0 * 1.2;
    const w = l.w * 1.6;
    sl.moveTo(hc[0] + Math.cos(a) * r0, hc[1] + Math.sin(a) * r0);
    sl.lineTo(hc[0] + Math.cos(a - w) * 1500, hc[1] + Math.sin(a - w) * 1500);
    sl.lineTo(hc[0] + Math.cos(a + w) * 1500, hc[1] + Math.sin(a + w) * 1500);
    sl.closePath();
  });
  knock(L[ink], () => L[ink].fill(sl));
  const hair = polyPath(hairPts(t, ignite));
  L[ink].save();
  L[ink].translate(HX, HY);
  knock(L[ink], () => {
    L[ink].lineCap = 'round';
    L[ink].lineJoin = 'round';
    L[ink].fill(s.torso);
    L[ink].fill(s.face);
    L[ink].fill(s.neck);
    L[ink].fill(hair);
    L[ink].fill(s.collar);
    L[ink].lineWidth = 80;
    L[ink].stroke(s.arms);
    L[ink].lineWidth = 40;
    L[ink].stroke(s.hands);
    L[ink].fill(scarfPath(t, 1));
  });
  // eyes stay inked: a held stare
  L[ink].fill(s.eyes);
  L[ink].lineWidth = 4;
  L[ink].stroke(s.lines);
  L[ink].stroke(hair);
  L[ink].restore();
}

/* ---------- act two: the blast over the mountains, then moonrise ---------- */

function drawLand(r: Riso, t: number, s: State) {
  const L = r.layers;
  const shrink = tween(t, 11.1, 12.5, ease.outCubic);
  const settle = tween(t, 14.8, 16.8, ease.inOutSine);
  const blastK = seg(t, 12.2, 14.9);
  const front = 1750 * ease.outCubic(blastK);
  const sx = shake(t, 12.2, 13.8, 14, 3);
  const sy = shake(t, 12.2, 13.8, 10, 4);
  r.camera(800 + sx, 450 + sy - 12 * settle, 1 + 0.025 * ease.inOutSine(seg(t, 12.4, 19.5)));

  // sun -> moon
  const sunC: Pt = [lerp(800, SUN[0], shrink), lerp(450, SUN[1], shrink)];
  sunC[1] = lerp(sunC[1], 300, settle);
  const R = lerp(lerp(70 * 17, SUN_R, shrink), 112, settle);

  const big = new Path2D();
  big.rect(-400, -400, 2400, 1700);

  /* sky */
  const day = 1 - settle;
  r.gradient(L[Y], big, { kind: 'radial', cx: sunC[0], cy: sunC[1], r0: R, r1: 1100, from: 0.9 * day, to: 0.25 * day }, 10);
  // sunburst rays
  if (day > 0.01) {
    const rays = new Path2D();
    const n = 20;
    const rot = t * 0.08;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const w = (TAU / n) * 0.28;
      rays.moveTo(sunC[0] + Math.cos(a) * R * 1.05, sunC[1] + Math.sin(a) * R * 1.05);
      rays.lineTo(sunC[0] + Math.cos(a - w) * 2200, sunC[1] + Math.sin(a - w) * 2200);
      rays.lineTo(sunC[0] + Math.cos(a + w) * 2200, sunC[1] + Math.sin(a + w) * 2200);
      rays.closePath();
    }
    fillD(r, L[P], rays, 0.5 * day);
    r.gradient(L[P], big, { kind: 'linear', x0: 0, y0: 0, x1: 0, y1: 520, from: 0.25 * day, to: 0 }, 6);
  }
  if (settle > 0.01) {
    r.gradient(L[V], big, { kind: 'linear', x0: 0, y0: -40, x1: 0, y1: 700, from: 0.88 * settle, to: 0.3 * settle }, 12);
    fillD(r, L[A], big, 0.42 * settle);
    const st = new Path2D();
    s.stars.forEach(([x, y], i) => {
      if (y > 470) return;
      circle(x, y, (1.2 + 1.4 * hash(i)) * seg(t, 15.4 + hash(i * 3) * 1.5, 16.4 + hash(i * 3) * 1.5), st);
    });
    for (const i of [V, A]) knock(L[i], () => L[i].fill(st));
  }

  // manga focus lines toward the sun during the blast
  const focus = seg(t, 12.15, 12.4) * (1 - seg(t, 13.6, 14.6));
  if (focus > 0.01) {
    const f = Math.floor(t * 12);
    const fl = new Path2D();
    s.speed.forEach((l, i) => {
      const a = l.a + (hash(i * 5.1 + f) - 0.5) * 0.03;
      const r0 = R * 1.6 + l.r0 * (0.6 + 0.6 * hash(i + f)) * (1.4 - focus * 0.6);
      const w = l.w * 0.8;
      fl.moveTo(sunC[0] + Math.cos(a) * r0, sunC[1] + Math.sin(a) * r0);
      fl.lineTo(sunC[0] + Math.cos(a - w) * 2000, sunC[1] + Math.sin(a - w) * 2000);
      fl.lineTo(sunC[0] + Math.cos(a + w) * 2000, sunC[1] + Math.sin(a + w) * 2000);
      fl.closePath();
    });
    L[V].fillStyle = '#000';
    L[V].fill(fl);
  }

  /* blast dome behind the mountains */
  const ground = 640;
  if (blastK > 0 && blastK < 1) {
    const fade = 1 - seg(blastK, 0.6, 1);
    const dome = new Path2D();
    dome.ellipse(800, ground, front, front * 0.62, 0, Math.PI, TAU);
    dome.closePath();
    const inner = new Path2D();
    inner.ellipse(800, ground, front * 0.86, front * 0.53, 0, Math.PI, TAU);
    inner.closePath();
    fillD(r, L[Y], dome, 0.5 * fade);
    fillD(r, L[P], inner, 0.2 * fade);
    const edge = new Path2D();
    edge.ellipse(800, ground, front * 0.98, front * 0.6, 0, Math.PI, TAU);
    knock(L[V], () => {
      L[V].lineWidth = 16 * fade;
      L[V].stroke(edge);
    });
    L[P].lineWidth = 14 * fade;
    L[P].stroke(edge);
  }

  /* mountains */
  s.mts.forEach((m, i) => {
    const lit = blastK > 0 && blastK < 1 ? clamp(1 - Math.abs(front - m.dist) / 380) : 0;
    const jig = lit * 5 * noise1(t * 30, i);
    for (const c of L) {
      c.save();
      c.translate(jig, 0);
    }
    const dark = [0.5, 0.75, 1][i];
    for (const j of [Y, P]) knock(L[j], () => L[j].fill(m.path));
    for (const j of [A, V]) knock(L[j], () => L[j].fill(m.path));
    fillD(r, L[V], m.path, lerp(dark * (1 - 0.75 * lit), Math.min(1, dark + 0.2), settle));
    fillD(r, L[A], m.path, [0.6, 0.85, 1][i] * (1 - 0.5 * lit));
    if (i === 0) fillD(r, L[P], m.path, 0.35 * day);
    if (lit > 0.02) {
      knock(L[A], () => {
        r.gradient(L[A], m.path, { kind: 'linear', x0: 0, y0: 450, x1: 0, y1: 900, from: lit, to: lit * 0.3 }, 6);
      });
      fillD(r, L[P], m.path, lit * 0.6);
    }
    // ridge rim light from the sun/moon
    const rim = new DOMMatrix().translate(0, 5);
    const rp = new Path2D();
    rp.addPath(m.path);
    knock(L[V], () => {
      L[V].save();
      L[V].clip(m.path);
      L[V].lineWidth = 6 - i * 1.5;
      L[V].globalCompositeOperation = 'destination-out';
      L[V].setTransform(L[V].getTransform().multiply(rim).multiply(new DOMMatrix().translate(0, -5)));
      L[V].stroke(rp);
      L[V].restore();
    });
    knock(L[A], () => {
      L[A].save();
      L[A].clip(m.path);
      L[A].lineWidth = 6 - i * 1.5;
      L[A].stroke(rp);
      L[A].restore();
    });
    L[Y].save();
    L[Y].clip(m.path);
    L[Y].lineWidth = 6 - i * 1.5;
    L[Y].stroke(rp);
    L[Y].restore();

    // ground ring of the blast wave, between the ranges
    if (i === 0 && blastK > 0 && blastK < 1) {
      const fade = 1 - seg(blastK, 0.7, 1);
      const ring = new Path2D();
      ring.ellipse(800, ground + 40, front * 0.9, front * 0.12, 0, 0, TAU);
      for (const j of [A, V]) knock(L[j], () => {
        L[j].lineWidth = 22 * fade;
        L[j].stroke(ring);
      });
      L[Y].lineWidth = 22 * fade;
      L[Y].stroke(ring);
      L[P].lineWidth = 6 * fade;
      L[P].stroke(ring);
    }
    if (i === 2) {
      // the hero on the near peak
      const wind = blastK > 0 && blastK < 1 ? 1 : 0.5;
      const mh = miniHero(t, wind);
      const mm = new DOMMatrix().translate(1182, s.peakY + 4).scale(1.3);
      const body = new Path2D();
      body.addPath(mh.body, mm);
      const scarf = new Path2D();
      scarf.addPath(mh.scarf, mm);
      for (const j of [Y, P]) knock(L[j], () => L[j].fill(body));
      L[V].fillStyle = '#000';
      L[V].fill(body);
      L[A].fillStyle = '#000';
      L[A].fill(body);
      for (const j of [Y, A, V]) knock(L[j], () => L[j].fill(scarf));
      L[P].fillStyle = '#000';
      L[P].fill(scarf);
    }
    for (const c of L) c.restore();
  });

  /* dust settling along the ground */
  const dust = seg(t, 13.0, 14.2) * (1 - seg(t, 15.5, 17.5));
  if (dust > 0.01) {
    const dp = new Path2D();
    for (let i = 0; i < 9; i++) {
      const x = 80 + i * 180 + 30 * noise1(i + t * 0.4, 6);
      const y = 690 + 40 * hash(i * 9) - t * 4;
      const w = 160 + 60 * hash(i);
      dp.ellipse(x, y, w, 26 + 10 * hash(i * 2), 0, 0, TAU);
    }
    for (const i of [V, A]) knock(L[i], () => fillD(r, L[i], dp, 0.4 * dust));
    fillD(r, L[Y], dp, 0.2 * dust * day);
  }

  /* the sun / moon disc */
  const disc = circle(sunC[0], sunC[1], R);
  for (const i of [P, A, V]) knock(L[i], () => L[i].fill(disc));
  L[Y].fillStyle = '#000';
  L[Y].fill(disc);
  r.gradient(L[P], disc, { kind: 'radial', cx: sunC[0], cy: sunC[1], r0: R * 0.3, r1: R, from: 0, to: 0.7 * day }, 10);
  const coreR = R * lerp(0.35, 0.22, shrink) * day;
  if (coreR > 1) {
    const core = circle(sunC[0], sunC[1], coreR);
    for (const i of [Y, P, A, V]) knock(L[i], () => L[i].fill(core));
  }
  if (settle > 0.01) {
    L[P].save();
    L[P].translate(sunC[0], sunC[1]);
    L[P].scale(R / 100, R / 100);
    L[P].clip(circle(0, 0, 100));
    fillD(r, L[P], s.craters, 0.28 * settle);
    r.gradient(L[P], null, { kind: 'linear', x0: -60, y0: -60, x1: 100, y1: 100, from: 0, to: 0.3 * settle }, 6);
    L[P].restore();
    // the ring settles around the moon
    const halo = seg(t, 15.6, 17.0);
    if (halo > 0) {
      const hr = R * lerp(1.0, 1.32, ease.outCubic(halo));
      const ring = new Path2D();
      ring.arc(sunC[0], sunC[1], hr, 0, TAU);
      for (const i of [A, V]) knock(L[i], () => {
        L[i].lineWidth = 5;
        L[i].stroke(ring);
      });
      L[Y].lineWidth = 5;
      L[Y].stroke(ring);
      r.gradient(L[Y], annulus(sunC[0], sunC[1], R, hr * 1.6), { kind: 'radial', cx: sunC[0], cy: sunC[1], r0: R, r1: hr * 1.6, from: 0.45 * halo, to: 0 }, 6);
    }
  }

  /* impact flash as the blast lands */
  if (t >= 12.2 && t < 12.3) {
    for (const ctx of L) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
    L[V].fillStyle = '#000';
    L[V].fill(big);
    knock(L[V], () => {
      L[V].fill(circle(sunC[0], sunC[1], R * 1.15));
      s.mts.forEach((m) => {
        L[V].lineWidth = 5;
        L[V].stroke(m.path);
      });
    });
  }

  /* petals return */
  const pk = seg(t, 15.0, 15.4);
  if (pk > 0) {
    const pp = new Path2D();
    s.petals.forEach((pe) => {
      const tt = t - 15.0 - pe.d;
      if (tt < 0) return;
      const x = pe.x - tt * 70 + 30 * Math.sin(tt * 1.6 + pe.ph);
      const y = -20 + tt * pe.sp;
      const tum = tt * 2.2 + pe.ph;
      const m = new DOMMatrix()
        .translate(x, y)
        .rotate((tum * 180) / Math.PI * 0.6)
        .scale(pe.s, pe.s * (0.35 + 0.65 * Math.abs(Math.cos(tum))));
      pp.addPath(smoothPath(s.petal, true, 0.4), m);
    });
    for (const i of [Y, A, V]) knock(L[i], () => L[i].fill(pp));
    L[P].fillStyle = '#000';
    L[P].fill(pp);
  }

  /* vertical end title */
  const title = seg(t, 16.6, 17.8);
  if (title > 0) {
    const tx = 1478;
    const ty0 = 236;
    const clip = new Path2D();
    clip.rect(tx - 40, ty0 - 50, 80, 50 + 230 * ease.inOutCubic(title));
    const draw = (ctx: Ctx) => {
      ctx.font = `900 44px ${DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ['A', 'U', 'R', 'A'].forEach((ch, i) => ctx.fillText(ch, tx, ty0 + i * 52));
    };
    for (const i of [A, V]) {
      L[i].save();
      L[i].clip(clip);
      knock(L[i], () => draw(L[i]));
      L[i].restore();
    }
    L[Y].save();
    L[Y].clip(clip);
    L[Y].fillStyle = '#000';
    draw(L[Y]);
    L[Y].restore();
    // a small ring above the title
    const dot = new Path2D();
    dot.arc(tx, ty0 - 70, 10 * ease.outBack(seg(t, 17.4, 17.9)), 0, TAU);
    L[P].lineWidth = 4;
    for (const i of [A, V]) knock(L[i], () => {
      L[i].lineWidth = 5;
      L[i].stroke(dot);
    });
    L[P].stroke(dot);
    L[Y].lineWidth = 4;
    L[Y].stroke(dot);
  }
}
