import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, hash, mulberry, noise1, type Pt } from '../riso/kit';
import {
  DECO,
  rgba,
  mix,
  poly,
  circle,
  rrect,
  gilt,
  giltStroke,
  goldGrad,
  grad,
  radial,
  glow,
  burstPath,
  fanPath,
  fanRibs,
  beam,
  decoFrame,
  decoText,
  ruleDiamond,
  makeStars,
  drawStars,
  zigguratPts,
  letterGold,
  sheenGrad,
  drawStreamliner,
  EMERALD_TRAIN,
  type Star,
} from '../styles/deco';

/*
 * The Caspian Line. The round light is the motif. A station clock in Baku strikes nine; a
 * streamlined locomotive rushes out of the station arch until its headlamp eclipses the clock and
 * we fall through the lamp onto a steel arch bridge in the mountains. We push into a dining-car
 * window: tea, a globe lamp, the land flowing past, a tunnel, then the sea. Through the window an
 * ocean liner looms up out of the waves and sounds its horn; we push into one porthole and come
 * out over a deco city at night under a full moon.
 */

const DUR = 19.5;

/* S1 */
const CLK = { x: 800, y: 345, R: 110 };
const T_TICK = 1.5;
const T_EMERGE = 2.45;
const T_ECLIPSE = 3.7;
const H0 = 711;
const S0 = 0.42;
const ECL_S = 3.11;
const LAMP_LY = -250;
const LAMP_R = 46;

/* S2 */
const RAIL2 = 470;
const TRAIN2_S = 0.46;
const T_S2 = 3.75;
const T_WIN0 = 6.55;
const T_WIN1 = 7.62;
const T_MASK0 = 7.55;
const T_MASK1 = 8.15;

/* S3 */
const WR = { x: 360, y: 110, w: 880, h: 430, r: 70 };
const WCY = WR.y + WR.h / 2;
const T_TUN = 9.85;
const TUN_V = 2400;
const TUN_L = 1480;
const T_THRU0 = 10.85;
const T_THRU1 = 11.65;

/* S4 */
const T_SEA = 10.3;
const T_HORN = 13.2;
const T_PORT0 = 14.3;
const T_PORT1 = 15.5;

/* S5 */
const T_TITLE = 16.7;

interface State {
  stars2: Star[];
  stars4: Star[];
  stars5: Star[];
  far2: Path2D[];
  mid2: Path2D[];
  city5: HTMLCanvasElement;
  derricks: Path2D;
}

/* ---------- helpers ---------- */

type Cam = [number, number, number];
const toScreen = (cam: Cam, x: number, y: number): Pt => [800 + (x - cam[0]) * cam[2], 450 + (y - cam[1]) * cam[2]];
const logLerp = (a: number, b: number, k: number) => Math.exp(lerp(Math.log(a), Math.log(b), k));

/** Faceted deco mountain range: each peak as a lit and a shaded facet */
const rangePaths = (seed: number, x0: number, x1: number, base: number, hMin: number, hMax: number, wMin: number, wMax: number, snowK = 0.24) => {
  const rng = mulberry(seed);
  const lit = new Path2D();
  const dark = new Path2D();
  const snow = new Path2D();
  let x = x0;
  while (x < x1) {
    const w = lerp(wMin, wMax, rng());
    const h = lerp(hMin, hMax, rng());
    const px = x + w * (0.38 + rng() * 0.24);
    const py = base - h;
    const ridge = px + (rng() - 0.5) * w * 0.15;
    // shoulders so the slopes are not straight
    const lk = 0.45 + rng() * 0.2;
    const ls: Pt = [lerp(px, x, lk) + (rng() - 0.3) * w * 0.08, lerp(py, base, lk) - rng() * h * 0.12];
    const rk = 0.35 + rng() * 0.25;
    const rs: Pt = [lerp(px, x + w, rk) - (rng() - 0.3) * w * 0.08, lerp(py, base, rk) - rng() * h * 0.15];
    lit.moveTo(x, base);
    lit.lineTo(ls[0], ls[1]);
    lit.lineTo(px, py);
    lit.lineTo(ridge, base);
    lit.closePath();
    dark.moveTo(ridge, base);
    dark.lineTo(px, py);
    dark.lineTo(rs[0], rs[1]);
    dark.lineTo(x + w, base);
    dark.closePath();
    if (snowK > 0) {
      const sk = snowK * (0.7 + rng() * 0.6);
      const sy = py + h * sk;
      const lx = lerp(px, ls[0], clamp((sy - py) / (ls[1] - py || 1)));
      const rx = lerp(px, rs[0], clamp((sy - py) / (rs[1] - py || 1)));
      snow.moveTo(px, py);
      snow.lineTo(rx, sy);
      const n = 4;
      for (let i = 1; i < n; i++) {
        const xx = lerp(rx, lx, i / n);
        snow.lineTo(xx, sy + (i % 2 ? -h * 0.06 : h * 0.04));
      }
      snow.lineTo(lx, sy);
      snow.closePath();
    }
    x += w * (0.45 + rng() * 0.25);
  }
  return [lit, dark, snow];
};

/* ---------- S1: the station clock and the locomotive ---------- */

const cam1 = (t: number): Cam => {
  if (t < T_TICK) return [800, CLK.y, logLerp(2.7, 2.4, ease.inOutSine(seg(t, 0, T_TICK)))];
  const k = ease.inOutCubic(seg(t, T_TICK + 0.1, 2.8));
  return [800, lerp(CLK.y, 450, k), logLerp(2.4, 0.95, k)];
};

/** Locomotive scale and lamp position (world) over time */
const loco1 = (t: number) => {
  if (t <= T_ECLIPSE) {
    const k = ease.inCubic(seg(t, T_EMERGE, T_ECLIPSE));
    const s = S0 * (1 + (ECL_S / S0 - 1) * k);
    const ground = H0 + 116.7 * s;
    return { s, ground, lampY: ground + LAMP_LY * s };
  }
  const s = ECL_S * Math.exp(3.3 * (t - T_ECLIPSE));
  const lampY = H0 + 116.7 * ECL_S + LAMP_LY * ECL_S;
  return { s, ground: lampY - LAMP_LY * s, lampY };
};

const drawClock = (c: Ctx, x: number, y: number, R: number, t: number) => {
  // sun rays behind the clock
  const rays = burstPath(x, y, { r0: R + 22, r1: R + 96, n: 36, width: 0.3, taper: true });
  c.fillStyle = radial(c, x, y, R, R + 100, [
    [0, rgba(DECO.goldHi, 0.9)],
    [1, rgba(DECO.gold, 0.1)],
  ]);
  c.fill(rays);
  // bezel
  const bez = circle(x, y, R + 18);
  circle(x, y, R, bez);
  gilt(c, bez, [x - R - 18, y - R - 18, R * 2 + 36, R * 2 + 36], { rule: 'evenodd', sheen: seg(t, T_TICK - 0.1, T_TICK + 0.9) });
  c.strokeStyle = DECO.goldDeep;
  c.lineWidth = 1.5;
  c.stroke(circle(x, y, R + 9));
  // face
  c.fillStyle = radial(c, x - R * 0.3, y - R * 0.3, 0, R * 1.3, [
    [0, DECO.ivory],
    [0.7, DECO.cream],
    [1, '#d9c39a'],
  ]);
  c.fill(circle(x, y, R));
  // ticks and hour bars
  const ticks = new Path2D();
  const bars = new Path2D();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU - Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (i % 5) {
      ticks.moveTo(x + ca * R * 0.86, y + sa * R * 0.86);
      ticks.lineTo(x + ca * R * 0.92, y + sa * R * 0.92);
    } else {
      const l0 = i % 15 ? 0.72 : 0.62;
      const hw = i % 15 ? 0.025 : 0.04;
      const pts: Pt[] = [
        [x + Math.cos(a - hw) * R * l0, y + Math.sin(a - hw) * R * l0],
        [x + Math.cos(a - hw * 0.8) * R * 0.92, y + Math.sin(a - hw * 0.8) * R * 0.92],
        [x + Math.cos(a + hw * 0.8) * R * 0.92, y + Math.sin(a + hw * 0.8) * R * 0.92],
        [x + Math.cos(a + hw) * R * l0, y + Math.sin(a + hw) * R * l0],
      ];
      poly(pts, bars);
    }
  }
  c.strokeStyle = DECO.ink;
  c.lineWidth = 1.4;
  c.stroke(ticks);
  gilt(c, bars, [x - R, y - R, R * 2, R * 2], { angle: 0.6 });
  c.strokeStyle = rgba(DECO.goldDeep, 0.8);
  c.lineWidth = 1;
  c.stroke(bars);
  c.strokeStyle = rgba(DECO.gold, 0.7);
  c.lineWidth = 1.5;
  c.stroke(circle(x, y, R * 0.5));
  // hands
  const tick = ease.outBack(seg(t, T_TICK, T_TICK + 0.2));
  const minA = -Math.PI / 2 + (TAU / 60) * (-1 + tick);
  const hrA = -Math.PI / 2 + (TAU / 12) * (9 - (1 - tick) / 60);
  const secA = -Math.PI / 2 + (TAU / 60) * (52 + (t / T_TICK) * 8);
  const hand = (a: number, len: number, w: number, tail: number) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const p: Pt[] = [
      [x - ca * tail, y - sa * tail],
      [x - sa * w + ca * len * 0.3, y + ca * w + sa * len * 0.3],
      [x + ca * len, y + sa * len],
      [x + sa * w + ca * len * 0.3, y - ca * w + sa * len * 0.3],
    ];
    return poly(p);
  };
  const hh = hand(hrA, R * 0.55, R * 0.07, R * 0.12);
  const mh = hand(minA, R * 0.86, R * 0.05, R * 0.14);
  c.fillStyle = DECO.ink;
  c.fill(hh);
  c.fill(mh);
  gilt(c, hand(hrA, R * 0.5, R * 0.03, R * 0.06), [x - R, y - R, R * 2, R * 2]);
  gilt(c, hand(minA, R * 0.8, R * 0.022, R * 0.08), [x - R, y - R, R * 2, R * 2]);
  c.strokeStyle = DECO.coral;
  c.lineWidth = 2.2;
  c.beginPath();
  c.moveTo(x - Math.cos(secA) * R * 0.2, y - Math.sin(secA) * R * 0.2);
  c.lineTo(x + Math.cos(secA) * R * 0.9, y + Math.sin(secA) * R * 0.9);
  c.stroke();
  c.fillStyle = DECO.coral;
  c.fill(circle(x, y, R * 0.06));
  gilt(c, circle(x, y, R * 0.035), [x - 6, y - 6, 12, 12]);
  // strike pulse
  const pk = seg(t, T_TICK, T_TICK + 0.7);
  if (pk > 0 && pk < 1) {
    c.strokeStyle = rgba(DECO.goldHi, 1 - pk);
    c.lineWidth = 6 * (1 - pk) + 1;
    c.stroke(circle(x, y, R + 20 + pk * 120));
  }
};

