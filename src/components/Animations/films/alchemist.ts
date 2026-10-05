import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import { TAU, clamp, ease, hash, lerp, mulberry, seg, smoothPath, tween, type Pt } from '../riso/kit';
import {
  MAN_STAND,
  SB,
  applyCam,
  bake,
  blob,
  bloomAt,
  deepen,
  drawPlate,
  finish,
  glowAt,
  keys,
  layerView,
  lift,
  lifts,
  makeStudio,
  manJoints,
  manLow,
  mixHex,
  mixMan,
  mottle,
  pencil,
  ramp,
  rgba,
  ribbon,
  screen,
  sketchLine,
  sparkle,
  starAt,
  title,
  toScreen,
  wash,
  type Cam,
  type ManPose,
  type Plate,
  type Studio,
} from '../styles/storybook';
import {
  CAMEL_KUSH,
  SD,
  SHEEP_GRAZE,
  SHEEP_LIE,
  SHEEP_STAND,
  camelWalk,
  drawCamel,
  drawElder,
  drawSheep,
  drawShepherd,
  drawStones,
  mixCamel,
  mixSheep,
  sheepWalk,
  type CamelOpts,
  type CamelPose,
  type SheepOpts,
  type SheepPose,
  type ShepOpts,
} from '../styles/storybook-desert';

/*
 * The Shepherd's Road: an original storybook homage, in watercolour, to the old fable of the
 * shepherd who dreams of treasure. He sleeps under a sycamore in a roofless chapel and dreams a
 * golden glint over far pyramids; an old king gives him two stones; he crosses the sea, sweeps
 * and lifts in a glass shop, rides a caravan through a sandstorm into a night of huge stars,
 * hears the wind at an oasis, digs at the foot of the pyramids, laughs, and goes home to find the
 * glint was under the sycamore all along.
 * Motif: the golden glint. Dream, stones, lanterns, glass, the one star, the sun on the apex, and
 * at last the light under the roots.
 */

const DURATION = 76;
const T2 = 9.6; // the stranger's stones
const T3 = 19.4; // across the sea
const T4 = 27.8; // the glass shop
const T5 = 36.4; // the caravan
const T_STORM = 41.4;
const T_NIGHT = 45.0;
const T6 = 50.0; // the oasis
const T7 = 57.0; // the pyramids
const T8 = 66.6; // home

const P = Math.PI;

/* ---------- helpers ---------- */

const mixCam = (a: Cam, b: Cam, k: number): Cam => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
  z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)),
  rot: lerp(a.rot ?? 0, b.rot ?? 0, k),
});
const camKeys = (t: number, ks: [number, Cam][], fn: (k: number) => number = ease.inOutSine): Cam => {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) return mixCam(ks[i - 1][1], ks[i][1], fn(seg(t, ks[i - 1][0], ks[i][0])));
  }
  return ks[ks.length - 1][1];
};
const pulse = (t: number, a: number, b: number, c: number, d: number) => Math.min(tween(t, a, b, ease.inOutSine), 1 - tween(t, c, d, ease.inOutSine));
const strokeP = (c: Ctx, p: Path2D, color: string, w: number, a = 1, op: GlobalCompositeOperation = 'source-over') => {
  c.save();
  c.globalCompositeOperation = op;
  c.globalAlpha = a;
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke(p);
  c.restore();
};
const fillP = (c: Ctx, p: Path2D, color: string | CanvasGradient, a = 1, op: GlobalCompositeOperation = 'source-over') => {
  c.save();
  c.globalCompositeOperation = op;
  c.globalAlpha = a;
  c.fillStyle = color;
  c.fill(p);
  c.restore();
};

/* ---------- poses ---------- */

const walkPose = (p: number, amt = 1, crook = true): ManPose => {
  const a = p * TAU;
  const leg = (ph: number): [number, number, number] => {
    const th = 0.36 * Math.sin(a + ph) * amt;
    const knee = Math.max(0, Math.sin(a + ph + 1.4)) * 0.75 * amt;
    return [th, th - knee, P / 2 - knee * 0.4 + Math.max(0, -th) * 0.3];
  };
  const arm = (ph: number): [number, number, number] => {
    const u = -0.32 * Math.sin(a + ph) * amt;
    return [u, u + 0.3, u + 0.3];
  };
  const sw = Math.sin(a) * 0.08 * amt;
  return { spine: 0.07, head: 0.02, aN: crook ? [0.18 + sw, 0.95 + sw, 1.05] : arm(0), aF: arm(P), lN: leg(0), lF: leg(P), smile: 0.7 };
};
const SH_STAND: ManPose = { ...MAN_STAND, aN: [0.14, 0.95, 1.05], smile: 0.7 };
const SH_SLEEP: ManPose = { spine: -0.42, head: 0.36, aN: [0.3, 1.2, 1.3], aF: [-0.25, 0.45, 0.55], lN: [1.5, 1.48, 2.8], lF: [1.95, 0.55, 1.5], smile: 0.45 };
const SH_REACH: ManPose = { spine: 0.1, head: 0.22, look: 0.7, aN: [0.95, 1.35, 1.55], aF: [0.1, 0.8, 0.9], lN: [0.12, 0.02, P / 2], lF: [-0.1, -0.02, P / 2], smile: 0.75 };
const SH_BOAT: ManPose = { spine: 0.08, head: -0.06, aN: [0.25, 0.8, 0.9], aF: [2.45, 2.75, 2.85], lN: [0.3, 0.08, P / 2], lF: [-0.22, -0.05, P / 2], smile: 0.8 };
const SH_SQUAT: ManPose = { spine: 0.78, head: -0.42, aN: [0.08, 0.06, 0.1], aF: [0.02, 0.0, 0.05], lN: [1.2, -0.25, P / 2], lF: [1.1, -0.32, P / 2], smile: 0.5, look: -0.5 };
const SH_HOLD: ManPose = { spine: -0.04, head: 0.02, aN: [0.3, 1.25, 1.35], aF: [0.25, 1.15, 1.25], lN: [0.06, 0.0, P / 2], lF: [-0.06, 0.0, P / 2], smile: 0.75 };
const SH_PRESS: ManPose = { spine: -0.12, head: -0.3, aN: [2.5, 2.72, 2.78], aF: [2.42, 2.64, 2.7], lN: [0.14, 0.0, P / 2], lF: [-0.14, 0.0, P / 2], smile: 1, blink: 1 };
const SH_GLASS: ManPose = { spine: -0.05, head: -0.34, look: -1, aN: [2.05, 2.55, 2.65], aF: [0.15, 0.6, 0.7], lN: [0.1, 0.0, P / 2], lF: [-0.1, 0.0, P / 2], smile: 0.85 };
const SH_RIDE: ManPose = { spine: 0.05, head: 0.0, aN: [0.45, 1.35, 1.4], aF: [0.4, 1.25, 1.3], lN: [1.2, 0.32, 1.3], lF: [1.1, 0.22, 1.35], smile: 0.7 };
const SH_FIRE: ManPose = { spine: -0.1, head: -0.1, aN: [0.6, 1.75, 1.85], aF: [-0.5, -0.3, -0.25], lN: [2.1, 0.42, 1.4], lF: [1.8, 0.2, 1.5], smile: 0.7 };
const SH_WIND: ManPose = { spine: -0.02, head: -0.12, look: -0.3, aN: [0.5, 0.75, 0.85], aF: [-0.35, -0.2, -0.1], lN: [0.22, 0.04, P / 2], lF: [-0.2, -0.04, P / 2], smile: 0.6 };
const SH_ARMS: ManPose = { spine: -0.12, head: -0.32, look: -0.8, aN: [2.25, 2.45, 2.5], aF: [-2.0, -2.25, -2.3], lN: [0.25, 0.04, P / 2], lF: [-0.22, -0.04, P / 2], smile: 0.9 };
const SH_KNEEL: ManPose = { spine: 0.24, head: 0.36, aN: [1.0, 1.4, 1.45], aF: [0.6, 1.1, 1.2], lN: [1.42, 0.06, P / 2], lF: [0.15, -1.5, -1.55], smile: 0.6, look: 0.6 };
const SH_HEELS: ManPose = { spine: -0.18, head: -0.42, aN: [0.35, 1.0, 1.1], aF: [0.25, 0.9, 1.0], lN: [1.45, -1.5, -1.5], lF: [1.4, -1.55, -1.55], smile: 1, blink: 1 };
const digPose = (p: number): ManPose => {
  const a = Math.sin(p * TAU);
  const b = Math.sin(p * TAU + P);
  return {
    spine: 0.62 + 0.05 * Math.sin(p * TAU * 2), head: 0.28, look: 0.9,
    aN: [1.05 + a * 0.35, 0.75 + a * 0.5, 0.6 + a * 0.4], aF: [0.95 + b * 0.35, 0.65 + b * 0.5, 0.5 + b * 0.4],
    lN: [1.42, 0.06, P / 2], lF: [0.15, -1.5, -1.55], smile: 0.5,
  };
};

/* ---------- state ---------- */

interface Star {
  x: number;
  y: number;
  s: number;
  ph: number;
  big: boolean;
}

interface State {
  st: Studio;
  skyTex: Plate;
  skyLift: Plate;
  chapel: Plate;
  dream: Plate;
  far2: Plate;
  mid2: Plate;
  near2: Plate;
  sea: Plate;
  city: Plate;
  shop: Plate;
  street: Plate;
  dFar: Plate;
  dMid: Plate;
  dNear: Plate;
  milky: Plate;
  oasis: Plate;
  pyr: Plate;
  caravan: Plate[];
  stars: Star[];
}

/* ---------- ch1/8: the chapel ---------- */

const g1 = (x: number) => 776 + 6 * Math.sin(x * 0.006) + 4 * Math.sin(x * 0.017 + 1);
const TX = 640; // sycamore trunk
const GABLE: Pt[] = [
  [1180, 800], [1180, 575], [1232, 470], [1252, 486], [1268, 440], [1320, 335], [1460, 575], [1460, 800],
];
const DOOR = { x: 1286, y: 610, w: 68, h: 190 };

const archPath = (x: number, y: number, w: number, h: number, p: Path2D = new Path2D()) => {
  p.moveTo(x, y + h);
  p.lineTo(x, y + w / 2);
  p.arc(x + w / 2, y + w / 2, w / 2, P, 0);
  p.lineTo(x + w, y + h);
  p.closePath();
  return p;
};

const leafCluster = (g: Ctx, st: Studio, x: number, y: number, rr: number, seed: number, cols: string[]) => {
  const rng = mulberry(seed);
  for (let i = 0; i < 4; i++) {
    const bx = x + (rng() - 0.5) * rr * 0.9;
    const by = y + (rng() - 0.5) * rr * 0.6;
    wash(g, st, blob(bx, by, rr * (0.45 + rng() * 0.3), rr * (0.35 + rng() * 0.2), seed * 7 + i, 0.25), cols[i % cols.length], { reserve: 0.4, a: 0.7, gran: 0.55, rim: 1.8, soft: true });
  }
};

const paintChapel = (r: Riso, st: Studio) =>
  bake(r, -280, 20, 2160, 990, 1.5, (g) => {
    const rng = mulberry(11);
    // back wall, roofless, with two arched windows
    const top: Pt[] = [];
    const xs = [190, 230, 260, 300, 345, 390, 430, 470, 520, 580, 650, 720, 790, 850, 910, 960, 1010, 1060, 1110, 1180];
    const ys = [520, 470, 455, 420, 430, 395, 400, 380, 392, 372, 380, 365, 372, 385, 378, 398, 420, 440, 470, 455];
    xs.forEach((x, i) => top.push([x, ys[i] + (rng() - 0.5) * 8]));
    const wall = new Path2D();
    wall.moveTo(190, 810);
    for (const q of top) wall.lineTo(q[0], q[1]);
    wall.lineTo(1180, 810);
    wall.closePath();
    wash(g, st, wall, SD.stone, { reserve: 1, a: 0.9, gran: 0.6, rim: 2.2, soft: true, grad: [0, 380, 0, 800, SD.stoneDeep] });
    g.save();
    g.clip(wall);
    mottle(g, 180, 360, 1010, 460, [SD.stoneDeep, '#b9a79a', '#a9b08a'], 26, 12, 0.25, 0.6);
    // masonry courses
    const courses = new Path2D();
    for (let y = 410; y < 800; y += 26) {
      courses.moveTo(190, y + Math.sin(y) * 2);
      courses.lineTo(1180, y + Math.cos(y) * 2);
      for (let x = 190 + ((y / 26) % 2) * 30; x < 1180; x += 60 + rng() * 20) {
        courses.moveTo(x, y);
        courses.lineTo(x + (rng() - 0.5) * 3, y + 26);
      }
    }
    pencil(g, st, courses, 0.18, 0.8, 0, 0);
    // moss and ivy at the foot of the wall
    for (let i = 0; i < 16; i++) wash(g, st, blob(200 + i * 62 + rng() * 30, 790 - rng() * 60, 22 + rng() * 20, 12 + rng() * 10, 40 + i, 0.3), i % 2 ? SB.leaf : '#8fa36b', { a: 0.55, gran: 0.5, rim: 1.2 });
    g.restore();
    pencil(g, st, wall, 0.35, 1);
    // knock out the windows so the sky shows through
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fill(archPath(300, 470, 74, 180));
    g.fill(archPath(900, 470, 74, 180));
    g.restore();
    // window reveals
    for (const wx of [300, 900]) {
      const rv = archPath(wx - 6, 464, 86, 190);
      const inner = archPath(wx, 470, 74, 180);
      g.save();
      g.globalCompositeOperation = 'source-over';
      const ring = new Path2D();
      ring.addPath(rv);
      ring.addPath(inner);
      g.restore();
      strokeP(g, inner, SD.stoneDeep, 5, 0.6, 'multiply');
      pencil(g, st, rv, 0.3, 0.8);
    }
    // the gable end, broken on one slope, with an arched doorway
    const gable = smoothPath(GABLE, true, 0.05);
    wash(g, st, gable, mixHex(SD.stone, SD.wall, 0.25), { reserve: 1, a: 0.9, gran: 0.6, rim: 2.2, soft: true, grad: [1180, 340, 1460, 800, SD.stoneDeep] });
    g.save();
    g.clip(gable);
    mottle(g, 1170, 330, 300, 480, [SD.stoneDeep, '#b9a79a'], 10, 14, 0.25, 0.5);
    const gc = new Path2D();
    for (let y = 400; y < 800; y += 26) {
      gc.moveTo(1180, y);
      gc.lineTo(1460, y);
    }
    pencil(g, st, gc, 0.16, 0.8, 0, 0);
    // the shaded right side of the gable end
    wash(g, st, smoothPath([[1395, 470], [1460, 575], [1460, 800], [1400, 800]], true, 0.05), SD.stoneDeep, { a: 0.35, gran: 0.4, rim: 0 });
    g.restore();
    pencil(g, st, gable, 0.4, 1);
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fill(archPath(DOOR.x, DOOR.y, DOOR.w, DOOR.h));
    g.restore();
    // a far green hill seen through the doorway
    g.save();
    g.clip(archPath(DOOR.x, DOOR.y, DOOR.w, DOOR.h));
    wash(g, st, blob(1320, 790, 110, 60, 5, 0.1), SB.leaf, { reserve: 1, a: 0.6, gran: 0.5, rim: 0 });
    g.restore();
    strokeP(g, archPath(DOOR.x, DOOR.y, DOOR.w, DOOR.h), SD.stoneDeep, 4, 0.55, 'multiply');
    // the sycamore: a broad trunk, splitting into three limbs, a great round crown
    const trunk = smoothPath(
      [[TX - 62, 800], [TX - 38, 770], [TX - 30, 640], [TX - 34, 520], [TX - 70, 440], [TX - 150, 360], [TX - 132, 350], [TX - 40, 418], [TX - 10, 330], [TX - 20, 240], [TX + 4, 240], [TX + 18, 360], [TX + 40, 410], [TX + 160, 330], [TX + 176, 345], [TX + 60, 440], [TX + 34, 540], [TX + 34, 700], [TX + 50, 770], [TX + 84, 800]],
      true,
      0.35
    );
    const bark = '#8a7866';
    wash(g, st, trunk, bark, { reserve: 1, a: 0.92, gran: 0.65, rim: 2.4, soft: true, grad: [TX - 60, 400, TX + 60, 400, deepen(bark, 0.35)] });
    g.save();
    g.clip(trunk);
    mottle(g, TX - 160, 230, 340, 580, ['#8f9a78', '#7d7264', '#b9ae98'], 18, 3, 0.3, 0.35);
    const bk = new Path2D();
    for (let i = 0; i < 26; i++) {
      const y = 460 + i * 13 + rng() * 6;
      bk.moveTo(TX - 30 + rng() * 20, y);
      bk.quadraticCurveTo(TX, y + 4, TX + 20 + rng() * 14, y - 2);
    }
    pencil(g, st, bk, 0.25, 0.8, 0, 0);
    g.restore();
    pencil(g, st, trunk, 0.4, 1);
    // the roots, spreading over the floor
    const roots = new Path2D();
    for (const [dx, len, s] of [[-50, -90, 1], [-30, -50, 1], [60, 100, 1], [40, 60, 1], [10, 50, 1]] as [number, number, number][]) {
      roots.moveTo(TX + dx, 780);
      roots.quadraticCurveTo(TX + dx + len * 0.5, 790 - s * 4, TX + dx + len, 800 + Math.abs(len) * 0.05);
    }
    strokeP(g, roots, deepen(bark, 0.25), 12, 0.85, 'multiply');
    pencil(g, st, roots, 0.3, 0.8);
    // the crown
    const greens = ['#7f9e6c', '#6c8b5d', '#97ab70', '#5f7d55'];
    const crown: [number, number, number][] = [];
    for (let i = 0; i < 34; i++) {
      const a = rng() * TAU;
      const rr = Math.sqrt(rng());
      crown.push([TX + 20 + Math.cos(a) * 340 * rr, 245 + Math.sin(a) * 150 * rr, 60 + rng() * 45]);
    }
    crown.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < crown.length; i++) leafCluster(g, st, crown[i][0], crown[i][1], crown[i][2], i + 3, greens);
    // undersides in shade, tops lifted in the light
    for (let i = 0; i < 10; i++) wash(g, st, blob(TX - 260 + i * 60, 360 + rng() * 30, 50, 22, 90 + i, 0.3), '#4f6a4a', { a: 0.3, gran: 0.4, rim: 0 });
    lifts(g, TX - 300, 110, 620, 160, 16, 17, 0.35, 0.5);
    // fruit-like dots of the sycamore fig
    const figs = new Path2D();
    for (let i = 0; i < 40; i++) {
      const a = rng() * TAU;
      const rr = Math.sqrt(rng());
      const x = TX + 20 + Math.cos(a) * 320 * rr;
      const y = 250 + Math.sin(a) * 130 * rr;
      figs.moveTo(x + 2.4, y);
      figs.arc(x, y, 2.4, 0, TAU);
    }
    wash(g, st, figs, '#c29a5c', { a: 0.7, gran: 0, rim: 0.5 });
    // a low broken stub of the old nave wall, and bushes at the edges
    const stub = smoothPath([[-120, 800], [-110, 640], [-60, 610], [0, 650], [60, 600], [140, 660], [190, 700], [190, 800]], true, 0.2);
    wash(g, st, stub, SD.stone, { reserve: 1, a: 0.88, gran: 0.6, rim: 2, soft: true, grad: [0, 600, 0, 800, SD.stoneDeep] });
    pencil(g, st, stub, 0.3, 1);
    for (const [bx, by, br] of [[-200, 770, 90], [1600, 760, 110], [1760, 780, 80], [60, 790, 60]] as [number, number, number][]) leafCluster(g, st, bx, by - br * 0.4, br, Math.floor(bx + 900), ['#7f9e6c', '#6c8b5d', '#97ab70']);
    // the floor: grass and fallen stones
    const floor = new Path2D();
    floor.moveTo(-280, 1010);
    for (let x = -280; x <= 1880; x += 20) floor.lineTo(x, g1(x) - 6);
    floor.lineTo(1880, 1010);
    floor.closePath();
    wash(g, st, floor, '#aeb07a', { reserve: 1, a: 0.88, gran: 0.6, rim: 1.8, soft: true, grad: [0, 770, 0, 1000, '#7f8a5c'] });
    g.save();
    g.clip(floor);
    mottle(g, -280, 760, 2160, 250, ['#8f9a62', '#c3b27a', '#7e8f5c'], 40, 21, 0.3, 0.6);
    const tufts = new Path2D();
    for (let i = 0; i < 1300; i++) {
      const x = -280 + rng() * 2160;
      const y = g1(x) + rng() ** 1.4 * 220;
      const l = 4 + rng() * 8;
      tufts.moveTo(x, y);
      tufts.lineTo(x + (rng() - 0.5) * 5, y - l);
    }
    strokeP(g, tufts, '#6d7c4c', 1, 0.6, 'multiply');
    g.restore();
    for (const [x, y, w, h] of [[250, 805, 34, 16], [1110, 812, 46, 20], [1500, 808, 40, 18], [470, 830, 26, 12], [990, 850, 30, 13]] as [number, number, number, number][]) {
      const st0 = blob(x, y, w, h, x, 0.18);
      wash(g, st, st0, SD.stone, { reserve: 1, gran: 0.5, rim: 1.4, grad: [x, y - h, x, y + h, SD.stoneDeep] });
      pencil(g, st, st0, 0.35);
    }
  });

