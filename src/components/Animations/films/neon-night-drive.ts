import type { RisoFilm, Riso } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, noise1, hash, mulberry, smooth, type Pt } from '../riso/kit';
import {
  NEON,
  Neon,
  createNeonFX,
  flick,
  hum,
  gridFloor,
  neonSun,
  makeStars,
  drawStars,
  rgba,
  rect,
  line,
  type NeonFX,
  type Star,
  type Part,
  type Baked,
} from '../styles/neon';

/*
 * Night Drive: one light line carries the whole drive. It ignites as the horizon, becomes the
 * riverbank the skyline rises from, the bridge deck full of tail-light streaks, our car's
 * tail-light bar, and finally shrinks to a dot down the road and opens back into the horizon.
 */

const HZ = 500;
const DY = 640; // bridge deck
const T_SWAP = 11.4;
const Z3 = 8;
const Z4 = 3.5;
const BAR_Y = 700;
const CAR_G = 840;

interface Building {
  cx: number;
  w: number;
  h: number;
  outline: Path2D;
  accent: Path2D;
  windows: Path2D;
  col: string;
  winCol: string;
  rise: number; // start time of the rise
  beacon?: Pt;
  crown?: { y: number; rx: number };
}

interface Dash {
  x: number;
  y: number;
  hw: number;
  ph: number;
}

interface State {
  fx: NeonFX;
  stars: Star[];
  city: Building[];
  refl: Dash[][];
  sunRefl: Dash[];
  bridge: { struct: Path2D; truss: Path2D; cable: Path2D; hangers: Path2D; lights: Path2D; piers: Path2D; deck: Path2D };
  traffic: { x: number; len: number; v: number; lane: number }[];
  car: { body: Path2D; tires: Path2D; glass: Path2D; plate: Path2D; trim: Path2D; pipes: Path2D };
  cityBig: Baked;
  citySmall: Baked;
  title: Baked;
  sub: Baked;
}

const polyP = (pts: Pt[], dx = 0, dy = 0, p = new Path2D()) => {
  pts.forEach(([x, y], i) => (i ? p.lineTo(x + dx, y + dy) : p.moveTo(x + dx, y + dy)));
  p.closePath();
  return p;
};

/* ---------- city ---------- */

