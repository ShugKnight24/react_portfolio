import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import {
  TAU,
  clamp,
  lerp,
  seg,
  tween,
  ease,
  noise1,
  mulberry,
  morphPair,
  morph,
  polyPath,
  smoothPath,
  transformPts,
  bez,
  DISPLAY,
  MONO,
  spacedText,
} from '../riso/kit';
import type { Pt } from '../riso/kit';

/*
 * Flame to Motor City. A flame on the Baku waterfront tears off its tip, which becomes a plane;
 * the camera pulls out to a globe while the contrail arcs west, dives into Detroit, swings down
 * into the centre line of a night highway, runs to the skyline, and the flame comes back as one
 * warm window: home.
 */

/** Rough height of the Baku city hill at x */
const hillY = (x: number) =>
  x < 330 ? 576 : x < 560 ? lerp(576, 490, ease.outSine((x - 330) / 230)) : x < 780 ? lerp(490, 520, (x - 560) / 220) : lerp(520, 576, clamp((x - 780) / 230));

const O = 0; // fluorescent orange
const T = 1; // teal
const B = 2; // federal blue
const Y = 3; // yellow

const DUR = 19;

/* Globe-world anchors (screen space of the globe scene) */
const GLOBE_C: Pt = [800, 610];
const GLOBE_R = 300;
const BAKU: Pt = [1004, 448];
const DET: Pt = [574, 452];
const ARC: [Pt, Pt, Pt, Pt] = [BAKU, [BAKU[0] - 70, BAKU[1] - 330], [DET[0] + 150, DET[1] - 320], DET];

/* Baku scene: local flame anchor (tip) and scale on the globe */
const FLAME_BASE: Pt = [1080, 800];
const FLAME_TIP: Pt = [1080, 600];
const S_BAKU = 0.04;
/* Highway scene: vanishing point, mapped to Detroit on the globe */
const HZ = 478;
const VP: Pt = [800, HZ];
const S_DET = 0.04;

/* Final home window (highway local space) */
const HOME: Pt = [749, 372];

/* ---------- small drawing helpers ---------- */

const fillInk = (r: Riso, ink: number, p: Path2D, d = 1, rule: CanvasFillRule = 'nonzero') => {
  if (d <= 0.001) return;
  const c = r.layers[ink];
  c.fillStyle = d >= 0.999 ? '#000' : r.tone(c, d);
  c.fill(p, rule);
};

const knock = (r: Riso, inks: number[], p: Path2D, d = 1) => {
  for (const ink of inks) {
    const c = r.layers[ink];
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = d >= 0.999 ? '#000' : r.tone(c, d);
    c.fill(p);
    c.globalCompositeOperation = 'source-over';
  }
};

const strokeInk = (r: Riso, ink: number, p: Path2D, w: number) => {
  const c = r.layers[ink];
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = '#000';
  c.stroke(p);
};

const knockStroke = (r: Riso, inks: number[], p: Path2D, w: number) => {
  for (const ink of inks) {
    const c = r.layers[ink];
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = w;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = '#000';
    c.stroke(p);
    c.globalCompositeOperation = 'source-over';
  }
};

/** Radial "glow": knock dots out of dark inks so the paper breathes through */
const glowOut = (r: Riso, inks: number[], cx: number, cy: number, r1: number, d: number) => {
  for (const ink of inks) {
    const c = r.layers[ink];
    c.globalCompositeOperation = 'destination-out';
    r.gradient(c, null, { kind: 'radial', cx, cy, r0: 0, r1, from: d, to: 0 }, 8);
    c.globalCompositeOperation = 'source-over';
  }
};

/** Push a transform (and optional clip) on every layer */
const push = (r: Riso, fn: (c: Ctx) => void) => {
  for (const c of r.layers) {
    c.save();
    fn(c);
  }
};
const pop = (r: Riso) => {
  for (const c of r.layers) c.restore();
};

const rectPath = (x: number, y: number, w: number, h: number, p = new Path2D()) => {
  p.rect(x, y, w, h);
  return p;
};
const circlePath = (x: number, y: number, rad: number, p = new Path2D()) => {
  p.moveTo(x + rad, y);
  p.arc(x, y, rad, 0, TAU);
  return p;
};
const ellPath = (x: number, y: number, rx: number, ry: number, p = new Path2D()) => {
  p.moveTo(x + rx, y);
  p.ellipse(x, y, rx, ry, 0, 0, TAU);
  return p;
};

/* ---------- the motif ---------- */

/** Teardrop flame: round base at (cx, by), cusp tip h above; flick 0 is a still flame */
const flamePts = (cx: number, by: number, w: number, h: number, t: number, seed: number, flick = 1, n = 64, m = 1.6): Pt[] => {
  const pts: Pt[] = [];
  const lean = flick * (noise1(t * 1.6 + seed * 3.1, seed) * 0.55 + Math.sin(t * 4.3 + seed) * 0.12) * w;
  const hk = 1 + flick * 0.06 * Math.sin(t * 7.1 + seed * 2);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const s = (1 + Math.cos(th)) / 2;
    const hw = w * Math.sin(th) * Math.pow(Math.abs(Math.sin(th / 2)), m);
    const wob = 1 + flick * 0.1 * Math.sin(t * 9 + s * 11 + seed);
    pts.push([cx + hw * wob + lean * s * s + flick * Math.sin(t * 6 + s * 7 + seed) * 0.08 * w * s, by - h * s * hk]);
  }
  return pts;
};

/** Top-down airliner, nose up, ~100 long, centred */
const planePts = (): Pt[] => {
  const half: Pt[] = [
    [0, -52],
    [4, -48],
    [6.5, -38],
    [7, -14],
    [50, 8],
    [50, 15],
    [7, 6],
    [6, 30],
    [20, 41],
    [20, 47],
    [2, 43],
    [0, 46],
  ];
  const left = half
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [-x, y] as Pt);
  return [...half, ...left];
};

/* ---------- state ---------- */

interface Star {
  x: number;
  y: number;
  r: number;
  ph: number;
}
interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface State {
  plane: Pt[];
  tipShape: Pt[];
  waves: { x: number; y: number; l: number; ph: number }[];
  hillHouses: Path2D;
  stars: Star[];
  continents: Path2D;
  lakes: Path2D;
  clouds: { x: number; y: number; s: number; v: number; puffs: [number, number, number][] }[];
  sky: {
    bodies: Path2D;
    cyls: { p: Path2D; x: number; w: number }[];
    lit: Path2D;
    litWarm: Path2D;
    bands: Path2D;
    bridge: Path2D;
    bridgeLights: Pt[];
    reflect: { x: number; w: number; ph: number; warm: boolean }[];
  };
}