const drawLocoFront = (c: Ctx, x: number, ground: number, s: number, t: number, glassMask = false) => {
  c.save();
  c.translate(x, ground);
  c.scale(s, s);
  // shadow on the platform
  c.fillStyle = 'rgba(10,6,20,0.45)';
  c.beginPath();
  c.ellipse(0, 4, 190, 16, 0, 0, TAU);
  c.fill();
  const body = new Path2D();
  body.moveTo(-150, 0);
  body.lineTo(-150, -240);
  body.ellipse(0, -240, 150, 150, 0, Math.PI, TAU);
  body.lineTo(150, 0);
  body.closePath();
  c.fillStyle = grad(c, -150, 0, 150, 0, [
    [0, '#03140f'],
    [0.22, DECO.emerald],
    [0.45, '#4aa489'],
    [0.55, '#2c7866'],
    [0.8, DECO.emerald],
    [1, '#020c09'],
  ]);
  c.fill(body);
  c.save();
  c.clip(body);
  c.fillStyle = grad(c, 0, -390, 0, 0, [
    [0, 'rgba(255,230,190,0.35)'],
    [0.35, 'rgba(255,230,190,0)'],
    [0.8, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.45)'],
  ]);
  c.fillRect(-160, -400, 320, 400);
  c.restore();
  // centre fin
  const fin = new Path2D();
  fin.rect(-8, -388, 16, 82);
  fin.rect(-8, -194, 16, 30);
  gilt(c, fin, [-8, -390, 16, 230], { angle: 1.4 });
  // speed whiskers (a smile of gold bands)
  const wh = new Path2D();
  for (let i = 0; i < 3; i++) {
    const y0 = -168 + i * 20;
    wh.moveTo(-150, y0 - 18);
    wh.quadraticCurveTo(0, y0 + 26, 150, y0 - 18);
    wh.lineTo(150, y0 - 10);
    wh.quadraticCurveTo(0, y0 + 34, -150, y0 - 10);
    wh.closePath();
  }
  gilt(c, wh, [-150, -190, 300, 90], { angle: 0.2, sheen: seg(t, 2.6, 3.5) });
  // pilot: stepped skirt with slats
  const pil = poly([
    [-150, -70],
    [150, -70],
    [124, -30],
    [96, -30],
    [80, 0],
    [-80, 0],
    [-96, -30],
    [-124, -30],
  ]);
  c.fillStyle = '#05100d';
  c.fill(pil);
  const sl = new Path2D();
  for (let i = 0; i < 4; i++) sl.rect(-120 + i * 4, -62 + i * 14, 240 - i * 8, 3);
  c.fillStyle = goldGrad(c, -150, -70, 150, 0);
  c.fill(sl);
  // marker lamps
  for (const mx of [-112, 112]) {
    c.fillStyle = DECO.coral;
    c.fill(circle(mx, -92, 9));
    gilt(c, (() => {
      const p = circle(mx, -92, 13);
      circle(mx, -92, 9, p);
      return p;
    })(), [mx - 13, -105, 26, 26], { rule: 'evenodd' });
  }
  // headlamp
  const bez = circle(0, LAMP_LY, LAMP_R + 14);
  circle(0, LAMP_LY, LAMP_R, bez);
  gilt(c, bez, [-60, LAMP_LY - 60, 120, 120], { rule: 'evenodd', angle: 0.9 });
  if (!glassMask) {
    c.fillStyle = radial(c, -8, LAMP_LY - 8, 0, LAMP_R, [
      [0, '#fffef6'],
      [0.6, '#fff2c8'],
      [1, '#f5c27a'],
    ]);
    c.fill(circle(0, LAMP_LY, LAMP_R));
    const rings = new Path2D();
    circle(0, LAMP_LY, LAMP_R * 0.7, rings);
    circle(0, LAMP_LY, LAMP_R * 0.4, rings);
    c.strokeStyle = 'rgba(214,160,80,0.45)';
    c.lineWidth = 2;
    c.stroke(rings);
  }
  c.restore();
};

const drawS1 = (r: Riso, c: Ctx, t: number, s: State) => {
  const cam = cam1(t);
  r.camera(cam[0], cam[1], cam[2]);
  // dusk sky over the Caspian
  c.fillStyle = grad(c, 0, -300, 0, H0, [
    [0, '#2a2150'],
    [0.45, '#6e3a66'],
    [0.8, DECO.coral],
    [1, DECO.peach],
  ]);
  c.fillRect(-800, -800, 3200, H0 + 800);
  drawStars(c, s.stars5, t, DECO.cream, 0.6);
  // sea and derricks at the horizon
  c.fillStyle = grad(c, 0, H0, 0, 800, [
    [0, '#7a4a70'],
    [1, '#2b2f63'],
  ]);
  c.fillRect(-800, H0, 3200, 300);
  c.save();
  c.translate(-120, 0);
  c.fillStyle = '#2b1f3e';
  c.fill(s.derricks);
  c.translate(1520, 0);
  c.scale(-1, 1);
  c.fill(s.derricks);
  c.restore();
  // station: wings
  const stone = (x0: number, x1: number) =>
    grad(c, x0, 0, x1, 0, [
      [0, '#f6d9b0'],
      [0.5, '#e8b98c'],
      [1, '#a8706a'],
    ]);
  for (const [x0, x1] of [
    [230, 470],
    [1130, 1370],
  ]) {
    const wing = poly(
      zigguratPts((x0 + x1) / 2, 760, [
        [(x1 - x0) / 2, 210],
        [(x1 - x0) / 2 - 20, 26],
      ])
    );
    c.fillStyle = stone(x0, x1);
    c.fill(wing);
    // tall windows with gold mullions
    const win = new Path2D();
    const mull = new Path2D();
    for (let i = 0; i < 4; i++) {
      const wx = x0 + 28 + i * ((x1 - x0 - 56) / 4) + 6;
      const ww = (x1 - x0 - 56) / 4 - 12;
      win.moveTo(wx, 740);
      win.lineTo(wx, 610);
      win.arc(wx + ww / 2, 610, ww / 2, Math.PI, TAU);
      win.lineTo(wx + ww, 740);
      win.closePath();
      for (let m = 1; m < 3; m++) mull.rect(wx + (ww * m) / 3 - 1, 590, 2, 150);
      for (let m = 0; m < 4; m++) mull.rect(wx, 640 + m * 26, ww, 2);
    }
    c.fillStyle = grad(c, 0, 580, 0, 740, [
      [0, '#ffe2a8'],
      [1, '#e48a4f'],
    ]);
    c.fill(win);
    c.fillStyle = DECO.goldLo;
    c.fill(mull);
  }
  // central tower
  const tw = poly(
    zigguratPts(800, 760, [
      [330, 190],
      [250, 130],
      [196, 190],
      [140, 50],
      [92, 30],
    ])
  );
  c.fillStyle = stone(470, 1130);
  c.fill(tw);
  // fluting
  const fl = new Path2D();
  for (let i = -6; i <= 6; i++) {
    if (Math.abs(i) < 2) continue;
    fl.moveTo(800 + i * 26, 460);
    fl.lineTo(800 + i * 26, 250);
  }
  c.strokeStyle = rgba(DECO.goldLo, 0.55);
  c.lineWidth = 2;
  c.stroke(fl);
  const caps = new Path2D();
  for (const [hw, y] of [
    [330, 570],
    [250, 440],
    [196, 250],
    [140, 200],
    [92, 170],
  ] as const)
    caps.rect(800 - hw - 4, y - 4, hw * 2 + 8, 8);
  gilt(c, caps, [470, 170, 660, 410], { angle: 0 });
  // arch portal with dark interior and rails
  const arch = poly(
    zigguratPts(800, 760, [
      [120, 120],
      [100, 30],
      [76, 24],
      [50, 20],
    ])
  );
  c.fillStyle = grad(c, 0, 566, 0, 760, [
    [0, '#120a18'],
    [1, '#2e1a24'],
  ]);
  c.fill(arch);
  c.lineJoin = 'miter';
  giltStroke(c, arch, [680, 566, 240, 194], 6);
  glow(c, 800, 712, 120, '#ffd99a', 0.35);
  // platform
  c.fillStyle = grad(c, 0, 760, 0, 1000, [
    [0, '#b98667'],
    [1, '#5a3240'],
  ]);
  c.fillRect(-800, 760, 3200, 400);
  const pv = new Path2D();
  for (let i = -12; i <= 12; i++) {
    pv.moveTo(800 + i * 30 * 0.42, 760);
    pv.lineTo(800 + i * 30 * 6, 1100);
  }
  for (const y of [790, 840, 920, 1040]) {
    pv.moveTo(-800, y);
    pv.lineTo(2400, y);
  }
  c.strokeStyle = 'rgba(60,30,40,0.35)';
  c.lineWidth = 1.5;
  c.stroke(pv);
  const rails = new Path2D();
  for (const sgn of [-1, 1]) {
    rails.moveTo(800 + sgn * 112 * S0, 760);
    rails.lineTo(800 + sgn * 112 * 4.4, H0 + 116.7 * 4.4);
  }
  c.strokeStyle = goldGrad(c, 600, 760, 1000, 1200);
  c.lineWidth = 4;
  c.stroke(rails);
  // clock
  drawClock(c, CLK.x, CLK.y, CLK.R, t);
  // locomotive
  const L = loco1(t);
  if (t > 1.6) {
    // beam and glow
    glow(c, 800, L.lampY, 160 * L.s + 60, '#fff2c8', 0.5);
    drawLocoFront(c, 800, L.ground, L.s, t);
    glow(c, 800, L.lampY, LAMP_R * L.s * 1.6, '#fffaf0', 0.55);
  }
};