const buildCity = (): Building[] => {
  const rng = mulberry(41);
  const out: Building[] = [];
  const add = (
    cx: number,
    pts: Pt[],
    col: string,
    winCol: string,
    o: { cyl?: boolean; beacon?: Pt; crown?: { y: number; rx: number }; win?: number } = {}
  ) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = -Math.min(...ys);
    const outline = polyP(pts, cx, 0);
    const accent = new Path2D();
    const windows = new Path2D();
    const x0 = cx + Math.min(...xs);
    if (o.cyl) {
      // floor bands bowed like a drum, and a vertical sheen
      for (let y = -24; y > -h + 30; y -= 26) {
        accent.moveTo(x0 + 3, y);
        accent.quadraticCurveTo(cx, y + 7, x0 + w - 3, y);
      }
      accent.moveTo(cx - w * 0.22, -10);
      accent.lineTo(cx - w * 0.22, -h + 26);
    }
    // window grid inside the main shaft
    const body = pts.filter((p) => p[1] > -h * 0.7);
    const bx0 = Math.min(...body.map((p) => p[0])) + cx + 8;
    const bx1 = Math.max(...body.map((p) => p[0])) + cx - 8;
    const top = -h * (o.win ?? 0.62);
    for (let y = -14; y > top; y -= 12) {
      for (let x = bx0; x < bx1 - 4; x += 10) {
        if (rng() < 0.3) windows.rect(x, y, 4, 5);
      }
    }
    out.push({ cx, w, h, outline, accent, windows, col, winCol, rise: 0, beacon: o.beacon, crown: o.crown });
  };

  const box = (w: number, h: number): Pt[] => [
    [-w / 2, 0],
    [-w / 2, -h],
    [w / 2, -h],
    [w / 2, 0],
  ];
  // far, low blocks first
  add(60, box(120, 110), NEON.violet, NEON.amber);
  add(1555, box(110, 120), NEON.violet, NEON.amber);
  add(150, box(110, 160), NEON.violet, '#9fe8ff');
  add(
    255,
    [
      [-40, 0],
      [-40, -210],
      [0, -262],
      [40, -210],
      [40, 0],
    ],
    NEON.magenta,
    NEON.amber,
    { beacon: [0, -262] }
  );
  add(
    360,
    [
      [-62, 0],
      [-62, -170],
      [-40, -170],
      [-40, -200],
      [40, -200],
      [40, -170],
      [62, -170],
      [62, 0],
    ],
    NEON.violet,
    NEON.amber
  );
  // stepped deco tower with a spire
  add(
    480,
    [
      [-50, 0],
      [-50, -230],
      [-36, -230],
      [-36, -282],
      [-22, -282],
      [-22, -322],
      [-8, -322],
      [-2, -386],
      [2, -386],
      [8, -322],
      [22, -322],
      [22, -282],
      [36, -282],
      [36, -230],
      [50, -230],
      [50, 0],
    ],
    NEON.cyan,
    NEON.amber,
    { beacon: [0, -386], win: 0.58 }
  );
  // twin-crowned block
  add(
    625,
    [
      [-66, 0],
      [-66, -200],
      [-50, -200],
      [-50, -236],
      [-30, -236],
      [-30, -200],
      [30, -200],
      [30, -236],
      [50, -236],
      [50, -200],
      [66, -200],
      [66, 0],
    ],
    NEON.amber,
    NEON.amber
  );
  // the round-tower cluster: rear pair, centre, front pair
  add(800, box(64, 300), NEON.violet, '#9fe8ff', { cyl: true });
  add(962, box(64, 300), NEON.violet, '#9fe8ff', { cyl: true });
  add(881, box(98, 392), NEON.cyan, '#9fe8ff', { cyl: true, crown: { y: -392, rx: 49 }, win: 0.9 });
  add(768, box(70, 250), NEON.magenta, '#9fe8ff', { cyl: true });
  add(994, box(70, 250), NEON.magenta, '#9fe8ff', { cyl: true });
  add(
    1120,
    [
      [-55, 0],
      [-55, -240],
      [55, -240],
      [55, 0],
    ],
    NEON.violet,
    NEON.amber,
    { beacon: [0, -300] }
  );
  add(
    1240,
    [
      [-45, 0],
      [-45, -150],
      [45, -190],
      [45, 0],
    ],
    NEON.magenta,
    NEON.amber
  );
  add(1365, box(130, 276), NEON.cyan, '#9fe8ff');
  add(1470, box(80, 170), NEON.violet, NEON.amber);
  // rise order: centre outward
  for (const b of out) b.rise = 3.55 + Math.abs(b.cx - 880) / 520 + hash(b.cx) * 0.12;
  // antenna on 1120
  out[out.length - 4].accent.moveTo(1120, -240);
  out[out.length - 4].accent.lineTo(1120, -300);
  return out;
};

/** Skyline standing on y = 0 in local space */
const drawCity = (N: Neon, city: Building[], t: number, o: { rise: (b: Building) => number; on: (b: Building) => number; refl?: number }) => {
  const c = N.c;
  const body = c.createLinearGradient(0, -400, 0, 0);
  body.addColorStop(0, NEON.ink2);
  body.addColorStop(1, NEON.bg);
  for (const b of city) {
    const k = o.rise(b);
    if (k <= 0) continue;
    const on = o.on(b) * hum(t, b.cx);
    N.with(
      () => {
        N.clip(rect(b.cx - b.w, -600, b.w * 2, 600.5));
        N.translate(0, (1 - k) * (b.h + 20));
      },
      () => {
        const parts: Part[] = [{ p: b.outline }];
        N.rim(parts, b.col, 1.6, on * 0.9, body);
        if (on > 0.02) {
          N.fill(b.windows, rgba(b.winCol, 0.8 * on), b.winCol, 0.35 * on);
          N.tube(b.accent, b.col, 1.1, 0.35 * on, 0.4);
          if (b.crown) {
            const cr = new Path2D();
            cr.ellipse(b.cx, b.crown.y + 10, b.crown.rx - 4, 7, 0, 0, TAU);
            N.tube(cr, NEON.cyan, 2.2, on);
          }
        }
        if (on > 0.5) beacons(N, [b], t, 1);
      }
    );
  }
};

/** Blinking red aircraft lights on the spires */
const beacons = (N: Neon, city: Building[], t: number, a: number) => {
  const bp = new Path2D();
  for (const b of city) {
    if (!b.beacon || Math.sin(t * 5 + b.cx) <= 0.2) continue;
    bp.moveTo(b.cx + b.beacon[0] + 3, b.beacon[1]);
    bp.arc(b.cx + b.beacon[0], b.beacon[1], 3, 0, TAU);
  }
  N.fill(bp, NEON.red, NEON.red, a);
};