/* ---------- Baku ---------- */

const drawPumpjack = (r: Riso, x: number, y: number, s: number, t: number, ph: number) => {
  const th = 0.24 * Math.sin(t * 2.1 + ph);
  const crank = t * 2.1 + ph;
  const p = new Path2D();
  // trestle platform in the water
  rectPath(x - 95 * s, y, 210 * s, 9 * s, p);
  for (let i = 0; i < 5; i++) rectPath(x - 88 * s + i * 48 * s, y + 8 * s, 5 * s, 70 * s, p);
  // skid
  rectPath(x - 80 * s, y - 8 * s, 170 * s, 8 * s, p);
  // samson post (A frame)
  p.moveTo(x - 28 * s, y - 8 * s);
  p.lineTo(x - 2 * s, y - 96 * s);
  p.lineTo(x + 2 * s, y - 96 * s);
  p.lineTo(x + 28 * s, y - 8 * s);
  p.lineTo(x + 18 * s, y - 8 * s);
  p.lineTo(x, y - 72 * s);
  p.lineTo(x - 18 * s, y - 8 * s);
  p.closePath();
  // gearbox and crank
  const gx = x - 62 * s;
  const gy = y - 26 * s;
  rectPath(gx - 14 * s, gy - 4 * s, 28 * s, 22 * s, p);
  const cpx = gx + Math.cos(crank) * 20 * s;
  const cpy = gy + Math.sin(crank) * 20 * s;
  const cw = new Path2D();
  cw.moveTo(gx, gy);
  cw.lineTo(cpx, cpy);
  // walking beam
  const ax = x;
  const ay = y - 98 * s;
  const c = Math.cos(th);
  const si = Math.sin(th);
  const loc = (u: number, v: number): Pt => [ax + u * c - v * si, ay + u * si + v * c];
  const beam: Pt[] = [loc(-66 * s, -5 * s), loc(92 * s, -5 * s), loc(92 * s, 5 * s), loc(-66 * s, 5 * s)];
  polyPath(beam, true, p);
  // horse head
  const head: Pt[] = [
    loc(86 * s, -9 * s),
    loc(104 * s, -6 * s),
    loc(114 * s, 8 * s),
    loc(114 * s, 30 * s),
    loc(108 * s, 44 * s),
    loc(100 * s, 44 * s),
    loc(104 * s, 26 * s),
    loc(98 * s, 8 * s),
    loc(86 * s, 6 * s),
  ];
  polyPath(head, true, p);
  // counterweight end, pitman arm
  const end = loc(-66 * s, 0);
  cw.moveTo(end[0], end[1]);
  cw.lineTo(cpx, cpy);
  const hb = loc(108 * s, 44 * s);
  cw.moveTo(hb[0], hb[1]);
  cw.lineTo(hb[0], y - 8 * s);
  const wh = new Path2D();
  circlePath(cpx, cpy, 6 * s, wh);
  circlePath(gx, gy, 9 * s, wh);
  fillInk(r, B, p);
  fillInk(r, T, p, 0.85);
  fillInk(r, B, wh);
  fillInk(r, T, wh);
  strokeInk(r, B, cw, 5 * s);
  strokeInk(r, T, cw, 5 * s);
  // sunset rim on the beam
  const rim = new Path2D();
  const a = loc(-60 * s, -5 * s);
  const b2 = loc(90 * s, -5 * s);
  rim.moveTo(a[0], a[1]);
  rim.lineTo(b2[0], b2[1]);
  strokeInk(r, O, rim, 2.2 * s);
};