/* the dream: a soft cloud with the pyramids and the glint in it */
const DREAM_C: Pt = [1240, 175];
const paintDream = (r: Riso, st: Studio) =>
  bake(r, DREAM_C[0] - 260, DREAM_C[1] - 170, 520, 340, 2.2, (g) => {
    const [cx, cy] = DREAM_C;
    const cloud = blob(cx, cy, 225, 140, 77, 0.16);
    g.save();
    g.clip(cloud);
    const sk = g.createLinearGradient(0, cy - 140, 0, cy + 140);
    sk.addColorStop(0, '#f6d9a8');
    sk.addColorStop(0.6, '#f2c08e');
    sk.addColorStop(1, '#e7a983');
    g.fillStyle = sk;
    g.fill(cloud);
    mottle(g, cx - 230, cy - 150, 460, 300, [SB.apricot, SB.blush, SB.gold], 18, 5, 0.25, 0.5);
    // dunes
    const dn = new Path2D();
    dn.moveTo(cx - 260, cy + 200);
    for (let x = cx - 260; x <= cx + 260; x += 10) dn.lineTo(x, cy + 70 - 14 * Math.sin((x - cx) * 0.02) - 6 * Math.sin((x - cx) * 0.05));
    dn.lineTo(cx + 260, cy + 200);
    dn.closePath();
    // three pyramids, the great one in the middle
    for (const [px, hw, h] of [[cx + 95, 55, 80], [cx - 90, 45, 62], [cx, 82, 128]] as [number, number, number][]) {
      const base = cy + 70;
      const lit = new Path2D();
      lit.moveTo(px - hw, base);
      lit.lineTo(px, base - h);
      lit.lineTo(px + hw * 0.2, base);
      lit.closePath();
      const sh = new Path2D();
      sh.moveTo(px + hw * 0.2, base);
      sh.lineTo(px, base - h);
      sh.lineTo(px + hw, base);
      sh.closePath();
      wash(g, st, lit, SD.pyramid, { reserve: 1, a: 0.9, gran: 0.5, rim: 1.4 });
      wash(g, st, sh, SD.pyramidShade, { reserve: 1, a: 0.9, gran: 0.5, rim: 1.4 });
      pencil(g, st, lit, 0.3, 0.8);
      pencil(g, st, sh, 0.3, 0.8);
    }
    wash(g, st, dn, SD.sand, { reserve: 0.9, a: 0.85, gran: 0.5, rim: 1.4, grad: [0, cy + 60, 0, cy + 170, SD.sandDeep] });
    g.restore();
    // soft wet edge: the cloud fades into the sky
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.filter = `blur(${(16 * r.scale).toFixed(1)}px)`;
    g.lineWidth = 46;
    g.strokeStyle = '#000';
    g.stroke(cloud);
    g.restore();
  });

/* ---------- ch2: the hills ---------- */

const g2 = (x: number) => 738 + 16 * Math.sin(x * 0.0023 + 0.5) + 5 * Math.sin(x * 0.011);
const KING_X = 1660;
const HORIZON2 = 430;

const olive = (g: Ctx, st: Studio, x: number, y: number, s: number, seed: number) => {
  const rng = mulberry(seed);
  const trunk = smoothPath([[x - 6 * s, y], [x - 4 * s, y - 20 * s], [x - 10 * s, y - 34 * s], [x - 2 * s, y - 40 * s], [x + 4 * s, y - 30 * s], [x + 2 * s, y - 16 * s], [x + 7 * s, y]], true, 0.4);
  wash(g, st, trunk, '#7d6b5a', { reserve: 1, gran: 0.5, rim: 1.2 * s });
  for (let i = 0; i < 6; i++) {
    const bx = x + (rng() - 0.5) * 46 * s;
    const by = y - 46 * s + (rng() - 0.5) * 22 * s;
    wash(g, st, blob(bx, by, (16 + rng() * 10) * s, (10 + rng() * 6) * s, seed * 9 + i, 0.3), i % 2 ? SD.olive : mixHex(SD.olive, '#a9b39a', 0.4), { reserve: 0.6, a: 0.8, gran: 0.5, rim: 1.4 });
  }
  wash(g, st, blob(x, y - 36 * s, 30 * s, 8 * s, seed, 0.2), SD.oliveDeep, { a: 0.3, gran: 0.3, rim: 0 });
  pencil(g, st, trunk, 0.35, 0.8);
};

const house = (g: Ctx, st: Studio, x: number, y: number, w: number, h: number, col: string = SD.wall, roof = false) => {
  const front = new Path2D();
  front.rect(x, y - h, w, h);
  wash(g, st, front, col, { reserve: 1, a: 0.9, gran: 0.35, rim: 1 });
  const side = new Path2D();
  side.rect(x + w, y - h, w * 0.3, h);
  wash(g, st, side, mixHex(col, '#9c8a9a', 0.45), { reserve: 1, a: 0.9, gran: 0.35, rim: 0.8 });
  if (roof) {
    const rf = new Path2D();
    rf.moveTo(x - 2, y - h);
    rf.lineTo(x + w * 0.65, y - h - w * 0.3);
    rf.lineTo(x + w * 1.32, y - h);
    rf.closePath();
    wash(g, st, rf, SD.terracotta, { reserve: 1, gran: 0.4, rim: 0.8 });
  }
  const win = new Path2D();
  win.rect(x + w * 0.3, y - h * 0.6, Math.max(1.5, w * 0.16), Math.max(2, h * 0.22));
  wash(g, st, win, '#5d5462', { a: 0.75, gran: 0, rim: 0 });
  pencil(g, st, front, 0.25, 0.6);
};

const paintFar2 = (r: Riso, st: Studio) =>
  bake(r, -260, 300, 3700, 520, 0.7, (g) => {
    // the sea: all along, behind the coast
    const sea = new Path2D();
    sea.rect(-260, HORIZON2, 3700, 400);
    wash(g, st, sea, SD.sea, { reserve: 1, a: 0.85, gran: 0.4, rim: 0, grad: [0, HORIZON2, 0, 760, SD.seaDeep] });
    g.save();
    g.clip(sea);
    lifts(g, -260, HORIZON2, 3700, 60, 30, 3, 0.5, 0.6);
    const hl = new Path2D();
    const rng = mulberry(6);
    for (let i = 0; i < 260; i++) {
      const x = -260 + rng() * 3700;
      const y = HORIZON2 + 6 + rng() ** 1.5 * 330;
      const l = 10 + (y - HORIZON2) * 0.12;
      hl.moveTo(x, y);
      hl.lineTo(x + l, y);
    }
    strokeP(g, hl, SD.seaPale, 1.2, 0.7);
    g.restore();
    // far coast hills (blue haze) ending at a headland
    const coast = new Path2D();
    coast.moveTo(-260, 820);
    for (let x = -260; x <= 900; x += 20) coast.lineTo(x, 380 + 30 * Math.sin(x * 0.006) + 20 * Math.sin(x * 0.017) + Math.max(0, (x - 650) * 0.25) ** 1.2);
    coast.lineTo(940, 820);
    coast.closePath();
    wash(g, st, coast, '#aab0cf', { reserve: 0.8, a: 0.75, gran: 0.35, rim: 2, soft: true, grad: [0, 360, 0, 560, mixHex('#aab0cf', SB.paper, 0.4)] });
    // a white village on the far hill, a bell tower
    const vr = mulberry(8);
    for (let i = 0; i < 16; i++) {
      const x = 180 + i * 24 + vr() * 10;
      const y = 410 + 30 * Math.sin(x * 0.006) + 20 * Math.sin(x * 0.017) + 18 + vr() * 6;
      house(g, st, x, y, 14 + vr() * 8, 10 + vr() * 8, SD.wall, vr() < 0.6);
    }
    const tw = new Path2D();
    tw.rect(330, 340, 12, 60);
    tw.moveTo(328, 340);
    tw.lineTo(336, 324);
    tw.lineTo(344, 340);
    wash(g, st, tw, SD.wall, { reserve: 1, gran: 0.3, rim: 1 });
    pencil(g, st, tw, 0.3, 0.6);
  });

const mid2Top = (x: number) => 520 + 34 * Math.sin(x * 0.0032 + 1) + 16 * Math.sin(x * 0.009) + Math.max(0, x - 1500) ** 1.3 * 0.28;
const paintMid2 = (r: Riso, st: Studio) =>
  bake(r, -260, 400, 2600, 500, 0.85, (g) => {
    const hill = new Path2D();
    hill.moveTo(-260, 900);
    for (let x = -260; x <= 2340; x += 20) hill.lineTo(x, mid2Top(x));
    hill.lineTo(2340, 900);
    hill.closePath();
    wash(g, st, hill, SD.hillGreen, { reserve: 1, a: 0.85, gran: 0.5, rim: 2, soft: true, grad: [0, 470, 0, 760, SD.hill] });
    g.save();
    g.clip(hill);
    mottle(g, -260, 440, 2600, 360, [SD.hill, SD.olive, '#d1b77e'], 30, 31, 0.3, 0.8);
    // furrows following the slope
    const fr = new Path2D();
    for (let k = 0; k < 14; k++) {
      fr.moveTo(-260, mid2Top(-260) + 16 + k * 18);
      for (let x = -260; x <= 2340; x += 40) fr.lineTo(x, mid2Top(x) + 16 + k * 18 * (1 + 0.15 * Math.sin(x * 0.004)));
    }
    strokeP(g, fr, '#8e8a58', 1, 0.3, 'multiply');
    g.restore();
    pencil(g, st, hill, 0.3, 1);
    // rows of olive trees
    const rng = mulberry(41);
    for (let row = 0; row < 3; row++) {
      for (let x = -240 + row * 30; x < 1700; x += 70 + rng() * 30) {
        const y = mid2Top(x) + 24 + row * 34;
        olive(g, st, x, y, 0.45 + row * 0.12, 100 + row * 50 + Math.floor(x));
      }
    }
  });

const paintNear2 = (r: Riso, st: Studio) =>
  bake(r, -300, 300, 2900, 640, 1.0, (g) => {
    const ground = new Path2D();
    ground.moveTo(-300, 940);
    for (let x = -300; x <= 2600; x += 20) ground.lineTo(x, g2(x) - 40 - 14 * Math.sin(x * 0.004 + 2));
    ground.lineTo(2600, 940);
    ground.closePath();
    wash(g, st, ground, '#c6b47c', { reserve: 1, a: 0.88, gran: 0.6, rim: 2, soft: true, grad: [0, 700, 0, 920, '#a79766'] });
    g.save();
    g.clip(ground);
    mottle(g, -300, 680, 2900, 260, ['#a9ae74', '#d7bf86', '#9ea66c'], 40, 51, 0.3, 0.7);
    // the path: a pale band of trodden earth
    const path = new Path2D();
    path.moveTo(-300, g2(-300) - 8);
    for (let x = -300; x <= 2600; x += 20) path.lineTo(x, g2(x) - 8);
    for (let x = 2600; x >= -300; x -= 20) path.lineTo(x, g2(x) + 14);
    path.closePath();
    wash(g, st, path, '#e2cfa2', { reserve: 0.8, a: 0.7, gran: 0.4, rim: 1.2 });
    const tufts = new Path2D();
    const rng = mulberry(52);
    for (let i = 0; i < 1300; i++) {
      const x = -300 + rng() * 2900;
      const base = g2(x) - 30 - 14 * Math.sin(x * 0.004 + 2);
      const y = base + rng() * 200;
      if (Math.abs(y - g2(x)) < 14) continue;
      const l = 4 + rng() * 9;
      tufts.moveTo(x, y);
      tufts.lineTo(x + (rng() - 0.5) * 6, y - l);
    }
    strokeP(g, tufts, '#7d8a52', 1, 0.6, 'multiply');
    // wild flowers
    const fl = new Path2D();
    for (let i = 0; i < 140; i++) {
      const x = -300 + rng() * 2900;
      const y = g2(x) + 20 + rng() * 140;
      fl.moveTo(x + 2, y);
      fl.arc(x, y, 1.6 + rng(), 0, TAU);
    }
    wash(g, st, fl, i0(rng) ? SB.rose : SB.gold, { a: 0.75, gran: 0, rim: 0 });
    g.restore();
    // the king's stone and his olive tree
    const rock = blob(KING_X, g2(KING_X) - 10, 30, 16, 9, 0.15);
    olive(g, st, KING_X + 70, g2(KING_X + 70) - 6, 1.9, 777);
    wash(g, st, rock, SD.stone, { reserve: 1, gran: 0.5, rim: 1.4, grad: [KING_X, g2(KING_X) - 26, KING_X, g2(KING_X), SD.stoneDeep] });
    pencil(g, st, rock, 0.4);
  });
const i0 = (rng: () => number) => rng() < 0.5;

/* ---------- ch3: sea and port ---------- */

const HORIZON3 = 430;
const CITY_DOOR: Pt = [2390, 548];
const LANTERNS: Pt[] = [
  [2140, 600], [2210, 520], [2300, 470], [2360, 590], [2465, 505], [2540, 430], [2600, 560], [2700, 470], [2790, 400], [2860, 520], [2420, 380], [2250, 640], [CITY_DOOR[0] + 46, CITY_DOOR[1] - 6],
];

const paintSea = (r: Riso, st: Studio) =>
  bake(r, -600, HORIZON3 - 10, 4200, 700, 0.55, (g) => {
    const sea = new Path2D();
    sea.rect(-600, HORIZON3, 4200, 700);
    wash(g, st, sea, SD.sea, { reserve: 1, a: 0.85, gran: 0.45, rim: 0, grad: [0, HORIZON3, 0, 1000, SD.seaDeep] });
    g.save();
    g.clip(sea);
    mottle(g, -600, HORIZON3, 4200, 600, [SD.seaDeep, '#6f8fae', '#86a7b4'], 50, 61, 0.25, 1.2);
    lifts(g, -600, HORIZON3, 4200, 80, 40, 62, 0.5, 0.8);
    g.restore();
  });