/* ---------- S2: the bridge ---------- */

const nose2 = (t: number) => 500 + 300 * (t - 3.8);
const lamp2 = (t: number): Pt => [nose2(t) - 14 * TRAIN2_S, RAIL2 - 80 * TRAIN2_S];
const win2 = (t: number): Pt => [nose2(t) + (-1046 + 30 + 3 * 62 + 20) * TRAIN2_S, RAIL2 - 101 * TRAIN2_S];

const cam2 = (t: number): Cam => {
  const L = lamp2(t);
  const k = ease.inOutCubic(seg(t, 4.0, 5.5));
  let cx = lerp(L[0], 820, k);
  let cy = lerp(L[1], 470, k);
  let z = logLerp(3.4, 1, k);
  const d = ease.inOutSine(seg(t, 5.5, T_WIN0));
  cx += 40 * d;
  z *= 1 + 0.06 * d;
  if (t > T_WIN0) {
    const W = win2(t);
    const kp = seg(t, T_WIN0, T_WIN1);
    cx = lerp(cx, W[0], ease.outCubic(kp));
    cy = lerp(cy, W[1], ease.outCubic(kp));
    z = logLerp(z, 9, ease.inCubic(kp));
  }
  return [cx, cy, z];
};

const archY = (x: number) => 492 + (800 - 492) * ((x - 800) / 490) ** 2;

const drawS2 = (r: Riso, c: Ctx, t: number, s: State) => {
  const cam = cam2(t);
  r.camera(cam[0], cam[1], cam[2]);
  c.fillStyle = grad(c, 0, -300, 0, 640, [
    [0, '#2e2152'],
    [0.42, '#8a3f62'],
    [0.75, DECO.coral],
    [0.92, DECO.salmon],
    [1, DECO.peach],
  ]);
  c.fillRect(-1000, -800, 3600, 1800);
  drawStars(c, s.stars2, t, DECO.cream, 0.5);
  // low sun
  glow(c, 1180, 560, 320, DECO.peach, 0.6);
  gilt(c, circle(1180, 560, 74), [1100, 480, 160, 160], { angle: 0.5, warm: 0.4 });
  // ranges
  c.fillStyle = '#c47a8a';
  c.fill(s.far2[0]);
  c.fillStyle = '#8e5274';
  c.fill(s.far2[1]);
  c.fillStyle = '#f6dcc8';
  c.fill(s.far2[2]);
  c.fillStyle = '#5a3660';
  c.fill(s.mid2[0]);
  c.fillStyle = '#3a2449';
  c.fill(s.mid2[1]);
  // haze in the gorge
  c.fillStyle = grad(c, 0, 600, 0, 800, [
    [0, rgba(DECO.salmon, 0.0)],
    [1, rgba(DECO.salmon, 0.35)],
  ]);
  c.fillRect(-1000, 600, 3600, 200);
  // river
  c.fillStyle = grad(c, 0, 790, 0, 940, [
    [0, '#2c7866'],
    [1, '#0b2b33'],
  ]);
  c.fillRect(-1000, 790, 3600, 400);
  const rip = new Path2D();
  for (let i = 0; i < 9; i++) {
    const y = 800 + i * 14;
    const off = ((t * (40 + i * 12) + i * 80) % 160) - 80;
    for (let x = -1000; x < 2600; x += 160) rip.rect(x + off, y, 70 + i * 6, 2);
  }
  c.fillStyle = rgba(DECO.peach, 0.45);
  c.fill(rip);
  // cliffs either side
  const cliffL = poly([
    [-1000, 1000],
    [-1000, RAIL2],
    [190, RAIL2],
    [190, 540],
    [240, 540],
    [240, 640],
    [290, 640],
    [300, 800],
    [330, 1000],
  ]);
  const cliffR = poly([
    [2600, 1000],
    [2600, RAIL2],
    [1410, RAIL2],
    [1410, 540],
    [1360, 540],
    [1360, 640],
    [1310, 640],
    [1300, 800],
    [1270, 1000],
  ]);
  c.fillStyle = grad(c, -400, 0, 300, 0, [
    [0, '#7a4428'],
    [1, '#c98a4e'],
  ]);
  c.fill(cliffL);
  c.fillStyle = grad(c, 1300, 0, 2000, 0, [
    [0, '#9a5a34'],
    [1, '#4e2618'],
  ]);
  c.fill(cliffR);
  const strata = new Path2D();
  for (const y of [520, 560, 610, 680, 760]) {
    strata.moveTo(-1000, y);
    strata.lineTo(lerp(190, 320, (y - 470) / 330), y);
    strata.moveTo(lerp(1410, 1280, (y - 470) / 330), y);
    strata.lineTo(2600, y);
  }
  c.strokeStyle = 'rgba(60,24,16,0.4)';
  c.lineWidth = 2;
  c.stroke(strata);
  // arch rib
  const rib = new Path2D();
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const x = lerp(310, 1290, i / N);
    if (i === 0) rib.moveTo(x, archY(x));
    else rib.lineTo(x, archY(x));
  }
  for (let i = N; i >= 0; i--) {
    const x = lerp(330, 1270, i / N);
    rib.lineTo(x, archY(x) + 30 + 40 * Math.abs((x - 800) / 470) ** 3);
  }
  rib.closePath();
  c.fillStyle = grad(c, 0, 490, 0, 800, [
    [0, '#14453d'],
    [1, '#061c18'],
  ]);
  c.fill(rib);
  c.strokeStyle = rgba(DECO.gold, 0.8);
  c.lineWidth = 2;
  c.stroke(rib);
  // spandrel posts
  const posts = new Path2D();
  for (let x = 340; x <= 1260; x += 46) {
    const y = archY(x);
    if (y - RAIL2 < 24) continue;
    posts.rect(x - 2.5, RAIL2 + 14, 5, y - RAIL2 - 12);
  }
  c.fillStyle = '#0b2b26';
  c.fill(posts);
  // pylons
  for (const px of [270, 1330]) {
    const py = poly(
      zigguratPts(px, 800, [
        [58, 300],
        [46, 60],
        [34, 40],
        [22, 30],
      ])
    );
    c.fillStyle = grad(c, px - 58, 0, px + 58, 0, [
      [0, '#f2d2a6'],
      [0.6, '#d9a273'],
      [1, '#8e5a4c'],
    ]);
    c.fill(py);
    c.fillStyle = '#3a1f22';
    c.fill(rrect(px - 10, 560, 20, 120, 10));
    const cap = new Path2D();
    cap.rect(px - 60, 498, 120, 6);
    cap.rect(px - 48, 438, 96, 5);
    cap.rect(px - 36, 398, 72, 5);
    cap.rect(px - 24, 368, 48, 5);
    gilt(c, cap, [px - 60, 360, 120, 150], { angle: 0 });
  }
  // deck
  c.fillStyle = '#0d2a26';
  c.fillRect(-1000, RAIL2, 3600, 18);
  c.fillStyle = goldGrad(c, -1000, 0, 2600, 0);
  c.fillRect(-1000, RAIL2 + 2, 3600, 2.5);
  c.fillRect(-1000, RAIL2 + 13, 3600, 1.5);
  // train
  const nx = nose2(t);
  drawStreamliner(c, nx, RAIL2, TRAIN2_S, EMERALD_TRAIN, { wheelRot: nx / 9, lamp: 1 });
  // the dining car window warms as we approach
  const wk = seg(t, T_WIN0 + 0.3, T_WIN1);
  if (wk > 0) {
    const W = win2(t);
    glow(c, W[0], W[1], 30, '#ffe6b0', 0.6 * wk);
  }
};

/* ---------- S3: dining car ---------- */

const cam3 = (t: number): Cam => {
  const z0 = 1 + 0.16 * ease.inOutSine(seg(t, T_MASK1, T_THRU0));
  const k = ease.inCubic(seg(t, T_THRU0, T_THRU1));
  const cy = lerp(340, WCY, ease.outCubic(seg(t, T_MASK1, T_THRU1)));
  return [800, cy, logLerp(z0, 3.6, k)];
};

const windowPath = () => rrect(WR.x, WR.y, WR.w, WR.h, WR.r);