const drawBaku = (r: Riso, t: number, s: State, stretch: number, tipGone: boolean) => {
  const sky = rectPath(-2500, -2600, 6600, 2600 + 576);
  r.gradient(r.layers[Y], sky, { kind: 'linear', x0: 0, y0: -200, x1: 0, y1: 576, from: 0.18, to: 1 }, 12);
  r.gradient(r.layers[O], sky, { kind: 'linear', x0: 0, y0: 40, x1: 0, y1: 576, from: 0, to: 0.8 }, 12);
  r.gradient(r.layers[B], sky, { kind: 'linear', x0: 0, y0: -300, x1: 0, y1: 360, from: 0.7, to: 0 }, 10);
  // sun sinking into the Caspian
  const sunY = 560 + t * 3;
  const sun = circlePath(820, sunY, 112);
  knock(r, [O, B], sun);
  fillInk(r, Y, sun);
  const sunRing = new Path2D();
  sunRing.arc(820, sunY, 150, 0, TAU);
  sunRing.arc(820, sunY, 118, 0, TAU, true);
  fillInk(r, O, sunRing, 0.25, 'evenodd');

  // Flame Towers: three flame-shaped silhouettes with flames playing on their skins
  const towers: [number, number, number, number][] = [
    [548, 488, 36, 205],
    [622, 478, 40, 250],
    [694, 492, 34, 190],
  ];
  const tw = new Path2D();
  const twPts: Pt[][] = [];
  for (const [x, by, w, h] of towers) {
    const pts = flamePts(x, by + 40, w, h + 40, 0, 0, 0, 64, 0.9);
    twPts.push(pts);
    smoothPath(pts, true, 0.5, tw);
  }
  fillInk(r, B, tw);
  fillInk(r, T, tw, 0.55);
  towers.forEach(([x, by, w, h], i) => {
    const inner = smoothPath(flamePts(x + 2, by + 18, w * 0.7, h * (0.62 + 0.06 * Math.sin(t * 2 + i)), t * 1.3, i + 3, 0.8));
    const c = r.layers[B];
    c.save();
    c.clip(smoothPath(twPts[i]));
    knock(r, [B, T], inner, 0.85);
    fillInk(r, O, inner);
    fillInk(r, Y, inner, 0.45);
    c.restore();
  });
  // floor lines on the towers
  {
    const fl = new Path2D();
    for (let y = 300; y < 520; y += 10) fl.rect(500, y, 240, 1.6);
    for (const ink of [B, T]) {
      const c = r.layers[ink];
      c.save();
      c.clip(tw);
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      c.fill(fl);
      c.globalCompositeOperation = 'source-over';
      c.restore();
    }
  }

  // city hill
  const hill = new Path2D();
  hill.moveTo(-2500, 576);
  hill.lineTo(330, 576);
  hill.bezierCurveTo(400, 560, 470, 502, 560, 490);
  hill.bezierCurveTo(650, 478, 720, 488, 780, 520);
  hill.bezierCurveTo(860, 552, 940, 572, 1010, 576);
  hill.closePath();
  fillInk(r, B, hill, 0.75);
  fillInk(r, T, hill, 0.6);
  fillInk(r, B, s.hillHouses);
  // tiny lit windows on the hill
  {
    const lit = new Path2D();
    const rng = mulberry(91);
    for (let i = 0; i < 60; i++) {
      const x = 380 + rng() * 600;
      const y = hillY(x) + 8 + rng() * 40;
      if (y < 572) lit.rect(x, y, 3, 2.4);
    }
    knock(r, [B, T], lit);
    fillInk(r, Y, lit);
  }

  // Yanar Dag: burning hillside
  const yd = new Path2D();
  yd.moveTo(1010, 576);
  yd.bezierCurveTo(1100, 560, 1180, 500, 1300, 470);
  yd.bezierCurveTo(1420, 440, 1520, 452, 1640, 470);
  yd.lineTo(4100, 500);
  yd.lineTo(4100, 576);
  yd.closePath();
  fillInk(r, B, yd);
  fillInk(r, T, yd, 0.7);
  for (const ink of [B, T]) {
    r.layers[ink].save();
    r.layers[ink].clip(yd);
  }
  glowOut(r, [B, T], 1330, 545, 150, 0.55);
  for (const ink of [B, T]) r.layers[ink].restore();
  {
    const fire = new Path2D();
    const core = new Path2D();
    for (let i = 0; i < 13; i++) {
      const x = 1230 + i * 17 + Math.sin(i * 2.3) * 5;
      const by = 552 - (i - 6) * (i - 6) * -0.15 - i * 0.4;
      const h = 26 + 22 * Math.abs(Math.sin(i * 1.7)) + 8 * Math.sin(t * 5 + i);
      polyPath(flamePts(x, by, 9, h, t * 1.4, i * 1.9, 1, 28), true, fire);
      polyPath(flamePts(x, by, 4.5, h * 0.55, t * 1.4, i * 1.9, 1, 20), true, core);
    }
    rectPath(1222, 546, 228, 10, fire);
    knock(r, [B, T], fire);
    fillInk(r, O, fire);
    fillInk(r, Y, fire, 0.5);
    fillInk(r, Y, core);
  }

  // the Caspian
  const sea = rectPath(-2500, 576, 6600, 2600);
  r.gradient(r.layers[B], sea, { kind: 'linear', x0: 0, y0: 576, x1: 0, y1: 880, from: 0.5, to: 0.95 }, 10);
  fillInk(r, T, sea, 0.4);
  r.gradient(r.layers[O], sea, { kind: 'linear', x0: 0, y0: 576, x1: 0, y1: 700, from: 0.35, to: 0 }, 6);
  // sun path on the water
  {
    const glint = new Path2D();
    for (let i = 0; i < 18; i++) {
      const y = 584 + i * i * 0.9 + i * 6;
      const w = 210 - i * 7 + 30 * Math.sin(t * 1.7 + i * 1.3);
      const x = 820 + 14 * Math.sin(t * 1.1 + i * 0.8) - w / 2;
      glint.rect(x, y, w, 3 + i * 0.25);
    }
    knock(r, [B, T], glint);
    fillInk(r, Y, glint);
    fillInk(r, O, glint, 0.45);
  }
  // wave dashes
  {
    const wv = new Path2D();
    for (const w of s.waves) {
      const x = w.x + Math.sin(t * 0.8 + w.ph) * 14;
      wv.rect(x, w.y, w.l, 1.8);
    }
    knock(r, [B], wv);
  }
  drawPumpjack(r, 300, 606, 0.62, t, 1.4);
  drawPumpjack(r, 150, 650, 1.05, t, 0);

  // boulevard parapet
  const wall = new Path2D();
  wall.moveTo(-2500, 846);
  wall.lineTo(4100, 846);
  wall.lineTo(4100, 2600);
  wall.lineTo(-2500, 2600);
  wall.closePath();
  const rail = rectPath(-2500, 836, 6600, 12);
  fillInk(r, B, wall);
  fillInk(r, T, wall, 0.8);
  fillInk(r, B, rail);
  fillInk(r, O, rectPath(-2500, 836, 6600, 4), 0.7);
  // brazier
  const [fx, fy] = FLAME_BASE;
  const bowl = new Path2D();
  bowl.moveTo(fx - 70, fy);
  bowl.bezierCurveTo(fx - 64, fy + 30, fx - 30, fy + 40, fx - 12, fy + 42);
  bowl.lineTo(fx - 10, fy + 60);
  bowl.lineTo(fx - 30, fy + 70);
  bowl.lineTo(fx + 30, fy + 70);
  bowl.lineTo(fx + 10, fy + 60);
  bowl.lineTo(fx + 12, fy + 42);
  bowl.bezierCurveTo(fx + 30, fy + 40, fx + 64, fy + 30, fx + 70, fy);
  bowl.closePath();
  // warm glow around the flame
  {
    const c = r.layers[O];
    r.gradient(c, null, { kind: 'radial', cx: fx, cy: fy - 70, r0: 0, r1: 260, from: 0.35, to: 0 }, 10);
  }
  fillInk(r, B, bowl);
  fillInk(r, T, bowl);
  const lip = ellPath(fx, fy, 70, 7);
  knock(r, [B, T], lip);
  fillInk(r, O, lip);
  fillInk(r, Y, lip);
  const sheen = new Path2D();
  sheen.moveTo(fx - 60, fy + 10);
  sheen.bezierCurveTo(fx - 52, fy + 28, fx - 34, fy + 36, fx - 18, fy + 38);
  strokeInk(r, O, sheen, 4);

  // the flame
  const h = 200 + stretch * 70;
  const w = 48 - stretch * 10;
  const main = smoothPath(flamePts(fx, fy + 4, w, tipGone ? h * 0.82 : h, t, 1));
  const core = smoothPath(flamePts(fx, fy + 4, w * 0.52, h * 0.55, t, 1.5));
  knock(r, [B, T], main);
  fillInk(r, O, main);
  fillInk(r, Y, main, 0.35);
  fillInk(r, Y, core);
};

/* ---------- globe ---------- */

