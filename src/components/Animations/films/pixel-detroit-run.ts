import type { RisoFilm, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, mulberry, hash } from '../riso/kit';
import {
  LW,
  LH,
  mk,
  mix,
  mixPal,
  u32Of,
  cyc,
  makePx,
  begin,
  present,
  dither,
  vGrad,
  disc,
  glow,
  iris,
  crisp,
  starfield,
  bake,
  spr,
  tint,
  figure,
  lookPal,
  runPose,
  text,
  windowBox,
  texFrom,
  markCycle,
  mode7,
  project7,
  starPath,
  type Px,
  type Look,
  type Pose,
  type Joints,
  type Tex,
  type Cam7,
} from '../styles/pixel16';

/* ---------- palette ---------- */

const OUT = '#120c1c';
const NIGHT = ['#07061a', '#0d0b2c', '#191548', '#2a2062', '#46296e', '#743872', '#a8526c'];
const DAWN = ['#2c2a72', '#46398c', '#7e4890', '#c85c7c', '#ef8566', '#ffb466', '#ffe49a'];
const STAR = ['#3a3a7a', '#9a9ad8', '#ffffff'];
const FURNACE = ['#ff6a24', '#ff8e34', '#ffb648', '#ffd86a', '#ffb648', '#ff8e34'];
const CROWN = ['#ffd27a', '#ffb050', '#ff8a3a', '#ffb050'];
const WATER_N = ['#0b1640', '#0f1d4c', '#122456', '#1a336c', '#25467f', '#3a5a9a'];
const WATER_D = ['#3a2c6e', '#4e3478', '#6a3c80', '#8e4a82', '#d0706e', '#ffc070'];
const SODIUM = '#ffcf78';

const GY = 194; // street level (feet)
const STAIR0 = 560;
const STAIR1 = 640;
const PLAT_Y = 134;
const ROOF_Y = 106; // train roof
const B1: [number, number, number] = [1480, 1690, 100];
const B2: [number, number, number] = [1800, 1895, 104];
const LOW_Y = 300; // street under the rooftops
const CAR_X = 1940;

/* ---------- the runner ---------- */

const hero: Look = {
  skin: '#e2a67c',
  skinS: '#a8664a',
  hair: '#2a1c1a',
  hairS: '#140c10',
  top: '#f0a83a',
  topS: '#b4602a',
  bot: '#3c4c9a',
  botS: '#252e66',
  shoe: '#f4f0ea',
  shoeS: '#b8b0c0',
  eye: '#1a0e14',
  headR: 4.6,
  torso: 10.5,
  thigh: 8.5,
  shin: 8.5,
  uarm: 6.2,
  farm: 5.8,
  legW: 3.8,
  armW: 3.2,
  chestW: 8.6,
  hipW: 6.8,
  hairFn: (c: Ctx, j: Joints, l: Look, back: boolean) => {
    const [hx, hy] = j.head;
    const R = l.headR;
    if (back) {
      c.fillStyle = l.topS;
      const p = new Path2D();
      p.ellipse(j.neck[0] - 2.4, j.neck[1] + 1.2, 3.4, 2.6, -0.4, 0, TAU);
      c.fill(p);
      return;
    }
    const p = new Path2D();
    p.moveTo(hx - R * 1.08, hy + R * 0.35);
    p.quadraticCurveTo(hx - R * 1.3, hy - R * 1.2, hx + R * 0.2, hy - R * 1.18);
    p.quadraticCurveTo(hx + R * 1.2, hy - R * 1.0, hx + R * 1.05, hy - R * 0.25);
    p.lineTo(hx + R * 0.55, hy - R * 0.55);
    p.lineTo(hx + R * 0.1, hy - R * 0.25);
    p.lineTo(hx - R * 0.35, hy - R * 0.1);
    p.lineTo(hx - R * 0.45, hy + R * 0.5);
    p.closePath();
    c.fillStyle = l.hair;
    c.fill(p);
    c.strokeStyle = '#6a6a86';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(hx - R * 0.15, hy, R * 1.12, -2.6, -0.95);
    c.stroke();
    c.fillStyle = '#d8323e';
    c.beginPath();
    c.ellipse(hx - R * 0.22, hy + R * 0.12, 1.3, 1.9, 0, 0, TAU);
    c.fill();
  },
  over: (c: Ctx, j: Joints, l: Look) => {
    const s = Math.sin(j.lean);
    const co = Math.cos(j.lean);
    const P = (v: number, u: number): [number, number] => [j.hip[0] + v * co + u * s, j.hip[1] + v * s - u * co];
    c.fillStyle = l.topS;
    const p = new Path2D();
    p.moveTo(...P(-0.5, 1));
    p.lineTo(...P(3.6, 1));
    p.lineTo(...P(3.2, 4.5));
    p.lineTo(...P(0, 4.2));
    p.closePath();
    c.fill(p);
    c.fillStyle = '#fff4d8';
    const q = P(3.4, 9);
    c.fillRect(Math.round(q[0]), Math.round(q[1]), 1, 3);
  },
};
const HERO_PAL = lookPal(hero, ['#6a6a86', '#d8323e', '#fff4d8']);

const POSES: Record<string, Pose> = {
  crouch: { lean: 0.5, bob: 4, legF: [1.0, 2.0], legB: [0.25, 1.7], armF: [-0.5, 0.9], armB: [-0.9, 0.8] },
  rise: { lean: 0.25, bob: -1, legF: [1.1, 1.7], legB: [-0.35, 0.4], armF: [2.4, 0.4], armB: [-1.0, 0.6] },
  leap: { lean: 0.32, bob: 0, legF: [1.45, 0.35], legB: [-0.65, 1.45], armF: [1.9, 0.15], armB: [-1.7, 0.35] },
  fall: { lean: 0.08, bob: 0, legF: [0.7, 1.1], legB: [0.05, 0.7], armF: [2.5, 0.5], armB: [1.9, 0.4] },
  land: { lean: 0.6, bob: 5, legF: [1.35, 2.4], legB: [0.5, 2.2], armF: [0.7, 1.2], armB: [-0.5, 1.0] },
  ride: { lean: 0.42, bob: 4.5, legF: [1.25, 2.1], legB: [-0.2, 1.9], armF: [0.25, 0.6], armB: [-1.1, 0.3] },
  surf: { lean: 0.12, bob: 1.5, legF: [0.62, 0.55], legB: [-0.55, 0.45], armF: [1.75, 0.3], armB: [-1.5, 0.25] },
  sit: { lean: -0.12, bob: 0, legF: [1.5, 1.5], legB: [1.4, 1.5], armF: [1.2, 0.35], armB: [1.1, 0.35] },
};

/* ---------- state ---------- */

interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
  ph: number;
}
interface Puff {
  x: number;
  y: number;
}
interface Side {
  x: number;
  y: number;
  k: number;
}
interface State {
  px: Px;
  stars: [number, number, number][];
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement;
  crowns: Win[];
  mid: HTMLCanvasElement;
  midWins: Win[];
  stacks: Puff[];
  guide: HTMLCanvasElement;
  front: HTMLCanvasElement;
  lamps: Side[];
  run: HTMLCanvasElement[];
  pose: Record<string, HTMLCanvasElement>;
  heroBack: HTMLCanvasElement;
  train: HTMLCanvasElement;
  carSide: HTMLCanvasElement[];
  carRear: HTMLCanvasElement;
  carRearEmpty: HTMLCanvasElement;
  rival: HTMLCanvasElement;
  lampPost: HTMLCanvasElement;
  facades: HTMLCanvasElement[];
  bollard: HTMLCanvasElement;
  tex: Tex;
  horizon: HTMLCanvasElement;
}

/* ---------- small pixel painters ---------- */