const paintCity = (r: Riso, st: Studio) =>
  bake(r, 1900, 150, 1500, 700, 2.0, (g) => {
    // the hill the city climbs
    const hill = new Path2D();
    hill.moveTo(1960, 700);
    hill.bezierCurveTo(2100, 560, 2300, 360, 2560, 330);
    hill.bezierCurveTo(2800, 300, 3000, 360, 3400, 420);
    hill.lineTo(3400, 700);
    hill.closePath();
    wash(g, st, hill, '#c9a97f', { reserve: 1, a: 0.85, gran: 0.5, rim: 2, soft: true, grad: [0, 320, 0, 700, '#a98a6c'] });
    // houses stacked up the hill, back to front
    const rng = mulberry(71);
    const hy = (x: number) => (x < 2560 ? 700 - (700 - 330) * Math.pow(clamp((x - 1960) / 600), 0.8) : 330 + (x - 2560) * 0.1);
    for (let row = 0; row < 6; row++) {
      for (let x = 2010 + row * 20; x < 3380; x += 34 + rng() * 26) {
        const y = hy(x) + 24 + row * 46 + rng() * 10;
        if (y > 690) continue;
        const w = 30 + rng() * 26;
        const h = 24 + rng() * 26;
        house(g, st, x, y, w, h, rng() < 0.75 ? SD.wall : '#e8cfa6', false);
        // little arched doors
        if (rng() < 0.5) {
          const d = archPath(x + w * 0.62, y - h * 0.5, w * 0.18, h * 0.5);
          wash(g, st, d, '#5b4a52', { a: 0.75, gran: 0, rim: 0 });
        }
      }
    }
    // domes and two towers
    for (const [x, y, rr] of [[2470, 400, 26], [2730, 380, 20], [3050, 410, 30]] as [number, number, number][]) {
      const d = new Path2D();
      d.moveTo(x - rr, y);
      d.arc(x, y, rr, P, 0);
      d.closePath();
      wash(g, st, d, SD.wall, { reserve: 1, gran: 0.35, rim: 1.2, grad: [x - rr, y - rr, x + rr, y, '#c9bfc9'] });
      pencil(g, st, d, 0.3, 0.7);
    }
    for (const [x, y, h] of [[2580, 360, 140], [2930, 380, 110]] as [number, number, number][]) {
      const tw = new Path2D();
      tw.rect(x, y - h, 24, h);
      wash(g, st, tw, '#e9d9bd', { reserve: 1, gran: 0.4, rim: 1.2, grad: [x, 0, x + 24, 0, '#c4ab8f'] });
      const cap = new Path2D();
      cap.rect(x - 3, y - h - 6, 30, 8);
      cap.moveTo(x + 4, y - h - 6);
      cap.lineTo(x + 12, y - h - 30);
      cap.lineTo(x + 20, y - h - 6);
      wash(g, st, cap, SD.terracotta, { reserve: 1, gran: 0.3, rim: 0.8 });
      const ww = new Path2D();
      for (let k = 0; k < 3; k++) ww.addPath(archPath(x + 8, y - h + 14 + k * 34, 8, 16));
      wash(g, st, ww, '#5b4a52', { a: 0.7, gran: 0, rim: 0 });
      pencil(g, st, tw, 0.35, 0.8);
    }
    // the shop door at the waterfront, lit
    const sd = archPath(CITY_DOOR[0] - 16, CITY_DOOR[1] - 44, 32, 48);
    const sw = new Path2D();
    sw.rect(CITY_DOOR[0] - 40, CITY_DOOR[1] - 70, 110, 74);
    wash(g, st, sw, '#efe2c8', { reserve: 1, gran: 0.35, rim: 1.2 });
    wash(g, st, sd, '#e7a54e', { reserve: 1, a: 0.95, gran: 0.2, rim: 1, edge: '#9d5e2e' });
    pencil(g, st, sw, 0.35, 0.8);
    // harbour wall
    const hw = new Path2D();
    hw.moveTo(1960, 700);
    hw.lineTo(3400, 700);
    hw.lineTo(3400, 670);
    hw.lineTo(2000, 676);
    hw.closePath();
    wash(g, st, hw, SD.stone, { reserve: 1, gran: 0.5, rim: 1.2, grad: [0, 670, 0, 700, SD.stoneDeep] });
    // palms along the front
    for (const x of [2080, 2180, 2640, 3200]) {
      const tr = new Path2D();
      tr.moveTo(x, 672);
      tr.quadraticCurveTo(x + 6, 620, x + 2, 580);
      strokeP(g, tr, '#8a7058', 4, 0.9);
      for (let k = 0; k < 7; k++) {
        const a = -P / 2 + (k - 3) * 0.45;
        const fp: Pt[] = [[x + 2, 580], [x + 2 + Math.cos(a) * 18, 580 + Math.sin(a) * 12 - 4], [x + 2 + Math.cos(a) * 34, 580 + Math.sin(a) * 10 + 10]];
        wash(g, st, ribbon(fp, (q) => 3 + Math.sin(q * P) * 6), SD.palm, { reserve: 0.8, gran: 0.4, rim: 0.8 });
      }
    }
  });

/* ---------- ch4: the glass shop ---------- */

const FLOOR4 = 812;
const COUNTER = { x: 720, y: 612, w: 330, h: 200 };
const WIN4 = { x: 1130, y: 190, w: 280, h: 380 };
interface GlassSpot {
  x: number;
  y: number;
  s: number;
}
const GLASS_SPOTS: GlassSpot[] = [];

const glassShape = (g: Ctx, st: Studio, x: number, y: number, s: number, kind: number, tint: string) => {
  const p = new Path2D();
  if (kind === 0) {
    // a tea glass
    p.moveTo(x - 7 * s, y - 22 * s);
    p.lineTo(x + 7 * s, y - 22 * s);
    p.quadraticCurveTo(x + 9 * s, y - 8 * s, x + 6 * s, y);
    p.lineTo(x - 6 * s, y);
    p.quadraticCurveTo(x - 9 * s, y - 8 * s, x - 7 * s, y - 22 * s);
  } else if (kind === 1) {
    // a round carafe
    p.moveTo(x - 4 * s, y - 40 * s);
    p.lineTo(x + 4 * s, y - 40 * s);
    p.lineTo(x + 4 * s, y - 26 * s);
    p.bezierCurveTo(x + 18 * s, y - 22 * s, x + 18 * s, y, x, y);
    p.bezierCurveTo(x - 18 * s, y, x - 18 * s, y - 22 * s, x - 4 * s, y - 26 * s);
    p.closePath();
  } else if (kind === 2) {
    // a bowl
    p.moveTo(x - 16 * s, y - 14 * s);
    p.lineTo(x + 16 * s, y - 14 * s);
    p.quadraticCurveTo(x + 14 * s, y, x, y);
    p.quadraticCurveTo(x - 14 * s, y, x - 16 * s, y - 14 * s);
  } else {
    // a goblet
    p.moveTo(x - 9 * s, y - 34 * s);
    p.lineTo(x + 9 * s, y - 34 * s);
    p.quadraticCurveTo(x + 9 * s, y - 16 * s, x + 1.5 * s, y - 14 * s);
    p.lineTo(x + 1.5 * s, y - 3 * s);
    p.lineTo(x + 7 * s, y);
    p.lineTo(x - 7 * s, y);
    p.lineTo(x - 1.5 * s, y - 3 * s);
    p.lineTo(x - 1.5 * s, y - 14 * s);
    p.quadraticCurveTo(x - 9 * s, y - 16 * s, x - 9 * s, y - 34 * s);
  }
  p.closePath();
  wash(g, st, p, tint, { reserve: 0.3, a: 0.45, gran: 0.15, rim: 1.4, rimA: 0.7, edge: deepen(tint, 0.5) });
  const hl = new Path2D();
  hl.moveTo(x - 4 * s, y - (kind === 1 ? 20 : 18) * s);
  hl.quadraticCurveTo(x - 6 * s, y - 10 * s, x - 3 * s, y - 4 * s);
  strokeP(g, hl, SB.paper, 1.6 * s, 0.85);
  pencil(g, st, p, 0.3, 0.7);
};

const paintShop = (r: Riso, st: Studio) =>
  bake(r, -40, -40, 1680, 980, 1.25, (g) => {
    const rng = mulberry(91);
    // walls: warm lime plaster
    const wall = new Path2D();
    wall.rect(-40, -40, 1680, FLOOR4 + 40);
    wash(g, st, wall, '#e9c99a', { reserve: 1, a: 0.9, gran: 0.5, rim: 0, grad: [0, -40, 0, FLOOR4, '#d7a877'] });
    mottle(g, -40, -40, 1680, 860, ['#d9a979', '#e7c08e', '#c99a74'], 40, 92, 0.3, 1.1);
    bloomAt(g, st, 300, 200, 120, '#d9a979', 1, 0.25);
    bloomAt(g, st, 980, 120, 90, '#d9a979', 2, 0.2);
    // a band of tiles along the bottom of the wall
    const dado = new Path2D();
    dado.rect(-40, 690, 1680, FLOOR4 - 690);
    wash(g, st, dado, '#4f7d8c', { reserve: 1, a: 0.85, gran: 0.4, rim: 1.2 });
    const tiles = new Path2D();
    for (let x = -40; x < 1640; x += 30) {
      for (let y = 700; y < FLOOR4; y += 30) {
        tiles.moveTo(x + 15, y);
        tiles.lineTo(x + 30, y + 15);
        tiles.lineTo(x + 15, y + 30);
        tiles.lineTo(x, y + 15);
        tiles.closePath();
      }
    }
    wash(g, st, tiles, '#e9dcc0', { a: 0.55, gran: 0.2, rim: 0.6 });
    // shelves in a big arched niche, glasses on them
    const niche = archPath(80, 120, 520, 560);
    wash(g, st, niche, '#c08c62', { reserve: 0.6, a: 0.75, gran: 0.4, rim: 2, soft: true });
    g.save();
    g.clip(niche);
    wash(g, st, blob(340, 520, 300, 200, 4, 0.2), '#a97552', { a: 0.35, gran: 0.4, rim: 0 });
    g.restore();
    pencil(g, st, niche, 0.4, 1);
    const tints = ['#a8cfd4', '#bcd7c4', '#d9c39a', '#c6b8d8', '#a8c6d8', '#e0b49a'];
    for (const sy of [300, 430, 560, 680]) {
      const shelf = new Path2D();
      shelf.rect(90, sy, 500, 12);
      wash(g, st, shelf, SB.wood, { reserve: 1, gran: 0.5, rim: 1.2, grad: [0, sy, 0, sy + 12, deepen(SB.wood, 0.3)] });
      pencil(g, st, shelf, 0.35);
      for (let x = 115; x < 570; x += 34 + rng() * 22) {
        const kind = Math.floor(rng() * 4);
        const s = 1.15 + rng() * 0.35;
        glassShape(g, st, x, sy, s, kind, tints[Math.floor(rng() * tints.length)]);
        GLASS_SPOTS.push({ x: x - 4 * s, y: sy - (kind === 1 ? 24 : 16) * s, s });
      }
    }
    // the window at the back: an arch onto the bright street
    const win = archPath(WIN4.x, WIN4.y, WIN4.w, WIN4.h);
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fill(win);
    g.restore();
    const frame = archPath(WIN4.x - 18, WIN4.y - 18, WIN4.w + 36, WIN4.h + 26);
    const fr = new Path2D();
    fr.addPath(frame);
    g.save();
    g.clip(frame);
    g.globalCompositeOperation = 'destination-over';
    g.restore();
    strokeP(g, win, '#9b6b47', 12, 0.85);
    strokeP(g, win, '#6e4a33', 2, 0.6);
    // a lattice in the window
    const lat = new Path2D();
    for (let k = 1; k < 4; k++) {
      lat.moveTo(WIN4.x + (WIN4.w * k) / 4, WIN4.y + 40);
      lat.lineTo(WIN4.x + (WIN4.w * k) / 4, WIN4.y + WIN4.h);
    }
    lat.moveTo(WIN4.x, WIN4.y + 230);
    lat.lineTo(WIN4.x + WIN4.w, WIN4.y + 230);
    strokeP(g, lat, '#7a5238', 3, 0.7);
    pencil(g, st, frame, 0.3, 1);
    // the counter
    const ct = new Path2D();
    ct.rect(COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h);
    wash(g, st, ct, SB.wood, { reserve: 1, a: 0.92, gran: 0.6, rim: 1.6, grad: [0, COUNTER.y, 0, COUNTER.y + COUNTER.h, deepen(SB.wood, 0.4)] });
    const top = new Path2D();
    top.rect(COUNTER.x - 14, COUNTER.y - 12, COUNTER.w + 28, 14);
    wash(g, st, top, mixHex(SB.wood, '#c69a6a', 0.4), { reserve: 1, gran: 0.4, rim: 1.2 });
    const panels = new Path2D();
    for (let k = 0; k < 3; k++) panels.rect(COUNTER.x + 18 + k * 104, COUNTER.y + 26, 86, 150);
    strokeP(g, panels, deepen(SB.wood, 0.5), 2, 0.5, 'multiply');
    pencil(g, st, ct, 0.4, 1);
    // glasses on the counter
    glassShape(g, st, 1000, COUNTER.y - 12, 1.3, 1, tints[0]);
    glassShape(g, st, 960, COUNTER.y - 12, 1.2, 0, tints[2]);
    GLASS_SPOTS.push({ x: 995, y: COUNTER.y - 44, s: 1.3 }, { x: 956, y: COUNTER.y - 32, s: 1.2 });
    // the floor: worn terracotta
    const floor = new Path2D();
    floor.rect(-40, FLOOR4, 1680, 140);
    wash(g, st, floor, '#c98a64', { reserve: 1, a: 0.9, gran: 0.6, rim: 1.2, grad: [0, FLOOR4, 0, 940, '#a46a4c'] });
    const fl = new Path2D();
    for (let x = -40; x < 1640; x += 80) {
      fl.moveTo(x, FLOOR4);
      fl.lineTo(x - 30, 940);
    }
    fl.moveTo(-40, FLOOR4 + 40);
    fl.lineTo(1640, FLOOR4 + 40);
    fl.moveTo(-40, FLOOR4 + 95);
    fl.lineTo(1640, FLOOR4 + 95);
    pencil(g, st, fl, 0.3, 0.9, 0, 0);
  });

/** what the shop window looks onto: white walls, a blue door, bright sky */
const paintStreet = (r: Riso, st: Studio) =>
  bake(r, WIN4.x - 20, WIN4.y - 20, WIN4.w + 40, WIN4.h + 40, 1.25, (g) => {
    const sky = new Path2D();
    sky.rect(WIN4.x - 20, WIN4.y - 20, WIN4.w + 40, WIN4.h + 40);
    wash(g, st, sky, '#bcd6e6', { reserve: 1, a: 0.85, gran: 0.3, rim: 0, grad: [0, WIN4.y, 0, WIN4.y + WIN4.h, '#f0e6cf'] });
    house(g, st, WIN4.x - 10, WIN4.y + WIN4.h + 10, 140, 230, SD.wall, false);
    house(g, st, WIN4.x + 150, WIN4.y + WIN4.h + 10, 120, 300, '#f0dcc0', false);
    const door = archPath(WIN4.x + 40, WIN4.y + WIN4.h - 110, 40, 120);
    wash(g, st, door, '#4f7db0', { reserve: 1, gran: 0.4, rim: 1 });
    lifts(g, WIN4.x, WIN4.y, WIN4.w, 120, 6, 5, 0.6, 0.6);
  });

/* ---------- ch5: dunes ---------- */

const DW = 2400;
const dNearY = (x: number) => 730 - 34 * Math.sin((TAU * x) / DW + 0.6) - 16 * Math.sin((TAU * x * 3) / DW + 1.3);
const dMidY = (x: number) => 560 - 46 * Math.sin((TAU * x * 2) / DW + 0.3) - 14 * Math.sin((TAU * x * 5) / DW + 2);
const dFarY = (x: number) => 480 - 40 * Math.sin((TAU * x * 3) / DW + 1.1) - 18 * Math.sin((TAU * x * 7) / DW);

const duneBand = (r: Riso, st: Studio, top: (x: number) => number, y0: number, h: number, col: string, shade: string, res: number, seed: number, ripples: number) =>
  bake(r, 0, y0, DW, h, res, (g) => {
    const band = new Path2D();
    band.moveTo(-20, y0 + h);
    for (let x = -20; x <= DW + 20; x += 12) band.lineTo(x, top(x));
    band.lineTo(DW + 20, y0 + h);
    band.closePath();
    wash(g, st, band, col, { reserve: 1, a: 0.9, gran: 0.55, rim: 2, soft: true, grad: [0, y0, 0, y0 + h, deepen(col, 0.15)] });
    g.save();
    g.clip(band);
    mottle(g, 0, y0, DW, h, [shade, SD.sandPale, SD.duneRose], 30, seed, 0.25, 0.8);
    // the shadow side of each crest: a rose-violet glaze on the lee slope
    const lee = new Path2D();
    let pen = false;
    for (let x = 0; x < DW; x += 8) {
      const d = top(x + 8) - top(x);
      if (d > 0.25) {
        if (!pen) lee.moveTo(x, top(x) + 26);
        else lee.lineTo(x, top(x) + 26);
        pen = true;
      } else pen = false;
    }
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.4;
    g.strokeStyle = shade;
    g.lineWidth = 52;
    g.lineCap = 'round';
    g.filter = `blur(${(16 * res * r.scale).toFixed(1)}px)`;
    for (const ox of [-DW, 0, DW]) {
      g.save();
      g.translate(ox, 0);
      g.stroke(lee);
      g.restore();
    }
    g.restore();
    // wind ripples
    const rp = new Path2D();
    const rng = mulberry(seed + 4);
    for (let i = 0; i < ripples; i++) {
      const x = rng() * DW;
      const y = top(x) + 10 + rng() ** 1.3 * (h - 40);
      const l = 20 + rng() * 40;
      for (const ox of [0, x < 60 ? DW : x > DW - 60 ? -DW : 0]) {
        if (ox === 0 && x < 0) continue;
        rp.moveTo(x + ox - l / 2, y);
        rp.quadraticCurveTo(x + ox, y - 3, x + ox + l / 2, y + 1);
      }
    }
    strokeP(g, rp, deepen(shade, 0.2), 1, 0.4, 'multiply');
    g.restore();
  });

/* ---------- ch6: the oasis ---------- */

const H6 = 540;
const o6 = (x: number) => 690 - 60 * Math.exp(-(((x - 1240) / 260) ** 2)) + 8 * Math.sin(x * 0.01);
const POOL: Pt = [600, 700];
const PALMS: [number, number, number, number][] = [
  [420, 706, 260, -0.12], [520, 690, 330, 0.05], [700, 694, 300, 0.14], [790, 704, 220, -0.05], [330, 716, 200, 0.18], [900, 712, 250, 0.1],
];
const palmTop = (x: number, y: number, h: number, lean: number): Pt => [x + Math.sin(lean) * h, y - Math.cos(lean) * h];