/** Shimmering reflections of the skyline and the sun on the water (local: waterline at y = 0) */
const drawRefl = (N: Neon, s: State, t: number, a: number, sunA: number, sunDx: number) => {
  if (a <= 0.01) return;
  const groups = new Map<string, Path2D>();
  s.city.forEach((b, i) => {
    let p = groups.get(b.col);
    if (!p) groups.set(b.col, (p = new Path2D()));
    for (const d of s.refl[i]) {
      const sh = Math.sin(t * 2.2 + d.ph) * 5;
      p.rect(d.x + sh - d.hw, d.y, d.hw * 2, 2.2);
    }
  });
  for (const [col, p] of groups) N.fill(p, rgba(col, 0.5 * a), col, 0.35 * a);
  if (sunA > 0.01) {
    const sp = new Path2D();
    const sp2 = new Path2D();
    for (const d of s.sunRefl) {
      const sh = Math.sin(t * 1.7 + d.ph) * 8;
      (d.y < 70 ? sp : sp2).rect(800 + sunDx + d.x + sh - d.hw, d.y, d.hw * 2, 2.6);
    }
    N.fill(sp, rgba(NEON.amber, 0.75 * sunA), NEON.amber, 0.5 * sunA);
    N.fill(sp2, rgba(NEON.magenta, 0.6 * sunA), NEON.magenta, 0.45 * sunA);
  }
};

/* ---------- bridge ---------- */

const T1 = 330;
const T2 = 1270;
const TOP = 232;

const cableY = (x: number) => {
  if (x < T1) return lerp(DY - 12, TOP, Math.pow(clamp((x + 260) / (T1 + 260)), 1.15));
  if (x > T2) return lerp(TOP, DY - 12, Math.pow(clamp((x - T2) / 560), 0.87));
  const u = (x - 800) / (T2 - 800);
  return lerp(DY - 34, TOP, u * u);
};

const buildBridge = () => {
  const struct = new Path2D();
  for (const tx of [T1, T2]) {
    // two legs joined by an arch and cross-beams
    struct.rect(tx - 44, TOP - 8, 16, DY - TOP + 8);
    struct.rect(tx + 28, TOP - 8, 16, DY - TOP + 8);
    struct.rect(tx - 44, TOP - 14, 88, 14);
    struct.rect(tx - 30, 330, 60, 9);
    struct.rect(tx - 30, 455, 60, 9);
  }
  const deck = new Path2D();
  deck.rect(-500, DY, 2700, 24);
  const piers = new Path2D();
  for (const tx of [T1, T2]) piers.rect(tx - 54, DY + 24, 108, 260);
  const truss = new Path2D();
  for (let x = -480; x < 2200; x += 34) {
    truss.moveTo(x, DY + 24);
    truss.lineTo(x + 17, DY + 38);
    truss.lineTo(x + 34, DY + 24);
  }
  truss.moveTo(-500, DY + 38);
  truss.lineTo(2200, DY + 38);
  const cable = new Path2D();
  const hangers = new Path2D();
  const lights = new Path2D();
  for (let x = -260; x <= 1830; x += 6) {
    const y = cableY(x);
    if (x === -260) cable.moveTo(x, y);
    else cable.lineTo(x, y);
  }
  for (let x = -230; x < 1820; x += 26) {
    if (Math.abs(x - T1) < 50 || Math.abs(x - T2) < 50) continue;
    const y = cableY(x);
    if (DY - y < 12) continue;
    hangers.moveTo(x, y);
    hangers.lineTo(x, DY);
  }
  for (let x = -230; x < 1820; x += 39) {
    const y = cableY(x);
    lights.moveTo(x + 3.2, y);
    lights.arc(x, y, 3.2, 0, TAU);
  }
  return { struct, truss, cable, hangers, lights, piers, deck };
};

const heroX = (t: number) => lerp(-160, 1010, ease.outSine(seg(t, 8.6, 11.6)));