/** The land rolling past the window (screen space), then a tunnel, then the sea */
const drawView = (r: Riso, c: Ctx, t: number, s: State) => {
  r.camera(800, 450, 1);
  const D = (t - 7.4) * 520;
  // fills run past the window so the view still covers it while the camera pushes through
  const x0 = -60;
  const x1 = 1660;
  const yT = -60;
  const yB = 960;
  const hz = 420;
  c.fillStyle = grad(c, 0, WR.y, 0, hz, [
    [0, '#8a3f62'],
    [0.55, DECO.coral],
    [1, DECO.peach],
  ]);
  c.fillRect(x0, yT, x1 - x0, hz - yT);
  glow(c, 1050 - D * 0.02, hz - 30, 160, DECO.peach, 0.6);
  // far range fades out into steppe
  const far = new Path2D();
  far.moveTo(x0, hz);
  for (let x = x0; x <= x1; x += 8) {
    const u = x + D * 0.12;
    const amp = 1 - clamp((u - 1200) / 500);
    const h = amp * (60 + 50 * Math.abs(Math.sin(u * 0.011)) + 30 * Math.abs(Math.sin(u * 0.027 + 1)));
    far.lineTo(x, hz - h);
  }
  far.lineTo(x1, hz);
  far.closePath();
  c.fillStyle = '#9a5878';
  c.fill(far);
  // ground
  c.fillStyle = grad(c, 0, hz, 0, WR.y + WR.h, [
    [0, '#c98a4e'],
    [1, '#7a4428'],
  ]);
  c.fillRect(x0, hz, x1 - x0, yB - hz);
  // mid: low hills and oil derricks
  const mid = new Path2D();
  const dk = new Path2D();
  mid.moveTo(x0, hz + 30);
  for (let x = x0; x <= x1; x += 10) {
    const u = x + D * 0.45;
    mid.lineTo(x, hz + 12 - 18 * Math.abs(Math.sin(u * 0.006)));
  }
  mid.lineTo(x1, hz + 30);
  mid.closePath();
  c.fillStyle = '#8a4a34';
  c.fill(mid);
  // the near embankment streaming past
  const strk = new Path2D();
  for (let i = 0; i < 12; i++) {
    const y = hz + 40 + i * i * 1.6 + i * 6;
    const w = 120 + hash(i) * 260;
    const off = (D * (1.2 + i * 0.12) + hash(i + 3) * 900) % 1400;
    for (let x = -off; x < x1 + 1400; x += 1400) strk.rect(x, y, w, 2 + i * 0.25);
  }
  c.fillStyle = 'rgba(255,214,160,0.22)';
  c.fill(strk);
  for (let i = 0; i < 14; i++) {
    const u = 1300 + i * 170;
    const x = u - D * 0.45;
    if (x < x0 - 60 || x > x1 + 60) continue;
    const h = 70 + hash(i) * 40;
    const by = hz + 10;
    dk.moveTo(x - 16, by);
    dk.lineTo(x, by - h);
    dk.lineTo(x + 16, by);
    dk.closePath();
  }
  c.fillStyle = '#3a1f30';
  c.fill(dk);
  c.strokeStyle = '#3a1f30';
  c.lineWidth = 1.2;
  const lat = new Path2D();
  for (let i = 0; i < 14; i++) {
    const u = 1300 + i * 170;
    const x = u - D * 0.45;
    if (x < x0 - 60 || x > x1 + 60) continue;
    const h = 70 + hash(i) * 40;
    for (let k = 1; k < 5; k++) {
      const yy = hz + 10 - (h * k) / 5;
      const hw = 16 * (1 - k / 5);
      lat.moveTo(x - hw - 4, yy);
      lat.lineTo(x + hw + 4, yy);
    }
  }
  c.stroke(lat);
  // telegraph poles and wires
  const pl = new Path2D();
  for (let i = -2; i < 30; i++) {
    const x = i * 380 - ((D * 1.4) % 380) + 380;
    if (x < x0 - 40 || x > x1 + 40) continue;
    pl.rect(x - 4, WR.y + 40, 8, yB - WR.y);
    pl.rect(x - 26, WR.y + 60, 52, 5);
  }
  c.fillStyle = '#2a1520';
  c.fill(pl);
  c.strokeStyle = 'rgba(42,21,32,0.7)';
  c.lineWidth = 1.5;
  c.beginPath();
  for (const yy of [WR.y + 64, WR.y + 80]) {
    c.moveTo(x0, yy);
    for (let x = x0; x <= x1; x += 20) {
      const ph = ((x + ((D * 1.4) % 380)) % 380) / 380;
      c.lineTo(x, yy + 18 * Math.sin(ph * Math.PI));
    }
  }
  c.stroke();
  // tunnel wall sweeping past, and the sea beyond it
  const xl = WR.x + WR.w - TUN_V * (t - T_TUN);
  const xr = xl + TUN_L;
  if (xr < x1) {
    c.save();
    const sea = new Path2D();
    sea.rect(Math.max(x0, xr), yT, x1 - Math.max(x0, xr), yB - yT);
    c.clip(sea);
    drawS4(r, c, t, s, false);
    c.restore();
    r.camera(800, 450, 1);
  }
  if (xl < x1 && xr > x0) {
    const wall = new Path2D();
    wall.rect(Math.max(x0, xl), yT, Math.min(x1, xr) - Math.max(x0, xl), yB - yT);
    c.fillStyle = '#0a0709';
    c.fill(wall);
    // portal masonry edges
    const edge = new Path2D();
    for (const ex of [xl, xr - 30]) if (ex > x0 - 40 && ex < x1) edge.rect(ex, yT, 30, yB - yT);
    c.fillStyle = '#3a2a24';
    c.fill(edge);
    // reflection of the interior on the dark glass
    const dark = clamp(Math.min(x1, xr) - Math.max(x0, xl)) / 1;
    if (dark > 0) {
      c.save();
      c.clip(wall);
      glow(c, 520, 380, 120, '#ffd9a0', 0.25);
      glow(c, 1060, 480, 80, '#ffd9a0', 0.15);
      c.restore();
    }
  }
};

const drawS3 = (r: Riso, c: Ctx, t: number, s: State) => {
  const cam = cam3(t);
  r.camera(cam[0], cam[1], cam[2]);
  // window view (clipped to the window, transformed by the camera)
  c.save();
  c.clip(windowPath());
  drawView(r, c, t, s);
  c.restore();
  r.camera(cam[0], cam[1], cam[2]);
  // glass sheen
  c.save();
  c.clip(windowPath());
  const gs = new Path2D();
  gs.moveTo(WR.x + 120, WR.y);
  gs.lineTo(WR.x + 260, WR.y);
  gs.lineTo(WR.x + 60, WR.y + WR.h);
  gs.lineTo(WR.x - 80, WR.y + WR.h);
  gs.closePath();
  c.fillStyle = 'rgba(255,240,220,0.08)';
  c.fill(gs);
  c.restore();
  // wall with lacquered panels, window cut out
  const wall = new Path2D();
  wall.rect(-600, -600, 2800, 1180);
  wall.addPath(windowPath());
  c.fillStyle = grad(c, 0, -100, 0, 600, [
    [0, '#06231e'],
    [0.5, DECO.emerald],
    [1, '#0a352f'],
  ]);
  c.fill(wall, 'evenodd');
  // marquetry stripes on the side panels
  const mq = new Path2D();
  for (let x = -600; x < 2200; x += 22) {
    if (x > WR.x - 70 && x < WR.x + WR.w + 50) continue;
    mq.rect(x, -600, 10, 1180);
  }
  c.fillStyle = 'rgba(60,140,115,0.18)';
  c.fill(mq);
  // inlaid gold frame around the window
  const inlay = rrect(WR.x - 34, WR.y - 34, WR.w + 68, WR.h + 68, WR.r + 30);
  rrect(WR.x - 44, WR.y - 44, WR.w + 88, WR.h + 88, WR.r + 38, inlay);
  c.strokeStyle = goldGrad(c, WR.x, WR.y, WR.x + WR.w, WR.y + WR.h);
  c.lineWidth = 2;
  c.stroke(inlay);
  // brass window frame
  const fr = rrect(WR.x - 16, WR.y - 16, WR.w + 32, WR.h + 32, WR.r + 14);
  fr.addPath(windowPath());
  gilt(c, fr, [WR.x - 16, WR.y - 16, WR.w + 32, WR.h + 32], { rule: 'evenodd', angle: 0.4, sheen: seg(t, 8.3, 9.6) });
  // pleated blind at the top of the glass
  c.save();
  c.clip(windowPath());
  const bl = new Path2D();
  bl.rect(WR.x, WR.y, WR.w, 46);
  c.fillStyle = grad(c, 0, WR.y, 0, WR.y + 46, [
    [0, '#efd9b4'],
    [1, '#c9a27a'],
  ]);
  c.fill(bl);
  const pleat = new Path2D();
  for (let x = WR.x; x < WR.x + WR.w; x += 16) {
    pleat.moveTo(x, WR.y);
    pleat.lineTo(x, WR.y + 46);
  }
  c.strokeStyle = 'rgba(120,80,50,0.35)';
  c.lineWidth = 1.5;
  c.stroke(pleat);
  c.fillStyle = DECO.gold;
  c.fillRect(WR.x, WR.y + 44, WR.w, 4);
  c.restore();
  // curtains, tied back
  for (const side of [-1, 1]) {
    const ex = side < 0 ? WR.x - 10 : WR.x + WR.w + 10;
    const inn = side < 0 ? WR.x + 110 : WR.x + WR.w - 110;
    const sw = Math.sin(t * 1.6 + side) * 3;
    const cur = new Path2D();
    cur.moveTo(ex - side * 40, WR.y - 40);
    cur.lineTo(inn, WR.y - 40);
    cur.bezierCurveTo(inn - side * 10, WR.y + 120, ex + side * 60 + sw, 330, ex + side * 30 + sw, 380);
    cur.bezierCurveTo(ex + side * 70 + sw, 440, inn - side * 20 + sw, 520, inn + side * 6 + sw, 600);
    cur.lineTo(ex - side * 50, 600);
    cur.closePath();
    c.fillStyle = grad(c, ex - side * 50, 0, inn, 0, [
      [0, '#7a2b28'],
      [0.6, DECO.red],
      [1, '#d9624c'],
    ]);
    c.fill(cur);
    const folds = new Path2D();
    for (let f = 1; f < 4; f++) {
      const fx = lerp(ex - side * 40, inn, f / 4);
      folds.moveTo(fx, WR.y - 40);
      folds.quadraticCurveTo(lerp(fx, ex + side * 30, 0.7), 330, ex + side * 30 + sw, 380);
      folds.moveTo(ex + side * 30 + sw, 384);
      folds.quadraticCurveTo(lerp(fx, ex, 0.3) + sw, 480, lerp(ex - side * 50, inn, f / 4) + sw, 600);
    }
    c.strokeStyle = 'rgba(60,10,14,0.4)';
    c.lineWidth = 2.5;
    c.stroke(folds);
    // gold tie
    c.fillStyle = goldGrad(c, ex - 30, 370, ex + 60, 392);
    c.fill(rrect(ex + side * 30 - 26 + sw, 372, 52, 14, 7));
  }
  // sconces: fan shades
  for (const sx of [170, 1430]) {
    glow(c, sx, 280, 170, '#ffcf8a', 0.45);
    const fan = new Path2D();
    c.save();
    c.translate(sx, 300);
    fanPath(0, 0, 70, 9, 1, fan);
    gilt(c, fan, [-70, -70, 140, 70], { angle: 0.3 });
    c.strokeStyle = DECO.goldDeep;
    c.lineWidth = 1.5;
    c.stroke(fanRibs(0, 0, 70, 9, 1));
    c.fillStyle = '#fff1cf';
    c.fill(circle(0, -8, 14));
    c.restore();
  }
  // lower wall panel with a gold rail
  c.fillStyle = grad(c, 0, 576, 0, 980, [
    [0, '#0b3a33'],
    [1, '#03140f'],
  ]);
  c.fillRect(-600, 576, 2800, 420);
  c.fillStyle = goldGrad(c, 0, 570, 1600, 590);
  c.fillRect(-600, 572, 2800, 6);
  // table cloth
  const tab = poly([
    [420, 586],
    [1180, 586],
    [1500, 980],
    [100, 980],
  ]);
  c.fillStyle = grad(c, 0, 586, 0, 900, [
    [0, '#e9dcc0'],
    [0.2, DECO.ivory],
    [1, '#d8c8a6'],
  ]);
  c.fill(tab);
  c.fillStyle = 'rgba(120,90,60,0.25)';
  c.fillRect(420, 586, 760, 4);
  // lamp glow on the cloth
  glow(c, 520, 640, 260, '#ffd38e', 0.35);
  // globe lamp
  drawGlobeLamp(c, 520, 640, t);
  // lemon slice on a saucer and the tea glass
  drawTea(c, 1060, 720, t);
};