const R = (c: Ctx, col: string | CanvasPattern, x: number, y: number, w: number, h: number) => {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/** Brick wall: base with a staggered mortar texture */
const brick = (c: Ctx, x: number, y: number, w: number, h: number, base: string, dark: string, light: string) => {
  R(c, base, x, y, w, h);
  for (let yy = y + 2; yy < y + h; yy += 3) {
    c.fillStyle = dark;
    c.fillRect(x, yy, w, 1);
    const off = ((yy - y) / 3) % 2 ? 0 : 3;
    for (let xx = x + off; xx < x + w; xx += 6) c.fillRect(xx, yy - 2, 1, 2);
  }
  R(c, light, x, y, 1, h);
};

/** A window grid with seeded lit / dark panes */
const windows = (c: Ctx, rng: () => number, x: number, y: number, w: number, h: number, cw: number, ch: number, gx: number, gy: number, lit: number, cols: readonly string[]) => {
  for (let yy = y; yy + ch <= y + h; yy += ch + gy) {
    for (let xx = x; xx + cw <= x + w; xx += cw + gx) {
      const on = rng() < lit;
      R(c, on ? cols[Math.floor(rng() * (cols.length - 1))] : cols[cols.length - 1], xx, yy, cw, ch);
      if (on && ch > 2) R(c, mix(cols[0], '#ffffff', 0.4), xx, yy, cw, 1);
    }
  }
};

/* ---------- setup painters ---------- */

const paintFar = (rng: () => number) => {
  const W = 720;
  const { canvas, ctx: c } = mk(W, LH);
  const body = '#1d1846';
  const edge = '#2b2562';
  const lit = ['#c88a4a', '#9a6a6a', '#141034'];
  const crowns: Win[] = [];
  // back row: soft, lower
  for (let x = 0; x < W; ) {
    const w = 10 + Math.floor(rng() * 22);
    const h = 18 + Math.floor(rng() * 40);
    R(c, '#171338', x, 176 - h, w, h);
    x += w + Math.floor(rng() * 4);
  }
  for (let x = 4; x < W; ) {
    const w = 12 + Math.floor(rng() * 24);
    const h = 26 + Math.floor(rng() * 56);
    if (Math.abs(x - 391) < 70) {
      x += w;
      continue;
    }
    R(c, body, x, 176 - h, w, h);
    R(c, edge, x, 176 - h, 1, h);
    windows(c, rng, x + 2, 176 - h + 4, w - 4, h - 6, 1, 1, 2, 2, 0.22, lit);
    if (rng() < 0.25) R(c, body, x + Math.floor(w / 2), 176 - h - 8, 1, 8);
    x += w + 2 + Math.floor(rng() * 6);
  }
  // stepped deco tower with a spire
  {
    const x = 250;
    R(c, body, x, 92, 22, 84);
    R(c, body, x + 3, 78, 16, 14);
    R(c, body, x + 6, 66, 10, 12);
    R(c, body, x + 10, 48, 2, 18);
    R(c, edge, x, 92, 1, 84);
    R(c, edge, x + 3, 78, 1, 14);
    windows(c, rng, x + 2, 96, 18, 76, 1, 2, 2, 2, 0.3, lit);
    crowns.push({ x: x + 10, y: 48, w: 2, h: 2, ph: 1 });
  }
  // the round towers: four short cylinders around a tall one
  const cyl = (cx: number, top: number, w: number, crown: boolean) => {
    const x0 = cx - w / 2;
    const bands = ['#3c3478', '#30296a', '#262058', '#1d1846', '#16123a'];
    for (let i = 0; i < w; i++) {
      const k = i / (w - 1);
      const b = Math.min(bands.length - 1, Math.floor(Math.abs(k - 0.25) * 2 * bands.length * 0.8));
      R(c, bands[b], x0 + i, top, 1, 176 - top);
    }
    for (let y = top + 7; y < 172; y += 3) {
      for (let i = 1; i < w - 1; i++) {
        const k = i / (w - 1);
        const v = hash(y * 13.1 + i * 7.7 + cx);
        if (v < 0.18 + 0.3 * (1 - Math.abs(k - 0.35) * 2)) R(c, v < 0.08 ? '#e0a860' : '#5a4a8a', x0 + i, y, 1, 1);
      }
    }
    // rounded cap
    R(c, bands[1], x0 + 1, top - 1, w - 2, 1);
    if (crown) crowns.push({ x: x0 + 1, y: top + 2, w: w - 2, h: 2, ph: cx * 0.07 });
  };
  cyl(366, 86, 16, true);
  cyl(418, 86, 16, true);
  cyl(392, 46, 26, true);
  cyl(354, 102, 18, true);
  cyl(430, 102, 18, true);
  // pyramid-top tower
  {
    const x = 520;
    R(c, body, x, 84, 20, 92);
    for (let i = 0; i < 10; i++) R(c, body, x + i, 84 - i, 20 - i * 2, 1);
    R(c, edge, x, 84, 1, 92);
    windows(c, rng, x + 2, 88, 16, 84, 1, 1, 2, 2, 0.28, lit);
    crowns.push({ x: x + 9, y: 73, w: 2, h: 2, ph: 2 });
  }
  // far bank under the skyline
  R(c, '#120f30', 0, 172, W, 53);
  for (let x = 0; x < W; x += 3) if (hash(x * 1.7) < 0.3) R(c, '#c88a4a', x, 173, 1, 1);
  return { canvas, crowns };
};

const paintMid = (rng: () => number) => {
  const W = 1400;
  const { canvas, ctx: c } = mk(W, LH);
  const wins: Win[] = [];
  const stacks: Puff[] = [];
  const brickA = '#4a2238';
  const brickD = '#36182e';
  const brickL = '#6a3448';
  // smokestacks behind the hall
  for (const [x, top] of [
    [56, 38],
    [104, 52],
    [196, 30],
  ]) {
    R(c, '#3a1a30', x, top, 9, 120 - top);
    R(c, '#54283e', x, top, 2, 120 - top);
    for (let y = top + 6; y < 118; y += 14) R(c, '#6e3446', x, y, 9, 2);
    R(c, '#2a1226', x - 1, top - 2, 11, 3);
    stacks.push({ x: x + 4, y: top - 2 });
  }
  // main hall with a sawtooth roof
  brick(c, 10, 122, 240, 72, brickA, brickD, brickL);
  for (let x = 10; x < 250; x += 16) {
    for (let i = 0; i < 12; i++) R(c, '#2e1430', x + i + 4, 122 - 12 + i, 1, 12 - i);
    R(c, '#7a4a7a', x, 110, 4, 12);
    R(c, '#c07a6a', x + 1, 111, 2, 10);
    wins.push({ x: x + 1, y: 111, w: 2, h: 10, ph: x * 0.13 });
  }
  R(c, '#2e1430', 10, 120, 240, 2);
  for (let x = 18; x < 244; x += 14) {
    R(c, '#2a1024', x - 1, 135, 10, 26);
    wins.push({ x, y: 137, w: 8, h: 22, ph: x * 0.31 });
    R(c, '#2a1024', x - 1, 168, 10, 2);
  }
  // second block with a water tower
  brick(c, 262, 96, 150, 98, '#3e1e36', '#2c1428', '#5a2c44');
  for (let y = 104; y < 186; y += 12) {
    for (let x = 268; x < 404; x += 10) {
      const on = rng() < 0.4;
      R(c, on ? '#ffb050' : '#1e0e22', x, y, 5, 7);
      if (on) wins.push({ x, y, w: 5, h: 7, ph: rng() * 6 });
    }
  }
  R(c, '#24122a', 380, 90, 2, 6);
  R(c, '#24122a', 394, 90, 2, 6);
  R(c, '#3a2034', 374, 68, 26, 22);
  for (let y = 70; y < 90; y += 4) R(c, '#2a1428', 374, y, 26, 1);
  R(c, '#2a1428', 372, 66, 30, 3);
  R(c, '#2a1428', 386, 60, 2, 6);
  // apartment blocks behind the rooftops
  for (let x = 980; x < W; ) {
    const w = 40 + Math.floor(rng() * 40);
    const top = 70 + Math.floor(rng() * 50);
    R(c, '#2a1a40', x, top, w, 194 - top);
    R(c, '#3a2656', x, top, 1, 194 - top);
    R(c, '#20142e', x - 1, top - 2, w + 2, 2);
    for (let y = top + 6; y < 190; y += 9) {
      for (let xx = x + 4; xx < x + w - 6; xx += 8) {
        const on = rng() < 0.35;
        R(c, on ? (rng() < 0.6 ? '#ffcc66' : '#8ac0ff') : '#170e24', xx, y, 4, 5);
      }
    }
    x += w + 6 + Math.floor(rng() * 10);
  }
  return { canvas, wins, stacks };
};

const paintGuide = () => {
  const W = 2200;
  const { canvas, ctx: c } = mk(W, 340);
  for (let x = 0; x < W; x += 96) {
    const bottom = x > 1460 ? LOW_Y : GY;
    R(c, '#4a4682', x + 40, 142, 10, bottom - 142);
    R(c, '#6a66a8', x + 40, 142, 2, bottom - 142);
    R(c, '#34305e', x + 48, 142, 2, bottom - 142);
    R(c, '#5a5696', x + 34, 142, 22, 4);
  }
  R(c, '#8a86c0', 0, 134, W, 1);
  R(c, '#6c68a6', 0, 135, W, 5);
  R(c, '#4a4682', 0, 140, W, 2);
  for (let x = 0; x < W; x += 12) R(c, '#5a5696', x, 136, 1, 4);
  return canvas;
};

const paintFront = (rng: () => number) => {
  const W = 2200;
  const H = 340;
  const { canvas, ctx: c } = mk(W, H);
  const lamps: Side[] = [];
  // street and sidewalk up to the rooftops
  R(c, '#4e4680', 0, GY, 1480, 6);
  R(c, '#6a62a0', 0, GY, 1480, 1);
  for (let x = 0; x < 1480; x += 16) R(c, '#3e3870', x, GY + 1, 1, 5);
  R(c, '#2e2858', 0, GY + 6, 1480, 2);
  R(c, '#1a1636', 0, GY + 8, 1480, H - GY - 8);
  for (let x = 0; x < 1480; x += 22) R(c, '#4a4470', x, 214, 11, 1);
  // street lamps
  for (let x = 30; x < 540; x += 110) {
    R(c, '#1a1630', x, 150, 2, GY - 150);
    R(c, '#1a1630', x, 150, 9, 2);
    R(c, '#2a2448', x + 6, 152, 5, 2);
    R(c, SODIUM, x + 7, 154, 3, 1);
    lamps.push({ x: x + 8, y: 155, k: 0 });
  }
  for (let x = 850; x < 1470; x += 96) {
    R(c, '#1a1630', x, 160, 2, GY - 160);
    R(c, '#1a1630', x - 3, 162, 8, 1);
    R(c, '#fff0c0', x - 4, 158, 3, 3);
    R(c, '#fff0c0', x + 3, 158, 3, 3);
    lamps.push({ x: x - 3, y: 159, k: 1 });
    lamps.push({ x: x + 4, y: 159, k: 1 });
  }
  // crates and a hydrant in the factory row
  const crate = (x: number, y: number, s: number) => {
    R(c, '#5a3a3a', x, y, s, s);
    R(c, '#7a5048', x, y, s, 1);
    R(c, '#7a5048', x, y, 1, s);
    R(c, '#3a2228', x + s - 1, y, 1, s);
    R(c, '#3a2228', x, y + s - 1, s, 1);
    for (let i = 1; i < s - 1; i++) R(c, '#3a2228', x + i, y + i, 1, 1);
  };
  crate(300, GY - 12, 12);
  crate(312, GY - 10, 10);
  crate(304, GY - 22, 10);
  R(c, '#b8323a', 460, GY - 8, 5, 8);
  R(c, '#e05a5a', 460, GY - 8, 1, 8);
  R(c, '#b8323a', 459, GY - 9, 7, 2);
  // riverfront railings
  const rail = (x0: number, x1: number) => {
    R(c, '#3a3468', x0, 180, x1 - x0, 2);
    R(c, '#5a5490', x0, 180, x1 - x0, 1);
    R(c, '#2a2450', x0, 187, x1 - x0, 1);
    for (let x = x0; x < x1; x += 7) R(c, '#2a2450', x, 182, 1, GY - 182);
  };
  rail(400, STAIR0 - 4);
  rail(812, 1470);
  // station stairs and platform
  const steps = 15;
  for (let i = 0; i < steps; i++) {
    const x = STAIR0 + (i * (STAIR1 - STAIR0)) / steps;
    const y = GY - ((i + 1) * (GY - PLAT_Y)) / steps;
    R(c, '#5a5690', x, y, (STAIR1 - STAIR0) / steps + 1, GY - y);
    R(c, '#8a86c0', x, y, (STAIR1 - STAIR0) / steps + 1, 1);
  }
  for (let i = 0; i < 80; i++) {
    const x = STAIR0 + i;
    R(c, '#c0bce8', x, GY - 14 - (i * (GY - PLAT_Y)) / 80, 1, 1);
  }
  R(c, '#46427a', STAIR0, GY - 3, STAIR1 - STAIR0, 3);
  R(c, '#7a76b0', STAIR1, PLAT_Y, 172, 6);
  R(c, '#a6a2d8', STAIR1, PLAT_Y, 172, 1);
  R(c, '#46427a', STAIR1, PLAT_Y + 6, 172, 2);
  for (const x of [660, 740, 806]) {
    R(c, '#4a4682', x, PLAT_Y + 8, 6, GY - PLAT_Y - 8);
    R(c, '#6a66a8', x, PLAT_Y + 8, 1, GY - PLAT_Y - 8);
  }
  // shelter
  R(c, '#2a2a5a', 690, 112, 2, 22);
  R(c, '#2a2a5a', 738, 112, 2, 22);
  R(c, '#34407a', 692, 114, 46, 18);
  R(c, '#4a5c9a', 692, 114, 46, 1);
  R(c, '#1e1a40', 686, 110, 58, 3);
  R(c, '#ffd88a', 700, 116, 14, 4);
  R(c, '#1e1a40', 702, 117, 10, 2);
  // rooftop buildings
  const bld = (x0: number, x1: number, top: number, wall: string, wallD: string, wallL: string) => {
    brick(c, x0, top, x1 - x0, H - top, wall, wallD, wallL);
    R(c, '#6a4a7a', x0 - 1, top - 2, x1 - x0 + 2, 2);
    R(c, '#8a6a9a', x0 - 1, top - 2, x1 - x0 + 2, 1);
    for (let y = top + 10; y < H - 20; y += 16) {
      for (let x = x0 + 8; x < x1 - 10; x += 14) {
        const on = rng() < 0.42;
        R(c, '#1a1028', x - 1, y - 1, 8, 11);
        R(c, on ? (rng() < 0.7 ? '#ffcc66' : '#ff9a50') : '#24183a', x, y, 6, 9);
        if (on) R(c, '#fff0b0', x, y, 6, 1);
        R(c, '#1a1028', x, y + 4, 6, 1);
      }
    }
  };
  bld(B1[0], B1[1], B1[2], '#3a2040', '#2a1430', '#54305a');
  bld(B2[0], B2[1], B2[2], '#40243e', '#2e182e', '#5a3456');
  // roof furniture on B1: water tower, vents, antenna
  R(c, '#2a1830', 1524, 84, 2, 14);
  R(c, '#2a1830', 1544, 84, 2, 14);
  R(c, '#4a3048', 1520, 62, 28, 22);
  for (let y = 64; y < 84; y += 4) R(c, '#3a2238', 1520, y, 28, 1);
  R(c, '#5e3c5a', 1520, 62, 2, 22);
  for (let i = 0; i < 8; i++) R(c, '#3a2238', 1520 + i * 1.5, 62 - i, 28 - i * 3, 1);
  R(c, '#4a3a5a', 1600, 88, 18, 10);
  R(c, '#6a5a7a', 1600, 88, 18, 1);
  R(c, '#2a2038', 1603, 91, 12, 5);
  R(c, '#2a1830', 1650, 70, 1, 28);
  R(c, '#2a1830', 1646, 76, 9, 1);
  // fire escape on B1's alley side
  for (let y = 120; y < H; y += 26) {
    R(c, '#1a1226', B1[1] - 2, y, 14, 2);
    for (let x = B1[1] - 2; x < B1[1] + 12; x += 3) R(c, '#1a1226', x, y - 6, 1, 6);
    R(c, '#1a1226', B1[1] - 2, y - 6, 14, 1);
  }
  // chimney on B2
  R(c, '#4a2a3a', 1860, 88, 10, 16);
  R(c, '#2a1626', 1858, 86, 14, 3);
  // the low street: storefront wall, sidewalk, road
  R(c, '#1e1834', B2[1], 196, W - B2[1], LOW_Y - 196);
  for (let x = B2[1] + 6; x < W; x += 30) {
    R(c, '#2a2448', x, 230, 22, 50);
    R(c, rng() < 0.5 ? '#3a4a8a' : '#2a2a50', x + 2, 240, 18, 30);
    R(c, '#4a3a6a', x, 226, 22, 4);
  }
  R(c, '#4e4680', B2[1], LOW_Y, W - B2[1], 6);
  R(c, '#6a62a0', B2[1], LOW_Y, W - B2[1], 1);
  R(c, '#2e2858', B2[1], LOW_Y + 6, W - B2[1], 2);
  R(c, '#1a1636', B2[1], LOW_Y + 8, W - B2[1], H - LOW_Y - 8);
  R(c, '#1a1630', 2030, 250, 2, 50);
  R(c, '#1a1630', 2024, 250, 8, 2);
  R(c, SODIUM, 2024, 252, 3, 1);
  lamps.push({ x: 2025, y: 253, k: 0 });
  return { canvas, lamps };
};

/* ---------- sprites ---------- */

const paintTrain = () =>
  bake(150, 34, (c) => {
    const car = (x: number, front: boolean) => {
      const p = new Path2D();
      p.moveTo(x, 6);
      p.lineTo(x + 66, 6);
      if (front) p.quadraticCurveTo(x + 74, 7, x + 74, 18);
      else p.lineTo(x + 68, 6);
      p.lineTo(x + (front ? 74 : 68), 27);
      p.lineTo(x, 27);
      p.closePath();
      c.fillStyle = '#9aa4c8';
      c.fill(p);
      c.save();
      c.clip(p);
      c.fillStyle = '#dfe6f4';
      c.fillRect(x, 6, 80, 15);
      c.fillStyle = '#ffffff';
      c.fillRect(x, 7, 80, 1);
      c.fillStyle = '#3a64c8';
      c.fillRect(x, 20, 80, 3);
      c.fillStyle = '#24408a';
      c.fillRect(x, 23, 80, 1);
      c.restore();
      c.fillStyle = '#2a2c58';
      c.fillRect(x + 3, 10, front ? 60 : 62, 7);
      for (let i = 0; i < 6; i++) {
        c.fillStyle = i % 2 ? '#ffd88a' : '#ffe8b0';
        c.fillRect(x + 5 + i * 10, 11, 7, 5);
        c.fillStyle = '#2a2c58';
        c.fillRect(x + 7 + i * 10, 13, 3, 3);
        c.fillRect(x + 8 + i * 10, 12, 1, 1);
      }
      if (front) {
        c.fillStyle = '#2a2c58';
        c.fillRect(x + 65, 10, 6, 7);
        c.fillStyle = '#8ac0ff';
        c.fillRect(x + 66, 11, 3, 4);
        c.fillStyle = '#fffbe0';
        c.fillRect(x + 70, 19, 4, 3);
      }
      c.fillStyle = '#2a2648';
      c.fillRect(x + 8, 27, 14, 4);
      c.fillRect(x + 48, 27, 14, 4);
      c.fillStyle = '#5a5690';
      c.fillRect(x + 10, 28, 3, 2);
      c.fillRect(x + 56, 28, 3, 2);
      c.fillStyle = '#c0c8e0';
      c.fillRect(x + 30, 6, 10, 2);
    };
    car(2, false);
    c.fillStyle = '#2a2648';
    c.fillRect(70, 14, 6, 10);
    car(74, true);
  }, { outline: OUT });

const paintCarSide = (wheel: number) =>
  bake(84, 30, (c) => {
    const p = new Path2D();
    p.moveTo(4, 17);
    p.quadraticCurveTo(5, 12, 14, 12);
    p.lineTo(34, 11);
    p.lineTo(42, 11);
    p.lineTo(70, 12);
    p.quadraticCurveTo(79, 12, 80, 18);
    p.lineTo(80, 22);
    p.lineTo(4, 22);
    p.closePath();
    c.fillStyle = '#8a1a2a';
    c.fill(p);
    c.save();
    c.clip(p);
    c.fillStyle = '#d0303c';
    c.fillRect(0, 10, 90, 9);
    c.fillStyle = '#ff6a5a';
    c.fillRect(0, 12, 90, 1);
    c.fillStyle = '#e8e8f0';
    c.fillRect(0, 17, 90, 1);
    c.restore();
    // windshield
    c.fillStyle = '#9ad0f0';
    c.beginPath();
    c.moveTo(46, 11);
    c.lineTo(41, 4);
    c.lineTo(43, 4);
    c.lineTo(49, 11);
    c.fill();
    // bumpers, lights
    c.fillStyle = '#e8e8f0';
    c.fillRect(78, 19, 4, 3);
    c.fillRect(2, 19, 4, 3);
    c.fillStyle = '#fffbe0';
    c.fillRect(78, 14, 2, 2);
    c.fillStyle = '#ff3a3a';
    c.fillRect(4, 14, 2, 2);
    // seats
    c.fillStyle = '#3a1a1a';
    c.fillRect(24, 7, 4, 5);
    c.fillRect(30, 8, 3, 4);
    // wheels
    for (const wx of [18, 66]) {
      c.fillStyle = '#141420';
      c.beginPath();
      c.arc(wx, 22, 6, 0, TAU);
      c.fill();
      c.fillStyle = '#8a8aa8';
      c.beginPath();
      c.arc(wx, 22, 3, 0, TAU);
      c.fill();
      c.fillStyle = '#e8e8f0';
      const a = wheel * (Math.PI / 4);
      c.fillRect(Math.round(wx + Math.cos(a) * 2) - 0.5, Math.round(22 + Math.sin(a) * 2) - 0.5, 1, 1);
      c.fillRect(Math.round(wx - Math.cos(a) * 2) - 0.5, Math.round(22 - Math.sin(a) * 2) - 0.5, 1, 1);
    }
  }, { outline: OUT });

const paintCarRear = (driver: boolean) =>
  bake(64, 40, (c) => {
    // tyres
    c.fillStyle = '#141420';
    c.fillRect(6, 28, 10, 10);
    c.fillRect(48, 28, 10, 10);
    // body
    const p = new Path2D();
    p.moveTo(4, 30);
    p.lineTo(4, 22);
    p.quadraticCurveTo(6, 14, 14, 14);
    p.lineTo(50, 14);
    p.quadraticCurveTo(58, 14, 60, 22);
    p.lineTo(60, 30);
    p.closePath();
    c.fillStyle = '#8a1a2a';
    c.fill(p);
    c.save();
    c.clip(p);
    c.fillStyle = '#d0303c';
    c.fillRect(0, 14, 64, 10);
    c.fillStyle = '#ff6a5a';
    c.fillRect(0, 16, 64, 1);
    c.restore();
    // trunk line and plate
    c.fillStyle = '#8a1a2a';
    c.fillRect(10, 20, 44, 1);
    c.fillStyle = '#e8e8f0';
    c.fillRect(26, 23, 12, 5);
    c.fillStyle = '#3a3a5a';
    c.fillRect(28, 25, 8, 1);
    // tail lights
    c.fillStyle = '#ff2a3a';
    c.fillRect(6, 21, 9, 4);
    c.fillRect(49, 21, 9, 4);
    c.fillStyle = '#ffb0a0';
    c.fillRect(7, 22, 3, 1);
    c.fillRect(50, 22, 3, 1);
    // chrome bumper
    c.fillStyle = '#e8e8f0';
    c.fillRect(2, 29, 60, 3);
    c.fillStyle = '#8a8aa8';
    c.fillRect(2, 31, 60, 1);
    // windshield frame + seats
    c.fillStyle = '#2a1a22';
    c.fillRect(12, 8, 40, 6);
    c.fillStyle = '#9ad0f0';
    c.fillRect(14, 4, 36, 4);
    c.fillStyle = '#c0e8ff';
    c.fillRect(14, 4, 36, 1);
    if (driver) {
      // the runner from behind
      c.fillStyle = '#b4602a';
      c.fillRect(17, 6, 12, 8);
      c.fillStyle = '#2a1c1a';
      c.beginPath();
      c.arc(23, 3.5, 4, 0, TAU);
      c.fill();
      c.fillStyle = '#d8323e';
      c.fillRect(18, 3, 2, 3);
      c.fillRect(26, 3, 2, 3);
      c.fillStyle = '#6a6a86';
      c.fillRect(19, -0.5, 8, 1);
    }
  }, { outline: OUT });

const paintRival = () =>
  bake(60, 38, (c) => {
    c.fillStyle = '#0c0a14';
    c.fillRect(5, 28, 9, 9);
    c.fillRect(46, 28, 9, 9);
    const p = new Path2D();
    p.moveTo(3, 30);
    p.lineTo(4, 16);
    p.lineTo(12, 6);
    p.lineTo(48, 6);
    p.lineTo(56, 16);
    p.lineTo(57, 30);
    p.closePath();
    c.fillStyle = '#2a2440';
    c.fill(p);
    c.fillStyle = '#3e3660';
    c.fillRect(4, 16, 52, 2);
    c.fillStyle = '#4a5a8a';
    c.fillRect(14, 8, 32, 7);
    c.fillStyle = '#6a7aaa';
    c.fillRect(14, 8, 32, 1);
    c.fillStyle = '#ff2a3a';
    c.fillRect(6, 20, 48, 3);
    c.fillStyle = '#ffb0a0';
    c.fillRect(8, 21, 6, 1);
    c.fillRect(46, 21, 6, 1);
    c.fillStyle = '#8a8aa8';
    c.fillRect(3, 28, 54, 2);
  }, { outline: OUT });

const paintLampPost = () => {
  const { canvas, ctx: c } = mk(14, 48);
  R(c, '#2a2448', 6, 6, 2, 42);
  R(c, '#3a3460', 6, 6, 1, 42);
  R(c, '#2a2448', 2, 4, 10, 2);
  R(c, '#ffe0a0', 3, 6, 8, 2);
  R(c, '#2a2448', 4, 46, 6, 2);
  return canvas;
};

const paintFacade = (rng: () => number, kind: number) => {
  const w = 44 + kind * 6;
  const h = 70 + kind * 22;
  const { canvas, ctx: c } = mk(w, h);
  const walls = ['#3a2a52', '#46284a', '#2e2a50'];
  brick(c, 0, 0, w, h, walls[kind % 3], mix(walls[kind % 3], '#000000', 0.3), mix(walls[kind % 3], '#ffffff', 0.15));
  R(c, '#20162e', 0, 0, w, 3);
  windows(c, rng, 4, 8, w - 8, h - 24, 5, 6, 3, 4, 0.5, ['#ffcc66', '#ff9a50', '#1a1028']);
  R(c, '#2a4a7a', 4, h - 14, w - 8, 12);
  R(c, '#ffcc66', 6, h - 12, 8, 6);
  return canvas;
};

const paintBollard = () => {
  const { canvas, ctx: c } = mk(6, 12);
  R(c, '#2a2448', 1, 2, 4, 10);
  R(c, '#4a4470', 1, 2, 1, 10);
  R(c, '#2a2448', 0, 0, 6, 3);
  return canvas;
};

/* The avenue floor: 256 wide, 4096 long. The river is at the far end (small v) */
const TEX_W = 256;
const TEX_H = 4096;
const RIVER_V = 560;
const PLAZA_V = 640;
const paintAvenue = (rng: () => number) => {
  const { canvas, ctx: c } = mk(TEX_W, TEX_H, true);
  // blocks either side
  R(c, '#2a2840', 0, 0, TEX_W, TEX_H);
  for (let v = PLAZA_V; v < TEX_H; v += 64) {
    R(c, '#34304e', 2, v + 2, 36, 58);
    R(c, '#34304e', 218, v + 2, 36, 58);
    for (let i = 0; i < 10; i++) {
      R(c, rng() < 0.5 ? '#3e3a5c' : '#2e2a46', 4 + Math.floor(rng() * 30), v + 4 + Math.floor(rng() * 52), 4, 4);
      R(c, rng() < 0.5 ? '#3e3a5c' : '#2e2a46', 220 + Math.floor(rng() * 30), v + 4 + Math.floor(rng() * 52), 4, 4);
    }
  }
  // sidewalks
  R(c, '#6a6488', 40, PLAZA_V, 24, TEX_H - PLAZA_V);
  R(c, '#6a6488', 192, PLAZA_V, 24, TEX_H - PLAZA_V);
  for (let v = PLAZA_V; v < TEX_H; v += 8) {
    R(c, '#5a5478', 40, v, 24, 1);
    R(c, '#5a5478', 192, v, 24, 1);
  }
  R(c, '#8a84a8', 63, PLAZA_V, 1, TEX_H - PLAZA_V);
  R(c, '#8a84a8', 192, PLAZA_V, 1, TEX_H - PLAZA_V);
  // asphalt
  R(c, '#3a3850', 64, PLAZA_V, 128, TEX_H - PLAZA_V);
  for (let i = 0; i < 9000; i++) R(c, rng() < 0.5 ? '#423f5a' : '#33314a', 64 + Math.floor(rng() * 128), PLAZA_V + Math.floor(rng() * (TEX_H - PLAZA_V)), 1, 1);
  for (let v = PLAZA_V + 40; v < TEX_H; v += 40) {
    R(c, '#d8d4e8', 95, v, 2, 20);
    R(c, '#d8d4e8', 159, v, 2, 20);
  }
  R(c, '#f0c040', 126, PLAZA_V + 30, 1, TEX_H);
  R(c, '#f0c040', 129, PLAZA_V + 30, 1, TEX_H);
  // crosswalks every block
  for (let v = PLAZA_V + 256; v < TEX_H; v += 512) for (let u = 66; u < 190; u += 8) R(c, '#c8c4d8', u, v, 4, 14);
  // plaza and the river
  R(c, '#5a5478', 0, RIVER_V, TEX_W, PLAZA_V - RIVER_V + 30);
  for (let v = RIVER_V; v < PLAZA_V + 30; v += 10) for (let u = (v / 10) % 2 ? 0 : 5; u < TEX_W; u += 10) R(c, '#4e4870', u, v, 5, 5);
  R(c, '#8a84a8', 0, RIVER_V, TEX_W, 2);
  // water bands (marked for palette cycling later)
  for (let v = 0; v < RIVER_V; v++) {
    for (let u = 0; u < TEX_W; u += 4) {
      const k = Math.floor((v * 0.3 + Math.sin(u * 0.07 + v * 0.04) * 2.4 + hash(Math.floor(u / 4) * 3.1 + Math.floor(v / 2) * 0.7) * 1.4) % 6);
      R(c, ['#010101', '#020202', '#030303', '#040404', '#050505', '#060606'][(k + 6) % 6], u, v, 4, 1);
    }
  }
  const tex = texFrom(canvas);
  markCycle(tex, '#010101', 0);
  markCycle(tex, '#020202', 1);
  markCycle(tex, '#030303', 2);
  markCycle(tex, '#040404', 3);
  markCycle(tex, '#050505', 4);
  markCycle(tex, '#060606', 5);
  return tex;
};

/* Horizon: skyline straight ahead, the round towers to the left of the road, a bridge to the right */
const paintHorizon = (rng: () => number) => {
  const W = 512;
  const H = 110;
  const { canvas, ctx: c } = mk(W, H);
  const base = H - 4;
  for (let x = 0; x < W; ) {
    const w = 8 + Math.floor(rng() * 16);
    const h = x > 262 && x < 340 ? 3 + Math.floor(rng() * 6) : 6 + Math.floor(rng() * 20);
    R(c, '#1a1640', x, base - h, w, h);
    x += w + 1;
  }
  const cyl = (cx: number, top: number, w: number) => {
    for (let i = 0; i < w; i++) {
      const k = i / (w - 1);
      const sh = ['#3e3680', '#30296c', '#262058', '#1d1846', '#16123a'];
      R(c, sh[Math.min(4, Math.floor(Math.abs(k - 0.25) * 8))], cx - w / 2 + i, top, 1, base - top);
    }
    for (let y = top + 5; y < base - 2; y += 3) for (let i = 1; i < w - 1; i++) if (hash(y * 3.3 + i * 9.1 + cx) < 0.2) R(c, '#e0a860', cx - w / 2 + i, y, 1, 1);
    R(c, '#ffb050', cx - w / 2 + 1, top + 1, w - 2, 1);
  };
  cyl(196, 40, 12);
  cyl(232, 40, 12);
  cyl(214, 8, 18);
  cyl(186, 54, 13);
  cyl(242, 54, 13);
  // suspension bridge
  const bx0 = 330;
  const bx1 = 500;
  R(c, '#1d1846', bx0, base - 18, bx1 - bx0, 2);
  for (const tx of [370, 460]) {
    R(c, '#241e52', tx, base - 46, 3, 46);
    R(c, '#241e52', tx - 2, base - 46, 7, 2);
    R(c, '#ff3a3a', tx + 1, base - 48, 1, 1);
  }
  for (let x = bx0; x < bx1; x++) {
    const a = (x - 370) / 90;
    let y: number;
    if (x < 370) y = base - 46 + (1 - (x - bx0) / 40) * 28;
    else if (x <= 460) y = base - 46 + Math.sin(a * Math.PI) * 26;
    else y = base - 46 + ((x - 460) / 40) * 28;
    R(c, '#2e2866', x, Math.round(Math.min(y, base - 18)), 1, 1);
    if (x % 6 === 0 && y < base - 19) R(c, '#221c4c', x, Math.round(y), 1, base - 18 - Math.round(y));
  }
  for (let x = 0; x < W; x += 5) if (hash(x * 5.5) < 0.3) R(c, '#c88a4a', x, base - 2, 1, 1);
  R(c, '#120f30', 0, base, W, 4);
  return canvas;
};

/** Back view of the runner standing up in the car, fist in the air */
const paintHeroBack = () =>
  bake(30, 40, (c) => {
    const cx = 15;
    // raised arm (right side of the picture)
    const arm = new Path2D();
    arm.moveTo(19, 18);
    arm.lineTo(24, 9);
    arm.lineTo(25, 2);
    arm.lineTo(28, 2);
    arm.lineTo(27, 10);
    arm.lineTo(22, 20);
    arm.closePath();
    c.fillStyle = '#d8902e';
    c.fill(arm);
    c.fillStyle = '#e2a67c';
    c.beginPath();
    c.arc(26.5, 2.5, 2.3, 0, TAU);
    c.fill();
    // other arm down
    c.fillStyle = '#b4602a';
    c.fillRect(6, 18, 3, 12);
    // torso
    const p = new Path2D();
    p.moveTo(8, 18);
    p.quadraticCurveTo(cx, 14, 22, 18);
    p.lineTo(22, 38);
    p.lineTo(8, 38);
    p.closePath();
    c.fillStyle = '#f0a83a';
    c.fill(p);
    c.fillStyle = '#b4602a';
    c.fillRect(8, 32, 14, 6);
    c.fillRect(19, 19, 3, 19);
    // hood
    c.fillStyle = '#d8902e';
    c.beginPath();
    c.ellipse(cx, 19, 5, 3, 0, 0, TAU);
    c.fill();
    // head from behind
    c.fillStyle = '#e2a67c';
    c.fillRect(cx - 1.5, 14, 3, 3);
    c.fillStyle = '#2a1c1a';
    c.beginPath();
    c.arc(cx, 10, 5, 0, TAU);
    c.fill();
    c.fillStyle = '#140c10';
    c.fillRect(cx - 4, 11, 8, 2);
    c.fillStyle = '#6a6a86';
    c.fillRect(cx - 5, 5, 10, 1);
    c.fillStyle = '#d8323e';
    c.fillRect(cx - 6, 8, 2, 4);
    c.fillRect(cx + 4, 8, 2, 4);
  }, { outline: OUT });

/* ---------- motion ---------- */

const trainFront = (t: number) => 870 + 260 * (t - 4.95);

const groundAt = (x: number) => {
  if (x < STAIR0) return GY;
  if (x < STAIR1) return GY - ((x - STAIR0) / (STAIR1 - STAIR0)) * (GY - PLAT_Y);
  return PLAT_Y;
};

interface HeroAt {
  x: number;
  y: number;
  spr: string;
  ph: number;
}

/** Leap progress with a slow-motion hang at the apex */
const leapK = (t: number) => {
  if (t < 9.02) return 0.45 * ease.outSine(seg(t, 8.6, 9.02));
  if (t < 9.5) return lerp(0.45, 0.54, seg(t, 9.02, 9.5));
  return lerp(0.54, 1, ease.inSine(seg(t, 9.5, 9.9)));
};

const heroAt = (t: number): HeroAt => {
  if (t < 4.5) {
    const x = 60 + 150 * t;
    const onStairs = x > STAIR0 && x < STAIR1;
    return { x, y: groundAt(x), spr: 'run', ph: t * (onStairs ? 2.2 : 2.6) };
  }
  if (t < 4.95) {
    const k = seg(t, 4.5, 4.95);
    const x = lerp(735, 800, k);
    const y = lerp(PLAT_Y, ROOF_Y, k) - Math.sin(k * Math.PI) * 30;
    return { x, y, spr: k < 0.12 ? 'crouch' : k < 0.45 ? 'rise' : k < 0.85 ? 'leap' : 'fall', ph: 0 };
  }
  if (t < 7.5) {
    const x = trainFront(t) - 70 + (t > 6.1 ? lerp(0, 8, tween(t, 6.1, 7.2)) : 0);
    const spr = t < 5.12 ? 'land' : t < 6.0 ? 'ride' : 'surf';
    return { x, y: ROOF_Y, spr, ph: 0 };
  }
  if (t < 7.95) {
    const k = seg(t, 7.5, 7.95);
    const x0 = trainFront(7.5) - 62;
    return { x: lerp(x0, 1560, k), y: lerp(ROOF_Y, B1[2], k) - Math.sin(k * Math.PI) * 22, spr: k < 0.15 ? 'crouch' : k < 0.75 ? 'leap' : 'fall', ph: 0 };
  }
  if (t < 8.6) {
    const k = seg(t, 7.95, 8.6);
    return { x: lerp(1560, 1672, k), y: B1[2], spr: t < 8.05 ? 'land' : 'run', ph: t * 2.7 };
  }
  if (t < 9.9) {
    const k = leapK(t);
    const x = lerp(1672, 1814, k);
    const y = lerp(B1[2], B2[2], k) - Math.sin(k * Math.PI) * 44;
    return { x, y, spr: k < 0.06 ? 'crouch' : k < 0.2 ? 'rise' : k < 0.8 ? 'leap' : 'fall', ph: 0 };
  }
  if (t < 10.35) {
    const k = seg(t, 9.9, 10.35);
    return { x: lerp(1814, 1884, k), y: B2[2], spr: t < 10.02 ? 'land' : 'run', ph: t * 2.7 };
  }
  if (t < 10.95) {
    const k = seg(t, 10.35, 10.95);
    const x = lerp(1884, CAR_X + 6, ease.outSine(k));
    const y = lerp(B2[2], LOW_Y - 12, ease.inCubic(k)) - Math.sin(k * Math.PI) * 10;
    return { x, y, spr: k < 0.5 ? 'leap' : 'fall', ph: 0 };
  }
  return { x: CAR_X + 6, y: LOW_Y - 12, spr: 'sit', ph: 0 };
};

const carX = (t: number) => CAR_X + (t > 11.1 ? 0.5 * 700 * (t - 11.1) ** 2 : 0);

/* ---------- side-scroll scenes (0 .. 11.7) ---------- */

const drawSide = (s: State, t: number) => {
  const c = s.px.c;
  const h = heroAt(t);
  // camera
  let camX = h.x - 150;
  if (t > 10.35) camX = lerp(1884 - 150, 1790, tween(t, 10.35, 10.95)) + (t > 11.1 ? (carX(t) - CAR_X) * 0.45 : 0);
  const camY = t < 10.35 ? 0 : clamp((h.y - B2[2]) * 0.62, 0, 114);
  const freeze = t > 9.02 && t < 9.5;

  // sky + stars
  c.drawImage(s.sky, 0, 0);
  starfield(c, s.stars, t, STAR, -camX * 0.02, -camY * 0.05, 150);
  // far skyline + its glowing crowns (the light ahead)
  const fo = Math.round(camX * 0.12);
  const fy = Math.round(-camY * 0.12);
  c.drawImage(s.far, -fo, fy);
  for (const w of s.crowns) R(c, cyc(CROWN, w.ph, t, 4), w.x - fo, w.y + fy, w.w, w.h);
  // the river, palette cycled
  {
    const y0 = 176 + fy;
    for (let y = y0; y < GY + 4 - camY * 0.45; y++) {
      const k = y - y0;
      for (let x = 0; x < LW; x += 8) {
        const i = Math.floor(k * 0.5 + Math.sin((x + camX * 0.3) * 0.05 + k) * 1.5);
        R(c, cyc(WATER_N, i, t, 3), x, y, 8, 1);
      }
    }
    // tower light dancing on the water
    for (let k = 0; k < 7; k++) {
      const yy = y0 + 3 + k * 2;
      const wob = Math.round(Math.sin(t * 6 + k * 1.7) * 2);
      R(c, k % 2 ? '#ffb050' : '#ffd27a', 391 - fo - 4 + wob - k * 0.3, yy, 8 - k * 0.6, 1);
    }
  }
  // mid layer: factories, then apartments
  const mo = Math.round(camX * 0.45 + 60);
  const my = Math.round(-camY * 0.45);
  c.drawImage(s.mid, -mo, my);
  for (const w of s.midWins) {
    const sx = w.x - mo;
    if (sx < -10 || sx > LW) continue;
    R(c, cyc(FURNACE, w.ph, t, 5), sx, w.y + my, w.w, w.h);
    R(c, '#ffe9a0', sx, w.y + my, w.w, 1);
  }
  // smoke
  for (const st of s.stacks) {
    const sx = st.x - mo;
    if (sx < -60 || sx > LW + 20) continue;
    for (let i = 0; i < 7; i++) {
      const a = (t * 0.45 + i / 7) % 1;
      const x = sx + a * 34 + Math.sin(a * 5 + i) * 2;
      const y = st.y + my - a * 34;
      const rr = 2 + a * 7;
      c.fillStyle = dither(c, '#2e2450', '#433670', 0.5 - a * 0.4);
      disc(c, x, y, rr);
      c.fillStyle = '#4e4078';
      disc(c, x - rr * 0.3, y - rr * 0.35, rr * 0.45);
    }
  }
  // guideway
  c.drawImage(s.guide, -Math.round(camX), -Math.round(camY));
  // the train and its headlight beam
  const tf = trainFront(t);
  const tx = Math.round(tf - 150 - camX);
  const ty = Math.round(ROOF_Y - 6 - camY);
  if (tx > -160 && tx < LW + 10) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    crisp(
      s.px,
      (q) => {
        q.fillStyle = '#3a3218';
        q.beginPath();
        q.moveTo(tx + 148, ty + 20);
        q.lineTo(tx + 250, ty + 4);
        q.lineTo(tx + 250, ty + 44);
        q.closePath();
        q.fill();
        q.fillStyle = '#2a2410';
        q.beginPath();
        q.moveTo(tx + 148, ty + 21);
        q.lineTo(tx + 200, ty + 14);
        q.lineTo(tx + 200, ty + 30);
        q.closePath();
        q.fill();
      },
      tx + 140,
      ty - 4,
      120,
      56
    );
    c.restore();
    c.drawImage(s.train, tx, ty);
  }
  // street, station, rooftops
  c.drawImage(s.front, -Math.round(camX), -Math.round(camY));
  // lamp glows (colour math: additive)
  for (const l of s.lamps) {
    const sx = l.x - camX;
    if (sx < -20 || sx > LW + 20) continue;
    const fl = 0.85 + 0.15 * Math.sin(t * 9 + l.x);
    glow(c, sx, l.y - camY + 3, (l.k ? 9 : 14) * fl, '#3a2008', 0.3);
  }
  // the car on the low street
  const cx = carX(t);
  {
    const sx = cx - camX;
    const sy = LOW_Y - camY;
    if (sx > -100 && sx < LW + 20) {
      const wf = t > 11.1 ? Math.floor((cx - CAR_X) / 4) % 4 : 0;
      if (t > 10.95) {
        // headlights on
        c.save();
        c.globalCompositeOperation = 'lighter';
        const on = t > 11.0 ? 1 : 0;
        if (on) {
          crisp(
            s.px,
            (q) => {
              q.fillStyle = '#3a3418';
              q.beginPath();
              q.moveTo(sx + 78, sy - 15);
              q.lineTo(sx + 170, sy - 30);
              q.lineTo(sx + 170, sy + 8);
              q.closePath();
              q.fill();
            },
            sx + 70,
            sy - 40,
            110,
            60
          );
        }
        c.restore();
      }
      if (t >= 10.95) {
        spr(c, s.pose.sit, sx + 28, sy - 13, 22, 31);
      }
      c.drawImage(s.carSide[wf], Math.round(sx), Math.round(sy - 28));
    }
  }
  // the runner
  if (t < 10.95) {
    const img = h.spr === 'run' ? s.run[Math.floor((((h.ph % 1) + 1) % 1) * 8)] : s.pose[h.spr];
    spr(c, img, h.x - camX, h.y - camY, 22, 31 + 17);
    if (freeze) {
      // impact frame: white silhouette flash on the first frames of the hang
      if (t < 9.1) spr(c, tint(img, '#ffffff'), h.x - camX, h.y - camY, 22, 48);
    }
  }
  // speed lines while riding
  if (t > 5.0 && t < 7.5) {
    const k = Math.min(seg(t, 5.0, 5.4), 1 - seg(t, 7.2, 7.5));
    for (let i = 0; i < 14; i++) {
      const y = 20 + ((i * 37) % 150);
      const x = LW - (((t * 900 + i * 173) % (LW + 80)) | 0);
      R(c, i % 3 ? '#8a86c0' : '#c0bce8', x, y, Math.round(20 * k + 6), 1);
    }
  }
  // the apex hang: radial speed burst behind everything but the runner
  return { camX, camY, h, freeze };
};