const drawBridge = (N: Neon, s: State, t: number, on: number, focus: number) => {
  const B = s.bridge;
  // reflections first, under everything
  const rp = new Path2D();
  for (let i = 0; i < 26; i++) {
    const x = -230 + i * 78;
    const y0 = DY + 60;
    for (let j = 0; j < 7; j++) {
      const yy = y0 + j * 26 + Math.sin(t * 2 + i + j) * 3;
      const hw = 3 + 9 * hash(i * 7 + j);
      rp.rect(x - hw + Math.sin(t * 3 + j * 1.3 + i) * 4, yy, hw * 2, 2);
    }
  }
  N.fill(rp, rgba(NEON.amber, 0.45 * on), NEON.amber, 0.3 * on);
  const bodyG = N.c.createLinearGradient(0, TOP, 0, DY);
  bodyG.addColorStop(0, NEON.ink2);
  bodyG.addColorStop(1, NEON.ink);
  N.rim([{ p: B.piers }], NEON.violet, 1.4, 0.6 * on);
  N.tube(B.hangers, NEON.violet, 0.9, 0.45 * on, 0.3);
  N.rim([{ p: B.struct }], NEON.cyan, 1.6, on, bodyG);
  N.tube(B.cable, NEON.cyan, 2.2, on);
  // necklace lights chase along the cable
  N.fill(B.lights, rgba(NEON.white, 0.95 * on), NEON.amber, 0.9 * on);
  N.rim([{ p: B.deck }], NEON.magenta, 1.4, on);
  N.tube(B.truss, NEON.violet, 1, 0.5 * on, 0.4);
  // tower beacons
  const bl = new Path2D();
  for (const tx of [T1, T2]) {
    bl.moveTo(tx + 5, TOP - 18);
    bl.arc(tx, TOP - 18, 5, 0, TAU);
  }
  if (Math.sin(t * 4.2) > -0.2) N.fill(bl, NEON.red, NEON.red, on);

  // traffic: tail-lights run east on the near lane, headlights west on the far one
  const red = new Path2D();
  const redHot = new Path2D();
  const wht = new Path2D();
  for (const q of s.traffic) {
    const span = 2900;
    const raw = q.x + q.v * t;
    const x = ((((raw + 500) % span) + span) % span) - 500;
    const y = DY + (q.lane ? 8 : 15);
    if (q.lane) {
      red.moveTo(x - q.len, y);
      red.lineTo(x, y);
      redHot.moveTo(x - 10, y);
      redHot.lineTo(x, y);
    } else {
      wht.moveTo(x, y);
      wht.lineTo(x + q.len, y);
    }
  }
  const rest = on * (1 - 0.75 * focus);
  N.tube(red, NEON.red, 2, rest * 0.9);
  N.tube(redHot, '#ff8a9a', 2.4, rest);
  N.tube(wht, '#fff1d6', 1.8, rest * 0.85);
  // our car: a brighter, longer streak
  const hx = heroX(t);
  if (t > 8.6) {
    const hp = line(hx - 200, DY + 8, hx, DY + 8);
    N.tube(hp, NEON.red, 4.2, on, 1.2);
    N.tube(line(hx - 12, DY + 8, hx, DY + 8), '#ff9aa8', 4.4, on * (1 - focus));
  }
};

/* ---------- car ---------- */

const buildCar = () => {
  const body = polyP(
    [
      [-266, -48],
      [-286, -96],
      [-283, -150],
      [-264, -170],
      [-206, -180],
      [-150, -250],
      [-100, -262],
      [100, -262],
      [150, -250],
      [206, -180],
      [264, -170],
      [283, -150],
      [286, -96],
      [266, -48],
      [236, -36],
      [-236, -36],
    ],
    0,
    0
  );
  const tires = new Path2D();
  tires.roundRect(-270, -66, 70, 66, 10);
  tires.roundRect(200, -66, 70, 66, 10);
  const glass = polyP([
    [-186, -184],
    [-140, -242],
    [140, -242],
    [186, -184],
  ]);
  const plate = new Path2D();
  plate.roundRect(-60, -108, 120, 32, 4);
  const trim = new Path2D();
  trim.moveTo(-262, -168);
  trim.lineTo(262, -168);
  trim.moveTo(-200, -60);
  trim.lineTo(200, -60);
  for (let x = -120; x <= 120; x += 40) {
    trim.moveTo(x, -60);
    trim.lineTo(x * 1.1, -40);
  }
  const pipes = new Path2D();
  pipes.ellipse(-150, -50, 16, 7, 0, 0, TAU);
  pipes.ellipse(150, -50, 16, 7, 0, 0, TAU);
  return { body, tires, glass, plate, trim, pipes };
};