const drawGlobe = (r: Riso, t: number, s: State, px: number) => {
  const bg = rectPath(-6000, -6000, 14000, 14000);
  r.gradient(r.layers[Y], bg, { kind: 'radial', cx: GLOBE_C[0], cy: GLOBE_C[1], r0: GLOBE_R, r1: 1000, from: 0.5, to: 0.06 }, 10);
  r.gradient(r.layers[T], bg, { kind: 'radial', cx: GLOBE_C[0], cy: GLOBE_C[1], r0: 600, r1: 1300, from: 0, to: 0.18 }, 6);
  const [gx, gy] = GLOBE_C;
  const globe = circlePath(gx, gy, GLOBE_R);
  const rim = new Path2D();
  rim.arc(gx, gy, GLOBE_R + 16, 0, TAU);
  rim.arc(gx, gy, GLOBE_R, 0, TAU, true);
  knock(r, [Y], rim);
  fillInk(r, O, rim, 0.3, 'evenodd');
  knock(r, [Y, T], globe);
  r.gradient(r.layers[B], globe, { kind: 'radial', cx: gx - 90, cy: gy - 110, r0: 0, r1: GLOBE_R * 1.25, from: 0.4, to: 1 }, 10);
  fillInk(r, T, globe, 0.3);
  // land
  for (const ink of [T, Y, B, O]) {
    r.layers[ink].save();
    r.layers[ink].clip(globe);
  }
  fillInk(r, T, s.continents);
  fillInk(r, Y, s.continents, 0.55);
  knock(r, [B], s.continents, 0.5);
  knock(r, [T, Y], s.lakes);
  // graticule turning slowly
  const gr = new Path2D();
  for (let i = -2; i <= 2; i++) {
    const yy = gy + i * 70;
    const half = Math.sqrt(Math.max(0, GLOBE_R * GLOBE_R - (yy - gy) ** 2));
    gr.moveTo(gx + half, yy);
    gr.ellipse(gx, yy, half, half * 0.12, 0, 0, TAU);
  }
  for (let i = 0; i < 6; i++) {
    const a = ((i / 6) * Math.PI + t * 0.08) % Math.PI;
    const rx = Math.abs(Math.cos(a)) * GLOBE_R;
    gr.moveTo(gx + rx, gy);
    gr.ellipse(gx, gy, rx, GLOBE_R, 0, 0, TAU);
  }
  knockStroke(r, [B, Y], gr, 1.3);
  // terminator shade
  r.gradient(r.layers[B], globe, { kind: 'linear', x0: gx + 80, y0: gy, x1: gx + GLOBE_R, y1: gy + 120, from: 0, to: 0.45 }, 6);
  for (const ink of [T, Y, B, O]) r.layers[ink].restore();

  // Detroit target ring
  const ring = new Path2D();
  ring.arc(DET[0], DET[1], 10 * px, 0, TAU);
  knockStroke(r, [B, T, Y], ring, 5 * px);
  strokeInk(r, O, ring, 2.4 * px);
};

const drawClouds = (r: Riso, t: number, s: State) => {
  for (const cl of s.clouds) {
    const p = new Path2D();
    const x0 = cl.x - t * cl.v;
    for (const [dx, dy, rr] of cl.puffs) circlePath(x0 + dx * cl.s, cl.y + dy * cl.s, rr * cl.s, p);
    const flat = rectPath(x0 - 90 * cl.s, cl.y + 6 * cl.s, 180 * cl.s, 22 * cl.s);
    knock(r, [Y, B, T, O], p);
    knock(r, [Y, B, T, O], flat);
    const shade = new Path2D();
    for (const [dx, dy, rr] of cl.puffs) circlePath(x0 + dx * cl.s + 6 * cl.s, cl.y + dy * cl.s + 10 * cl.s, rr * cl.s * 0.85, shade);
    const c = r.layers[B];
    c.save();
    c.clip(p);
    fillInk(r, B, shade, 0.22);
    c.restore();
    fillInk(r, B, flat, 0.22);
  }
};

/* ---------- Detroit night ---------- */

const rx = (a: number, q: number) => 800 + a * 900 * q;
const ry = (q: number) => HZ + 422 * q;

const drawSkyline = (r: Riso, t: number, s: State, home: number) => {
  const k = s.sky;
  // river
  const river = rectPath(-3000, 466, 7600, 12);
  fillInk(r, B, river, 0.8);
  fillInk(r, T, river, 0.5);
  {
    const rf = new Path2D();
    const rw = new Path2D();
    for (const d of k.reflect) {
      const x = d.x + Math.sin(t * 2 + d.ph) * 1.5;
      const w = d.w * (0.7 + 0.3 * Math.sin(t * 3 + d.ph * 2));
      (d.warm ? rw : rf).rect(x - w / 2, 468 + (d.ph % 3) * 3, w, 1.2);
    }
    knock(r, [B, T], rf);
    knock(r, [B, T], rw);
    fillInk(r, Y, rf);
    fillInk(r, O, rw);
  }
  // buildings
  fillInk(r, B, k.bodies);
  fillInk(r, T, k.bodies, 0.7);
  for (const c of k.cyls) {
    fillInk(r, B, c.p);
    r.gradient(r.layers[T], c.p, { kind: 'linear', x0: c.x - c.w / 2, y0: 0, x1: c.x + c.w / 2, y1: 0, from: 0.15, to: 1 }, 6);
  }
  knock(r, [B, T], k.bands, 0.6);
  // bridge
  strokeInk(r, B, k.bridge, 1.1);
  strokeInk(r, T, k.bridge, 1.1);
  {
    const bl = new Path2D();
    for (const [x, y] of k.bridgeLights) circlePath(x, y, 0.9, bl);
    knock(r, [B, T], bl);
    fillInk(r, O, bl);
  }
  // lit windows (a few blink)
  knock(r, [B, T], k.lit);
  fillInk(r, Y, k.lit);
  knock(r, [B, T], k.litWarm);
  fillInk(r, O, k.litWarm);
  fillInk(r, Y, k.litWarm, 0.4);

  // smoke from the stacks
  {
    const sm = new Path2D();
    for (let st = 0; st < 3; st++) {
      const sx = 495 + st * 25;
      const sy = 466 - (62 + st * 4);
      for (let i = 0; i < 6; i++) {
        const f = (i / 6 + t * 0.12 + st * 0.13) % 1;
        circlePath(sx + f * 40 + Math.sin(f * 6 + st) * 3, sy - f * 50, 3 + f * 9, sm);
      }
    }
    fillInk(r, T, sm, 0.18);
    fillInk(r, O, sm, 0.12);
  }

  // home: one window becomes a flame
  if (home > 0) {
    const [hx, hy] = HOME;
    const pulse = 0.85 + 0.15 * Math.sin(t * 3.2);
    glowOut(r, [B, T], hx, hy - 3, 8 + 26 * home, 0.85 * home * pulse);
    r.gradient(r.layers[O], circlePath(hx, hy - 3, 34 * home), { kind: 'radial', cx: hx, cy: hy - 3, r0: 0, r1: 32 * home, from: 0.8 * home, to: 0 }, 8);
    r.gradient(r.layers[Y], circlePath(hx, hy - 3, 14 * home), { kind: 'radial', cx: hx, cy: hy - 3, r0: 0, r1: 13 * home, from: 0.5 * home, to: 0 }, 5);
    const win = rectPath(hx - 2.4, hy - 1.2, 4.8, 3.6);
    knock(r, [B, T], win);
    fillInk(r, O, win);
    fillInk(r, Y, win, 0.5);
    const fl = smoothPath(flamePts(hx, hy + 2.4, 3.6 * home, 15 * home, t, 4, 1, 48));
    knock(r, [B, T], fl);
    fillInk(r, O, fl);
    fillInk(r, Y, smoothPath(flamePts(hx, hy + 2.4, 1.8 * home, 8 * home, t, 4.5, 1, 40)));
  }
};