const drawGlobeLamp = (c: Ctx, x: number, y: number, t: number) => {
  // shadow
  c.fillStyle = 'rgba(80,50,30,0.25)';
  c.beginPath();
  c.ellipse(x + 30, y + 6, 80, 12, 0, 0, TAU);
  c.fill();
  const base = poly(
    zigguratPts(x, y, [
      [56, 12],
      [42, 10],
      [28, 10],
    ])
  );
  gilt(c, base, [x - 56, y - 32, 112, 32], { angle: 0.2 });
  const stem = new Path2D();
  stem.rect(x - 6, y - 120, 12, 90);
  gilt(c, stem, [x - 6, y - 120, 12, 90], { angle: 0 });
  const gy = y - 170;
  const fl = 0.92 + 0.08 * noise1(t * 6, 3);
  glow(c, x, gy, 180, '#ffd9a0', 0.55 * fl);
  c.fillStyle = radial(c, x - 14, gy - 16, 0, 56, [
    [0, '#fffaf0'],
    [0.5, '#ffe6b6'],
    [1, '#f0b878'],
  ]);
  c.fill(circle(x, gy, 52));
  // gold equator band and finial
  const band = new Path2D();
  band.ellipse(x, gy, 53, 9, 0, 0, TAU);
  band.ellipse(x, gy, 53, 4, 0, 0, TAU);
  gilt(c, band, [x - 53, gy - 9, 106, 18], { rule: 'evenodd', angle: 0 });
  gilt(c, circle(x, gy - 58, 7), [x - 7, gy - 65, 14, 14]);
};

const drawTea = (c: Ctx, x: number, y: number, t: number) => {
  // saucer
  c.fillStyle = 'rgba(80,50,30,0.22)';
  c.beginPath();
  c.ellipse(x + 10, y + 8, 96, 16, 0, 0, TAU);
  c.fill();
  const sau = new Path2D();
  sau.ellipse(x, y, 88, 18, 0, 0, TAU);
  c.fillStyle = DECO.ivory;
  c.fill(sau);
  giltStroke(c, sau, [x - 88, y - 18, 176, 36], 3);
  // pear-shaped glass (armudu)
  const prof = (k: number) => {
    // k 0 bottom .. 1 rim : half width
    if (k < 0.18) return lerp(22, 34, k / 0.18);
    if (k < 0.52) return lerp(34, 22, smooth01((k - 0.18) / 0.34));
    return lerp(22, 33, smooth01((k - 0.52) / 0.48));
  };
  const H = 120;
  const gl: Pt[] = [];
  for (let i = 0; i <= 20; i++) gl.push([x + prof(i / 20), y - 4 - (i / 20) * H]);
  for (let i = 20; i >= 0; i--) gl.push([x - prof(i / 20), y - 4 - (i / 20) * H]);
  const glass = poly(gl);
  const tea: Pt[] = [];
  const lvl = 0.78;
  const slosh = Math.sin(t * 2.2) * 2;
  for (let i = 0; i <= 16; i++) tea.push([x + prof((i / 16) * lvl) - 3, y - 6 - (i / 16) * lvl * H]);
  tea.push([x - prof(lvl) + 3, y - 6 - lvl * H - slosh]);
  for (let i = 16; i >= 0; i--) tea.push([x - prof((i / 16) * lvl) + 3, y - 6 - (i / 16) * lvl * H]);
  c.fillStyle = grad(c, x - 34, 0, x + 34, 0, [
    [0, '#5a1a0c'],
    [0.4, '#c4501c'],
    [0.7, '#e88a3a'],
    [1, '#6a2410'],
  ]);
  c.fill(poly(tea));
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fill(glass);
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 2;
  c.stroke(glass);
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x - 20, y - 26);
  c.quadraticCurveTo(x - 30, y - 50, x - 16, y - 68);
  c.stroke();
  // gold rim
  c.strokeStyle = DECO.gold;
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(x, y - 4 - H, 33, 5, 0, 0, TAU);
  c.stroke();
  // spoon
  c.strokeStyle = goldGrad(c, x + 40, y - 20, x + 90, y + 10);
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(x + 38, y + 2);
  c.lineTo(x + 82, y - 6);
  c.stroke();
  // lemon slice
  const lx = x - 150;
  const ly = y + 30;
  const lem = new Path2D();
  lem.ellipse(lx, ly, 38, 14, 0, 0, TAU);
  c.fillStyle = '#f2d24a';
  c.fill(lem);
  c.fillStyle = '#fbe98a';
  c.beginPath();
  c.ellipse(lx, ly, 32, 11, 0, 0, TAU);
  c.fill();
  const seg8 = new Path2D();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    seg8.moveTo(lx, ly);
    seg8.lineTo(lx + Math.cos(a) * 31, ly + Math.sin(a) * 10.5);
  }
  c.strokeStyle = 'rgba(255,255,240,0.9)';
  c.lineWidth = 1.6;
  c.stroke(seg8);
  // steam
  c.strokeStyle = 'rgba(255,250,240,0.5)';
  c.lineWidth = 4;
  c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const ph = t * 0.9 + i * 0.33;
    const f = ph % 1;
    c.globalAlpha = Math.sin(f * Math.PI) * 0.8;
    c.beginPath();
    const bx = x - 12 + i * 12;
    const by = y - H - 10 - f * 60;
    c.moveTo(bx, by + 30);
    c.bezierCurveTo(bx + 14, by + 16, bx - 14, by + 4, bx + Math.sin(ph * 5) * 6, by - 18);
    c.stroke();
  }
  c.globalAlpha = 1;
};

const smooth01 = (k: number) => k * k * (3 - 2 * k);

/* ---------- S4: the liner ---------- */

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

interface View {
  E: V3;
  f: V3;
  rt: V3;
  up: V3;
  F: number;
  bow: V3;
  h: V3;
  port: V3;
}

const HEAD = norm([0.55, 0, -1]);
const BOW_END: V3 = [24, 0, 47];

const shipDist = (t: number) => {
  const k = seg(t, T_SEA, T_HORN);
  return 980 * (1 - ease.outCubic(k)) - 4 * Math.max(0, t - T_HORN);
};

const view4 = (t: number): View => {
  const E: V3 = [0, 2.4, 0];
  const pitch = 0.1 + 0.1 * ease.inOutSine(seg(t, T_SEA + 1, T_HORN)) + 0.06 * ease.inOutSine(seg(t, T_HORN + 0.3, T_PORT0 + 0.4));
  const f = norm([0.05, pitch, 1]);
  const rt = norm(cross(f, [0, 1, 0]));
  const up = cross(rt, f);
  const d = shipDist(t);
  const bow: V3 = [BOW_END[0] - HEAD[0] * d, 0, BOW_END[2] - HEAD[2] * d];
  const port = cross([0, 1, 0], HEAD);
  return { E, f, rt: [-rt[0], -rt[1], -rt[2]], up, F: 980, bow, h: HEAD, port };
};

/** Project ship-local (u along, y up, v to port) to screen */
const proj = (V: View, u: number, y: number, v: number): [number, number, number] => {
  const P: V3 = [V.bow[0] + V.h[0] * u + V.port[0] * v, y, V.bow[2] + V.h[2] * u + V.port[2] * v];
  const d = sub(P, V.E);
  const z = Math.max(1.5, dot(d, V.f));
  return [800 + (V.F * dot(d, V.rt)) / z, 450 - (V.F * dot(d, V.up)) / z, z];
};

const B = 16;
const stemU = (y: number) => 0.42 * y;
const sheer = (u: number) => 25 + 5 * clamp((u + 70) / 70);
const halfW = (u: number, y: number) => {
  const d = stemU(y) - u;
  return B * Math.pow(clamp(d / 62), 0.52) * (0.84 + 0.16 * clamp(y / 28));
};

const projPath = (V: View, pts: [number, number, number][], p: Path2D = new Path2D()) => {
  pts.forEach(([u, y, v], i) => {
    const q = proj(V, u, y, v);
    if (i === 0) p.moveTo(q[0], q[1]);
    else p.lineTo(q[0], q[1]);
  });
  p.closePath();
  return p;
};

const PORT_HOLE = { u: -22, y: 15 };