const paintOasis = (r: Riso, st: Studio) =>
  bake(r, -200, 380, 2000, 560, 1.0, (g) => {
    // far dunes
    const far = new Path2D();
    far.moveTo(-200, 940);
    for (let x = -200; x <= 1800; x += 16) far.lineTo(x, H6 - 30 * Math.sin(x * 0.004 + 1) - 14 * Math.sin(x * 0.011));
    far.lineTo(1800, 940);
    far.closePath();
    wash(g, st, far, mixHex(SD.sand, SD.duneRose, 0.4), { reserve: 1, a: 0.75, gran: 0.4, rim: 1.6, soft: true });
    // tents, far left
    for (const [x, w] of [[60, 110], [190, 80]] as [number, number][]) {
      const tn = new Path2D();
      const y = H6 + 40;
      tn.moveTo(x - w / 2, y + 30);
      tn.lineTo(x - w * 0.3, y);
      tn.lineTo(x + w * 0.35, y - 6);
      tn.lineTo(x + w / 2, y + 30);
      tn.closePath();
      wash(g, st, tn, '#6a5248', { reserve: 1, gran: 0.5, rim: 1.2 });
      pencil(g, st, tn, 0.35);
    }
    // ground around the water: green
    const green = new Path2D();
    green.moveTo(-200, 940);
    for (let x = -200; x <= 1800; x += 16) green.lineTo(x, Math.min(o6(x), 640 + 70 * ((x - 600) / 700) ** 2) + 0);
    green.lineTo(1800, 940);
    green.closePath();
    wash(g, st, green, SD.sand, { reserve: 1, a: 0.9, gran: 0.6, rim: 2, soft: true, grad: [0, 600, 0, 920, SD.sandDeep] });
    g.save();
    g.clip(green);
    wash(g, st, blob(620, 712, 420, 70, 3, 0.15), '#9fae6a', { a: 0.7, gran: 0.5, rim: 2, soft: true });
    mottle(g, -200, 600, 2000, 340, [SD.sandDeep, SD.duneRose, SD.sandPale], 30, 33, 0.25, 0.8);
    g.restore();
    // the pool
    const pool = new Path2D();
    pool.ellipse(POOL[0], POOL[1], 190, 32, 0, 0, TAU);
    wash(g, st, pool, SD.sea, { reserve: 1, a: 0.85, gran: 0.4, rim: 2, grad: [0, POOL[1] - 32, 0, POOL[1] + 32, SD.seaDeep] });
    // the well
    const wl = new Path2D();
    wl.ellipse(880, 692, 34, 9, 0, 0, TAU);
    const wb = new Path2D();
    wb.rect(846, 692, 68, 34);
    wb.ellipse(880, 726, 34, 9, 0, 0, P);
    wash(g, st, wb, SD.stone, { reserve: 1, gran: 0.6, rim: 1.4, grad: [846, 0, 914, 0, SD.stoneDeep] });
    wash(g, st, wl, '#5b5056', { reserve: 1, a: 0.8, gran: 0.3, rim: 1 });
    const frame = new Path2D();
    frame.moveTo(852, 694);
    frame.lineTo(856, 630);
    frame.moveTo(908, 694);
    frame.lineTo(904, 630);
    frame.moveTo(850, 632);
    frame.lineTo(910, 632);
    strokeP(g, frame, SB.wood, 4, 0.9);
    pencil(g, st, wb, 0.4);
    // palm trunks: curved, ringed
    for (const [x, y, h, lean] of PALMS) {
      const tp = palmTop(x, y, h, lean);
      const pts: Pt[] = [];
      for (let k = 0; k <= 10; k++) {
        const q = k / 10;
        pts.push([lerp(x, tp[0], q) + Math.sin(q * P) * lean * -40, lerp(y, tp[1], q)]);
      }
      const tr = ribbon(pts, (q) => lerp(16, 9, q));
      wash(g, st, tr, '#9a7e62', { reserve: 1, gran: 0.6, rim: 1.4, grad: [x - 8, 0, x + 8, 0, '#7a6048'] });
      const rings = new Path2D();
      for (let k = 1; k < 20; k++) {
        const q = k / 20;
        const cx = lerp(x, tp[0], q) + Math.sin(q * P) * lean * -40;
        const cy = lerp(y, tp[1], q);
        const w = lerp(16, 9, q) / 2;
        rings.moveTo(cx - w, cy);
        rings.quadraticCurveTo(cx, cy + 3, cx + w, cy - 1);
      }
      strokeP(g, rings, '#5c4636', 0.9, 0.5, 'multiply');
      pencil(g, st, tr, 0.35);
    }
  });

/* ---------- ch7: the pyramids ---------- */

const H7 = 600;
const PYRS: [number, number, number][] = [
  // centre x, half width, peak y
  [1520, 120, 470],
  [1240, 220, 350],
  [820, 300, 250],
];
const g7 = (x: number) => 770 - 34 * Math.sin(x * 0.0035 + 0.4) - 12 * Math.sin(x * 0.011);
const DIG_X = 700;

const paintPyramids = (r: Riso, st: Studio) =>
  bake(r, -200, 180, 2000, 760, 1.15, (g) => {
    // far dune line
    const far = new Path2D();
    far.moveTo(-200, 940);
    // the far sand line: drifts piled up against each pyramid's base, so they sit in the dunes
    const farTop = (x: number) => {
      let y = H7 + 14 - 12 * Math.sin(x * 0.005 + 2) - 5 * Math.sin(x * 0.019 + 1);
      for (const [cx, hw] of PYRS) y -= 20 * Math.exp(-(((x - cx) / (hw * 1.05)) ** 2));
      return y;
    };
    for (let x = -200; x <= 1800; x += 12) far.lineTo(x, farTop(x));
    far.lineTo(1800, 940);
    far.closePath();
    for (const [cx, hw0, py] of PYRS) {
      // the faces run on below the sand line (hidden by the drifts)
      const BASE = H7 + 46;
      const hw = (hw0 * (BASE - py)) / (H7 + 6 - py);
      const lit = new Path2D();
      lit.moveTo(cx - hw, BASE);
      lit.lineTo(cx, py);
      lit.lineTo(cx + hw * 0.18, BASE);
      lit.closePath();
      const sh = new Path2D();
      sh.moveTo(cx + hw * 0.18, BASE);
      sh.lineTo(cx, py);
      sh.lineTo(cx + hw, BASE);
      sh.closePath();
      wash(g, st, lit, SD.pyramid, { reserve: 1, a: 0.92, gran: 0.6, rim: 2, soft: true, grad: [cx, py, cx, H7, mixHex(SD.pyramid, SD.sandPale, 0.3)] });
      wash(g, st, sh, SD.pyramidShade, { reserve: 1, a: 0.92, gran: 0.6, rim: 2, soft: true, grad: [cx, py, cx + hw, H7, deepen(SD.pyramidShade, 0.25)] });
      // courses of stone
      const cs = new Path2D();
      for (let k = 1; k < 30; k++) {
        const q = k / 30;
        const y = lerp(py, BASE, q);
        const w = hw * q;
        cs.moveTo(cx - w, y);
        cs.lineTo(cx + w, y);
      }
      g.save();
      const both = new Path2D();
      both.addPath(lit);
      both.addPath(sh);
      g.clip(both);
      strokeP(g, cs, deepen(SD.pyramidShade, 0.4), 0.8, 0.35, 'multiply');
      g.restore();
      pencil(g, st, lit, 0.35, 1);
      pencil(g, st, sh, 0.35, 1);
      sketchLine(g, st, [[cx, py], [cx + hw * 0.18, BASE]], 0.3, 4);
    }
    wash(g, st, far, mixHex(SD.sand, SD.duneRose, 0.35), { reserve: 1, a: 0.85, gran: 0.5, rim: 1.6, soft: true, grad: [0, H7, 0, 760, SD.sand] });
    g.save();
    g.clip(far);
    // each pyramid's shadow falling across the sand at its foot, and ripples to break up the plain
    for (const [cx, hw] of PYRS) {
      g.save();
      g.filter = `blur(${(14 * 1.15 * r.scale).toFixed(1)}px)`;
      wash(g, st, blob(cx + hw * 0.6, farTop(cx + hw * 0.6) + 10, hw * 0.7, 12, Math.floor(cx), 0.15), SD.duneShade, { a: 0.22, gran: 0, rim: 0 });
      g.restore();
    }
    mottle(g, -200, H7, 2000, 200, [SD.duneShade, SD.sandPale, SD.duneRose], 26, 73, 0.22, 0.6);
    const fr = new Path2D();
    const frng = mulberry(74);
    for (let i = 0; i < 90; i++) {
      const x = -200 + frng() * 2000;
      const y = farTop(x) + 12 + frng() * 150;
      fr.moveTo(x - 16, y);
      fr.quadraticCurveTo(x, y - 2.5, x + 18, y + 1);
    }
    strokeP(g, fr, SD.duneShade, 1, 0.35, 'multiply');
    g.restore();
    // foreground dune
    const near = new Path2D();
    near.moveTo(-200, 940);
    for (let x = -200; x <= 1800; x += 12) near.lineTo(x, g7(x));
    near.lineTo(1800, 940);
    near.closePath();
    wash(g, st, near, SD.sand, { reserve: 1, a: 0.92, gran: 0.6, rim: 2, soft: true, grad: [0, 700, 0, 920, SD.sandDeep] });
    g.save();
    g.clip(near);
    mottle(g, -200, 700, 2000, 240, [SD.sandDeep, SD.duneRose, SD.sandPale], 30, 71, 0.25, 0.7);
    const rp = new Path2D();
    const rng = mulberry(72);
    for (let i = 0; i < 160; i++) {
      const x = -200 + rng() * 2000;
      const y = g7(x) + 14 + rng() * 160;
      rp.moveTo(x - 20, y);
      rp.quadraticCurveTo(x, y - 3, x + 22, y + 1);
    }
    strokeP(g, rp, SD.duneShade, 1, 0.4, 'multiply');
    g.restore();
  });

/* ---------- caravan sprites ---------- */

const CARAVAN_PH = 24;
const paintCaravan = (r: Riso, st: Studio): Plate[] => {
  const out: Plate[] = [];
  // two loads (pack / rider) x CARAVAN_PH gait phases; a camel keeps its load for the whole walk
  for (let n = 0; n < 2 * CARAVAN_PH; n++) {
    const rider = n >= CARAVAN_PH;
    const i = n % CARAVAN_PH;
    out.push(
      bake(r, -80, -200, 240, 210, 1.1, (g) => {
        const pose = camelWalk(i / CARAVAN_PH);
        const m = drawCamel(g, st, pose, { t: 0, pack: !rider, saddle: rider, pencil: 0.25 });
        if (rider) {
          // a robed rider
          const [sx, sy] = m.seat;
          const robe = smoothPath([[sx - 8, sy + 4], [sx - 6, sy - 26], [sx + 2, sy - 32], [sx + 9, sy - 24], [sx + 14, sy + 6], [sx + 18, sy + 22], [sx - 2, sy + 20]], true, 0.4);
          wash(g, st, robe, SD.indigo, { reserve: 1, gran: 0.5, rim: 1.2 });
          const hd = new Path2D();
          hd.arc(sx + 3, sy - 38, 7, 0, TAU);
          wash(g, st, hd, '#efe6d2', { reserve: 1, gran: 0.3, rim: 1 });
          pencil(g, st, robe, 0.3);
        }
      })
    );
  }
  return out;
};

/* ---------- per-frame painting ---------- */

const skyGrad = (c: Ctx, top: string, mid: string, bot: string, y0 = 0, y1 = 900) => {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, bot);
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = g;
  c.fillRect(-10, -10, 1620, 920);
  c.restore();
};
const skyTexture = (c: Ctx, s: State, a = 1, liftA = 1) => {
  drawPlate(c, s.skyTex, a, 'multiply');
  drawPlate(c, s.skyLift, liftA * 0.8);
};

const drawStars = (c: Ctx, s: State, ox: number, oy: number, a: number, t: number, big = 1) => {
  if (a <= 0.01) return;
  c.save();
  c.globalCompositeOperation = 'screen';
  for (const st of s.stars) {
    const x = ((((st.x + ox) % 1700) + 1700) % 1700) - 50;
    const y = ((((st.y + oy) % 1000) + 1000) % 1000) - 50;
    const tw = 0.65 + 0.35 * Math.sin(t * (1.3 + st.ph) + st.ph * 9);
    starAt(c, s.st, x, y, st.s * 2.2 * big, a * tw);
    if (st.big) sparkle(c, x, y, st.s * 3.2 * big, st.s * 0.4, '#fff4d8', a * tw * 0.8, 0.1);
  }
  c.restore();
  c.globalAlpha = 1;
};

const sunDisc = (c: Ctx, s: State, x: number, y: number, rr: number, warm: number, a = 1) => {
  c.save();
  c.globalCompositeOperation = 'screen';
  glowAt(c, s.st, x, y, rr * 6, 0.85 * a);
  c.restore();
  const d = new Path2D();
  d.arc(x, y, rr, 0, TAU);
  c.save();
  c.globalAlpha = a;
  wash(c, s.st, d, mixHex(SB.gold, SB.apricotDeep, warm), { reserve: 1, a: 0.75, gran: 0.2, rim: 1.6, edge: SB.apricotDeep });
  lift(c, blob(x - rr * 0.25, y - rr * 0.25, rr * 0.45, rr * 0.35, 3, 0.2), 0.5);
  c.restore();
};

/** The motif: a golden glint (glow, four-point star, a slow turn) */
const glint = (c: Ctx, s: State, x: number, y: number, size: number, a: number, t: number) => {
  if (a <= 0.01) return;
  c.save();
  c.globalCompositeOperation = 'screen';
  const tw = 0.85 + 0.15 * Math.sin(t * 5.3);
  glowAt(c, s.st, x, y, size * 4.5 * tw, a * 0.85);
  starAt(c, s.st, x, y, size * 0.9, a);
  sparkle(c, x, y, size * 1.9 * tw, size * 0.2, '#ffe6a8', a, 0.1 + Math.sin(t * 0.7) * 0.08);
  sparkle(c, x, y, size * 0.9 * tw, size * 0.12, '#fff6dc', a * 0.8, P / 4 + 0.1);
  c.restore();
  c.globalAlpha = 1;
};

const warmWash = (r: Riso, k: number, col: string = SB.apricot) => {
  if (k <= 0.01) return;
  const c = r.layers[0];
  screen(r);
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = k;
  const g = c.createLinearGradient(0, 0, 0, 900);
  g.addColorStop(0, rgba(col, 0.2));
  g.addColorStop(1, rgba(col, 0.75));
  c.fillStyle = g;
  c.fillRect(0, 0, 1600, 900);
  c.restore();
};
const nightWash = (r: Riso, k: number, col: string = SB.night) => {
  if (k <= 0.01) return;
  const c = r.layers[0];
  screen(r);
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = k;
  const g = c.createLinearGradient(0, 0, 0, 900);
  g.addColorStop(0, rgba(col, 0.6));
  g.addColorStop(1, rgba(col, 0.85));
  c.fillStyle = g;
  c.fillRect(0, 0, 1600, 900);
  c.restore();
};

type Fig = { px: number; py: number; sc: number; face: number };
const shep = (c: Ctx, s: State, x: number, groundY: number, sc: number, face: number, p: ManPose, o: Partial<ShepOpts> & { t: number; pelvisY?: number }) => {
  c.save();
  const py = o.pelvisY ?? groundY - manLow(p) * sc;
  c.translate(x, py);
  c.scale(sc * face, sc);
  const ground = (groundY - py) / sc;
  const j = drawShepherd(c, s.st, p, { crook: null, ground, ...o });
  c.restore();
  return { j, px: x, py, sc, face };
};
const figPt = (m: Fig, q: Pt): Pt => [m.px + q[0] * m.sc * m.face, m.py + q[1] * m.sc];

const sheep = (c: Ctx, s: State, x: number, groundY: number, sc: number, face: number, p: SheepPose, o: SheepOpts) => {
  c.save();
  c.translate(x, groundY);
  c.scale(sc * face, sc);
  drawSheep(c, s.st, p, o);
  c.restore();
};
const camel = (c: Ctx, s: State, x: number, groundY: number, sc: number, face: number, p: CamelPose, o: CamelOpts) => {
  c.save();
  c.translate(x, groundY);
  c.scale(sc * face, sc);
  const m = drawCamel(c, s.st, p, o);
  c.restore();
  const w = (q: Pt): Pt => [x + q[0] * sc * face, groundY + q[1] * sc];
  return { seat: w(m.seat), nose: w(m.nose), head: w(m.head), hump: w(m.hump) };
};

/* ---------- chapter 1: the dream ---------- */

const SLEEP_X = TX + 52;
const drawCh1 = (r: Riso, s: State, t: number, home = false) => {
  const c = r.layers[0];
  const C = camKeys(t, [
    [0, { x: 800, y: 470, z: 0.96 }],
    [2.6, { x: 790, y: 520, z: 1.12 }],
    [4.1, { x: SLEEP_X + 10, y: 712, z: 3.3 }],
    [5.0, { x: SLEEP_X + 14, y: 706, z: 3.45 }],
    [6.5, { x: 1150, y: 270, z: 1.5 }],
    [7.6, { x: 1236, y: 190, z: 2.3 }],
    [9.6, { x: DREAM_C[0], y: DREAM_C[1] - 70, z: 7 }],
  ]);
  screen(r);
  skyGrad(c, SB.nightDeep, SB.night, '#4c5c8c');
  skyTexture(c, s, 0.8, 0.35);
  drawStars(c, s, -C.x * 0.05, -C.y * 0.05, 0.9, t);
  // the moon, high and left
  {
    const v = layerView(C, 0.15);
    const [mx, my] = toScreen(v, 300, 120);
    c.save();
    c.globalCompositeOperation = 'screen';
    glowAt(c, s.st, mx, my, 160, 0.5);
    c.restore();
    const m = new Path2D();
    m.arc(mx, my, 26, 0, TAU);
    const cut = new Path2D();
    cut.arc(mx + 12, my - 6, 24, 0, TAU);
    c.save();
    c.clip(m);
    fillP(c, m, '#f6efd8', 0.95);
    fillP(c, cut, SB.night, 0.45, 'multiply');
    c.restore();
  }
  applyCam(r, C);
  drawPlate(c, s.chapel);
  // sheep asleep around him, breathing
  const flock: [number, number, number, number][] = [
    [430, 1, 0.95, 1], [900, 1, 1.0, 2], [1030, -1, 0.9, 3], [1160, 1, 1.05, 4], [1340, -1, 0.95, 5],
  ];
  for (const [x, f, sc, seed] of flock) {
    const br = Math.sin(t * 1.6 + seed) * 0.5;
    sheep(c, s, x, g1(x) + 8, sc * 1.05, f, { ...SHEEP_LIE, y: SHEEP_LIE.y + br, graze: seed === 3 ? 0.1 : 0.35 }, { t, seed, dark: seed === 4 ? 0.35 : 0 });
  }
  // the shepherd asleep against the trunk, smiling at his dream
  const dreamK = tween(t, 4.2, 5.0);
  shep(c, s, SLEEP_X, g1(SLEEP_X) + 6, 1.15, 1, { ...SH_SLEEP, smile: lerp(0.45, 0.85, dreamK), head: SH_SLEEP.head + Math.sin(t * 0.9) * 0.02 }, {
    t,
    pelvisY: g1(SLEEP_X) + 2,
    sleep: true,
    wind: 0.1,
    behind: (j) => {
      // the crook leaning on the trunk
      const p = new Path2D();
      p.moveTo(j.hipN[0] - 20, 40);
      p.lineTo(j.hipN[0] - 34, -86);
      p.bezierCurveTo(j.hipN[0] - 35, -96, j.hipN[0] - 24, -100, j.hipN[0] - 22, -92);
      strokeP(c, p, SD.crook, 2.6, 0.9);
    },
  });
  // night over everything; a little moonlight back on the stones
  nightWash(r, 0.62, SB.night);
  screen(r);
  c.save();
  c.globalCompositeOperation = 'screen';
  glowAt(c, s.st, 300, 120, 700, 0.18);
  c.restore();
  c.globalAlpha = 1;
  applyCam(r, C);
  // fireflies: tiny gold specks drifting over the grass
  for (let i = 0; i < 10; i++) {
    const fx = 300 + ((i * 197 + t * 18 * (1 + (i % 3) * 0.3)) % 1100);
    const fy = 700 - 40 * Math.sin(t * 0.7 + i * 2) - (i % 4) * 26;
    glint(c, s, fx, fy, 2.2, 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7), t);
  }
  // the dream: a wisp of gold rising from his head to a cloud with the pyramids in it
  const head: Pt = [SLEEP_X + 6, g1(SLEEP_X) - 52];
  const wk = tween(t, 4.6, 6.6, ease.inOutSine);
  if (wk > 0) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 18; i++) {
      const q = (i / 18) * wk;
      const x = lerp(head[0], DREAM_C[0] - 60, q) + Math.sin(q * 9 + t * 2) * 30 * (1 - q);
      const y = lerp(head[1] - 10, DREAM_C[1] + 90, ease.outSine(q));
      pts.push([x, y]);
    }
    const fade = 1 - tween(t, 6.8, 7.8);
    const trail = ribbon(pts, (q) => 1 + q * 5);
    fillP(c, trail, rgba(SB.gold, 0.5 * fade), 1, 'screen');
    for (let i = 0; i < 7; i++) {
      const p = pts[Math.min(pts.length - 1, Math.floor((i / 7) * pts.length + ((t * 6) % 3)))];
      glint(c, s, p[0], p[1], 3, 0.6 * fade, t + i);
    }
  }
  const form = tween(t, 5.6, 7.0);
  if (form > 0) {
    c.save();
    c.globalAlpha = form;
    c.translate(DREAM_C[0], DREAM_C[1]);
    const sc = 0.85 + 0.15 * form + Math.sin(t * 0.8) * 0.01;
    c.scale(sc, sc);
    c.translate(-DREAM_C[0], -DREAM_C[1]);
    drawPlate(c, s.dream, form);
    c.restore();
    // the glint on the apex of the great pyramid
    const ap: Pt = [DREAM_C[0], DREAM_C[1] + 70 - 128 * 1];
    const apS: Pt = [DREAM_C[0] + (ap[0] - DREAM_C[0]) * (0.85 + 0.15 * form), DREAM_C[1] + (ap[1] - DREAM_C[1]) * (0.85 + 0.15 * form)];
    glint(c, s, apS[0], apS[1], 5 + tween(t, 7.0, 9.6, ease.inCubic) * 40, form, t);
  }
  // the glint swells into light
  const flash = tween(t, 8.2, 9.6, ease.inCubic);
  if (flash > 0 && !home) {
    screen(r);
    const g = c.createRadialGradient(800, 450, 0, 800, 450, 1000);
    g.addColorStop(0, rgba('#fffaf0', flash));
    g.addColorStop(0.5, rgba('#fbe7bd', flash * 0.95));
    g.addColorStop(1, rgba(SB.gold, flash * 0.9));
    c.save();
    c.fillStyle = g;
    c.fillRect(0, 0, 1600, 900);
    c.restore();
  }
};