const drawHighway = (r: Riso, t: number, s: State, home: number) => {
  // night sky
  const sky = rectPath(-3000, -3000, 7600, 3000 + HZ);
  r.gradient(r.layers[B], sky, { kind: 'linear', x0: 0, y0: -100, x1: 0, y1: HZ, from: 1, to: 0.45 }, 12);
  fillInk(r, T, sky, 0.16);
  r.gradient(r.layers[O], sky, { kind: 'linear', x0: 0, y0: 250, x1: 0, y1: HZ, from: 0, to: 0.6 }, 8);
  r.gradient(r.layers[Y], sky, { kind: 'linear', x0: 0, y0: 380, x1: 0, y1: HZ, from: 0, to: 0.35 }, 5);
  {
    const st = new Path2D();
    for (const p of s.stars) {
      const tw = 0.6 + 0.4 * Math.sin(t * 2.5 + p.ph);
      circlePath(p.x, p.y, p.r * tw, st);
    }
    knock(r, [B, T], st);
    fillInk(r, Y, st, 0.6);
  }
  // ground
  const ground = rectPath(-3000, HZ, 7600, 3000);
  fillInk(r, B, ground);
  fillInk(r, T, ground, 0.75);
  drawSkyline(r, t, s, home);

  // road
  const road = new Path2D();
  road.moveTo(rx(-1, 0), ry(0));
  road.lineTo(rx(1, 0), ry(0));
  road.lineTo(rx(1, 4), ry(4));
  road.lineTo(rx(-1, 4), ry(4));
  road.closePath();
  knock(r, [T], road, 0.6);
  // shoulders
  const edges = new Path2D();
  for (const a of [-1, 1]) {
    edges.moveTo(rx(a * 0.98, 0.02), ry(0.02));
    edges.lineTo(rx(a * 0.98, 4), ry(4));
  }
  knockStroke(r, [B], edges, 2);

  // light streams
  const head = new Path2D();
  const tail = new Path2D();
  const quad = (p: Path2D, a: number, z1: number, z2: number) => {
    const q1 = 1 / Math.max(0.25, z1);
    const q2 = 1 / Math.max(0.25, z2);
    const aw = 0.012;
    p.moveTo(rx(a - aw, q1), ry(q1));
    p.lineTo(rx(a + aw, q1), ry(q1));
    p.lineTo(rx(a + aw, q2), ry(q2));
    p.lineTo(rx(a - aw, q2), ry(q2));
    p.closePath();
  };
  for (let i = 0; i < 14; i++) {
    const lane = i % 2 === 0 ? -0.62 : -0.34;
    const f = (t * 0.22 + i * 0.4142) % 1;
    const z = lerp(40, 0.3, f);
    quad(head, lane - 0.035, z, z + 2.2);
    quad(head, lane + 0.035, z, z + 2.2);
  }
  for (let i = 0; i < 14; i++) {
    const lane = i % 2 === 0 ? 0.34 : 0.62;
    const f = (t * 0.1 + i * 0.618) % 1;
    const z = lerp(0.6, 40, f);
    quad(tail, lane - 0.035, z, Math.max(0.3, z - 1.6));
    quad(tail, lane + 0.035, z, Math.max(0.3, z - 1.6));
  }
  knock(r, [B, T], head);
  fillInk(r, Y, head, 0.5);
  knock(r, [B, T], tail);
  fillInk(r, O, tail);

  // street lamps passing
  const poles = new Path2D();
  const lamps = new Path2D();
  for (let i = 0; i < 8; i++) {
    const z = 30 - ((t * 6 + i * 4) % 32);
    if (z < 0.35) continue;
    const q = 1 / z;
    for (const a of [-1.2, 1.2]) {
      const x = rx(a, q);
      const y = ry(q);
      const h = 300 * q;
      poles.moveTo(x, y);
      poles.lineTo(x, y - h);
      poles.lineTo(x - Math.sign(a) * 70 * q, y - h - 6 * q);
      circlePath(x - Math.sign(a) * 70 * q, y - h + 3 * q, 7 * q + 0.6, lamps);
    }
  }
  strokeInk(r, B, poles, 1.2);
  strokeInk(r, T, poles, 1.2);
  knock(r, [B, T], lamps);
  fillInk(r, O, lamps);
  fillInk(r, Y, lamps);
};

/** Contrail in highway local space: the arrival curve, then swung down onto the road */
const highwayLine = (r: Riso, t: number, swing: number, dash: number) => {
  const n = 40;
  const curve: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const u = 1 - (i / (n - 1)) * 0.5;
    const g = bez(ARC[0], ARC[1], ARC[2], ARC[3], u);
    curve.push([VP[0] + (g[0] - DET[0]) / S_DET, VP[1] + (g[1] - DET[1]) / S_DET]);
  }
  const p = new Path2D();
  if (dash < 0.01) {
    const far = curve[curve.length - 1];
    let full = Math.PI / 2 - Math.atan2(far[1] - VP[1], far[0] - VP[0]);
    while (full < 0) full += TAU;
    while (full > TAU) full -= TAU;
    const ang = swing * full;
    const c = Math.cos(ang);
    const si = Math.sin(ang);
    const pts = curve.map(([x, y], i): Pt => {
      const dx = x - VP[0];
      const dy = y - VP[1];
      const rot: Pt = [VP[0] + dx * c - dy * si, VP[1] + dx * si + dy * c];
      const len = Math.hypot(dx, dy);
      const straight: Pt = [VP[0], VP[1] + len * 0.6];
      void i;
      return [lerp(rot[0], straight[0], swing * swing), lerp(rot[1], straight[1], swing * swing)];
    });
    polyPath(pts, false, p);
    knockStroke(r, [B, T], p, 7);
    strokeInk(r, O, p, 5);
    strokeInk(r, Y, p, 2);
    return;
  }
  // dashed centre line in perspective, moving toward the viewer
  const gap = dash;
  for (let k = 0; k < 40; k++) {
    const z0 = 0.35 + k * 1.2 - ((t * 6) % 1.2);
    const z1 = z0 + 1.2 * (1 - 0.55 * gap);
    if (z0 <= 0.2) continue;
    const q0 = 1 / z0;
    const q1 = 1 / z1;
    const aw = 0.009;
    p.moveTo(rx(-aw, q0), ry(q0));
    p.lineTo(rx(aw, q0), ry(q0));
    p.lineTo(rx(aw, q1), ry(q1));
    p.lineTo(rx(-aw, q1), ry(q1));
    p.closePath();
  }
  knock(r, [B, T], p);
  fillInk(r, O, p);
  fillInk(r, Y, p, 0.6);
};