/** Radial burst lines centred on the runner during the hang */
const burst = (s: State, cx: number, cy: number, k: number) => {
  const c = s.px.c;
  c.save();
  c.globalCompositeOperation = 'lighter';
  crisp(s.px, (q) => {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + hash(i) * 0.2;
      const r0 = 26 + hash(i + 3) * 20;
      const r1 = r0 + 60 + hash(i + 7) * 120 * k;
      const w = 0.03 + hash(i + 11) * 0.03;
      q.fillStyle = i % 2 ? '#5a3010' : '#3a2a50';
      q.beginPath();
      q.moveTo(cx + Math.cos(a - w) * r0, cy + Math.sin(a - w) * r0);
      q.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      q.lineTo(cx + Math.cos(a + w) * r0, cy + Math.sin(a + w) * r0);
      q.fill();
    }
  });
  c.restore();
};

/* ---------- Mode 7 avenue (11.7 .. 19) ---------- */


/** Distance travelled along the avenue since 11.7 */
const drive = (t: number) => {
  const a = Math.max(0, t - 11.7);
  // accel 0.9 s to cruise, cruise, then a long brake to the river
  const v0 = 140;
  const vc = 560;
  const ta = 0.9;
  const tb = 15.0 - 11.7;
  const td = 1.7;
  if (a < ta) return v0 * a + ((vc - v0) / (2 * ta)) * a * a;
  const sA = v0 * ta + ((vc - v0) / 2) * ta;
  if (a < tb) return sA + vc * (a - ta);
  const sB = sA + vc * (tb - ta);
  const k = Math.min(1, (a - tb) / td);
  return sB + vc * td * (k - (k * k) / 2);
};
const totalDrive = () => drive(30);