/* ---------- chapter 2: the stranger's stones ---------- */

const shepX2 = (t: number) => keys(t, [[10.6, 260], [13.7, KING_X - 135]], (k) => k);
const drawCh2 = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  const px = shepX2(t);
  const C0 = camKeys(t, [
    [T2, { x: 520, y: 260, z: 3.2 }],
    [11.0, { x: 620, y: 470, z: 1.0 }],
    [13.4, { x: 1180, y: 560, z: 1.25 }],
    [14.2, { x: KING_X - 60, y: g2(KING_X) - 90, z: 2.3 }],
    [15.1, { x: KING_X - 56, y: g2(KING_X) - 88, z: 2.4 }],
    [15.7, { x: KING_X - 40, y: g2(KING_X) - 55, z: 6.2 }],
    [16.9, { x: KING_X - 36, y: g2(KING_X) - 58, z: 6.6 }],
    [17.7, { x: KING_X - 20, y: g2(KING_X) - 80, z: 2.0 }],
    [T3 - 0.8, { x: 2900, y: 380, z: 1.6 }],
  ]);
  let C = C0;
  if (t > 11.0 && t < 13.4) C = mixCam(C0, { x: px + 260, y: 560, z: 1.25 }, pulse(t, 11.0, 11.8, 12.8, 13.4) * 0.7);
  // morning, then the day passes into a sea sunset
  const eve = tween(t, 17.4, T3 + 0.4, ease.inOutSine);
  screen(r);
  skyGrad(c, mixHex(SB.skyDeep, '#7b6fa2', eve), mixHex(SB.sky, '#f0b896', eve), mixHex(SB.skyHi, SB.gold, eve));
  skyTexture(c, s, 0.85, 0.9 - eve * 0.4);
  // the sun: morning low over the hills, later setting over the sea
  {
    const v = layerView(C, 0.15);
    const sx = lerp(500, 980, eve);
    const sy = lerp(260, 430, eve);
    const [x, y] = toScreen(v, sx, sy);
    sunDisc(c, s, x, y, 34 * Math.sqrt(v.z), 0.2 + eve * 0.7);
  }
  for (const [pl, p] of [[s.far2, 0.4], [s.mid2, 0.7]] as [Plate, number][]) {
    applyCam(r, layerView(C, p));
    drawPlate(c, pl);
  }
  // sun glitter on the far sea
  {
    const v = layerView(C, 0.4);
    applyCam(r, v);
    const gl = new Path2D();
    for (let i = 0; i < 40; i++) {
      const x = 1100 + hash(i * 3.1) * 1600 + Math.sin(t * 2 + i) * 6;
      const y = HORIZON2 + 6 + hash(i * 7.7) * 80;
      const on = Math.max(0, Math.sin(t * 3 + i * 1.9));
      if (on > 0.3) {
        gl.moveTo(x, y);
        gl.lineTo(x + 8 + on * 6, y);
      }
    }
    strokeP(c, gl, rgba('#fff4d8', 0.8), 1.4, 0.8);
  }
  applyCam(r, C);
  drawPlate(c, s.near2);
  // the flock walks ahead of him, then grazes around the king's stone
  const walking = tween(t, 10.6, 10.9) * (1 - tween(t, 13.4, 13.8));
  const flock: [number, number, number][] = [
    [120, -6, 1], [190, 10, 2], [60, 16, 3], [250, 4, 4], [-60, 12, 5], [320, 18, 6],
  ];
  for (const [dx, dy, seed] of flock) {
    const sx0 = px + dx + (seed % 2 ? 20 : -10) * tween(t, 13.4, 15);
    const gy0 = g2(sx0) + dy;
    const wp = sheepWalk((sx0 + seed * 13) / 34);
    const graze = { ...SHEEP_GRAZE, graze: 0.75 + 0.25 * Math.sin(t * 1.3 + seed) };
    const pose = walking > 0.01 ? mixSheep(graze, wp, walking) : mixSheep(SHEEP_STAND, graze, tween(t, 13.6 + seed * 0.2, 14.3 + seed * 0.2));
    sheep(c, s, sx0, gy0, 0.9, 1, pose, { t, seed, dark: seed === 5 ? 0.4 : 0 });
  }
  // the king on his stone
  const reach = tween(t, 14.6, 15.4);
  const open = tween(t, 15.5, 16.0);
  const handOver = tween(t, 16.4, 16.9);
  c.save();
  c.translate(KING_X + 6, g2(KING_X) - 22);
  c.scale(-1.0, 1.0);
  const king = drawElder(c, s.st, { t, reach, open, glint: pulse(t, 14.0, 14.4, 14.9, 15.4) });
  c.restore();
  const palm: Pt = [KING_X + 6 - king.palm[0], g2(KING_X) - 22 + king.palm[1]];
  // the shepherd: walks, stops, reaches out for the stones
  let pose: ManPose = SH_STAND;
  if (t < 13.75) pose = walkPose((px - 260) / 30, walking * 0.85);
  else pose = mixMan(SH_STAND, SH_REACH, tween(t, 15.6, 16.3) * (1 - tween(t, 16.9, 17.5) * 0.85));
  const m = shep(c, s, px, g2(px) + 2, 1.05, 1, { ...pose, look: t > 14 ? 0.3 : 0, smile: t > 16.6 ? 0.95 : pose.smile }, {
    t,
    crook: 0.05,
    crookFar: t > 15.2,
    wind: 0.25,
  });
  // the stones: in his palm, then his hand closes
  const hand = figPt(m, m.j.hN);
  const sp: Pt = [lerp(palm[0], hand[0] + 3, handOver), lerp(palm[1] - 2.5, hand[1] - 3, handOver)];
  const closeK = tween(t, 17.2, 17.6);
  if (t > 15.4 && closeK < 1) {
    c.save();
    c.globalAlpha = 1 - closeK;
    drawStones(c, s.st, sp[0], sp[1], 2.6, pulse(t, 15.8, 16.1, 16.6, 17.0));
    c.restore();
  }
  if (t > 15.5) glint(c, s, sp[0] + 2, sp[1] - 1, 2.5 + pulse(t, 15.7, 16.0, 16.5, 17.0) * 3, 0.9 - closeK * 0.5, t);
  warmWash(r, 0.35 * eve);
  // the light of the dream fades into the morning
  const flash = 1 - tween(t, T2, 10.9, ease.outSine);
  if (flash > 0.01) {
    screen(r);
    const g = c.createRadialGradient(800, 450, 0, 800, 450, 1000);
    g.addColorStop(0, rgba('#fffaf0', flash));
    g.addColorStop(0.5, rgba('#fbe7bd', flash * 0.95));
    g.addColorStop(1, rgba(SB.gold, flash * 0.9));
    c.save();
    c.fillStyle = g;
    c.fillRect(0, 0, 1600, 900);
    c.restore();
  }
};

/* ---------- chapter 3: across the sea ---------- */

const boatX = (t: number) => keys(t, [[T3, -350], [25.6, 1700]], (k) => k);
const waveY = (x: number, t: number) => HORIZON3 + 260 + 6 * Math.sin(x * 0.012 - t * 1.6) + 4 * Math.sin(x * 0.03 + t * 2.2);

const drawBoat = (c: Ctx, s: State, t: number, bx: number, dusk: number) => {
  const by = waveY(bx, t);
  const roll = Math.sin(t * 1.3) * 0.04;
  c.save();
  c.translate(bx, by);
  c.rotate(roll);
  // the lateen sail, filled with wind
  const mastTop: Pt = [10, -230];
  const sail = new Path2D();
  sail.moveTo(-120, -40);
  sail.quadraticCurveTo(-40, -150 - Math.sin(t * 2) * 4, 70, -262);
  sail.quadraticCurveTo(40, -120, 46, -36);
  sail.closePath();
  wash(c, s.st, sail, '#efe4cc', { reserve: 1, a: 0.9, gran: 0.4, rim: 2, grad: [-120, -40, 70, -260, '#dccaa6'] });
  const patch = new Path2D();
  patch.rect(-30, -120, 26, 22);
  wash(c, s.st, patch, '#d9b88a', { a: 0.6, gran: 0.4, rim: 1 });
  const seams = new Path2D();
  for (let k = 1; k < 5; k++) {
    seams.moveTo(-120 + k * 30, -40 - k * 2);
    seams.quadraticCurveTo(-60 + k * 22, -120 - k * 10, 70 - (5 - k) * 2, -262 + (5 - k) * 40);
  }
  strokeP(c, seams, '#bfa47c', 0.8, 0.5, 'multiply');
  pencil(c, s.st, sail, 0.35, 1);
  const mast = new Path2D();
  mast.moveTo(10, 0);
  mast.lineTo(mastTop[0], mastTop[1]);
  mast.moveTo(-124, -36);
  mast.lineTo(74, -266);
  strokeP(c, mast, '#6e4a33', 3, 0.95);
  // hull
  const hull = smoothPath([[-150, -22], [-100, 10], [60, 14], [140, -4], [170, -34], [120, -18], [-120, -14]], true, 0.4);
  wash(c, s.st, hull, '#7a5a44', { reserve: 1, a: 0.92, gran: 0.6, rim: 2, grad: [0, -30, 0, 14, '#4f3a2e'] });
  const stripe = new Path2D();
  stripe.moveTo(-138, -14);
  stripe.quadraticCurveTo(0, -6, 160, -26);
  strokeP(c, stripe, SD.indigo, 3, 0.8);
  strokeP(c, stripe, SB.gold, 1, 0.6);
  pencil(c, s.st, hull, 0.4);
  c.restore();
  return { deck: [bx + 80 + Math.sin(roll) * 20, by - 14 + roll * 80] as Pt, roll, rope: [bx + 10 + roll * 200, by - 200] as Pt };
};

const cam3 = (t: number): Cam => {
  const C = camKeys(t, [
    [T3 - 0.6, { x: 820, y: 422, z: 1.2 }],
    [20.6, { x: 760, y: 480, z: 0.9 }],
    [21.6, { x: boatX(21.6) + 120, y: 580, z: 2.0 }],
    [23.2, { x: boatX(23.2) + 70, y: 540, z: 2.7 }],
    [24.6, { x: 1880, y: 470, z: 0.95 }],
    [25.5, { x: 2200, y: 520, z: 1.3 }],
    [T4, { x: CITY_DOOR[0], y: CITY_DOOR[1] - 24, z: 5 }],
  ]);
  const bx = boatX(t);
  if (t > 21.6 && t < 23.2) return { ...C, x: bx + lerp(120, 70, seg(t, 21.6, 23.2)) };
  return C;
};

const drawCh3 = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  const bx = boatX(t);
  const dusk = tween(t, 22.6, 26.4, ease.inOutSine);
  const cam = cam3(t);
  screen(r);
  skyGrad(c, mixHex('#7b6fa2', SB.dusk, dusk), mixHex('#f0b896', '#c98a96', dusk), mixHex(SB.gold, SB.apricotDeep, dusk));
  skyTexture(c, s, 0.85, 0.6 - dusk * 0.3);
  drawStars(c, s, 0, 0, dusk * 0.6, t);
  // the sun on the horizon, sinking
  {
    const v = layerView(cam, 0.15);
    const [x, y] = toScreen(v, 660 + (t - T3) * 8, 430 + dusk * 40);
    c.save();
    c.beginPath();
    c.rect(0, 0, 1600, toScreen(cam, 0, HORIZON3)[1]);
    c.clip();
    sunDisc(c, s, x, y, 40 * Math.sqrt(v.z), 0.85);
    c.restore();
  }
  // gulls
  applyCam(r, layerView(cam, 0.6));
  const gulls = new Path2D();
  for (let i = 0; i < 6; i++) {
    const gx = 300 + i * 260 + (t - T3) * (30 + i * 4) + Math.sin(t + i) * 20;
    const gy = 200 + (i % 3) * 50 + Math.sin(t * 1.2 + i * 2) * 14;
    const f = Math.sin(t * 7 + i * 1.3) * 5;
    gulls.moveTo(gx - 12, gy - f);
    gulls.quadraticCurveTo(gx - 5, gy - 6, gx, gy);
    gulls.quadraticCurveTo(gx + 5, gy - 6, gx + 12, gy - f);
  }
  strokeP(c, gulls, '#4d4650', 1.6, 0.75);
  // sea
  applyCam(r, cam);
  drawPlate(c, s.sea);
  // waves near and far: short strokes riding the swell, gold glitter where the sun lies
  const wv = new Path2D();
  const gl = new Path2D();
  const x0 = cam.x - 800 / cam.z - 60;
  const x1 = cam.x + 800 / cam.z + 60;
  for (let row = 0; row < 9; row++) {
    const yb = HORIZON3 + 40 + row * row * 9;
    const sp = 30 + row * 14;
    for (let x = Math.floor(x0 / sp) * sp; x < x1; x += sp) {
      const h = hash(x * 0.13 + row * 7.1);
      const xx = x + h * sp + Math.sin(t * 1.2 + row) * 8;
      const y = yb + Math.sin(xx * 0.02 - t * 1.6 + row) * (2 + row * 0.6);
      const l = 8 + row * 4;
      wv.moveTo(xx - l, y);
      wv.quadraticCurveTo(xx, y - 3 - row * 0.4, xx + l, y);
      if (Math.abs(xx - (660 + (t - T3) * 8)) < 260 - row * 10 && Math.sin(t * 3 + h * 20) > 0.2) {
        gl.moveTo(xx - l * 0.5, y + 2);
        gl.lineTo(xx + l * 0.5, y + 2);
      }
    }
  }
  strokeP(c, wv, mixHex(SD.seaDeep, SB.dusk, dusk), 1.4, 0.55, 'multiply');
  strokeP(c, wv, SD.seaPale, 0.8, 0.5);
  strokeP(c, gl, '#ffe6a8', 1.8, 0.85 * (1 - dusk * 0.6));
  // the city across the water
  applyCam(r, cam);
  drawPlate(c, s.city);
  nightWash(r, dusk * 0.45, SB.dusk);
  applyCam(r, cam);
  // lanterns come on one by one as dusk falls
  LANTERNS.forEach((p, i) => {
    const on = tween(t, 23.4 + i * 0.18, 23.9 + i * 0.18);
    glint(c, s, p[0], p[1], 3 + (i === LANTERNS.length - 1 ? 3 : 0), on * (0.75 + 0.25 * Math.sin(t * 4 + i)), t + i);
  });
  {
    c.save();
    c.globalCompositeOperation = 'screen';
    glowAt(c, s.st, CITY_DOOR[0], CITY_DOOR[1] - 20, 60, 0.6 * tween(t, 23.6, 24.6));
    c.restore();
    c.globalAlpha = 1;
  }
  // the boat and the shepherd at the bow, his cloak streaming
  const b = drawBoat(c, s, t, bx, dusk);
  const ropeHold = (j: { hF: Pt }) => j;
  void ropeHold;
  const m = shep(c, s, b.deck[0] - 140, b.deck[1], 1, 1, { ...SH_BOAT, spine: SH_BOAT.spine + b.roll, head: SH_BOAT.head + Math.sin(t * 0.8) * 0.04, smile: 0.85 }, {
    t,
    wind: 1.0,
    tint: [SB.dusk, dusk * 0.35],
    glow: 0.6 * (1 - dusk * 0.5),
  });
  const hf = figPt(m, m.j.hF);
  const rp = new Path2D();
  rp.moveTo(hf[0], hf[1]);
  rp.lineTo(b.rope[0] + 30, b.rope[1] - 50);
  strokeP(c, rp, '#8a6a4a', 1.2, 0.8);
  // bow spray
  for (let i = 0; i < 6; i++) {
    const k = ((t * 1.4 + i / 6) % 1 + 1) % 1;
    const sx = bx + 150 + k * 40;
    const sy = waveY(bx + 150, t) - 10 - Math.sin(k * P) * 26;
    const d = new Path2D();
    d.arc(sx, sy, 2 + (1 - k) * 2, 0, TAU);
    fillP(c, d, SB.paper, 0.7 * (1 - k));
  }
};

/* ---------- chapter 4: the glass shop ---------- */