/* ---------- film ---------- */

export const bakuDetroitFilm: RisoFilm<State> = {
  id: 'baku-detroit',
  title: 'Flame to Motor City',
  caption: 'From the Land of Fire on the Caspian to the Motor City on the river.',
  theme: 'Origins',
  motif: 'A flame that becomes a plane, a road and a window',
  duration: DUR,
  paper: '#f3ead8',
  inks: [
    { color: '#ff6c2f', offset: [1.5, -1] },
    { color: '#00838a', offset: [-1.2, 0.8] },
    { color: '#3d5588', offset: [0, 0] },
    { color: '#ffe800', offset: [0.8, 1.2] },
  ],
  scenes: [
    { at: 0, label: 'Land of Fire' },
    { at: 4, label: 'Lift-off' },
    { at: 9.6, label: 'Descent' },
    { at: 12.9, label: 'Motor City' },
    { at: 15.3, label: 'Home' },
  ],
  posterTime: 2.6,

  setup() {
    const rng = mulberry(1979);
    const tip = flamePts(0, 30, 17, 82, 0, 0, 0, 72);
    const [tipShape, plane] = morphPair(tip, planePts(), 120);

    const waves = Array.from({ length: 70 }, () => ({
      x: -100 + rng() * 1800,
      y: 600 + rng() * 240,
      l: 10 + rng() * 40,
      ph: rng() * TAU,
    }));
    const hillHouses = new Path2D();
    for (let i = 0; i < 40; i++) {
      const x = 370 + rng() * 600;
      if (x > 510 && x < 730) continue;
      const w = 10 + rng() * 16;
      const top = Math.max(hillY(x), hillY(x + w)) - 4 - rng() * 8;
      hillHouses.rect(x, top, w, 18);
    }

    const stars = Array.from({ length: 110 }, () => ({
      x: -400 + rng() * 2400,
      y: -400 + rng() * 780,
      r: 0.8 + rng() * 1.6,
      ph: rng() * TAU,
    }));

    // continents: soft blobs
    const blob = (cx: number, cy: number, rxx: number, ryy: number, seed: number) => {
      const pts: Pt[] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        const k = 1 + noise1(i * 0.35, seed) * 0.22 + noise1(i * 1.1, seed + 3) * 0.08;
        pts.push([cx + Math.cos(a) * rxx * k, cy + Math.sin(a) * ryy * k]);
      }
      return pts;
    };
    const continents = new Path2D();
    smoothPath(blob(560, 430, 150, 105, 1), true, 0.5, continents); // North America
    smoothPath(blob(690, 330, 40, 22, 2), true, 0.5, continents); // Greenland
    smoothPath(blob(650, 700, 62, 120, 3), true, 0.5, continents); // South America
    smoothPath(blob(925, 410, 80, 52, 4), true, 0.5, continents); // Europe
    smoothPath(blob(935, 640, 88, 125, 5), true, 0.5, continents); // Africa
    smoothPath(blob(1090, 420, 130, 120, 6), true, 0.5, continents); // Asia
    const lakes = new Path2D();
    ellPath(BAKU[0] + 12, BAKU[1] - 4, 8, 20, lakes); // Caspian
    ellPath(578, 432, 9, 4, lakes);
    ellPath(565, 423, 4, 9, lakes);
    ellPath(590, 438, 7, 3, lakes);
    ellPath(552, 418, 10, 4, lakes);

    const puff = (): [number, number, number][] => [
      [-50, 0, 30],
      [-12, -18, 40],
      [30, -6, 34],
      [62, 6, 24],
      [-82, 12, 18],
    ];
    const clouds = [
      { x: 330, y: 250, s: 1.1, v: 9, puffs: puff() },
      { x: 1330, y: 210, s: 0.9, v: 6, puffs: puff() },
      { x: 1260, y: 760, s: 1.2, v: 12, puffs: puff() },
      { x: 360, y: 790, s: 1, v: 10, puffs: puff() },
    ];

    // skyline
    const bodies = new Path2D();
    const cyls: { p: Path2D; x: number; w: number }[] = [];
    const lit = new Path2D();
    const litWarm = new Path2D();
    const bands = new Path2D();
    const base = 466;
    const wins: Win[] = [];
    const block = (x: number, w: number, h: number, p = bodies) => {
      p.rect(x - w / 2, base - h, w, h);
      for (let y = base - h + 3; y < base - 3; y += 3.2) {
        for (let xx = x - w / 2 + 1.6; xx < x + w / 2 - 1.6; xx += 2.6) {
          if (rng() < 0.18) wins.push({ x: xx, y, w: 1.3, h: 1.4 });
        }
      }
    };
    // industrial edge
    bodies.moveTo(470, base);
    for (let i = 0; i < 6; i++) {
      bodies.lineTo(470 + i * 18, base - 16);
      bodies.lineTo(470 + i * 18, base - 24);
      bodies.lineTo(470 + (i + 1) * 18, base - 16);
    }
    bodies.lineTo(578, base);
    bodies.closePath();
    for (let st = 0; st < 3; st++) {
      const sx = 495 + st * 25;
      const h = 62 + st * 4;
      bodies.rect(sx - 2.6, base - h, 5.2, h);
      for (let y = base - h + 6; y < base - 20; y += 9) bands.rect(sx - 2.6, y, 5.2, 0.7);
    }
    // water tower
    bodies.rect(446, base - 52, 20, 14);
    bodies.ellipse(456, base - 52, 10, 4, 0, 0, TAU);
    bodies.moveTo(456, base - 64);
    bodies.lineTo(447, base - 52);
    bodies.lineTo(465, base - 52);
    bodies.closePath();
    for (const lx of [448, 454, 458, 464]) bodies.rect(lx - 0.6, base - 40, 1.2, 40);
    for (let y = base - 50; y < base - 39; y += 3) bands.rect(446, y, 20, 0.6);
    // blocks around the cluster
    const blocks: [number, number, number][] = [
      [596, 20, 40],
      [618, 16, 56],
      [642, 24, 46],
      [668, 18, 66],
      [690, 14, 50],
      [796, 18, 72],
      [814, 14, 52],
      [872, 20, 58],
      [892, 14, 40],
      [1130, 18, 16],
      [1150, 12, 24],
      [1170, 22, 14],
      [1195, 16, 20],
      [1220, 26, 12],
    ];
    for (const [x, w, h] of blocks) block(x, w, h);
    // art-deco stepped tower
    {
      const x = 845;
      block(x, 26, 60);
      block(x, 18, 88);
      block(x, 10, 100);
      bodies.moveTo(x - 5, base - 100);
      bodies.lineTo(x, base - 122);
      bodies.lineTo(x + 5, base - 100);
      bodies.closePath();
    }
    // cylinder cluster
    const cyl = (x: number, w: number, h: number) => {
      const p = new Path2D();
      p.rect(x - w / 2, base - h, w, h);
      p.ellipse(x, base - h, w / 2, w * 0.12, 0, 0, TAU);
      cyls.push({ p, x, w });
      for (let y = base - h + 4; y < base - 2; y += 3) {
        bands.rect(x - w / 2, y, w, 0.45);
        for (let xx = x - w / 2 + 1.2; xx < x + w / 2 - 1.2; xx += 2.2) {
          if (rng() < 0.16) wins.push({ x: xx, y: y + 0.8, w: 1.2, h: 1.3 });
        }
      }
    };
    cyl(726, 13, 74);
    cyl(772, 13, 74);
    cyl(736, 14, 64);
    cyl(763, 14, 64);
    cyl(749, 22, 122);
    bodies.rect(745, base - 132, 8, 10);
    bodies.rect(748.4, base - 142, 1.2, 10);
    for (const w of wins) {
      if (Math.hypot(w.x - HOME[0], w.y - HOME[1]) < 5) continue;
      (rng() < 0.2 ? litWarm : lit).rect(w.x, w.y, w.w, w.h);
    }

    // bridge to the other shore
    const bridge = new Path2D();
    const deckY = 454;
    bridge.moveTo(902, deckY);
    bridge.lineTo(1124, deckY);
    for (const tx of [950, 1076]) {
      bridge.moveTo(tx, base);
      bridge.lineTo(tx, deckY - 52);
    }
    const cable = (x: number) => {
      if (x < 950) return lerp(deckY, deckY - 52, (x - 902) / 48);
      if (x > 1076) return lerp(deckY - 52, deckY, (x - 1076) / 48);
      const k = (x - 1013) / 63;
      return deckY - 52 + (1 - k * k) * 46;
    };
    bridge.moveTo(902, deckY);
    for (let x = 904; x <= 1124; x += 2) bridge.lineTo(x, cable(x));
    for (let x = 908; x < 1122; x += 5) {
      bridge.moveTo(x, deckY);
      bridge.lineTo(x, cable(x));
    }
    for (let x = 902; x < 1124; x += 8) bridge.moveTo(x, deckY), bridge.lineTo(x + 1, base);
    const bridgeLights: Pt[] = [];
    for (let x = 906; x < 1124; x += 9) bridgeLights.push([x, deckY - 1.2]);
    bridgeLights.push([950, deckY - 53], [1076, deckY - 53]);

    const reflect = Array.from({ length: 70 }, () => ({
      x: 440 + rng() * 820,
      w: 2 + rng() * 9,
      ph: rng() * 9,
      warm: rng() < 0.35,
    }));

    return {
      plane,
      tipShape,
      waves,
      hillHouses,
      stars,
      continents,
      lakes,
      clouds,
      sky: { bodies, cyls, lit, litWarm, bands, bridge, bridgeLights, reflect },
    };
  },

  draw(r, t, s) {
    /* ---- camera through Baku -> globe -> Detroit (globe-world coordinates) ---- */
    const bakuZoom = lerp(1, 1.09, tween(t, 0, 4.6, ease.inOutSine));
    const bakuC: Pt = [lerp(800, 900, tween(t, 0, 4.6, ease.inOutSine)), lerp(450, 500, tween(t, 0, 4.6, ease.inOutSine))];
    const toG = (l: Pt, anchorL: Pt, anchorG: Pt, sc: number): Pt => [anchorG[0] + (l[0] - anchorL[0]) * sc, anchorG[1] + (l[1] - anchorL[1]) * sc];

    if (t < 11.3) {
      let Z: number;
      let C: Pt;
      const z0 = (lerp(1, 1.09, 1) / S_BAKU);
      const c0 = toG([900, 500], FLAME_TIP, BAKU, S_BAKU);
      const z2 = 1 / S_DET;
      const c2 = toG([800, 450], VP, DET, S_DET);
      const drift = lerp(1, 1.04, tween(t, 6.8, 9.6, ease.inOutSine));
      const z1 = drift;
      const c1: Pt = [800, 450];
      if (t < 4.6) {
        Z = bakuZoom / S_BAKU;
        C = toG(bakuC, FLAME_TIP, BAKU, S_BAKU);
      } else if (t < 7.2) {
        const k = tween(t, 4.6, 7.2, ease.inOutSine);
        Z = Math.exp(lerp(Math.log(z0), Math.log(1), k));
        const w = (1 / Z - 1 / z0) / (1 - 1 / z0);
        C = [lerp(c0[0], c1[0], w), lerp(c0[1], c1[1], w)];
      } else if (t < 9.6) {
        Z = z1;
        C = c1;
      } else {
        const k = tween(t, 9.6, 11.3, ease.inOutCubic);
        const za = lerp(1, 1.04, 1);
        Z = Math.exp(lerp(Math.log(za), Math.log(z2), k));
        const w = (1 / za - 1 / Z) / (1 / za - 1 / z2);
        C = [lerp(c1[0], c2[0], w), lerp(c1[1], c2[1], w)];
      }
      r.camera(C[0], C[1], Z);

      const irisOut = t < 4.6 ? 4000 : lerp(2200, 0, tween(t, 4.7, 6.9, ease.inOutSine));
      const bakuIris = Math.min(irisOut, Z * S_BAKU * 1800);
      const irisIn = t < 9.6 ? 0 : lerp(0, 2200, tween(t, 9.9, 11.2, ease.inSine));
      const detIris = Math.min(irisIn, Z * S_DET * 1800);
      const bakuCovers = t < 4.6;

      if (!bakuCovers) {
        drawGlobe(r, t, s, 1 / Z);
        // Baku marker: a tiny flame where we left
        const fz = 1 / Z;
        const mk = smoothPath(flamePts(BAKU[0], BAKU[1] + 9 * fz * 1.4, 6 * fz * 1.4, 22 * fz * 1.4, t, 7, 1, 40));
        knock(r, [B, T, Y], mk);
        fillInk(r, O, mk);
        drawClouds(r, t, s);
      }
      if (bakuIris > 1) {
        const clip = circlePath(BAKU[0], BAKU[1], bakuIris / Z);
        knock(r, [O, T, B, Y], clip);
        push(r, (c) => {
          c.clip(clip);
          c.translate(BAKU[0], BAKU[1]);
          c.scale(S_BAKU, S_BAKU);
          c.translate(-FLAME_TIP[0], -FLAME_TIP[1]);
        });
        const stretch = Math.sin(Math.PI * seg(t, 3.4, 4.5)) * (t < 4.0 ? 1 : 1 - seg(t, 4.0, 4.5) * 0.4);
        drawBaku(r, t, s, stretch, t > 4.0);
        pop(r);
        // iris rim
        if (!bakuCovers) {
          const rim = new Path2D();
          rim.arc(BAKU[0], BAKU[1], bakuIris / Z, 0, TAU);
          strokeInk(r, O, rim, 5 / Z);
        }
      }
      if (detIris > 1) {
        const clip = circlePath(DET[0], DET[1], detIris / Z);
        knock(r, [O, T, B, Y], clip);
        push(r, (c) => {
          c.clip(clip);
          c.translate(DET[0], DET[1]);
          c.scale(S_DET, S_DET);
          c.translate(-VP[0], -VP[1]);
        });
        drawHighway(r, t, s, 0);
        pop(r);
        const rim = new Path2D();
        rim.arc(DET[0], DET[1], detIris / Z, 0, TAU);
        strokeInk(r, O, rim, 5 / Z);
      }

      /* ---- contrail and plane ---- */
      const sp = seg(t, 3.95, 10.05);
      const u = Math.pow(sp, 2.9) * (1.8 - 0.8 * sp);
      if (t > 3.9) {
        const trail: Pt[] = [];
        const n = 80;
        for (let i = 0; i <= n; i++) trail.push(bez(ARC[0], ARC[1], ARC[2], ARC[3], (i / n) * u));
        const tp = polyPath(trail, false);
        knockStroke(r, [B, T, Y], tp, 8 / Z);
        strokeInk(r, O, tp, 6 / Z);
        strokeInk(r, Y, tp, 2.2 / Z);
      }
      if (t > 3.9 && t < 10.2) {
        const m = tween(t, 3.95, 4.9, ease.inOutCubic);
        const pos = bez(ARC[0], ARC[1], ARC[2], ARC[3], u);
        const pos2 = bez(ARC[0], ARC[1], ARC[2], ARC[3], Math.min(1, u + 0.01));
        const pos0 = bez(ARC[0], ARC[1], ARC[2], ARC[3], Math.max(0, u - 0.01));
        const head = Math.atan2(pos2[0] - pos0[0], -(pos2[1] - pos0[1]));
        const rot = lerp(0, head, m);
        const screenScale = lerp(bakuZoom, 0.62, tween(t, 4.6, 7, ease.inOutSine)) * (1 - tween(t, 9.3, 10.15, ease.inCubic));
        const shape = morph(s.tipShape, s.plane, m);
        const wpts = transformPts(shape, pos[0], pos[1], screenScale / Z, rot, 0, 0);
        const p = polyPath(wpts, true);
        knock(r, [Y], p);
        fillInk(r, O, p, 1 - m * 0.75);
        fillInk(r, B, p, m);
        fillInk(r, T, p, m * 0.5);
      }
      return;
    }

    /* ---- Detroit, local highway space ---- */
    const pushK = tween(t, 12.9, 15.0, ease.inOutCubic);
    const homeK = tween(t, 15.6, 17.8, ease.inOutCubic);
    const zA = 1;
    const zB = 2.6;
    const zC = 4.2;
    let Z = Math.exp(lerp(Math.log(zA), Math.log(zB), pushK));
    const cA: Pt = [800, 450];
    const cB: Pt = [762, 400];
    const cC: Pt = [HOME[0], HOME[1] - 26];
    let w = (1 / zA - 1 / Z) / (1 / zA - 1 / zB);
    let C: Pt = [lerp(cA[0], cB[0], w), lerp(cA[1], cB[1], w)];
    if (homeK > 0) {
      Z = Math.exp(lerp(Math.log(zB), Math.log(zC), homeK));
      w = (1 / zB - 1 / Z) / (1 / zB - 1 / zC);
      C = [lerp(cB[0], cC[0], w), lerp(cB[1], cC[1], w)];
    }
    r.camera(C[0], C[1], Z);
    const home = tween(t, 15.3, 16.4, ease.outCubic);
    drawHighway(r, t, s, home);
    const swing = tween(t, 11.3, 12.2, ease.inOutCubic);
    const dash = tween(t, 12.15, 12.7, ease.outCubic);
    highwayLine(r, t, swing, dash);

    /* ---- title ---- */
    r.camera(800, 450, 1);
    const tk = tween(t, 16.3, 17.3, ease.outCubic);
    if (tk > 0) {
      const mask = rectPath(800 - 520 * tk, 40, 1040 * tk, 140);
      for (const c of r.layers) {
        c.save();
        c.clip(mask);
        c.font = `900 50px ${DISPLAY}`;
        c.textAlign = 'center';
        c.textBaseline = 'alphabetic';
      }
      const text = (ink: number, ko: boolean, label: string, y: number, sp: number, font?: string) => {
        const c = r.layers[ink];
        if (font) c.font = font;
        if (ko) c.globalCompositeOperation = 'destination-out';
        c.fillStyle = '#000';
        spacedText(c, label, 800, y, sp);
        c.globalCompositeOperation = 'source-over';
      };
      text(B, true, 'FLAME TO MOTOR CITY', 112, 6);
      text(T, true, 'FLAME TO MOTOR CITY', 112, 6);
      text(O, false, 'FLAME TO MOTOR CITY', 112, 6);
      const sub = `700 20px ${MONO}`;
      text(B, true, 'BAKU  ·  DETROIT', 152, 8, sub);
      text(T, true, 'BAKU  ·  DETROIT', 152, 8, sub);
      text(Y, false, 'BAKU  ·  DETROIT', 152, 8, sub);
      text(O, false, 'BAKU  ·  DETROIT', 152, 8, sub);
      for (const c of r.layers) c.restore();
    }
    void clamp;
  },
};