/** Car seen from behind, local origin at ground centre */
const drawCar = (N: Neon, s: State, t: number, sc: number, lampPh: number) => {
  const C = s.car;
  const c = N.c;
  const bodyG = c.createLinearGradient(0, -262, 0, 0);
  bodyG.addColorStop(0, '#1b0f33');
  bodyG.addColorStop(0.55, NEON.ink);
  bodyG.addColorStop(1, '#05030a');
  N.rim([{ p: C.tires }], NEON.violet, 1.6, 0.8, '#05030a');
  N.rim([{ p: C.body }], NEON.magenta, 2.2, 1, bodyG);
  // rear window with a sliding streetlight glint
  const gl = c.createLinearGradient(0, -242, 0, -184);
  gl.addColorStop(0, '#2a1650');
  gl.addColorStop(1, '#0e0820');
  N.dark(C.glass, gl);
  N.with(
    () => N.clip(C.glass),
    () => {
      const gx = lerp(-320, 320, lampPh);
      const band = new Path2D();
      band.moveTo(gx - 30, -250);
      band.lineTo(gx + 10, -250);
      band.lineTo(gx - 40, -176);
      band.lineTo(gx - 80, -176);
      band.closePath();
      N.fill(band, rgba(NEON.amber, 0.1), undefined, 0, 'nonzero', true);
      // the city ahead, faint in the glass
      N.tube(line(-190, -196, 190, -196), NEON.cyan, 1, 0.3, 0.2);
    }
  );
  N.tube(C.glass, NEON.violet, 1.2, 0.7, 0.4);
  N.tube(C.trim, NEON.violet, 1, 0.45, 0.3);
  N.fill(C.plate, rgba('#e8e0ff', 0.22), '#e8e0ff', 0.25);
  N.tube(C.plate, '#e8e0ff', 0.8, 0.4, 0.2);
  N.tube(C.pipes, NEON.cyan, 1.2, 0.6, 0.4);
  // the tail-light bar, the motif
  const bar = line(-232, -140, 232, -140);
  N.tube(bar, NEON.red, 6, 1, 1.2);
  N.tube(line(-226, -140, 226, -140), '#ffd6dc', 2.2, 0.9, 0.3);
  const ends = new Path2D();
  ends.moveTo(-262, -152);
  ends.lineTo(-248, -152);
  ends.lineTo(-248, -122);
  ends.moveTo(262, -152);
  ends.lineTo(248, -152);
  ends.lineTo(248, -122);
  N.tube(ends, NEON.red, 3.5, 1);
  // light pooled on the wet road
  if (sc > 0.3) {
    const pool = c.createLinearGradient(0, 0, 0, 70);
    pool.addColorStop(0, rgba(NEON.red, 0.22));
    pool.addColorStop(1, rgba(NEON.red, 0));
    const pp = new Path2D();
    pp.ellipse(0, 0, 250, 60, 0, 0, Math.PI);
    N.light(pp, pool);
  }
  void t;
};

/* ---------- road ---------- */

const VP: Pt = [800, HZ];

const drawRoad = (N: Neon, t: number, a: number, scroll: number) => {
  if (a <= 0.01) return;
  const D = 900 - HZ;
  const P = (bx: number, u: number): Pt => [VP[0] + (bx - VP[0]) * u, HZ + D * u];
  // asphalt
  const road = polyP([
    [VP[0] - 4, HZ],
    [VP[0] + 4, HZ],
    [1560, 900],
    [40, 900],
  ]);
  const rg = N.c.createLinearGradient(0, HZ, 0, 900);
  rg.addColorStop(0, rgba('#0a0614', a));
  rg.addColorStop(1, rgba('#120a22', a));
  N.dark(road, rg, 'nonzero', a);
  // edges
  const edges = new Path2D();
  edges.moveTo(VP[0], HZ);
  edges.lineTo(40, 900);
  edges.moveTo(VP[0], HZ);
  edges.lineTo(1560, 900);
  N.tube(edges, NEON.cyan, 2.6, a);
  // lane dashes as perspective quads
  const dashes = new Path2D();
  const fr = scroll - Math.floor(scroll);
  for (const bx of [547, 1053]) {
    for (let i = 0; i < 14; i++) {
      const z = 0.75 + (i + 1 - fr) * 0.9;
      const u0 = 1 / z;
      const u1 = 1 / (z + 0.42);
      const w0 = 9 * u0;
      const w1 = 9 * u1;
      const [x0, y0] = P(bx, u0);
      const [x1, y1] = P(bx, u1);
      dashes.moveTo(x0 - w0, y0);
      dashes.lineTo(x0 + w0, y0);
      dashes.lineTo(x1 + w1, y1);
      dashes.lineTo(x1 - w1, y1);
      dashes.closePath();
    }
  }
  N.fill(dashes, rgba('#e9dcff', 0.85 * a), NEON.violet, 0.8 * a);
  N.fadeGlow(HZ, HZ + 60);
  // streetlights on both sides
  const lf = scroll * 0.5;
  const lfr = lf - Math.floor(lf);
  const poles = new Path2D();
  const lamps = new Path2D();
  for (let i = 0; i < 6; i++) {
    const z = 0.55 + (i + 1 - lfr) * 1.15;
    const u = 1 / z;
    for (const side of [-1, 1]) {
      const [bx, by] = P(VP[0] + side * 1150, u);
      const top = by - 760 * u;
      const ax = bx - side * 150 * u;
      poles.moveTo(bx, by);
      poles.lineTo(bx, top);
      poles.lineTo(ax, top + 14 * u);
      lamps.moveTo(ax + 9 * u, top + 18 * u);
      lamps.ellipse(ax, top + 18 * u, 9 * u, 4 * u, 0, 0, TAU);
    }
  }
  N.tube(poles, NEON.violet, 2, 0.7 * a, 0.5);
  N.fill(lamps, rgba(NEON.white, a), NEON.amber, a);
  // two cars far ahead
  const far = new Path2D();
  for (const [bx, z0] of [
    [700, 7.5],
    [930, 10],
  ] as const) {
    const z = z0 + 0.6 * Math.sin(t * 0.7 + bx);
    const u = 1 / z;
    const [x, y] = P(bx, u);
    far.moveTo(x - 16 * u * 2, y - 8);
    far.lineTo(x + 16 * u * 2, y - 8);
  }
  N.tube(far, NEON.red, 2.2, a);
};