const SHOP_X = 520;
const drawCrate = (c: Ctx, s: State, x: number, y: number, rotA: number, t: number, glintK = 0) => {
  c.save();
  c.translate(x, y);
  c.rotate(rotA);
  // glasses peeking out, packed in straw
  const tints = ['#a8cfd4', '#d9c39a', '#c6b8d8', '#bcd7c4'];
  for (let k = 0; k < 4; k++) {
    const p = new Path2D();
    p.ellipse(-24 + k * 16, -22, 6, 9, 0, P, 0);
    p.lineTo(-18 + k * 16, -14);
    p.lineTo(-30 + k * 16, -14);
    p.closePath();
    wash(c, s.st, p, tints[k], { reserve: 0.6, a: 0.6, gran: 0.1, rim: 1, edge: deepen(tints[k], 0.5) });
  }
  const straw = new Path2D();
  for (let k = 0; k < 14; k++) {
    straw.moveTo(-34 + k * 5, -16);
    straw.lineTo(-30 + k * 5 + Math.sin(k) * 3, -24 - (k % 3) * 2);
  }
  strokeP(c, straw, SB.wheatDeep, 1, 0.8);
  const box = new Path2D();
  box.rect(-38, -18, 76, 40);
  wash(c, s.st, box, SB.wood, { reserve: 1, a: 0.92, gran: 0.6, rim: 1.4, grad: [0, -18, 0, 22, deepen(SB.wood, 0.35)] });
  const slats = new Path2D();
  slats.moveTo(-38, -4);
  slats.lineTo(38, -4);
  slats.moveTo(-38, 9);
  slats.lineTo(38, 9);
  slats.moveTo(-26, -18);
  slats.lineTo(-26, 22);
  slats.moveTo(26, -18);
  slats.lineTo(26, 22);
  strokeP(c, slats, deepen(SB.wood, 0.55), 1, 0.5, 'multiply');
  pencil(c, s.st, box, 0.4);
  if (glintK > 0) glint(c, s, -10, -26, 4, glintK, t);
  c.restore();
};

const GLASS_W: Pt = (() => {
  const j = manJoints(SH_GLASS);
  const sc = 2.05;
  const py = FLOOR4 + 8 - manLow(SH_GLASS) * sc;
  return [SHOP_X + 70 + j.hN[0] * sc + 4, py + j.hN[1] * sc - 22];
})();
const drawCh4 = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  const C = camKeys(t, [
    [T4 - 0.8, { x: 800, y: 470, z: 1.0 }],
    [29.0, { x: 760, y: 500, z: 1.15 }],
    [30.4, { x: SHOP_X + 40, y: 655, z: 2.1 }],
    [31.6, { x: SHOP_X + 50, y: 640, z: 2.0 }],
    [32.4, { x: 800, y: 560, z: 1.45 }],
    [33.6, { x: GLASS_W[0] + 30, y: GLASS_W[1] + 20, z: 2.6 }],
    [T5, { x: GLASS_W[0], y: GLASS_W[1], z: 9 }],
  ]);
  screen(r);
  // outside the window: bright, behind the plate
  applyCam(r, C);
  drawPlate(c, s.street);
  drawPlate(c, s.shop);
  // a beam of sun from the window across the floor
  const beamK = 0.35 + 0.15 * Math.sin(t * 0.5);
  const beam = new Path2D();
  beam.moveTo(WIN4.x, WIN4.y + 60);
  beam.lineTo(WIN4.x + WIN4.w, WIN4.y + 60);
  beam.lineTo(620, FLOOR4 + 90);
  beam.lineTo(180, FLOOR4 + 90);
  beam.closePath();
  const bg = c.createLinearGradient(WIN4.x, WIN4.y, 400, FLOOR4);
  bg.addColorStop(0, rgba('#fff3d0', 0.45 * beamK));
  bg.addColorStop(1, rgba('#fff3d0', 0));
  fillP(c, beam, bg, 1, 'screen');
  // the hanging lantern, swinging gently
  {
    const sw = Math.sin(t * 1.2) * 0.06;
    c.save();
    c.translate(800, -40);
    c.rotate(sw);
    const ch = new Path2D();
    ch.moveTo(0, 0);
    ch.lineTo(0, 150);
    strokeP(c, ch, '#6e5a44', 1.4, 0.8);
    const lan = smoothPath([[0, 150], [16, 166], [20, 196], [12, 214], [-12, 214], [-20, 196], [-16, 166]], true, 0.4);
    c.save();
    c.globalCompositeOperation = 'screen';
    glowAt(c, s.st, 0, 192, 120, 0.6);
    c.restore();
    wash(c, s.st, lan, '#c9973f', { reserve: 1, a: 0.85, gran: 0.4, rim: 1.4 });
    const holes = new Path2D();
    for (let k = 0; k < 9; k++) {
      holes.moveTo(-10 + (k % 3) * 9 + 1.5, 176 + Math.floor(k / 3) * 12);
      holes.arc(-10 + (k % 3) * 9, 176 + Math.floor(k / 3) * 12, 1.5, 0, TAU);
    }
    fillP(c, holes, '#fff1c4', 0.95);
    pencil(c, s.st, lan, 0.4);
    c.restore();
  }
  // glasses on the shelves catch the light in turn
  GLASS_SPOTS.forEach((g, i) => {
    const k = Math.max(0, Math.sin(t * 1.3 - i * 0.7));
    if (k > 0.6) glint(c, s, g.x, g.y, 2 + g.s * 1.5, (k - 0.6) * 2.2, t + i);
  });

  // the shepherd: lifts the crate from the floor, presses it overhead with a grin, sets it on the counter
  const gy = FLOOR4 + 8;
  const sc = 2.05;
  let pose: ManPose = SH_STAND;
  let crate: { x: number; y: number; r: number } | null = null;
  const lift1 = tween(t, 28.6, 29.4);
  const up = tween(t, 29.6, 30.5, ease.inOutCubic);
  const press = tween(t, 30.6, 31.1, ease.outCubic) * (1 - tween(t, 31.6, 32.0));
  const toCounter = tween(t, 32.0, 32.6);
  const glassK = tween(t, 32.8, 33.5);
  if (t < 29.6) pose = mixMan(SH_STAND, SH_SQUAT, lift1);
  else pose = mixMan(SH_SQUAT, SH_HOLD, up);
  if (t > 30.55) pose = mixMan(SH_HOLD, SH_PRESS, press);
  if (t > 32.0) pose = mixMan(SH_HOLD, { ...SH_STAND, aN: [0.4, 1.0, 1.1], smile: 0.8 }, toCounter);
  if (t > 32.6) pose = mixMan(pose, SH_GLASS, glassK);
  const breathe = Math.sin(t * 2.2) * 0.01;
  pose = { ...pose, spine: pose.spine + breathe };
  const moveX = keys(t, [[31.9, 0], [32.6, 70]], ease.inOutSine);
  const m = shep(c, s, SHOP_X + moveX, gy, sc, 1, pose, {
    t,
    wind: 0.05,
    glow: 0.35,
    held: (j) => {
      // the crate rides in his hands
      if (t < 32.4) {
        const hx = (j.hN[0] + j.hF[0]) / 2;
        const hy = (j.hN[1] + j.hF[1]) / 2;
        const pyR = gy - manLow(pose) * sc;
        const fx = (SHOP_X + 46 - SHOP_X) / sc;
        const fy = (FLOOR4 - 14 - pyR) / sc;
        const k = t < 29.6 ? 0 : clamp(up * 1.6);
        crate = { x: lerp(fx, hx + 6, k), y: lerp(fy, hy + lerp(4, -9, press), k), r: 0 };
        // drawn in rig space: scale back
        c.save();
        c.translate(crate.x, crate.y);
        c.scale(1 / sc, 1 / sc);
        drawCrate(c, s, 0, 0, Math.sin(t * 2) * 0.02 * press, t, press);
        c.restore();
      }
      if (glassK > 0.01) {
        c.save();
        c.translate(j.hN[0] + 2, j.hN[1] - 2);
        c.scale(1 / sc, 1 / sc);
        glassShape(c, s.st, 0, 10, 1.6, 3, '#a8cfd4');
        c.restore();
      }
    },
  });
  void crate;
  if (t >= 32.4) drawCrate(c, s, COUNTER.x + 90, COUNTER.y - 34, 0, t, 0);
  // a sweat drop and a grin at the top of the press
  if (press > 0.6) {
    const hd = figPt(m, [m.j.head[0] - 6, m.j.head[1] - 6]);
    const dp = smoothPath([[hd[0], hd[1] - 6], [hd[0] + 3, hd[1]], [hd[0], hd[1] + 3], [hd[0] - 3, hd[1]]], true, 0.5);
    wash(c, s.st, dp, '#a8cfd4', { reserve: 1, a: 0.8, gran: 0, rim: 1 });
  }
  // the glass he holds up catches the sun: the motif
  if (glassK > 0.3) {
    const gp = figPt(m, [m.j.hN[0] + 2, m.j.hN[1] - 14]);
    glint(c, s, gp[0], gp[1], 4 + tween(t, 33.2, 34.6) * 14, glassK, t);
  }
};

/* ---------- chapter 5: the caravan ---------- */

const riderX = (t: number) => 380 + (t - T5) * 92;
const CAMP: Pt = [800, 735];

const dunesBack = (r: Riso, s: State, C: Cam, t: number, tod: { top: string; mid: string; bot: string; sun?: [number, number] }) => {
  const c = r.layers[0];
  screen(r);
  skyGrad(c, tod.top, tod.mid, tod.bot, 0, 620);
  skyTexture(c, s, 0.8, 0.7);
  if (tod.sun) {
    const v = layerView(C, 0.12);
    const [x, y] = toScreen(v, tod.sun[0], tod.sun[1]);
    sunDisc(c, s, x, y, 46 * Math.sqrt(v.z), 0.75);
  }
  for (const [pl, p] of [[s.dFar, 0.3], [s.dMid, 0.6]] as [Plate, number][]) {
    const v = layerView(C, p);
    applyCam(r, v);
    const xmin = v.x - 800 / v.z;
    const xmax = v.x + 800 / v.z;
    for (let k = Math.floor(xmin / DW); k <= Math.floor(xmax / DW); k++) {
      c.save();
      c.translate(k * DW, 0);
      drawPlate(c, pl);
      c.restore();
    }
    if (p === 0.6 && t < T_NIGHT) {
      // the caravan along the mid ridge, in silhouette against the light
      for (let i = 0; i < 7; i++) {
        const x = 300 + (t - T5) * 48 - i * 120;
        const y = dMidY(x) + 4;
        const ph = (((x / (79 * 0.42)) % 1) + 1) % 1;
        const pl2 = s.caravan[(i % 3 === 1 ? CARAVAN_PH : 0) + (Math.floor(ph * CARAVAN_PH) % CARAVAN_PH)];
        c.save();
        c.translate(x, y);
        c.scale(0.42, 0.42);
        drawPlate(c, pl2);
        c.restore();
      }
    }
  }
  applyCam(r, C);
  const xmin = C.x - 800 / C.z;
  const xmax = C.x + 800 / C.z;
  for (let k = Math.floor(xmin / DW); k <= Math.floor(xmax / DW); k++) {
    c.save();
    c.translate(k * DW, 0);
    drawPlate(c, s.dNear);
    c.restore();
  }
};

const drawCh5 = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  if (t >= T_NIGHT) return drawCamp(r, s, t);
  const rx = riderX(t);
  const gy = dNearY(rx);
  const camSc = 0.82;
  const C = camKeys(t, [
    [T5 - 0.8, { x: rx - 40, y: gy - 170, z: 1.0 }],
    [37.4, { x: riderX(37.4) + 30, y: dNearY(riderX(37.4)) - 160, z: 1.05 }],
    [38.6, { x: riderX(38.6) + 40, y: dNearY(riderX(38.6)) - 175, z: 2.3 }],
    [39.6, { x: riderX(39.6) + 40, y: dNearY(riderX(39.6)) - 170, z: 2.2 }],
    [40.6, { x: riderX(40.6) + 240, y: dNearY(riderX(40.6)) - 230, z: 0.85 }],
    [42.6, { x: riderX(42.6) + 60, y: dNearY(riderX(42.6)) - 150, z: 1.6 }],
    [T_NIGHT, { x: riderX(T_NIGHT) + 40, y: dNearY(riderX(T_NIGHT)) - 160, z: 1.9 }],
  ]);
  const cam = { ...C, x: rx + (C.x - riderX(t) + (t < 37.4 ? 0 : 0)) };
  const golden = 1 - tween(t, T_STORM, 43.0);
  dunesBack(r, s, cam, t, {
    top: mixHex('#a49ac0', '#b38f6a', 1 - golden),
    mid: mixHex('#f0b896', '#d9a46a', 1 - golden),
    bot: mixHex(SB.gold, '#e0b27a', 1 - golden),
    sun: [rx + 520 - (t - T5) * 20, 520],
  });
  applyCam(r, cam);
  // the rider: his camel paces along the near dune
  const ph = rx / (79 * camSc);
  const pose = camelWalk(ph);
  const storm = tween(t, T_STORM, 42.8);
  const cp = { ...pose, neck: pose.neck - storm * 0.25, head: pose.head + storm * 0.2, blink: storm * 0.7 };
  // a second, lead camel ahead on a rope
  const lx = rx + 240;
  camel(c, s, lx, dNearY(lx) + 6, camSc * 0.92, 1, { ...camelWalk(lx / (79 * camSc * 0.92) + 0.3), neck: -storm * 0.25 }, { t, pack: true, glow: 0.45 * golden, dark: 0.2 });
  const cm = camel(c, s, rx, gy + 6, camSc, 1, cp, { t, saddle: true, glow: 0.45 * golden });
  const bob = pose.drop;
  shep(c, s, cm.seat[0], cm.seat[1] + 40, 1.0, 1, { ...SH_RIDE, spine: SH_RIDE.spine + Math.sin(ph * TAU) * 0.04 + storm * 0.18, head: SH_RIDE.head + storm * 0.25, smile: 0.75 - storm * 0.5, blink: storm * 0.6 }, {
    t,
    pelvisY: cm.seat[1] + bob * 0.2 - 2,
    wind: 0.5 + storm * 0.9,
    glow: 0.55 * golden,
    hood: tween(t, 42.0, 42.6),
  });
  // the sandstorm: ribbons of sand streaming across, a haze that swallows the light
  const haze = Math.min(1, tween(t, T_STORM, 43.6) * 0.75 + tween(t, 44.2, T_NIGHT, ease.inSine) * 0.25);
  if (haze > 0.01) {
    screen(r);
    // toward the end the cover takes on exactly the colour the night camp clears from, so the cut under it is seamless
    const k2 = tween(t, 43.8, T_NIGHT, ease.inOutSine);
    c.save();
    c.globalAlpha = haze * lerp(0.9, 1, k2);
    const g = c.createLinearGradient(0, 0, 1600, 900);
    g.addColorStop(0, rgba(mixHex('#d7a46a', '#b98458', k2), lerp(0.9, 1, k2)));
    g.addColorStop(1, rgba(mixHex('#b98458', '#5a4a6a', k2), lerp(0.95, 1, k2)));
    c.fillStyle = g;
    c.fillRect(0, 0, 1600, 900);
    c.restore();
    sandStreams(c, s, t, haze);
  }
};

/** fast ribbons of blown sand and grit, screen space */
const sandStreams = (c: Ctx, s: State, t: number, k: number) => {
  const a = new Path2D();
  const b = new Path2D();
  for (let i = 0; i < 26; i++) {
    const y0 = hash(i * 1.7) * 900;
    const speed = 900 + hash(i * 3.3) * 700;
    const len = 300 + hash(i * 5.1) * 500;
    const x = (((t * speed + hash(i) * 3000) % 2600) + 2600) % 2600 - 600;
    const pts: Pt[] = [];
    for (let q = 0; q <= 8; q++) {
      const xx = x - (q / 8) * len;
      pts.push([xx, y0 + Math.sin(xx * 0.006 + i + t * 2) * 30 + (q / 8) * 20]);
    }
    ribbon(pts, (u) => Math.sin(u * P) * (4 + hash(i * 9.1) * 10) * k, i % 2 ? a : b);
  }
  fillP(c, a, '#f1d9a8', 0.55 * k);
  fillP(c, b, '#9e6c46', 0.35 * k, 'multiply');
  const grit = new Path2D();
  for (let i = 0; i < 160; i++) {
    const x = (((t * (1300 + hash(i) * 600) + hash(i * 2.1) * 2000) % 1800) + 1800) % 1800 - 100;
    const y = hash(i * 4.7) * 900 + Math.sin(t * 3 + i) * 10;
    grit.moveTo(x, y);
    grit.lineTo(x - 10, y + 1);
  }
  strokeP(c, grit, '#7d5537', 1.2, 0.6 * k, 'multiply');
};