const drawLiner = (c: Ctx, V: View, t: number, portGlass: boolean) => {
  const L = 270;
  // starboard sliver near the bow (shadow side)
  const sb: [number, number, number][] = [];
  for (let u = stemU(sheer(0)); u >= -70; u -= 5) sb.push([u, sheer(u), -halfW(u, sheer(u))]);
  for (let u = -70; u <= 0; u += 5) sb.push([u, 0, -halfW(u, 0)]);
  c.fillStyle = '#05060a';
  c.fill(projPath(V, sb));
  // funnels (aft first)
  for (const fu of [-170, -132, -94]) {
    const y0 = sheer(fu) + 13;
    const H = 26;
    const rake = -7;
    const n = 14;
    const ring = (yy: number, du: number, sc: number) =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * TAU;
        return proj(V, fu + du + Math.cos(a) * 8 * sc, yy, Math.sin(a) * 6 * sc);
      });
    const bot = ring(y0, 0, 1);
    const top = ring(y0 + H, rake, 0.92);
    const band = ring(y0 + H * 0.74, rake * 0.74, 0.94);
    // silhouette: hull of the two rings (draw as quads)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = (i / n) * TAU;
      const lit = 0.5 + 0.5 * Math.sin(a + 0.6);
      const q = new Path2D();
      q.moveTo(bot[i][0], bot[i][1]);
      q.lineTo(bot[j][0], bot[j][1]);
      q.lineTo(band[j][0], band[j][1]);
      q.lineTo(band[i][0], band[i][1]);
      q.closePath();
      c.fillStyle = mix('#7a2418', '#f08a62', lit);
      c.fill(q);
      c.strokeStyle = c.fillStyle;
      c.lineWidth = 1;
      c.stroke(q);
      const q2 = new Path2D();
      q2.moveTo(band[i][0], band[i][1]);
      q2.lineTo(band[j][0], band[j][1]);
      q2.lineTo(top[j][0], top[j][1]);
      q2.lineTo(top[i][0], top[i][1]);
      q2.closePath();
      c.fillStyle = mix('#050508', '#2a2a36', lit);
      c.fill(q2);
      c.strokeStyle = c.fillStyle;
      c.stroke(q2);
    }
    const cap = new Path2D();
    top.forEach((p, i) => (i ? cap.lineTo(p[0], p[1]) : cap.moveTo(p[0], p[1])));
    cap.closePath();
    c.fillStyle = '#020203';
    c.fill(cap);
  }
  // mast and stays
  const m0 = proj(V, -36, sheer(-36), 0);
  const m1 = proj(V, -40, sheer(-36) + 46, 0);
  const st = proj(V, stemU(30), 30, 0);
  c.strokeStyle = '#1a1a22';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(m0[0], m0[1]);
  c.lineTo(m1[0], m1[1]);
  c.moveTo(m1[0], m1[1]);
  c.lineTo(st[0], st[1]);
  c.stroke();
  // superstructure tiers: port face and forward face
  const tiers: [number, number, number, number, number][] = [
    [-48, -210, 0, 6, 13],
    [-56, -196, 6, 11, 12],
    [-64, -176, 11, 15, 10.5],
    [-60, -84, 15, 19, 8],
  ];
  for (const [uf, ub, y0r, y1r, hw] of tiers) {
    const y0 = sheer(uf) + y0r;
    const y1 = sheer(uf) + y1r;
    const pf = projPath(V, [
      [uf, y0, hw],
      [ub, y0, hw],
      [ub, y1, hw],
      [uf, y1, hw],
    ]);
    const a = proj(V, uf, y1, hw);
    const b = proj(V, ub, y0, hw);
    c.fillStyle = grad(c, a[0], 0, b[0], 0, [
      [0, '#fbf1dc'],
      [1, '#c9b49a'],
    ]);
    c.fill(pf);
    const ff = projPath(V, [
      [uf, y0, -hw],
      [uf, y0, hw],
      [uf, y1, hw],
      [uf, y1, -hw],
    ]);
    c.fillStyle = '#e2b996';
    c.fill(ff);
    // window strip
    const ws = projPath(V, [
      [uf - 2, y0 + 1.4, hw + 0.05],
      [ub + 2, y0 + 1.4, hw + 0.05],
      [ub + 2, y0 + 3.2, hw + 0.05],
      [uf - 2, y0 + 3.2, hw + 0.05],
    ]);
    c.fillStyle = '#2a2a3a';
    c.fill(ws);
    const fw = projPath(V, [
      [uf + 0.05, y0 + 1.4, -hw + 1],
      [uf + 0.05, y0 + 1.4, hw - 1],
      [uf + 0.05, y0 + 3.2, hw - 1],
      [uf + 0.05, y0 + 3.2, -hw + 1],
    ]);
    c.fillStyle = '#ffd99a';
    c.fill(fw);
  }
  // hull port side
  const hp: [number, number, number][] = [];
  for (let y = 0; y <= sheer(10); y += 2) hp.push([stemU(y), y, 0]);
  for (let u = stemU(sheer(0)); u >= -L; u -= 4) hp.push([u, sheer(u), halfW(u, sheer(u))]);
  hp.push([-L, 0, halfW(-L, 0)]);
  for (let u = -L; u <= 0; u += 4) hp.push([u, 0, halfW(u, 0)]);
  const hull = projPath(V, hp);
  const b0 = proj(V, 0, 26, 0);
  const b1 = proj(V, -L, 0, B);
  c.fillStyle = grad(c, b0[0], b0[1], b1[0], b1[1], [
    [0, '#2a3550'],
    [0.08, '#141a2a'],
    [0.4, '#07080e'],
    [1, '#030306'],
  ]);
  c.fill(hull);
  // bow highlight airbrushed along the flare
  c.save();
  c.clip(hull);
  const hl = proj(V, -10, 22, halfW(-10, 22));
  c.fillStyle = radial(c, hl[0], hl[1], 0, 900 / Math.max(1, hl[2] / 40), [
    [0, 'rgba(140,170,220,0.35)'],
    [1, 'rgba(140,170,220,0)'],
  ]);
  c.fillRect(-500, -500, 2600, 1900);
  c.restore();
  // boot-topping and sheer line
  const bt: [number, number, number][] = [];
  for (let u = 0; u >= -L; u -= 6) bt.push([u, 2.8, halfW(u, 2.8) + 0.02]);
  for (let u = -L; u <= 0; u += 6) bt.push([u, 0, halfW(u, 0) + 0.02]);
  for (let y = 0; y <= 2.8; y += 1.4) bt.push([stemU(y), y, 0]);
  c.fillStyle = DECO.red;
  c.fill(projPath(V, bt));
  const sh: [number, number, number][] = [];
  for (let u = stemU(sheer(0)) - 0.5; u >= -L; u -= 5) sh.push([u, sheer(u) - 0.4, halfW(u, sheer(u)) + 0.02]);
  for (let u = -L; u <= stemU(sheer(0)) - 0.5; u += 5) sh.push([u, sheer(u) - 1.4, halfW(u, sheer(u) - 1.4) + 0.02]);
  c.fillStyle = goldGrad(c, b0[0], b0[1], b1[0], b1[1]);
  c.fill(projPath(V, sh));
  // portholes
  const lit = new Path2D();
  const dim = new Path2D();
  const rims = new Path2D();
  for (const yy of [9, 15, 21]) {
    for (let u = -10; u > -L + 10; u -= 5.5) {
      if (u === PORT_HOLE.u && yy === PORT_HOLE.y) continue;
      const q = proj(V, u, yy, halfW(u, yy) + 0.05);
      const rr = (0.85 * V.F) / q[2];
      if (rr < 0.6) continue;
      circle(q[0], q[1], rr * 1.3, rims);
      circle(q[0], q[1], rr, hash(u * 3.1 + yy) > 0.3 ? lit : dim);
    }
  }
  const fade = 1 - seg(t, T_PORT0, T_PORT0 + 0.5);
  c.globalAlpha = fade;
  c.fillStyle = rgba(DECO.gold, 0.85);
  c.fill(rims);
  c.fillStyle = '#ffd99a';
  c.fill(lit);
  c.fillStyle = '#3a3040';
  c.fill(dim);
  c.globalAlpha = 1;
  // the porthole we fall into
  const ph = proj(V, PORT_HOLE.u, PORT_HOLE.y, halfW(PORT_HOLE.u, PORT_HOLE.y) + 0.05);
  const pr = (0.85 * V.F) / ph[2];
  const ring = circle(ph[0], ph[1], pr * 1.45);
  circle(ph[0], ph[1], pr, ring);
  gilt(c, ring, [ph[0] - pr * 1.5, ph[1] - pr * 1.5, pr * 3, pr * 3], { rule: 'evenodd', angle: 0.8, sheen: seg(t, T_HORN + 0.4, T_PORT0 + 0.4) });
  if (!portGlass) {
    c.fillStyle = radial(c, ph[0] - pr * 0.3, ph[1] - pr * 0.3, 0, pr, [
      [0, '#fff3d0'],
      [1, '#f0a868'],
    ]);
    c.fill(circle(ph[0], ph[1], pr));
  }
  // anchor
  const an = proj(V, -5, 24, halfW(-5, 24) + 0.05);
  c.fillStyle = '#000';
  c.fill(circle(an[0], an[1], (1.3 * V.F) / an[2]));
};