/* ---------- film ---------- */

const stageScroll = (t: number) => t * 1.2 - 0.9 * Math.max(0, t - 3.8);

export const neonNightDriveFilm: RisoFilm<State> = {
  id: 'neon-night-drive',
  title: 'Night Drive',
  caption: 'One line of light, from the horizon to the bridge to the tail-lights and home.',
  theme: 'Detroit',
  motif: 'the light streak line',
  series: 'Neon',
  mode: 'direct',
  duration: 19,
  paper: NEON.bg,
  grain: 0,
  inks: [{ color: NEON.magenta }, { color: NEON.cyan }, { color: NEON.violet }, { color: NEON.amber }, { color: NEON.red }],
  scenes: [
    { at: 0, label: 'Ignition' },
    { at: 3.6, label: 'Skyline' },
    { at: 7.6, label: 'Bridge' },
    { at: 11.4, label: 'Drive' },
    { at: 15.4, label: 'Home' },
  ],
  posterTime: 13.6,

  setup(r: Riso): State {
    const rng = mulberry(77);
    const city = buildCity();
    const refl = city.map((b) =>
      Array.from({ length: 22 }, (_, j) => {
        const y = 8 + j * 9 + rng() * 3;
        return { x: b.cx + (rng() - 0.5) * b.w * 0.3, y, hw: b.w * (0.12 + rng() * 0.3) * (1 - j / 26), ph: rng() * TAU };
      })
    );
    const sunRefl = Array.from({ length: 30 }, (_, j) => ({
      x: (rng() - 0.5) * 30,
      y: 6 + j * 7.5,
      hw: 150 * (1 - j / 34) * (0.5 + rng() * 0.6),
      ph: rng() * TAU,
    }));
    const traffic = Array.from({ length: 22 }, (_, i) => {
      const lane = i % 2;
      return { x: rng() * 2900, len: 40 + rng() * 90, v: lane ? 340 + rng() * 120 : -(300 + rng() * 140), lane };
    });
    const still = (n: Neon) => drawCity(n, city, 0, { rise: () => 1, on: () => 1 });
    const cityBig = Neon.bake(r, -80, -420, 1760, 424, 2, still);
    const citySmall = Neon.bake(r, -80, -420, 1760, 424, 1, still);
    const title = Neon.bake(r, 250, 100, 1100, 140, 1, (n) => n.text('NIGHT DRIVE', 800, 170, 92, NEON.magenta, { spacing: 10 }));
    const sub = Neon.bake(r, 500, 226, 600, 44, 1, (n) =>
      n.text('DETROIT', 800, 248, 28, NEON.cyan, { spacing: 14, font: `600 28px ui-monospace, "SF Mono", Menlo, monospace`, w: 1 })
    );
    return {
      cityBig,
      citySmall,
      title,
      sub,
      fx: createNeonFX(r),
      stars: makeStars(110, 9, -600, 2400, 0, 470),
      city,
      refl,
      sunRefl,
      bridge: buildBridge(),
      traffic,
      car: buildCar(),
    };
  },

  draw(r, t, s) {
    const N = Neon.frame(r, s.fx);
    const c = N.c;
    let flash = 0;

    if (t < T_SWAP) {
      /* ===== A–C: horizon, skyline, bridge ===== */
      // camera: pull back from the igniting line, then a slow push; zoom into our car at the end
      const kPull = tween(t, 0.6, 3.6, ease.inOutCubic);
      let z = lerp(2.1, 1, kPull) * lerp(1, 1.04, tween(t, 3.6, 7.6, ease.inOutSine));
      let cx = 800;
      let cy = lerp(HZ, 450, kPull);
      const pan = tween(t, 7.6, 9.8, ease.inOutCubic);
      const kz = seg(t, 9.9, T_SWAP);
      const bx = lerp(1750, 0, pan);
      if (kz > 0) {
        const e = ease.inQuint(kz);
        z = Math.exp(lerp(Math.log(1.04), Math.log(Z3), e));
        const target: Pt = [heroX(t) - 100 + bx, DY + 8];
        const kk = smooth(clamp(kz * 1.6));
        cx = lerp(800, target[0], kk);
        cy = lerp(450, target[1], kk);
      }
      N.cam(cx, cy, z);

      // sky
      const sky = c.createLinearGradient(0, 0, 0, HZ);
      sky.addColorStop(0, NEON.bg);
      sky.addColorStop(1, '#1d0a36');
      const skyOn = tween(t, 0.9, 3, ease.inOutSine);
      c.globalAlpha = skyOn;
      c.fillStyle = sky;
      c.fillRect(-1200, -600, 4000, HZ + 600);
      c.globalAlpha = 1;
      const cityDx = -360 * pan;
      N.with(
        () => N.translate(cityDx * 0.5, 0),
        () => drawStars(N, s.stars, t, skyOn)
      );

      // sun rises from behind the line, then sinks behind the skyline
      const sunUp = tween(t, 1.1, 3.4, ease.outCubic);
      const sunY = lerp(HZ + 230, HZ - 40, sunUp) + 90 * tween(t, 4.2, 7.6, ease.inOutSine);
      neonSun(N, 800 - 220 * pan, sunY, 210, { clipY: HZ, phase: t * 0.35, a: clamp(sunUp * 1.6) });

      // skyline rises out of the line, tower by tower
      N.with(
        () => N.translate(cityDx, HZ),
        () => {
          if (t > 6.3) {
            N.sprite(s.cityBig, hum(t, 2, 0.04));
            beacons(N, s.city, t, 1);
          } else
            drawCity(N, s.city, t, {
              rise: (b) => tween(t, b.rise, b.rise + 0.9, ease.outCubic),
              on: (b) => flick(t, b.rise + 0.55, 0.5, b.cx),
            });
        }
      );

      // floor: grid while we roll, then water
      const water = tween(t, 3.9, 5.6, ease.inOutSine);
      const floorA = tween(t, 1.6, 3.0, ease.inOutSine);
      const floorG = c.createLinearGradient(0, HZ, 0, 900);
      floorG.addColorStop(0, '#12062a');
      floorG.addColorStop(1, NEON.bg);
      c.globalAlpha = floorA;
      c.fillStyle = floorG;
      c.fillRect(-1200, HZ, 4000, 900);
      c.globalAlpha = 1;
      gridFloor(N, {
        hz: HZ,
        vx: 800,
        scroll: stageScroll(t),
        col: NEON.magenta,
        a: floorA * lerp(1, 0.75, water),
        water,
        t: t + pan * 9,
        bottom: 1000,
        x0: -1400,
        x1: 3000,
      });
      N.with(
        () => N.translate(cityDx, HZ),
        () => drawRefl(N, s, t, water, water * clamp(sunUp) * (1 - 0.5 * pan), 220 * pan * 0.4)
      );

      // the line itself: grows out from the centre with a stutter
      const lineK = tween(t, 0.35, 1.5, ease.outExpo);
      const lineOn = flick(t, 0.3, 0.7, 3) * hum(t, 1);
      const half = 1400 * lineK;
      const lineCol = NEON.cyan;
      N.tube(line(800 - half, HZ, 800 + half, HZ), lineCol, 2.6, lineOn * (1 - 0.35 * pan), 1.3);

      // bridge slides in, much faster than the city: we are driving onto it
      if (pan > 0) {
        N.with(
          () => N.translate(bx, 0),
          () => drawBridge(N, s, t, clamp(pan * 1.6), seg(t, 10.2, 11.0))
        );
      }
      N.power = 1.05 + 0.3 * flick(t, 0.3, 0.7, 3) * (1 - seg(t, 1, 1.6)) + 1.1 * ease.inCubic(kz);
      N.ab = 1.6 + 6 * ease.inCubic(kz);
      flash = 0.45 * ease.inQuint(seg(t, T_SWAP - 0.35, T_SWAP));
    } else {
      /* ===== D–E: the drive, and away into the horizon ===== */
      const kOut = tween(t, T_SWAP, 13.2, ease.outCubic);
      const z = Math.exp(lerp(Math.log(Z4), 0, kOut));
      const cx = 800;
      const cy = lerp(BAR_Y, 450, kOut);
      N.cam(cx, cy, z);

      const away = tween(t, 15.2, 16.9, ease.inCubic);
      const roadA = 1 - tween(t, 16.4, 17.4, ease.inOutSine);
      const speed = t - T_SWAP;
      const scroll = speed * 3.2 + 2.2 * Math.max(0, t - 15.2) ** 2;

      const sky = c.createLinearGradient(0, 0, 0, HZ);
      sky.addColorStop(0, NEON.bg);
      sky.addColorStop(1, '#1d0a36');
      c.fillStyle = sky;
      c.fillRect(-1200, -600, 4000, HZ + 600);
      drawStars(N, s.stars, t, 1);
      const setK = tween(t, 15.6, 18.4, ease.inOutSine);
      neonSun(N, 800, HZ - 20 + 60 * setK, 190, { clipY: HZ, phase: t * 0.35 });
      // the city ahead, small on the horizon
      N.with(
        () => {
          N.translate(800, HZ);
          N.scale(0.42);
          N.translate(-880, 0);
        },
        () => {
          N.sprite(s.citySmall, hum(t, 2, 0.04));
          beacons(N, s.city, t, 1);
        }
      );
      const floorG = c.createLinearGradient(0, HZ, 0, 900);
      floorG.addColorStop(0, '#12062a');
      floorG.addColorStop(1, NEON.bg);
      c.fillStyle = floorG;
      c.fillRect(-1200, HZ, 4000, 900);
      gridFloor(N, { hz: HZ, vx: 800, scroll: scroll * 0.6, col: NEON.magenta, a: 0.85, bottom: 1000, x0: -1400, x1: 3000 });
      drawRoad(N, t, roadA, scroll);

      // our car, then away down the road
      const sc = lerp(1, 0.012, away);
      const gy = HZ + (CAR_G - HZ) * sc;
      const sway = noise1(t * 0.8, 3) * 10 * (1 - away);
      const bounce = Math.sin(t * 13) * 1.2 * (1 - away);
      if (sc > 0.03) {
        N.with(
          () => {
            N.translate(800 + sway, gy + bounce);
            N.scale(sc);
          },
          () => drawCar(N, s, t, sc, ((scroll * 0.5) % 1 + 1) % 1)
        );
      }
      // the tail-light becomes a dot, then opens into the horizon
      const open = tween(t, 16.75, 17.7, ease.inOutCubic);
      if (sc <= 0.03 || open > 0) {
        const half = lerp(232 * sc, 1500, open);
        const lw = lerp(3.2, 2.6, open);
        const col = open > 0.5 ? NEON.cyan : NEON.red;
        N.tube(line(800 - half, HZ - 140 * sc * (1 - open), 800 + half, HZ - 140 * sc * (1 - open)), NEON.red, lw, 1 - open * 0.6, 1.3);
        if (open > 0) N.tube(line(800 - half, HZ, 800 + half, HZ), col, 2.6, ease.inOutSine(open), 1.3);
      }
      // title
      const ti = flick(t, 17.35, 0.55, 5);
      if (ti > 0) {
        N.sprite(s.title, ti * hum(t, 9));
        N.sprite(s.sub, flick(t, 17.8, 0.4, 8));
      }
      N.power = 1.05 + 0.9 * (1 - seg(t, T_SWAP, 12.3));
      N.ab = 1.6 + 5 * (1 - seg(t, T_SWAP, 12.2)) + 3 * Math.max(0, Math.sin((t - 15.2) * 2)) * (1 - seg(t, 16.6, 17));
      flash = 0.45 * (1 - ease.outCubic(seg(t, T_SWAP, T_SWAP + 0.5)));
    }
    N.end(t, { flash, flashCol: '#ff7a8c' });
  },
};