const drawCamp = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  const C = camKeys(t, [
    [T_NIGHT, { x: 800, y: 560, z: 1.25 }],
    [46.4, { x: 790, y: 590, z: 1.15 }],
    [47.4, { x: 690, y: 655, z: 2.6 }],
    [48.3, { x: 690, y: 650, z: 2.7 }],
    [T6, { x: 820, y: -260, z: 1.0 }],
  ]);
  screen(r);
  skyGrad(c, SB.nightDeep, SB.night, SB.dusk, 0, 700);
  skyTexture(c, s, 0.8, 0.3);
  // the milky way and enormous stars
  {
    const v = layerView(C, 0.3);
    applyCam(r, v);
    drawPlate(c, s.milky);
    screen(r);
    const so = toScreen(v, 0, 0);
    drawStars(c, s, so[0], so[1], 1, t, 1.5);
  }
  // the one star that shines brighter (the motif)
  {
    const v = layerView(C, 0.3);
    const [x, y] = toScreen(v, 1000, -120);
    glint(c, s, x, y, 6 + pulse(t, 48.4, 49.2, 49.6, 50.0) * 10, 0.6 + 0.4 * tween(t, 47.6, 48.6), t);
  }
  // dark dunes
  {
    const v = layerView(C, 0.6);
    applyCam(r, v);
    for (let k = -1; k <= 0; k++) {
      c.save();
      c.translate(k * DW + 600, 0);
      drawPlate(c, s.dMid);
      c.restore();
    }
  }
  applyCam(r, C);
  c.save();
  c.translate(-DW + 1000, 0);
  drawPlate(c, s.dNear);
  c.translate(DW, 0);
  drawPlate(c, s.dNear);
  c.restore();
  nightWash(r, 0.8, SB.dusk);
  applyCam(r, C);
  // the camp: couched camels, the fire, the shepherd looking up
  const fireA = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3);
  c.save();
  c.globalCompositeOperation = 'screen';
  glowAt(c, s.st, CAMP[0], CAMP[1] - 20, 420 * fireA, 0.9);
  glowAt(c, s.st, CAMP[0], CAMP[1] + 10, 220 * fireA, 0.8);
  c.restore();
  {
    const sh = new Path2D();
    sh.ellipse(670, CAMP[1] + 14, 46, 7, 0, 0, TAU);
    sh.ellipse(CAMP[0], CAMP[1] + 10, 40, 6, 0, 0, TAU);
    fillP(c, sh, rgba('#3a2a30', 0.3), 1, 'multiply');
  }
  c.globalAlpha = 1;
  const fireLight: [string, number] = [SB.night, 0.25];
  const cy = dNearY(-DW + 1000 + CAMP[0]);
  void cy;
  const gy = CAMP[1];
  camel(c, s, 1070, gy + 16, 0.9, -1, { ...CAMEL_KUSH, neck: 0.15 + Math.sin(t * 0.6) * 0.03, chew: 1 }, { t, saddle: true, tint: fireLight, glow: 0.6 });
  camel(c, s, 330, gy + 20, 0.85, 1, { ...CAMEL_KUSH, neck: -0.1, head: 0.2, blink: 1 }, { t, pack: true, tint: [SB.night, 0.35], glow: 0.3 });
  const look = tween(t, 46.6, 47.6);
  shep(c, s, 680, gy + 8, 1.1, 1, { ...SH_FIRE, head: lerp(-0.1, -0.5, look), look: -look, smile: 0.8 }, {
    t,
    pelvisY: gy + 4,
    tint: fireLight,
    glow: 0.9,
    glowCol: '#f0a060',
    wind: 0.08,
  });
  // the fire
  const logs = new Path2D();
  logs.moveTo(CAMP[0] - 26, gy + 8);
  logs.lineTo(CAMP[0] + 24, gy - 2);
  logs.moveTo(CAMP[0] - 22, gy - 2);
  logs.lineTo(CAMP[0] + 26, gy + 8);
  strokeP(c, logs, '#4a3328', 6, 0.95);
  for (let i = 0; i < 3; i++) {
    const fl = smoothPath(
      [[CAMP[0] - 16 + i * 8, gy], [CAMP[0] - 10 + i * 6 + Math.sin(t * 8 + i) * 4, gy - 22 - i * 6], [CAMP[0] - 2 + i * 3 + Math.sin(t * 11 + i) * 5, gy - 44 - i * 8 * fireA], [CAMP[0] + 6 + i * 2, gy - 16], [CAMP[0] + 14 - i * 4, gy]],
      true,
      0.45
    );
    wash(c, s.st, fl, i === 0 ? SB.apricotDeep : i === 1 ? SD.amber : SB.gold, { reserve: 0.5, a: 0.85, gran: 0.1, rim: 1, edge: SB.rose });
  }
  // sparks rising
  for (let i = 0; i < 8; i++) {
    const k = ((t * 0.6 + i / 8) % 1 + 1) % 1;
    glint(c, s, CAMP[0] + Math.sin(t * 2 + i * 2) * 14 * k, gy - 40 - k * 160, 1.6, 1 - k, t + i);
  }
  // the storm clears off the camp
  const clear = 1 - tween(t, T_NIGHT, 46.4, ease.outSine);
  if (clear > 0.01) {
    screen(r);
    c.save();
    c.globalAlpha = clear;
    const g = c.createLinearGradient(0, 0, 1600, 900);
    g.addColorStop(0, rgba('#b98458', 1));
    g.addColorStop(1, rgba('#5a4a6a', 1));
    c.fillStyle = g;
    c.fillRect(0, 0, 1600, 900);
    c.restore();
    sandStreams(c, s, t, clear);
  }
};

/* ---------- chapter 6: the oasis ---------- */

const SHEP6_X = 1240;
const drawFronds = (c: Ctx, s: State, t: number, wind: number) => {
  for (const [x, y, h, lean] of PALMS) {
    const tp = palmTop(x, y, h, lean);
    const fr = new Path2D();
    const frD = new Path2D();
    for (let k = 0; k < 9; k++) {
      const base = -P / 2 + (k - 4) * 0.42;
      const sway = Math.sin(t * 1.7 + k + x * 0.01) * 0.08 + wind * 0.25;
      const a = base + sway;
      const len = 70 + (k % 3) * 14 + h * 0.1;
      const pts: Pt[] = [];
      for (let q = 0; q <= 6; q++) {
        const u = q / 6;
        const droop = u * u * 40 * Math.abs(Math.cos(a));
        pts.push([tp[0] + Math.cos(a) * len * u, tp[1] + Math.sin(a) * len * u + droop]);
      }
      ribbon(pts, (u) => Math.sin(Math.min(1, u * 1.2) * P) * 12 + 1, k % 2 ? fr : frD);
    }
    wash(c, s.st, frD, SD.palmDeep, { reserve: 0.8, a: 0.88, gran: 0.4, rim: 1.2 });
    wash(c, s.st, fr, SD.palm, { reserve: 0.8, a: 0.88, gran: 0.4, rim: 1.2 });
    // leaflet cuts
    const cuts = new Path2D();
    for (let k = 0; k < 9; k++) {
      const a = -P / 2 + (k - 4) * 0.42 + Math.sin(t * 1.7 + k + x * 0.01) * 0.08 + wind * 0.25;
      const len = 70 + (k % 3) * 14 + h * 0.1;
      for (let q = 1; q < 6; q++) {
        const u = q / 6;
        const px = tp[0] + Math.cos(a) * len * u;
        const py = tp[1] + Math.sin(a) * len * u + u * u * 40 * Math.abs(Math.cos(a));
        cuts.moveTo(px, py);
        cuts.lineTo(px + Math.cos(a + 1.2) * 8, py + Math.sin(a + 1.2) * 8 + 4);
      }
    }
    strokeP(c, cuts, '#3f5536', 0.9, 0.5, 'multiply');
    // dates
    const dt = new Path2D();
    for (let k = 0; k < 6; k++) {
      dt.moveTo(tp[0] - 6 + k * 2.5 + 2, tp[1] + 8 + (k % 2) * 4);
      dt.arc(tp[0] - 6 + k * 2.5, tp[1] + 8 + (k % 2) * 4, 2, 0, TAU);
    }
    wash(c, s.st, dt, SD.amber, { a: 0.85, gran: 0, rim: 0.5 });
  }
};

const ribbonsOfWind = (c: Ctx, s: State, t: number, k: number, cx: number, cy: number) => {
  // ribbons of sand that lift off the dune and spiral round him
  const a = new Path2D();
  const b = new Path2D();
  for (let i = 0; i < 9; i++) {
    const pts: Pt[] = [];
    const ph = t * 1.4 + i * 0.7;
    const r0 = 60 + i * 22;
    for (let q = 0; q <= 14; q++) {
      const u = q / 14;
      const ang = ph - u * 2.4 + i;
      pts.push([cx + Math.cos(ang) * r0 * (0.6 + u * 0.8) - u * 120 * (i % 2 ? 1 : -1), cy - 30 - u * 140 - Math.sin(ang) * r0 * 0.25 - i * 6]);
    }
    ribbon(pts, (u) => Math.sin(u * P) * (5 + (i % 3) * 3) * k, i % 2 ? a : b);
  }
  fillP(c, a, SD.sandPale, 0.75 * k);
  fillP(c, b, SD.sandDeep, 0.45 * k, 'multiply');
};

const drawCh6 = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  const C = camKeys(t, [
    [T6, { x: 820, y: -260, z: 1.0 }],
    [51.8, { x: 820, y: 470, z: 1.0 }],
    [53.2, { x: 1060, y: 560, z: 1.55 }],
    [54.6, { x: SHEP6_X - 20, y: o6(SHEP6_X) - 70, z: 2.4 }],
    [55.6, { x: SHEP6_X - 60, y: o6(SHEP6_X) - 100, z: 1.9 }],
    [T7, { x: 900, y: 450, z: 1.05 }],
  ]);
  const dawn = tween(t, T6, 52.6, ease.inOutSine);
  screen(r);
  skyGrad(c, mixHex(SB.nightDeep, '#6f7fae', dawn), mixHex(SB.night, '#e7b8b0', dawn), mixHex(SB.dusk, SB.gold, dawn), 0, 900);
  skyTexture(c, s, 0.8, 0.4 + dawn * 0.5);
  // the morning star fading where the brightest night star was
  glint(c, s, 980 + (C.x - 820) * -0.3, 330 - (C.y + 260) * 0.3, 8, 1 - tween(t, 51.4, 52.6), t);
  drawStars(c, s, 0, -(C.y + 260) * 0.3, (1 - dawn) * 0.9, t, 1.5);
  {
    const v = layerView(C, 0.15);
    const [x, y] = toScreen(v, 1400, 470 - dawn * 60);
    if (dawn > 0.3) sunDisc(c, s, x, y, 34 * Math.sqrt(v.z), 0.4, (dawn - 0.3) / 0.7);
  }
  applyCam(r, C);
  drawPlate(c, s.oasis);
  // the pool shimmers
  const sh = new Path2D();
  for (let i = 0; i < 14; i++) {
    const x = POOL[0] - 160 + i * 24 + Math.sin(t * 1.3 + i) * 6;
    const y = POOL[1] - 20 + (i % 4) * 11;
    sh.moveTo(x, y);
    sh.lineTo(x + 12 + Math.sin(t * 2 + i) * 4, y);
  }
  strokeP(c, sh, SD.seaPale, 1.2, 0.8);
  glint(c, s, POOL[0] + 60 + Math.sin(t) * 10, POOL[1] - 8, 3, 0.7 * dawn, t);
  const wind = tween(t, 52.8, 54.0) + tween(t, 55.0, 56.0) * 0.6;
  drawFronds(c, s, t, wind);
  // the shepherd on the dune crest, talking to the wind
  const arms = tween(t, 54.4, 55.2, ease.inOutCubic);
  const gy = o6(SHEP6_X);
  shep(c, s, SHEP6_X, gy + 4, 1.15, -1, mixMan(SH_WIND, SH_ARMS, arms), { t, wind: 0.6 + wind * 0.9, glow: 0.4 * dawn });
  // his crook planted in the sand beside him
  const ck = new Path2D();
  ck.moveTo(SHEP6_X + 40, gy + 6);
  ck.lineTo(SHEP6_X + 36, gy - 112);
  ck.bezierCurveTo(SHEP6_X + 35, gy - 124, SHEP6_X + 22, gy - 124, SHEP6_X + 22, gy - 114);
  strokeP(c, ck, SD.crook, 3, 0.9);
  // spiralling ribbons of sand
  ribbonsOfWind(c, s, t, tween(t, 53.4, 54.6), SHEP6_X, gy);
  nightWash(r, (1 - dawn) * 0.6, SB.night);
};

/** the wind wipe: a front of sand ribbons sweeping left to right; returns the front x (screen) */
const windFront = (t: number) => lerp(-300, 1900, tween(t, 55.7, T7 + 0.6, ease.inOutSine));
const windWipe = (c: Ctx, s: State, t: number) => {
  const fx = windFront(t);
  const a = new Path2D();
  const b = new Path2D();
  for (let i = 0; i < 18; i++) {
    const y0 = -40 + i * 56;
    const pts: Pt[] = [];
    for (let q = 0; q <= 10; q++) {
      const u = q / 10;
      pts.push([fx - 420 * u + Math.sin(i * 1.7 + u * 3 + t * 3) * 40, y0 + Math.sin(u * 5 + i) * 30]);
    }
    ribbon(pts, (u) => Math.sin(Math.min(1, u * 1.1) * P) * (40 + (i % 3) * 16) * (1 - u * 0.5), i % 2 ? a : b);
  }
  wash(c, s.st, b, SD.sandDeep, { reserve: 0.9, a: 0.85, gran: 0.5, rim: 2 });
  wash(c, s.st, a, SD.sandPale, { reserve: 0.9, a: 0.9, gran: 0.4, rim: 2 });
};
const windClip = (t: number) => {
  const fx = windFront(t);
  const p = new Path2D();
  p.moveTo(-10, -10);
  for (let y = -10; y <= 910; y += 30) p.lineTo(fx - 160 + Math.sin(y * 0.02 + t * 3) * 50, y);
  p.lineTo(-10, 910);
  p.closePath();
  return p;
};

/* ---------- chapter 7: the pyramids ---------- */

const shepX7 = (t: number) => keys(t, [[58.4, 330], [60.4, DIG_X - 40]], (k) => k);
const drawCh7 = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  const apex: Pt = [PYRS[2][0], PYRS[2][2]];
  const C = camKeys(t, [
    [T7 - 1, { x: 900, y: 450, z: 1.05 }],
    [57.6, { x: 860, y: 430, z: 1.05 }],
    [58.6, { x: apex[0], y: apex[1] + 40, z: 1.9 }],
    [59.4, { x: 700, y: 520, z: 1.4 }],
    [60.6, { x: DIG_X + 20, y: 560, z: 1.6 }],
    [61.4, { x: DIG_X + 20, y: 610, z: 2.0 }],
    [62.8, { x: DIG_X + 24, y: 615, z: 2.1 }],
    [63.6, { x: DIG_X - 10, y: 640, z: 2.2 }],
    [64.4, { x: DIG_X - 10, y: 630, z: 2.3 }],
    [65.6, { x: apex[0], y: 440, z: 1.2 }],
    [T8, { x: apex[0], y: 430, z: 1.25 }],
  ]);
  const rise = tween(t, T7 - 0.6, 59.0, ease.outSine);
  screen(r);
  skyGrad(c, mixHex('#8a86b8', SB.skyDeep, tween(t, 59, 64)), mixHex('#f0b896', SB.sky, tween(t, 60, 65) * 0.6), SB.gold, 0, 700);
  skyTexture(c, s, 0.8, 0.8);
  // the sun rises exactly behind the apex
  const sunY = lerp(apex[1] + 40, apex[1] - 70, rise) - tween(t, 59, T8) * 60;
  {
    const v = layerView(C, 0.9);
    const [x, y] = toScreen(v, apex[0], sunY);
    sunDisc(c, s, x, y, 40 * v.z, 0.6);
  }
  applyCam(r, C);
  drawPlate(c, s.pyr);
  // the moment: sun on the tip, a burst of light
  const burst = pulse(t, 57.7, 58.3, 59.0, 60.2);
  if (burst > 0.01) {
    c.save();
    c.globalCompositeOperation = 'screen';
    const rays = new Path2D();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + t * 0.05;
      const l = (160 + (i % 2) * 120) * burst;
      rays.moveTo(apex[0], apex[1]);
      rays.lineTo(apex[0] + Math.cos(a - 0.03) * l, apex[1] + Math.sin(a - 0.03) * l);
      rays.lineTo(apex[0] + Math.cos(a + 0.03) * l, apex[1] + Math.sin(a + 0.03) * l);
      rays.closePath();
    }
    c.globalAlpha = 0.35 * burst;
    c.fillStyle = '#ffe6a8';
    c.fill(rays);
    c.restore();
  }
  glint(c, s, apex[0], apex[1], 6 + burst * 16, 0.5 + 0.5 * Math.max(burst, 1 - tween(t, 60, 61)), t);
  // the shepherd: walks to the dune top, kneels, digs, stops, laughs
  const px = shepX7(t);
  let pose: ManPose = SH_STAND;
  let face = 1;
  const walkK = tween(t, 58.4, 58.7) * (1 - tween(t, 60.2, 60.5));
  if (t < 60.4) pose = mixMan({ ...SH_STAND, head: -0.25, look: -0.8 }, walkPose((px - 330) / 30, 0.85, false), walkK);
  else if (t < 61.0) pose = mixMan(SH_STAND, SH_KNEEL, tween(t, 60.4, 61.0));
  else if (t < 62.9) pose = mixMan(SH_KNEEL, digPose((t - 61) * 1.6), tween(t, 61.0, 61.3));
  else {
    pose = mixMan(digPose((62.9 - 61) * 1.6), { ...SH_KNEEL, spine: 0.1, head: 0.1, smile: 0.7, look: 0.5 }, tween(t, 62.9, 63.3));
    pose = mixMan(pose, SH_HEELS, tween(t, 63.4, 63.9));
    if (t > 64.6) {
      pose = mixMan(pose, { ...SH_HEELS, head: -0.05, smile: 0.9, blink: 0 }, tween(t, 64.6, 65.0));
      face = 1 - 2 * tween(t, 64.7, 64.9);
    }
  }
  const laugh = t > 63.5 && t < 64.6 ? Math.sin(t * 22) * 0.04 : 0;
  pose = { ...pose, spine: pose.spine + laugh, head: pose.head + laugh };
  const gy = g7(px);
  // the hole and the sand flying from it
  const digK = tween(t, 61.0, 62.8);
  if (digK > 0) {
    const hole = new Path2D();
    hole.ellipse(DIG_X + 12, g7(DIG_X + 12) + 6, 10 + digK * 18, 3 + digK * 5, 0, 0, TAU);
    wash(c, s.st, hole, mixHex(SD.sandDeep, SD.duneShade, 0.4), { reserve: 0, a: 0.6, gran: 0.5, rim: 1.4 });
    const heap = blob(DIG_X - 22, g7(DIG_X - 22) + 4, 10 + digK * 14, 4 + digK * 6, 7, 0.2);
    wash(c, s.st, heap, SD.sand, { reserve: 1, a: 0.9, gran: 0.5, rim: 1.2, grad: [DIG_X - 30, g7(DIG_X) - 10, DIG_X - 10, g7(DIG_X) + 8, SD.sandDeep] });
  }
  const fz = Math.abs(face) < 0.2 ? Math.sign(face || 1) * 0.2 : face;
  shep(c, s, px, gy + 6, 1.3, fz, pose, { t, wind: 0.35, glow: 0.45 });
  if (t > 61.1 && t < 62.9) {
    for (let i = 0; i < 10; i++) {
      const k = ((t * 1.6 + i / 10) % 1 + 1) % 1;
      const sx = DIG_X + 10 - k * 50 - (i % 3) * 6;
      const sy = g7(DIG_X) - Math.sin(k * P) * (30 + (i % 4) * 8);
      const d = new Path2D();
      d.arc(sx, sy, 1.4 + (i % 3) * 0.6, 0, TAU);
      fillP(c, d, SD.sandDeep, 0.8 * (1 - k * 0.5));
    }
  }
  // a glint in the sand that is only the sun on a shard (the realisation)
  const shard = pulse(t, 62.2, 62.5, 63.0, 63.5);
  glint(c, s, DIG_X + 14, g7(DIG_X + 14) + 4, 3 + shard * 4, shard, t);
};

/* ---------- 7 -> 8: the pyramid becomes the gable ---------- */

const ch8Cam = (t: number): Cam =>
  camKeys(t, [
    [T7 + 6, { x: 1320, y: 520, z: 1.5 }],
    [T8, { x: 1320, y: 520, z: 1.5 }],
    [68.2, { x: 980, y: 560, z: 1.25 }],
    [69.4, { x: TX + 30, y: 700, z: 2.2 }],
    [71.2, { x: TX + 30, y: 690, z: 2.4 }],
    [73.4, { x: 820, y: 480, z: 1.0 }],
    [DURATION, { x: 810, y: 478, z: 1.0 }],
  ]);