const drawS4 = (r: Riso, c: Ctx, t: number, s: State, full: boolean, cam: Cam = [800, 450, 1]) => {
  r.camera(cam[0], cam[1], cam[2]);
  const V = view4(t);
  const hzn = proj(V, -4000, 0, 0)[1];
  const horn = t >= T_HORN ? seg(t, T_HORN, T_HORN + 1.0) : 0;
  // sky
  c.fillStyle = grad(c, 0, -100, 0, hzn, [
    [0, DECO.midnight],
    [0.5, '#25407a'],
    [0.85, '#a8566e'],
    [1, DECO.coral],
  ]);
  c.fillRect(-50, -50, 1700, hzn + 52);
  drawStars(c, s.stars4, t, DECO.cream, 0.8);
  // horn: rays burst from behind the bow
  const st = proj(V, stemU(30), 30, 0);
  if (horn > 0 && horn < 1) {
    const rk = ease.outExpo(seg(t, T_HORN, T_HORN + 0.25));
    const rays = burstPath(st[0], st[1], { r0: 40, r1: 2200, n: 30, width: 0.45, k: rk, stagger: 0 });
    c.fillStyle = radial(c, st[0], st[1], 0, 1400, [
      [0, rgba(DECO.peach, 0.85 * (1 - horn))],
      [1, rgba(DECO.coral, 0.25 * (1 - horn))],
    ]);
    c.fill(rays);
  }
  // sea
  c.fillStyle = grad(c, 0, hzn, 0, 900, [
    [0, '#3a3a6a'],
    [0.25, DECO.navy],
    [1, '#070b18'],
  ]);
  c.fillRect(-50, hzn, 1700, 960 - hzn);
  // deco wave rows
  const wv = new Path2D();
  for (let i = 0; i < 16; i++) {
    const k = i / 15;
    const y = hzn + 6 + Math.pow(k, 1.8) * (930 - hzn);
    const w = 18 + k * 150;
    const off = ((t * (20 + k * 160) + i * 37) % w) - w;
    for (let x = off - w; x < 1700; x += w) {
      wv.moveTo(x, y);
      wv.quadraticCurveTo(x + w / 2, y - 3 - k * 18, x + w, y);
    }
  }
  c.strokeStyle = rgba(DECO.cream, 0.4);
  c.lineWidth = 1.6;
  c.stroke(wv);
  // the liner
  drawLiner(c, V, t, !full && t > T_PORT0);
  // bow wave and spray
  const sw = proj(V, 0, 0, 0);
  const sc = V.F / sw[2];
  const foam = new Path2D();
  const fw = (horn > 0 ? 1 + 0.6 * Math.sin(horn * Math.PI) : 1) * sc * 0.28;
  foam.moveTo(sw[0] - 30 * fw, sw[1] + 2 * fw);
  foam.quadraticCurveTo(sw[0] - 10 * fw, sw[1] - 7 * fw, sw[0] + 2 * fw, sw[1] - 4 * fw);
  foam.quadraticCurveTo(sw[0] + 14 * fw, sw[1] - 9 * fw, sw[0] + 18 * fw, sw[1] + 1 * fw);
  foam.quadraticCurveTo(sw[0], sw[1] + 4 * fw, sw[0] - 30 * fw, sw[1] + 2 * fw);
  c.fillStyle = rgba(DECO.ivory, 0.92);
  c.fill(foam);
  if (horn > 0 && horn < 1) {
    const drops = new Path2D();
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI * (0.15 + 0.7 * hash(i));
      const dd = (20 + 60 * hash(i + 5)) * horn * sc * 0.3;
      circle(sw[0] + Math.cos(a) * dd * 3, sw[1] + Math.sin(a) * dd * 2 + horn * horn * 40 * sc * 0.1, (1.2 + hash(i + 9)) * sc * 0.4 * (1 - horn), drops);
    }
    c.fill(drops);
  }
  // horn steam and sound rings from the front funnel
  if (horn > 0) {
    const fp = proj(V, -94 - 7, sheer(-94) + 13 + 27, 0);
    const fs = V.F / fp[2];
    const steam = new Path2D();
    for (let i = 0; i < 7; i++) {
      const k = clamp(horn * 1.4 - i * 0.08);
      if (k <= 0) continue;
      circle(fp[0] - k * 6 * fs * (1 + i * 0.3), fp[1] - k * 9 * fs - i * 2 * fs * k, (1.2 + i * 0.35) * fs * (0.4 + k * 0.6), steam);
    }
    c.fillStyle = rgba(DECO.ivory, 0.9 * (1 - seg(t, T_HORN + 0.6, T_HORN + 1.3)));
    c.fill(steam);
    for (let i = 0; i < 3; i++) {
      const k = seg(t, T_HORN + i * 0.14, T_HORN + 0.9 + i * 0.14);
      if (k <= 0 || k >= 1) continue;
      c.strokeStyle = rgba(DECO.cream, 0.8 * (1 - k));
      c.lineWidth = 6 * (1 - k) + 1;
      c.beginPath();
      c.arc(fp[0], fp[1], 40 + k * 700, -Math.PI * 0.95, -Math.PI * 0.05);
      c.stroke();
    }
  }
};

const hornFlash = (c: Ctx, t: number) => {
  const k = seg(t, T_HORN - 0.02, T_HORN + 0.14);
  if (k <= 0 || k >= 1) return;
  c.fillStyle = rgba(DECO.ivory, 0.75 * (1 - k));
  c.fillRect(-50, -50, 1700, 1000);
};

const shake4 = (t: number) => (t > T_HORN && t < T_HORN + 0.35 ? Math.sin(t * 95) * 9 * (1 - (t - T_HORN) / 0.35) : 0);

const portScreen = (t: number) => {
  const V = view4(t);
  const ph = proj(V, PORT_HOLE.u, PORT_HOLE.y, halfW(PORT_HOLE.u, PORT_HOLE.y) + 0.05);
  return { x: ph[0], y: ph[1], r: (0.85 * V.F) / ph[2] };
};

const cam4 = (t: number): Cam => {
  const P = portScreen(t);
  const k = seg(t, T_PORT0, T_PORT1);
  const z = logLerp(1, Math.max(1, 1200 / P.r), ease.inCubic(k));
  const kk = ease.outCubic(k);
  return [lerp(800, P.x, kk) + shake4(t), lerp(450, P.y, kk), z];
};

/* ---------- S5: arrival ---------- */

const buildCity = (r: Riso): HTMLCanvasElement => {
  const RES = 1.25;
  const { canvas, ctx: c } = r.scratch(1700 * RES, 700 * RES);
  c.scale(RES, RES);
  c.translate(50, 0);
  const base = 640;
  const rng = mulberry(77);
  // far random towers
  let x = -60;
  while (x < 1660) {
    const w = 40 + rng() * 60;
    const h = 60 + rng() * 140;
    poly(
      zigguratPts(x + w / 2, base, [
        [w / 2, h * 0.7],
        [w * 0.32, h * 0.3],
      ])
    );
    c.fillStyle = '#16244a';
    c.fill(
      poly(
        zigguratPts(x + w / 2, base, [
          [w / 2, h * 0.7],
          [w * 0.32, h * 0.3],
        ])
      )
    );
    x += w + rng() * 6;
  }
  // symmetric front towers
  const towers: [number, [number, number][], number][] = [
    [
      800,
      [
        [72, 250],
        [56, 90],
        [42, 70],
        [28, 50],
        [16, 40],
      ],
      90,
    ],
    [
      210,
      [
        [56, 170],
        [42, 60],
        [28, 46],
      ],
      30,
    ],
    [
      400,
      [
        [70, 130],
        [50, 50],
        [30, 30],
      ],
      0,
    ],
    [
      600,
      [
        [80, 90],
        [56, 40],
      ],
      0,
    ],
    [
      60,
      [
        [60, 80],
        [40, 30],
      ],
      0,
    ],
  ];
  for (const [tx, tiers, spire] of towers) {
    for (const sx of tx === 800 ? [800] : [tx, 1600 - tx]) {
      const pts = zigguratPts(sx, base, tiers);
      const p = poly(pts);
      c.fillStyle = grad(c, sx - 80, 0, sx + 80, 0, [
        [0, '#2a3a6e'],
        [0.5, '#1b2a55'],
        [1, '#0c1430'],
      ]);
      c.fill(p);
      c.strokeStyle = rgba(DECO.gold, 0.7);
      c.lineWidth = 1.2;
      c.stroke(p);
      const top = base - tiers.reduce((a, b) => a + b[1], 0);
      if (spire) {
        c.fillStyle = goldGrad(c, sx - 6, top - spire, sx + 6, top);
        c.beginPath();
        c.moveTo(sx - 5, top);
        c.lineTo(sx, top - spire);
        c.lineTo(sx + 5, top);
        c.fill();
      }
      // windows: vertical lit slots
      const win = new Path2D();
      let yb = base;
      for (const [hw, th] of tiers) {
        for (let wx = sx - hw + 8; wx < sx + hw - 8; wx += 9) {
          for (let wy = yb - th + 8; wy < yb - 6; wy += 12) if (rng() < 0.35) win.rect(wx, wy, 3, 7);
        }
        yb -= th;
      }
      c.fillStyle = 'rgba(255,214,150,0.85)';
      c.fill(win);
    }
  }
  return canvas;
};