const V_CAR0 = 2900;
const V_CAR1 = RIVER_V + 26;
const HOR_VP = 232; // horizon canvas x straight down the avenue
const SUN_X = 300; // horizon canvas x where the sun comes up

const drawAvenue = (s: State, t: number) => {
  const c = s.px.c;
  const dist = drive(t);
  const vCar = lerp(V_CAR0, V_CAR1, dist / totalDrive());
  // dawn
  const dawn = clamp(seg(t, 12.2, 17.2));
  const sky = mixPal(NIGHT, DAWN, ease.inOutSine(dawn), 10);
  // lane changes: weave out to pass the rival, then back to the centre
  const lane = 150 + 26 * Math.sin(seg(t, 12.6, 14.6) * Math.PI) * (t < 14.6 ? 1 : 0) - 22 * tween(t, 14.6, 15.4) + 22 * tween(t, 15.6, 16.6);
  const steer = Math.cos(seg(t, 12.6, 14.6) * Math.PI) * 0.06 * (t > 12.6 && t < 14.6 ? 1 : 0);
  // at the river the camera cranes up and swings right around the parked car, toward the sun
  const rise = tween(t, 16.0, 18.4, ease.inOutCubic);
  const yaw = 0.3 * tween(t, 16.0, 18.6, ease.inOutSine);
  const carY = 214 - 8 * rise + (Math.sin(t * 23) > 0.7 && t < 16.3 ? -1 : 0);
  const hor = lerp(92, 124, rise);
  const hgt = lerp(18, 30, rise);
  const f = 190;
  const carZ = (hgt * f) / (carY - 2 - hor);
  const a = steer + yaw + Math.sin(t * 1.3) * 0.004;
  const cam: Cam7 = { x: lane - Math.sin(a) * carZ, y: vCar + Math.cos(a) * carZ, a, h: hgt, hor, f };
  const v = cam.y;
  // sky
  vGrad(c, 0, 0, LW, Math.ceil(cam.hor) + 1, sky, 1);
  starfield(c, s.stars, t, STAR.map((q) => mix(q, sky[2], dawn)), 0, 0, Math.max(0, cam.hor - 30 - dawn * 60));
  // the sun rises at the end of the avenue
  const sunUp = tween(t, 15.0, 18.0, ease.outCubic);
  const sunR = 30;
  const sunY = cam.hor + sunR + 6 - sunUp * 70;
  const g = lerp(1, 1.3, seg(dist, 0, totalDrive()));
  const hx = Math.round(200 - HOR_VP * g - a * f + (150 - lane) * 0.3);
  const sunX = hx + SUN_X * g;
  if (sunUp > 0) {
    glow(c, sunX, sunY, sunR + 34, '#3a1c0a', 0.6);
    c.fillStyle = '#ffd25a';
    disc(c, sunX, sunY, sunR);
    c.fillStyle = dither(c, '#ffd25a', '#ffe68a', 0.5);
    disc(c, sunX - 3, sunY - 4, sunR * 0.78);
    c.fillStyle = '#ffe68a';
    disc(c, sunX - 6, sunY - 8, sunR * 0.5);
    c.fillStyle = dither(c, '#ffe68a', '#fff6c8', 0.5);
    disc(c, sunX - 8, sunY - 10, sunR * 0.28);
    // retro sun bands
    for (let i = 0; i < 6; i++) {
      const yy = Math.round(sunY + 4 + i * 5);
      R(c, sky[Math.min(6, 4 + Math.floor(i / 3))], sunX - sunR, yy, sunR * 2 + 1, 1 + Math.floor(i / 2));
    }
  }
  // horizon skyline: grows as we approach, slides with the steering
  {
    const w = Math.round(s.horizon.width * g);
    const hh = Math.round(s.horizon.height * g);
    c.drawImage(s.horizon, hx, Math.round(cam.hor - hh + 3), w, hh);
    // tower crowns glow (palette cycled)
    R(c, cyc(CROWN, 0, t, 4), hx + Math.round(206 * g), Math.round(cam.hor - hh + 3 + 9 * g), Math.round(16 * g), Math.max(1, Math.round(g)));
    if (dawn > 0.25) {
      c.save();
      c.globalAlpha = clamp((dawn - 0.25) * 1.5) * 0.55;
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = '#b0607a';
      c.fillRect(0, Math.round(cam.hor - hh), LW, hh + 3);
      c.restore();
    }
  }
  // floor
  const water = mixPal(WATER_N, WATER_D, dawn, 8);
  const cycle = [0, 1, 2, 3, 4, 5].map((i) => u32Of(cyc(water, i, t, 5)));
  mode7(s.px, s.tex, cam, { fog: sky[5], fogNear: 200, fogFar: 1500, fogMax: 0.85, cycle });
  // colour math: night darkening and dawn warmth over the floor
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = mix('#6e6aac', '#ffd8c0', ease.inOutSine(dawn));
  c.fillRect(0, Math.floor(cam.hor) + 1, LW, LH);
  c.restore();
  // sun path on the water
  if (sunUp > 0) {
    const rows = LH - cam.hor;
    for (let k = 0; k < 18; k++) {
      const y = Math.round(cam.hor + 2 + (k * k * rows) / 360);
      if (y >= LH) break;
      // only on the water, not on the road or the plaza
      const zr = (cam.h * cam.f) / (y + 0.5 - cam.hor);
      if (cam.y - Math.cos(cam.a) * zr > RIVER_V - 4) continue;
      const w = Math.round(6 + k * 2.6 + Math.sin(t * 7 + k * 1.9) * 3);
      const wob = Math.round(Math.sin(t * 4 + k * 0.8) * (1 + k * 0.2));
      R(c, k % 3 === 0 ? '#fff2b0' : '#ffc060', sunX - w / 2 + wob, y, w, 1);
    }
  }
  // roadside sprites: lamps and facades, far to near
  const items: { u: number; v: number; img: HTMLCanvasElement; hgt: number; lamp?: boolean }[] = [];
  const v0 = Math.floor((v - 1400) / 96) * 96;
  for (let vv = v0; vv < v; vv += 96) {
    if (vv < PLAZA_V + 40) continue;
    items.push({ u: 60, v: vv, img: s.lampPost, hgt: 40, lamp: true });
    items.push({ u: 196, v: vv + 48, img: s.lampPost, hgt: 40, lamp: true });
  }
  const f0 = Math.floor((v - 1400) / 128) * 128;
  for (let vv = f0; vv < v; vv += 128) {
    if (vv < PLAZA_V + 60) continue;
    const k = Math.abs(Math.floor(vv / 128)) % 3;
    items.push({ u: 22, v: vv, img: s.facades[k], hgt: 70 + k * 18 });
    items.push({ u: 234, v: vv + 64, img: s.facades[(k + 1) % 3], hgt: 76 + ((k + 1) % 3) * 18 });
  }
  for (let uu = 8; uu < 256; uu += 20) items.push({ u: uu, v: RIVER_V + 4, img: s.bollard, hgt: 10 });
  const proj = items
    .map((it) => ({ it, p: project7(cam, it.u, it.v) }))
    .filter((q) => q.p && q.p.z > 4 && q.p.z < 1500)
    .sort((a, b) => (b.p?.z ?? 0) - (a.p?.z ?? 0));
  const lampsOff = dawn > 0.8;
  for (const { it, p } of proj) {
    if (!p) continue;
    const hgt = it.hgt * p.s;
    const w = (it.img.width / it.img.height) * hgt;
    if (hgt < 1) continue;
    c.drawImage(it.img, Math.round(p.x - w / 2), Math.round(p.y - hgt), Math.max(1, Math.round(w)), Math.max(1, Math.round(hgt)));
    if (it.lamp && !lampsOff && hgt > 6) {
      glow(c, p.x, p.y - hgt * 0.86, clamp(hgt * 0.3, 2, 12), '#3a2408', 0.35);
    }
  }
  // the rival: a dark sedan we reel in and pass
  {
    const rv = V_CAR0 - 110 - (t - 11.7) * 460; // rival's v (slower than us)
    const p = project7(cam, 116, rv);
    if (p && t > 11.7 && t < 15.2) {
      const hgt = 30 * p.s * 0.95;
      const w = (s.rival.width / s.rival.height) * hgt;
      if (p.z > carZ - 4) {
        spr(c, s.rival, p.x, p.y, s.rival.width / 2, s.rival.height, hgt / s.rival.height);
        // its tail-lights flare
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = '#3a0a0a';
        disc(c, p.x - w * 0.36, p.y - hgt * 0.42, Math.max(1, w * 0.12));
        disc(c, p.x + w * 0.36, p.y - hgt * 0.42, Math.max(1, w * 0.12));
        c.restore();
      }
    }
  }
  // the hero car
  const stopped = t > 16.4;
  const rx = 200 + Math.round(steer * -120);
  // headlight pool ahead of the car
  if (dawn < 0.85) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    crisp(s.px, (q) => {
      q.fillStyle = dawn < 0.5 ? '#2c220c' : '#1a1406';
      q.beginPath();
      q.moveTo(rx - 22, carY - 26);
      q.lineTo(rx - 60, cam.hor + 14);
      q.lineTo(rx + 60, cam.hor + 14);
      q.lineTo(rx + 22, carY - 26);
      q.closePath();
      q.fill();
    }, 0, cam.hor, LW, LH - cam.hor);
    c.restore();
  }
  spr(c, t > 16.9 ? s.carRearEmpty : s.carRear, rx, carY, 32, 39);
  // the runner stands up in the seat, fist up
  if (t > 16.9) {
    const k = tween(t, 16.9, 17.4, ease.outBack);
    spr(c, s.heroBack, rx - 9, carY - 26 + (1 - k) * 12, 15, 38);
  }
  // tail-light glow: the light that has been leading all night
  glow(c, rx - 21, carY - 16, stopped ? 6 : 9, '#4a0c10', 0.35);
  glow(c, rx + 21, carY - 16, stopped ? 6 : 9, '#4a0c10', 0.35);
  // boost streaks while overtaking
  const boost = Math.min(seg(t, 13.3, 13.6), 1 - seg(t, 14.3, 14.7));
  if (boost > 0) {
    crisp(s.px, (q) => {
      q.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const a = hash(i * 2.3) * TAU;
        const ph = (t * 3.2 + hash(i)) % 1;
        const r0 = 40 + ph * 220;
        const x = 200 + Math.cos(a) * r0;
        const y = cam.hor + 20 + Math.sin(a) * r0 * 0.55;
        if (y < cam.hor + 4) continue;
        const len = 4 + ph * 18 * boost;
        q.strokeStyle = i % 2 ? '#e8e4ff' : '#9a96d0';
        q.beginPath();
        q.moveTo(x, y);
        q.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.55);
        q.stroke();
      }
    }, 0, cam.hor, LW, LH - cam.hor, 60);
  }
  return { cam, rx, carY, dawn, sunX, sunY, sunUp };
};