const pyrOutline = (C: Cam): Pt[] => {
  const [cx, hw, py] = PYRS[2];
  return [toScreen(C, cx - hw, H7 + 6), toScreen(C, cx - hw * 0.5, (py + H7) / 2), toScreen(C, cx - hw * 0.15, py + (H7 - py) * 0.15), toScreen(C, cx, py), toScreen(C, cx + hw * 0.5, (py + H7) / 2), toScreen(C, cx + hw, H7 + 6)];
};
const gableOutline = (C: Cam): Pt[] => [toScreen(C, ...GABLE[0]), toScreen(C, ...GABLE[1]), toScreen(C, ...GABLE[2]), toScreen(C, ...GABLE[5]), toScreen(C, ...GABLE[6]), toScreen(C, ...GABLE[7])];

const drawMorph = (r: Riso, s: State, t: number, k: number, C7: Cam) => {
  const c = r.layers[0];
  screen(r);
  const A = pyrOutline(C7);
  const B = gableOutline(ch8Cam(t));
  const pts: Pt[] = A.map((p, i) => [lerp(p[0], B[i][0], k), lerp(p[1], B[i][1], k)]);
  const p = new Path2D();
  p.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) p.lineTo(...pts[i]);
  p.closePath();
  const col = mixHex(SD.pyramid, mixHex(SD.stone, SD.wall, 0.25), k);
  const a = 1 - tween(k, 0.5, 0.95);
  c.save();
  c.globalAlpha = a;
  wash(c, s.st, p, col, { reserve: 1, a: 0.92, gran: 0.6, rim: 2.2, grad: [pts[3][0], pts[3][1], pts[5][0], pts[5][1], mixHex(SD.pyramidShade, SD.stoneDeep, k)] });
  pencil(c, s.st, p, 0.4, 1);
  c.restore();
};

/** organic watercolour blooms growing from the centre: the reveal of home */
const bloomClip = (k: number) => {
  const p = new Path2D();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.3;
    const d = i === 0 ? 0 : 260 + (i % 3) * 120;
    const cx = 800 + Math.cos(a) * d * (i === 0 ? 0 : 1);
    const cy = 420 + Math.sin(a) * d * 0.6;
    const delay = i === 0 ? 0 : 0.15 + (i % 4) * 0.08;
    const rr = clamp((k - delay) / (1 - delay)) * 1100;
    if (rr > 1) blob(cx, cy, rr, rr * 0.85, 30 + i, 0.18, 0, p);
  }
  return p;
};

/* ---------- chapter 8: home ---------- */

const drawCh8 = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  const C = ch8Cam(t);
  screen(r);
  const morning = 1;
  skyGrad(c, SB.skyDeep, mixHex(SB.sky, '#f3d2a8', 0.35), mixHex(SB.skyHi, SB.gold, 0.5));
  skyTexture(c, s, 0.85, 0.9 * morning);
  {
    const v = layerView(C, 0.15);
    const [x, y] = toScreen(v, 1060, 300);
    sunDisc(c, s, x, y, 30 * Math.sqrt(v.z), 0.3);
  }
  applyCam(r, C);
  drawPlate(c, s.chapel);
  // sun beams through the windows
  const beams = new Path2D();
  for (const wx of [300, 900]) {
    beams.moveTo(wx, 480);
    beams.lineTo(wx + 74, 480);
    beams.lineTo(wx + 74 - 120, 800);
    beams.lineTo(wx - 120 - 60, 800);
    beams.closePath();
  }
  fillP(c, beams, rgba('#fff2c8', 0.22), 1, 'screen');
  // sheep grazing in the ruin again
  for (const [x, f, seed] of [[1010, 1, 2], [1150, -1, 4], [420, 1, 1], [1360, -1, 5]] as [number, number, number][]) {
    const look = tween(t, 70.6 + seed * 0.1, 71.2 + seed * 0.1);
    const graze = 0.6 + 0.4 * Math.sin(t * 1.1 + seed);
    sheep(c, s, x, g1(x) + 10, 1.05, f, mixSheep({ ...SHEEP_GRAZE, graze }, { ...SHEEP_STAND, graze: 0.1 }, look * (seed % 2 ? 1 : 0.6)), { t, seed, dark: seed === 4 ? 0.35 : 0 });
  }
  // the treasure under the roots: dug, uncovered, opened; light pours out
  const dig = tween(t, 68.4, 70.2);
  const open = tween(t, 70.3, 71.0, ease.outBack);
  const light = tween(t, 70.4, 71.6);
  const CH: Pt = [TX + 110, g1(TX + 110) + 14];
  if (dig > 0) {
    const hole = new Path2D();
    hole.ellipse(CH[0], CH[1], 24 + dig * 10, 6 + dig * 4, 0, 0, TAU);
    wash(c, s.st, hole, '#6d5a44', { reserve: 0, a: 0.7, gran: 0.5, rim: 1 });
    // the chest lid, then the chest opening
    c.save();
    c.translate(CH[0], CH[1] + 2);
    const box = new Path2D();
    box.rect(-18, -10 * dig, 36, 12 * dig);
    wash(c, s.st, box, '#7a5238', { reserve: 1, a: 0.92, gran: 0.6, rim: 1.2, grad: [0, -10, 0, 2, '#4f3a2e'] });
    const band = new Path2D();
    band.rect(-18, -10 * dig, 36, 2.5);
    band.rect(-4, -10 * dig, 8, 12 * dig);
    wash(c, s.st, band, SB.gold, { a: 0.85, gran: 0.2, rim: 0.5, edge: SD.goldDeep });
    if (light > 0) {
      c.save();
      c.globalCompositeOperation = 'screen';
      glowAt(c, s.st, 0, -14, 70 + light * 300, light * 0.95);
      glowAt(c, s.st, 0, -14, 40 + light * 120, light);
      const rays = new Path2D();
      for (let i = 0; i < 9; i++) {
        const a = -P / 2 + (i - 4) * 0.2 + Math.sin(t * 0.6 + i) * 0.03;
        const l = (200 + (i % 3) * 90) * light;
        rays.moveTo(0, -10);
        rays.lineTo(Math.cos(a - 0.05) * l, -10 + Math.sin(a - 0.05) * l);
        rays.lineTo(Math.cos(a + 0.05) * l, -10 + Math.sin(a + 0.05) * l);
        rays.closePath();
      }
      c.globalAlpha = 0.3 * light;
      c.fillStyle = '#ffe6a8';
      c.fill(rays);
      c.restore();
      c.globalAlpha = 1;
    }
    c.save();
    c.translate(-18, -10 * dig);
    c.rotate(-open * 1.9);
    const lid = new Path2D();
    lid.moveTo(0, 0);
    lid.lineTo(36, 0);
    lid.quadraticCurveTo(36, -9, 18, -11);
    lid.quadraticCurveTo(0, -9, 0, 0);
    wash(c, s.st, lid, '#8a5e40', { reserve: 1, gran: 0.6, rim: 1.2 });
    c.restore();
    pencil(c, s.st, box, 0.4);
    if (open > 0.2) {
      const gold = new Path2D();
      gold.ellipse(0, -10 * dig - 1, 16, 4 + open * 2, 0, P, 0);
      wash(c, s.st, gold, SB.gold, { reserve: 1, a: 0.95, gran: 0.3, rim: 1, edge: SD.goldDeep });
      for (let k = 0; k < 4; k++) sparkle(c, -10 + k * 7, -10 * dig - 3 - (k % 2) * 2, 3, 0.6, '#fff6dc', 0.9, 0.2);
      c.globalAlpha = 1;
    }
    c.restore();
    if (light > 0) {
      for (let i = 0; i < 9; i++) {
        const k = ((t * 0.5 + i / 9) % 1 + 1) % 1;
        glint(c, s, CH[0] + Math.sin(i * 2.3 + t) * 30 * k, CH[1] - 14 - k * 140, 2 + (i % 3), light * (1 - k), t + i);
      }
      glint(c, s, CH[0], CH[1] - 16, 6 + light * 10, light, t);
    }
  }
  // the shepherd, home: kneels at the roots, digs, sits back in the gold light
  const sx = TX + 60;
  let pose: ManPose = SH_KNEEL;
  if (t < 70.2) pose = mixMan(SH_KNEEL, digPose((t - 68) * 1.4), tween(t, 68.2, 68.6) * (1 - tween(t, 69.9, 70.2)));
  else pose = mixMan(SH_KNEEL, { ...SH_HEELS, blink: 0, smile: 1, head: -0.15, look: 0.5, aN: [0.9, 1.4, 1.5], aF: [0.6, 1.1, 1.2] }, tween(t, 70.4, 71.2));
  shep(c, s, sx, g1(sx) + 8, 1.15, 1, pose, { t, wind: 0.2, glow: 0.4 + light * 0.6, glowCol: SB.gold });
  // the crook leaning on the trunk where he left it
  const ck = new Path2D();
  ck.moveTo(TX - 20, g1(TX) + 4);
  ck.lineTo(TX - 6, g1(TX) - 128);
  ck.bezierCurveTo(TX - 4, g1(TX) - 140, TX + 10, g1(TX) - 140, TX + 10, g1(TX) - 128);
  strokeP(c, ck, SD.crook, 3, 0.9);
  // falling leaves
  for (let i = 0; i < 7; i++) {
    const k = ((t * 0.12 + i / 7) % 1 + 1) % 1;
    const lx = TX - 260 + i * 90 + Math.sin(t * 1.3 + i) * 30;
    const ly = 300 + k * 480;
    const lf = blob(lx, ly, 4, 2, i, 0.2, Math.sin(t * 3 + i));
    wash(c, s.st, lf, i % 2 ? SB.leaf : SB.wheat, { a: 0.8 * Math.sin(k * P), gran: 0, rim: 0.6 });
  }
  warmWash(r, 0.3 * light, SB.gold);
  // the title
  screen(r);
  const ta = tween(t, 72.6, 73.8);
  title(c, "The Shepherd's Road", 800, 840, 40, ta * 0.92, '#5a3a34');
};

/** a fresh sheet inside the current clip, so the next scene's glazes sit on paper, not on the last scene */
const paperIn = (r: Riso) => {
  const c = r.layers[0];
  screen(r);
  c.save();
  c.fillStyle = SB.paper;
  c.fillRect(-10, -10, 1620, 920);
  c.restore();
};

/* ---------- the film ---------- */

export const alchemistFilm: RisoFilm<State> = {
  id: 'alchemist',
  title: "The Shepherd's Road",
  caption: 'A storybook in watercolour: a shepherd dreams of treasure at the pyramids, crosses the sea and the desert after a golden glint, and finds it was waiting under the sycamore at home.',
  theme: 'Origins',
  category: 'Origins & travel',
  motif: 'A golden glint: the dream, the stones, the lanterns, the glass, one star, the sun on the apex, and the light under the roots',
  duration: DURATION,
  series: 'Storybook',
  mode: 'direct',
  paper: SB.paper,
  paperTexture: true,
  grain: 0.06,
  inks: [{ color: SD.sand }, { color: SB.gold }, { color: SD.cloak }, { color: SD.sea }, { color: SD.olive }],
  scenes: [
    { at: 0, label: 'A dream under the sycamore' },
    { at: T2, label: "The stranger's stones" },
    { at: T3, label: 'Across the sea' },
    { at: T4, label: 'The glass shop' },
    { at: T5, label: 'The caravan' },
    { at: T6, label: 'The oasis' },
    { at: T7, label: 'The pyramids' },
    { at: T8, label: 'Home' },
  ],
  posterTime: 74.5,

  setup(r) {
    const st = makeStudio(r);
    const rng = mulberry(1988);
    const stars: Star[] = [];
    for (let i = 0; i < 190; i++) {
      const big = rng() < 0.08;
      stars.push({ x: rng() * 1700, y: rng() * 1000, s: big ? 3 + rng() * 2 : 0.8 + rng() * rng() * 2.2, ph: rng() * 3, big });
    }
    GLASS_SPOTS.length = 0;
    const skyTex = bake(r, 0, 0, 1600, 900, 0.5, (g) => {
      mottle(g, -100, -100, 1800, 1100, ['#9f97b0', '#b8a9a8', '#a5b5c9', '#c9b39c'], 46, 31, 0.15, 1.4);
      for (let i = 0; i < 9; i++) {
        const q = mulberry(400 + i);
        bloomAt(g, st, q() * 1600, q() * 900, 60 + q() * 120, '#a69cb4', 50 + i, 0.16);
      }
    });
    const skyLift = bake(r, 0, 0, 1600, 900, 0.5, (g) => lifts(g, -100, -50, 1800, 950, 26, 77, 0.32, 1.5));
    const milky = bake(r, -400, -900, 2400, 1500, 0.5, (g) => {
      const band = ribbon(
        [[-400, 300], [200, -100], [800, -380], [1400, -600], [2000, -800]],
        () => 380
      );
      void band;
      mottle(g, -400, -900, 2400, 1500, ['#c9b9d8', '#e9d6c0', '#b9c6e0'], 60, 9, 0.18, 1.2);
      lifts(g, -400, -900, 2400, 1500, 50, 8, 0.25, 1);
      g.globalCompositeOperation = 'screen';
      const dots = new Path2D();
      const q = mulberry(5);
      for (let i = 0; i < 1600; i++) {
        const u = q();
        const x = lerp(-400, 2000, u) + (q() - 0.5) * 500;
        const y = lerp(300, -800, u) + (q() - 0.5) * 360;
        const rr = 0.5 + q() * q() * 1.6;
        dots.moveTo(x + rr, y);
        dots.arc(x, y, rr, 0, TAU);
      }
      g.fillStyle = 'rgba(255,248,230,0.75)';
      g.fill(dots);
      // keep only a soft diagonal band
      g.globalCompositeOperation = 'destination-in';
      g.filter = `blur(${(90 * 0.5 * r.scale).toFixed(1)}px)`;
      g.strokeStyle = '#000';
      g.lineWidth = 520;
      g.lineCap = 'round';
      const cl = new Path2D();
      cl.moveTo(-400, 300);
      cl.lineTo(200, -100);
      cl.lineTo(800, -380);
      cl.lineTo(1400, -600);
      cl.lineTo(2000, -800);
      g.stroke(cl);
    });
    return {
      st,
      skyTex,
      skyLift,
      chapel: paintChapel(r, st),
      dream: paintDream(r, st),
      far2: paintFar2(r, st),
      mid2: paintMid2(r, st),
      near2: paintNear2(r, st),
      sea: paintSea(r, st),
      city: paintCity(r, st),
      shop: paintShop(r, st),
      street: paintStreet(r, st),
      dFar: duneBand(r, st, dFarY, 400, 500, mixHex(SD.sand, SD.duneRose, 0.45), SD.duneShade, 0.45, 81, 120),
      dMid: duneBand(r, st, dMidY, 470, 430, mixHex(SD.sand, SD.duneRose, 0.15), SD.duneShade, 0.6, 82, 260),
      dNear: duneBand(r, st, dNearY, 640, 300, SD.sand, SD.duneShade, 0.9, 83, 420),
      milky,
      oasis: paintOasis(r, st),
      pyr: paintPyramids(r, st),
      caravan: paintCaravan(r, st),
      stars,
    };
  },

  draw(r, t, s) {
    const c = r.layers[0];
    if (t < T2) drawCh1(r, s, t);
    else if (t < T3 - 0.6) drawCh2(r, s, t);
    else if (t < T4 - 0.8) {
      // the sea of the hills becomes the sea of the crossing
      if (t < T3 + 0.4) {
        drawCh2(r, s, t);
        const k = tween(t, T3 - 0.6, T3 + 0.4, ease.inOutSine);
        if (k > 0) {
          c.save();
          screen(r);
          c.beginPath();
          c.rect(0, 900 * (1 - k) - 10, 1600, 900 * k + 20);
          c.clip();
          paperIn(r);
          drawCh3(r, s, t);
          c.restore();
        }
      } else drawCh3(r, s, t);
    } else if (t < T4) {
      // into the lit doorway: an arch opens onto the shop
      drawCh3(r, s, t);
      const k = tween(t, T4 - 0.8, T4 + 0.6, ease.inCubic);
      const cm = cam3(t);
      const dp = toScreen(cm, CITY_DOOR[0], CITY_DOOR[1] - 22);
      const w = lerp(32 * cm.z, 2800, k);
      const h = w * 1.45;
      const cx = lerp(dp[0], 800, k);
      const cy = lerp(dp[1], 450, k);
      c.save();
      screen(r);
      c.clip(archPath(cx - w / 2, cy - h * 0.5, w, h));
      drawCh4(r, s, t);
      c.restore();
    } else if (t < T4 + 0.6) {
      drawCh4(r, s, t);
    } else if (t < T5 - 1.2) drawCh4(r, s, t);
    else if (t < T5 + 0.4) {
      // through the glass: the bowl of light opens onto the dunes
      drawCh4(r, s, t);
      const k = tween(t, T5 - 1.2, T5 + 0.4, ease.inCubic);
      const rr = lerp(30, 1100, k);
      c.save();
      screen(r);
      const e = new Path2D();
      e.ellipse(800, 450, rr, rr * 0.8, 0, 0, TAU);
      c.clip(e);
      paperIn(r);
      drawCh5(r, s, t);
      c.restore();
      if (k < 0.98) {
        screen(r);
        const e2 = new Path2D();
        e2.ellipse(800, 450, rr, rr * 0.8, 0, 0, TAU);
        strokeP(c, e2, '#fff3d0', 6, 0.6 * (1 - k), 'screen');
        strokeP(c, e2, deepen(SD.glass, 0.4), 2, 0.6 * (1 - k));
      }
    } else if (t < T6) drawCh5(r, s, t);
    else if (t < 55.7) drawCh6(r, s, t);
    else if (t < T7 + 0.6) {
      drawCh6(r, s, t);
      c.save();
      screen(r);
      c.clip(windClip(t));
      paperIn(r);
      drawCh7(r, s, t);
      c.restore();
      screen(r);
      windWipe(c, s, t);
    } else if (t < 65.4) drawCh7(r, s, t);
    else if (t < T8 + 0.5) {
      const k = tween(t, 65.4, T8 + 0.4, ease.inOutSine);
      drawCh7(r, s, t);
      const C7 = camKeys(t, [[65.6, { x: PYRS[2][0], y: 440, z: 1.2 }], [T8, { x: PYRS[2][0], y: 430, z: 1.25 }]]);
      const reveal = tween(t, 65.6, T8 + 0.5, ease.inOutSine);
      if (reveal > 0) {
        c.save();
        screen(r);
        const cl = bloomClip(reveal);
        c.clip(cl);
        paperIn(r);
        drawCh8(r, s, t);
        c.restore();
        screen(r);
        strokeP(c, bloomClip(reveal), deepen(SD.stone, 0.4), 3, 0.35 * (1 - reveal), 'multiply');
      }
      drawMorph(r, s, t, k, C7);
    } else drawCh8(r, s, t);
    finish(r, s.st, 0.4, 1);
  },
};