const drawS5 = (r: Riso, c: Ctx, t: number, s: State) => {
  const z = logLerp(1.18, 1, ease.outCubic(seg(t, T_PORT1 - 0.4, 17.2)));
  r.camera(800, 470, z);
  const hz = 640;
  c.fillStyle = grad(c, 0, -100, 0, hz, [
    [0, '#060c1e'],
    [0.5, DECO.navy],
    [0.85, '#2a4a7a'],
    [1, '#4a6a8a'],
  ]);
  c.fillRect(-400, -400, 2400, hz + 400);
  drawStars(c, s.stars5, t, DECO.cream, 0.9);
  // moon rising behind the central tower
  const my = lerp(330, 270, ease.outCubic(seg(t, T_PORT1 - 0.4, 17.6)));
  glow(c, 800, my, 330, '#f6e2b0', 0.45);
  // as the title lands the moon throws out a ring of gold rays
  const rk = ease.outBack(seg(t, T_TITLE - 0.5, T_TITLE + 0.6));
  if (rk > 0) {
    const rays = burstPath(800, my, { r0: 172, r1: 330, n: 48, width: 0.32, k: rk, stagger: 0, taper: true, alt: 0.4, a0: 0.02 * t });
    c.fillStyle = radial(c, 800, my, 160, 340, [
      [0, rgba(DECO.goldHi, 0.85)],
      [1, rgba(DECO.gold, 0)],
    ]);
    c.fill(rays);
  }
  const moon = circle(800, my, 150);
  c.fillStyle = radial(c, 760, my - 40, 0, 170, [
    [0, '#fffaf0'],
    [0.7, '#f6e6c0'],
    [1, '#e2c68a'],
  ]);
  c.fill(moon);
  const mr = new Path2D();
  for (const k of [0.92, 0.72, 0.52]) circle(800, my, 150 * k, mr);
  c.strokeStyle = 'rgba(190,150,80,0.35)';
  c.lineWidth = 2;
  c.stroke(mr);
  // searchlights
  for (let i = 0; i < 4; i++) {
    const sx = [390, 590, 1010, 1210][i];
    const ang = -Math.PI / 2 + (i < 2 ? -1 : 1) * (0.25 + 0.2 * Math.sin(t * 0.8 + i * 1.3));
    beam(c, sx, 470, ang, 900, 0.03, DECO.cream, 0.16);
  }
  c.drawImage(s.city5, -50, 0, 1700, 700);
  // central tower crown: a small sunburst echo
  glow(c, 800, 130, 50, DECO.goldHi, 0.5 + 0.2 * Math.sin(t * 3));
  // harbour
  c.fillStyle = grad(c, 0, hz, 0, 900, [
    [0, '#1b2c57'],
    [1, '#050914'],
  ]);
  c.fillRect(-400, hz, 2400, 600);
  const ref = new Path2D();
  const gold = new Path2D();
  for (let i = 0; i < 40; i++) {
    const y = hz + 4 + i * 6.5;
    const sh = Math.sin(t * 2.6 + i * 0.9) * 8;
    const w = 90 + i * 4;
    ref.rect(800 - w / 2 + sh, y, w * (0.6 + 0.4 * hash(i)), 2);
    for (let k = 0; k < 7; k++) {
      const lx = [160, 330, 560, 1040, 1270, 1440, 800][k];
      if (hash(i * 7 + k) > 0.55) gold.rect(lx - 8 + Math.sin(t * 3 + i + k) * 4, y, 16 * hash(i + k), 1.6);
    }
  }
  c.fillStyle = rgba('#fff2d0', 0.6);
  c.fill(ref);
  c.fillStyle = rgba('#ffd99a', 0.6);
  c.fill(gold);
  // the liner, small, gliding into port
  const lx = lerp(120, 330, seg(t, T_PORT1, DUR));
  const lin = new Path2D();
  lin.moveTo(lx - 120, hz + 26);
  lin.lineTo(lx + 92, hz + 26);
  lin.lineTo(lx + 112, hz + 8);
  lin.lineTo(lx - 110, hz + 10);
  lin.closePath();
  lin.rect(lx - 80, hz - 2, 140, 10);
  lin.rect(lx - 60, hz - 10, 90, 8);
  c.fillStyle = '#05070f';
  c.fill(lin);
  const fun = new Path2D();
  for (let i = 0; i < 3; i++) fun.rect(lx - 50 + i * 30, hz - 26, 12, 16);
  c.fillStyle = DECO.coral;
  c.fill(fun);
  const pl = new Path2D();
  for (let i = 0; i < 14; i++) circle(lx - 96 + i * 14, hz + 17, 1.8, pl);
  c.fillStyle = '#ffd99a';
  c.fill(pl);
};

/* ---------- film ---------- */

export const decoOrientLineFilm: RisoFilm<State> = {
  id: 'deco-orient-line',
  title: 'The Caspian Line',
  caption: 'From a Baku station clock to a headlamp, a porthole and a moon over a city far away.',
  theme: 'Origins',
  motif: 'The round light: clock, headlamp, porthole, moon',
  duration: DUR,
  series: 'Art deco',
  mode: 'direct',
  paper: DECO.midnight,
  grain: 0.22,
  inks: [{ color: DECO.gold }, { color: DECO.emerald }, { color: DECO.coral }, { color: DECO.navy }, { color: DECO.cream }],
  scenes: [
    { at: 0, label: 'Departure' },
    { at: T_S2, label: 'The bridge' },
    { at: T_MASK0, label: 'Dining car' },
    { at: T_THRU0, label: 'The liner' },
    { at: T_PORT1, label: 'Arrival' },
  ],
  posterTime: 18.2,

  setup(r: Riso) {
    const der = new Path2D();
    const rng = mulberry(5);
    for (let i = 0; i < 6; i++) {
      const x = 40 + i * 34 + rng() * 10;
      const h = 30 + rng() * 26;
      der.moveTo(x - 8, H0 + 2);
      der.lineTo(x, H0 - h);
      der.lineTo(x + 8, H0 + 2);
      der.closePath();
    }
    return {
      stars2: makeStars(40, 21, -400, 2000, -400, 200),
      stars4: makeStars(60, 22, 0, 1600, 0, 320),
      stars5: makeStars(80, 23, -300, 1900, -300, 420),
      far2: rangePaths(31, -1000, 2600, 640, 170, 320, 220, 360, 0.26),
      mid2: rangePaths(32, -1000, 2600, 700, 70, 160, 180, 300, 0),
      city5: buildCity(r),
      derricks: der,
    };
  },

  draw(r, t, s) {
    const c = r.layers[0];
    // S1 and the fall through the headlamp
    if (t < 4.6) {
      const L0 = loco1(t);
      const c0 = cam1(t);
      const covered = LAMP_R * L0.s * c0[2] * ease.inOutCubic(seg(t, T_ECLIPSE - 0.05, T_ECLIPSE + 0.3)) > 1100;
      if (!covered) drawS1(r, c, t, s);
      if (t > T_ECLIPSE - 0.05) {
        const cam = cam1(t);
        const L = loco1(t);
        const [lx, ly] = toScreen(cam, 800, L.lampY);
        const gr = LAMP_R * L.s * cam[2];
        const k = ease.inOutCubic(seg(t, T_ECLIPSE - 0.05, T_ECLIPSE + 0.3));
        r.camera(800, 450, 1);
        c.save();
        c.clip(circle(lx, ly, gr * k));
        drawS2(r, c, Math.max(t, T_S2), s);
        c.restore();
        r.camera(800, 450, 1);
        const rim = circle(lx, ly, gr * k + 6);
        circle(lx, ly, gr * k, rim);
        c.fillStyle = rgba('#fff4d6', 0.8 * (1 - seg(t, 4.2, 4.6)));
        c.fill(rim, 'evenodd');
      }
    } else if (t < T_MASK1) {
      drawS2(r, c, t, s);
    }
    // the dining car window opens around us
    if (t >= T_MASK0 && t < T_THRU1) {
      if (t < T_MASK1) {
        const cam = cam2(t);
        const W = win2(t);
        const [wx, wy] = toScreen(cam, W[0], W[1]);
        const ww = 40 * TRAIN2_S * cam[2];
        const wh = 30 * TRAIN2_S * cam[2];
        const k = ease.inOutCubic(seg(t, T_MASK0, T_MASK1));
        const x0 = lerp(wx - ww / 2, -80, k);
        const y0 = lerp(wy - wh / 2, -80, k);
        const x1 = lerp(wx + ww / 2, 1680, k);
        const y1 = lerp(wy + wh / 2, 980, k);
        r.camera(800, 450, 1);
        c.save();
        c.clip(rrect(x0, y0, x1 - x0, y1 - y0, lerp(7 * TRAIN2_S * cam[2], 0, k)));
        drawS3(r, c, t, s);
        c.restore();
      } else drawS3(r, c, t, s);
    }
    // through the window: the sea and the liner
    if (t >= T_THRU1) {
      const cam = cam4(t);
      const inPort = t > T_PORT0;
      // the liner scene, with a camera push into the porthole
      drawS4(r, c, t, s, true, cam);
      r.camera(800, 450, 1);
      hornFlash(c, t);
      if (inPort) {
        const P = portScreen(t);
        const sx = 800 + (P.x - cam[0]) * cam[2];
        const sy = 450 + (P.y - cam[1]) * cam[2];
        const pr = P.r * cam[2];
        r.camera(800, 450, 1);
        c.save();
        c.clip(circle(sx, sy, pr));
        if (pr > 1) drawS5(r, c, t, s);
        // warm glass fading off to reveal the city
        r.camera(800, 450, 1);
        c.fillStyle = rgba('#ffd9a0', 1 - seg(t, T_PORT0, T_PORT0 + 0.6));
        c.fillRect(sx - pr, sy - pr, pr * 2, pr * 2);
        c.restore();
        // brass rim stays on top while it sweeps past
        r.camera(800, 450, 1);
        const ring = circle(sx, sy, pr * 1.45);
        circle(sx, sy, pr, ring);
        if (pr < 1600) gilt(c, ring, [sx - pr * 1.5, sy - pr * 1.5, pr * 3, pr * 3], { rule: 'evenodd', angle: 0.8 });
      }
      if (t >= T_PORT1) drawS5(r, c, t, s);
    }

    /* ---------- overlays ---------- */
    r.camera(800, 450, 1);
    if (t >= T_TITLE - 0.2) {
      const k = ease.outCubic(seg(t, T_TITLE, T_TITLE + 1.2));
      // title plate over the harbour
      const plate = rrect(320, 716, 960, 132, 10);
      c.fillStyle = rgba('#060a18', 0.78 * clamp(k * 1.5));
      c.fill(plate);
      c.globalAlpha = clamp(k * 1.5);
      giltStroke(c, plate, [320, 716, 960, 132], 2);
      giltStroke(c, rrect(330, 726, 940, 112, 6), [320, 716, 960, 132], 1);
      c.globalAlpha = 1;
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.6)';
      c.shadowOffsetY = 3;
      c.shadowBlur = 6;
      decoText(c, 'THE CASPIAN LINE', 800, 792, 60, 22, k, letterGold(c, 745, 792), 500);
      c.restore();
      const sk = seg(t, 18.0, 19.0);
      if (sk > 0 && sk < 1) decoText(c, 'THE CASPIAN LINE', 800, 792, 60, 22, 1, sheenGrad(c, 400, 1200, sk), 500);
      ruleDiamond(c, 800, 808, 420, ease.outCubic(seg(t, T_TITLE + 0.5, T_TITLE + 1.3)), letterGold(c, 800, 816), 1.5);
      decoText(c, 'BAKU  ·  TO THE WORLD', 800, 836, 21, 13, ease.outCubic(seg(t, T_TITLE + 0.8, T_TITLE + 1.8)), DECO.cream, 500);
    }
    decoFrame(c, tween(t, 0.1, 1.6, ease.inOutCubic), {
      inset: 24,
      margin: DECO.midnight,
      sheenK: t > 15 ? seg(t, 17.6, 19.2) : seg(t, 1.2, 2.6),
    });
  },
};