/* ---------- film ---------- */

export const pixelDetroitRunFilm: RisoFilm<State> = {
  id: 'pixel-detroit-run',
  title: 'Motor City Run',
  caption: 'One night run through a 16-bit Detroit, chasing the light ahead until it turns into the sun.',
  theme: 'Detroit',
  motif: 'the light ahead: headlight, tower crowns, tail-lights, sunrise',
  series: '16-bit',
  mode: 'direct',
  duration: 19,
  paper: '#07061a',
  grain: 0,
  inks: [{ color: '#f0a83a' }, { color: '#2a2062' }, { color: '#d0303c' }, { color: '#ffd25a' }, { color: '#3a64c8' }],
  scenes: [
    { at: 0, label: 'Factory row' },
    { at: 3.0, label: 'People mover' },
    { at: 7.4, label: 'Rooftops' },
    { at: 11.7, label: 'The avenue' },
    { at: 15.6, label: 'Sunrise' },
  ],
  posterTime: 18.6,

  setup() {
    const rng = mulberry(313);
    const px = makePx();
    const sky = mk(LW, LH).canvas;
    vGrad(sky.getContext('2d') as Ctx, 0, 0, LW, 190, NIGHT, 1);
    const stars: [number, number, number][] = Array.from({ length: 70 }, () => [rng() * LW, rng() * 140, rng()]);
    const far = paintFar(rng);
    const mid = paintMid(rng);
    const front = paintFront(rng);
    const fig = (p: Pose) => bake(48, 54, (q) => figure(q, hero, p, 22, 31), { pal: HERO_PAL, outline: OUT });
    const run = Array.from({ length: 8 }, (_, i) => fig(runPose(i / 8, 0.24)));
    const pose: Record<string, HTMLCanvasElement> = {};
    for (const k of Object.keys(POSES)) pose[k] = fig(POSES[k]);
    const heroBack = paintHeroBack();
    return {
      px,
      stars,
      sky,
      far: far.canvas,
      crowns: far.crowns,
      mid: mid.canvas,
      midWins: mid.wins,
      stacks: mid.stacks,
      guide: paintGuide(),
      front: front.canvas,
      lamps: front.lamps,
      run,
      pose,
      heroBack,
      train: paintTrain(),
      carSide: [0, 1, 2, 3].map((i) => paintCarSide(i)),
      carRear: paintCarRear(true),
      carRearEmpty: paintCarRear(false),
      rival: paintRival(),
      lampPost: paintLampPost(),
      facades: [0, 1, 2].map((k) => paintFacade(rng, k)),
      bollard: paintBollard(),
      tex: paintAvenue(rng),
      horizon: paintHorizon(rng),
    };
  },

  draw(r, t, s) {
    const px = s.px;
    const c = px.c;
    begin(px, '#07061a');

    if (t < 11.72) {
      const { camX, camY, h, freeze } = drawSide(s, t);
      const hx = h.x - camX;
      const hy = h.y - camY - 20;
      if (freeze) {
        // re-draw the runner over a burst so the hang reads as THE moment
        burst(s, hx, hy, seg(t, 9.02, 9.25));
        const img = s.pose[h.spr];
        spr(c, img, h.x - camX, h.y - camY, 22, 48);
      }
      // caption box, typed in
      if (t > 1.9 && t < 4.0) {
        const k = tween(t, 1.9, 2.15, ease.outCubic) * (1 - tween(t, 3.7, 3.95));
        windowBox(c, 12, 12, 118, 22, undefined, k);
        if (k > 0.9) {
          const msg = 'DETROIT  4:52 AM';
          const n = Math.floor(clamp((t - 2.2) / 0.8) * msg.length);
          text(c, msg.slice(0, n), 20, 19, { fill: '#ffffff', shadow: '#0a0a30' });
        }
      }
      // iris: opens on the runner, closes on the car's headlights
      if (t < 0.9) iris(c, hx + 2, hy, lerp(0, 260, tween(t, 0.05, 0.9, ease.inCubic)));
      if (t > 11.2) {
        const sx = carX(t) - camX + 78;
        iris(c, Math.min(sx, 340), LOW_Y - camY - 14, lerp(240, 4, tween(t, 11.2, 11.7, ease.inOutSine)));
      }
      // camera: pull out from a close-up, push in on the ride, snap in on the hang
      let zoom = lerp(2.4, 1, tween(t, 0.2, 2.2, ease.inOutCubic));
      zoom *= 1 + 0.15 * Math.sin(seg(t, 3.4, 5.2) * Math.PI) + 0.3 * Math.sin(seg(t, 5.2, 7.6) * Math.PI);
      if (t > 8.95 && t < 9.7) zoom *= 1 + 0.75 * (t < 9.02 ? seg(t, 8.95, 9.02) : 1 - tween(t, 9.5, 9.7));
      if (t > 10.9) zoom *= 1 + 0.25 * tween(t, 10.9, 11.3);
      present(r, px, { zoom, zx: hx + 10, zy: hy });
      return;
    }

    const av = drawAvenue(s, t);
    // iris opens on the car
    if (t < 12.3) iris(c, av.rx, av.carY - 16, lerp(4, 260, tween(t, 11.72, 12.3, ease.inOutSine)));
    // title as the sun clears the river
    if (t > 17.2) {
      const k = tween(t, 17.2, 17.8, ease.outBack);
      const title = 'MOTOR CITY RUN';
      const st = { fill: ['#fff6c8', '#ffe08a', '#ffc860', '#ffa848', '#ff8a40', '#f06a3a', '#d04a3a'], outline: '#2a1030', shadow: '#2a1030', bold: true };
      const ty = lerp(-30, 20, k);
      text(c, title, 200, ty, st, 2, 0.5);
      if (t > 17.6) {
        const k2 = tween(t, 17.6, 18.0);
        text(c, 'DETROIT', 200, 44 + (1 - k2) * 6, { fill: '#fff0d0', outline: '#2a1030', spacing: 3 }, 1, 0.5);
      }
    }
    // a quick white flash at the overtake
    if (t > 13.84 && t < 13.9) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#3a3a5a';
      c.fillRect(0, 0, LW, LH);
      c.restore();
    }
    // a little 4-point glint on the sun as the title lands
    if (t > 17.7) {
      const k = Math.sin(seg(t, 17.7, 18.3) * Math.PI);
      if (k > 0) crisp(px, (q) => {
        q.fillStyle = '#ffffff';
        q.fill(starPath(av.sunX, av.sunY - 12, 4 + 10 * k, 1.2, 4, 0));
      }, av.sunX - 26, av.sunY - 40, 52, 56);
    }
    present(r, px, { zoom: lerp(1.25, 1, tween(t, 11.72, 12.6)), zx: 200, zy: lerp(av.carY - 16, 112, tween(t, 11.72, 12.6)) });
  },
};
