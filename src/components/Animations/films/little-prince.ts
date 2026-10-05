import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import { TAU, clamp, ease, hash, lerp, mulberry, seg, smoothPath, tween, type Pt } from '../riso/kit';
import {
  FOX_CROUCH,
  FOX_LIE,
  FOX_SIT,
  FOX_STAND,
  MAN_STAND,
  SB,
  applyCam,
  bake,
  blob,
  blobPts,
  bloomAt,
  deepen,
  drawFox,
  drawMan,
  drawPaperStar,
  drawPlate,
  drawRose,
  finish,
  foxRun,
  foxWalk,
  glowAt,
  keys,
  layerView,
  lift,
  lifts,
  makeStudio,
  manLow,
  mixFox,
  mixHex,
  mixMan,
  mottle,
  pencil,
  ramp,
  ribbon,
  rgba,
  screen,
  sketchLine,
  sparkle,
  starAt,
  title,
  toScreen,
  wash,
  wheat,
  type Cam,
  type FoxPose,
  type ManJoints,
  type ManPose,
  type Plate,
  type Stalk,
  type Studio,
} from '../styles/storybook';

/*
 * The Prince and the Fox: an original storybook homage, in watercolour.
 * A bearded prince keeps a single rose on a planet the size of a house, watches his sunsets,
 * and drifts away on a paper star past other little worlds to a wheat field on Earth. A fawn
 * fox (Luna) watches from the wheat; day by day he sits a little closer until she comes to him.
 * They run, they rest, and the wheat starts to mean her. He goes home; on his planet at night
 * one star is shaped like her, and it shines back.
 * Motif: gold. The paper star's glow, the wheat, her coat, the sunset, and at last a star.
 */

const DURATION = 75;
const T2 = 13.5; // little worlds
const T_SWITCH2 = 14.6;
const T3 = 25.35; // a field of gold (cloud wipe switch)
const T4 = 31.5; // the fox in the wheat
const T5 = 46; // our days
const T_MORPH = 54.4; // fur -> wheat switch
const T6 = 56.5; // going home
const T7 = 64; // stars that laugh

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

/* ---------- poses ---------- */

const manWalk = (p: number, amt = 1): ManPose => {
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
  return { spine: 0.07, head: 0.02, aN: arm(0), aF: arm(P), lN: leg(0), lF: leg(P), smile: 0.7 };
};
const manRun = (p: number): ManPose => {
  const a = p * TAU;
  const leg = (ph: number): [number, number, number] => {
    const th = 0.62 * Math.sin(a + ph) + 0.12;
    const knee = (0.35 + Math.max(0, Math.sin(a + ph + 1.6)) * 1.25) * 1;
    return [th, th - knee, P / 2 - knee * 0.25];
  };
  const arm = (ph: number): [number, number, number] => {
    const u = -0.7 * Math.sin(a + ph);
    return [u, u + 1.45, u + 1.5];
  };
  return { spine: 0.22, head: -0.08, aN: arm(0), aF: arm(P), lN: leg(0), lF: leg(P), smile: 1 };
};
const manSweep = (p: number): ManPose => {
  const w = Math.sin(p * TAU) * 0.22;
  return {
    spine: 0.26, head: 0.28, aN: [0.62 + w, 0.95 + w, 1.0 + w], aF: [0.42 + w, 0.62 + w, 0.7 + w],
    lN: [0.28, 0.08, P / 2], lF: [-0.22, -0.08, P / 2], smile: 0.6, look: 0.6,
  };
};
const MAN_KNEEL: ManPose = { spine: 0.22, head: 0.38, aN: [1.05, 1.4, 1.45], aF: [0.62, 1.1, 1.2], lN: [1.42, 0.06, P / 2], lF: [0.15, -1.5, -1.55], smile: 0.95, look: 0.6 };
const MAN_CHAIR: ManPose = { spine: -0.04, head: -0.06, aN: [0.38, 1.25, 1.3], aF: [0.34, 1.2, 1.25], lN: [1.52, 0.05, P / 2], lF: [1.47, 0.0, P / 2], smile: 0.75 };
const MAN_FLOAT: ManPose = { spine: -0.04, head: -0.18, aN: [2.7, 2.88, 2.95], aF: [0.32, 0.6, 0.6], lN: [0.3, -0.12, 1.15], lF: [0.04, -0.4, 0.95], smile: 0.8, look: -0.6 };
const MAN_SITG: ManPose = { spine: -0.02, head: 0.05, aN: [0.6, 1.75, 1.85], aF: [0.45, 1.6, 1.7], lN: [2.1, 0.42, 1.4], lF: [1.8, 0.2, 1.5], smile: 0.7 };
const MAN_REACH: ManPose = { spine: 0.16, head: 0.12, aN: [1.32, 1.5, 1.62], aF: [0.45, 1.6, 1.7], lN: [2.0, 0.35, 1.4], lF: [1.8, 0.2, 1.5], smile: 0.85, look: 0.4 };
const MAN_REST: ManPose = { spine: -0.22, head: 0.32, aN: [0.95, 1.55, 1.7], aF: [-0.55, -0.35, -0.3], lN: [1.62, 1.48, 2.6], lF: [2.05, 0.5, 1.4], smile: 0.95, look: 0.7 };
const MAN_BOW: ManPose = { spine: 0.5, head: 0.42, aN: [1.0, 1.9, 2.0], aF: [0.8, 1.6, 1.7], lN: [1.42, 0.06, P / 2], lF: [0.15, -1.5, -1.55], smile: 0.9, blink: 1, look: 0.6 };
const MAN_LOOKUP: ManPose = { spine: -0.14, head: -0.42, aN: [0.6, 1.75, 1.85], aF: [-0.5, -0.3, -0.25], lN: [2.1, 0.42, 1.4], lF: [1.8, 0.2, 1.5], smile: 0.7, look: -1 };

/** Luna poses used across the film */
const FOX_PEEK: FoxPose = { ...FOX_CROUCH, y: 36, neck: -0.85, head: 0.0, ears: 0 };
const FOX_WARY: FoxPose = { ...FOX_CROUCH, ears: 0.55, neck: -0.3, head: 0.18, tail: 0.6 };
const FOX_CURIOUS: FoxPose = { ...FOX_SIT, head: -0.12, neck: -0.95, ears: 0.1 };
const FOX_REST: FoxPose = { ...FOX_LIE, neck: -0.18, head: 0.42, ears: 0.55, blink: 0.75 };
const FOX_LOOKUP: FoxPose = { ...FOX_SIT, neck: -1.3, head: -0.35, ears: 0.05 };

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
  planet: Plate;
  worlds: { lamp: Plate; books: Plate; gym: Plate; city: Plate };
  earth: Plate;
  clouds: Plate;
  hills: Plate;
  field: Plate;
  stars: Star[];
  fur: { a: Pt[]; b: Pt[]; w: number; c: number }[];
}

/* ---------- worlds: geometry ---------- */

const C1: Pt = [800, 560];
const R1 = 150;
const onPlanet = (th: number, h = 0): Pt => [C1[0] + Math.sin(th) * (R1 + h), C1[1] - Math.cos(th) * (R1 + h)];
const TH_VOLC = -0.78;
const TH_VOLC2 = -1.25;
const TH_ROSE = 0.34;

// little worlds (chapter 2)
const W_LAMP: Pt = [1000, 520];
const W_BOOKS: Pt = [2150, 540];
const W_GYM: Pt = [3300, 520];
const W_CITY: Pt = [4400, 540];
const EARTH: Pt = [6300, 2050];
const EARTH_R = 1450;

// the field (chapters 3-6)
const FW = 3200;
const HILL_X = 2750;
const gy = (x: number) => 790 - 78 * Math.exp(-(((x - HILL_X) / 520) ** 2)) + 6 * Math.sin(x * 0.004);

/* ---------- setup painting ---------- */

const paintSkyTex = (r: Riso, st: Studio) =>
  bake(r, 0, 0, 1600, 900, 0.5, (g) => {
    mottle(g, -100, -100, 1800, 1100, ['#7f97b8', '#a3a6c4', '#8eb1cc', '#b8a9b8'], 46, 31, 0.16, 1.4);
    for (let i = 0; i < 9; i++) {
      const rng = mulberry(400 + i);
      bloomAt(g, st, rng() * 1600, rng() * 900, 60 + rng() * 120, '#8ea6c4', 50 + i, 0.18);
    }
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.18;
    const p = new Path2D();
    p.rect(0, 0, 1600, 900);
    wash(g, st, p, '#ffffff', { a: 0, gran: 0.28, granColor: '#5e6f8c', rim: 0 });
  });

const paintSkyLift = (r: Riso) =>
  bake(r, 0, 0, 1600, 900, 0.5, (g) => {
    lifts(g, -100, -50, 1800, 950, 26, 77, 0.32, 1.5);
  });

const crater = (g: Ctx, st: Studio, cx: number, cy: number, rr: number, seed: number) => {
  wash(g, st, blob(cx, cy, rr, rr * 0.6, seed, 0.15), SB.planetDeep, { a: 0.4, gran: 0.4, rim: 1.4, soft: true });
  lift(g, blob(cx + rr * 0.25, cy + rr * 0.15, rr * 0.55, rr * 0.3, seed + 1, 0.2), 0.25);
};

const volcanoAt = (g: Ctx, st: Studio, th: number, h: number, w: number, active: boolean) => {
  g.save();
  const [x, y] = onPlanet(th, -6);
  g.translate(x, y);
  g.rotate(th);
  const cone = smoothPath([[-w, 6], [-w * 0.55, -h * 0.6], [-w * 0.3, -h], [w * 0.3, -h], [w * 0.55, -h * 0.6], [w, 6]], true, 0.35);
  wash(g, st, cone, '#a88c7c', { reserve: 1, a: 0.85, gran: 0.6, rim: 2, soft: true, grad: [-w, -h, w, 0, '#80655c'] });
  const mouth = new Path2D();
  mouth.ellipse(0, -h, w * 0.3, 3.2, 0, 0, TAU);
  wash(g, st, mouth, active ? '#7a5048' : '#8a7a72', { a: 0.75, gran: 0.4, rim: 1 });
  if (active) {
    const glow = new Path2D();
    glow.ellipse(0, -h + 0.5, w * 0.2, 1.6, 0, 0, TAU);
    wash(g, st, glow, SB.apricotDeep, { a: 0.8, gran: 0, rim: 0 });
  }
  pencil(g, st, cone, 0.4, 0.8);
  sketchLine(g, st, [[-w * 0.3, -h], [-w * 0.15, -h * 0.4], [-w * 0.05, 4]], 0.18, 2);
  g.restore();
};

const paintPlanet = (r: Riso, st: Studio) =>
  bake(r, C1[0] - R1 - 90, C1[1] - R1 - 90, 2 * R1 + 180, 2 * R1 + 180, 2.2, (g) => {
    const disc = new Path2D();
    disc.arc(C1[0], C1[1], R1, 0, TAU);
    wash(g, st, disc, SB.planet, { reserve: 1, a: 0.9, gran: 0.65, rim: 3, soft: true, grad: [C1[0] - R1 * 0.6, C1[1] - R1 * 0.7, C1[0] + R1 * 0.6, C1[1] + R1, '#8f9a7b'] });
    g.save();
    g.clip(disc);
    mottle(g, C1[0] - R1, C1[1] - R1, R1 * 2, R1 * 2, ['#c7b07a', '#8fa585', '#b49a86'], 14, 12, 0.3, 0.5);
    // the shadowed side, a second glaze
    const shadow = new Path2D();
    shadow.arc(C1[0] + R1 * 0.35, C1[1] + R1 * 0.3, R1 * 1.05, 0, TAU);
    shadow.rect(C1[0] - R1 * 2, C1[1] - R1 * 2, R1 * 4, R1 * 4);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.0;
    g.restore();
    g.save();
    g.clip(disc);
    const sh = new Path2D();
    sh.arc(C1[0], C1[1], R1, 0, TAU);
    const gr = g.createRadialGradient(C1[0] - R1 * 0.35, C1[1] - R1 * 0.4, R1 * 0.2, C1[0], C1[1], R1 * 1.05);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, rgba('#6c7d8f', 0.12));
    gr.addColorStop(1, rgba('#4a5876', 0.4));
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = gr;
    g.fill(sh);
    crater(g, st, C1[0] - 40, C1[1] + 30, 22, 3);
    crater(g, st, C1[0] + 55, C1[1] - 30, 14, 5);
    crater(g, st, C1[0] + 10, C1[1] + 95, 18, 7);
    crater(g, st, C1[0] - 90, C1[1] - 50, 10, 9);
    bloomAt(g, st, C1[0] + 30, C1[1] + 40, 40, SB.planet, 3, 0.25);
    lift(g, blob(C1[0] - 55, C1[1] - 75, 45, 22, 2, 0.2, -0.6), 0.25);
    g.restore();
    // grass tufts around the rim
    const tuft = new Path2D();
    const rng = mulberry(21);
    for (let i = 0; i < 70; i++) {
      const th = rng() * TAU;
      const base = onPlanet(th, -1.5);
      const n = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const a = th + (rng() - 0.5) * 0.9;
        const l = 4 + rng() * 6;
        tuft.moveTo(base[0] + k * 1.2 * Math.cos(th), base[1] + k * 1.2 * Math.sin(th));
        tuft.lineTo(base[0] + Math.sin(a) * l + k * 1.2 * Math.cos(th), base[1] - Math.cos(a) * l + k * 1.2 * Math.sin(th));
      }
    }
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.strokeStyle = SB.leafDeep;
    g.globalAlpha = 0.7;
    g.lineWidth = 1.1;
    g.lineCap = 'round';
    g.stroke(tuft);
    g.restore();
    volcanoAt(g, st, TH_VOLC, 17, 25, true);
    volcanoAt(g, st, TH_VOLC2, 11, 17, false);
    // pebbles
    for (const [th, rr] of [[-0.2, 4], [0.62, 3], [1.6, 5], [2.4, 4], [-2.1, 3.5]] as [number, number][]) {
      const [x, y] = onPlanet(th, 1);
      wash(g, st, blob(x, y, rr * 1.4, rr, Math.floor(th * 10 + 40), 0.15, th), SB.stone, { reserve: 1, gran: 0.4, rim: 1 });
    }
    pencil(g, st, disc, 0.35, 1, 1.2, -0.8);
  });

/** a tiny world: disc + whatever lives on it, baked in its own spot */
const worldDisc = (g: Ctx, st: Studio, c: Pt, rr: number, col: string, seed: number) => {
  const disc = new Path2D();
  disc.arc(c[0], c[1], rr, 0, TAU);
  wash(g, st, disc, col, { reserve: 1, a: 0.88, gran: 0.6, rim: 2.6, soft: true, grad: [c[0] - rr * 0.6, c[1] - rr * 0.7, c[0] + rr * 0.6, c[1] + rr, deepen(col, 0.3)] });
  g.save();
  g.clip(disc);
  mottle(g, c[0] - rr, c[1] - rr, rr * 2, rr * 2, [deepen(col, 0.3), '#b7a2a8', '#9fb2c3'], 9, seed, 0.28, 0.4);
  crater(g, st, c[0] - rr * 0.3, c[1] + rr * 0.25, rr * 0.16, seed + 1);
  crater(g, st, c[0] + rr * 0.4, c[1] + rr * 0.45, rr * 0.11, seed + 2);
  lift(g, blob(c[0] - rr * 0.4, c[1] - rr * 0.5, rr * 0.3, rr * 0.15, seed + 3, 0.2, -0.6), 0.25);
  g.restore();
  pencil(g, st, disc, 0.35, 1, 1, -0.8);
};
const onW = (c: Pt, rr: number, th: number, h = 0): Pt => [c[0] + Math.sin(th) * (rr + h), c[1] - Math.cos(th) * (rr + h)];

const paintLamp = (r: Riso, st: Studio) =>
  bake(r, W_LAMP[0] - 160, W_LAMP[1] - 200, 320, 340, 1.8, (g) => {
    worldDisc(g, st, W_LAMP, 62, '#c3b49b', 61);
    // lamppost
    const [x, y] = onW(W_LAMP, 62, 0.18, -2);
    g.save();
    g.translate(x, y);
    g.rotate(0.18);
    const post = new Path2D();
    post.rect(-1.6, -58, 3.2, 58);
    post.rect(-5, -3, 10, 4);
    wash(g, st, post, '#4f4a55', { reserve: 1, gran: 0.4, rim: 0.8 });
    const arm = new Path2D();
    arm.moveTo(0, -56);
    arm.quadraticCurveTo(6, -62, 10, -56);
    g.strokeStyle = '#4f4a55';
    g.lineWidth = 1.6;
    g.stroke(arm);
    const cage = smoothPath([[5, -56], [15, -56], [13, -44], [7, -44]], true, 0.2);
    wash(g, st, cage, '#6d6570', { reserve: 1, a: 0.6, gran: 0.2, rim: 0.8 });
    pencil(g, st, post, 0.4);
    g.restore();
  });

const book = (g: Ctx, st: Studio, x: number, y: number, w: number, h: number, a: number, col: string) => {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const p = new Path2D();
  p.rect(-w / 2, -h, w, h);
  wash(g, st, p, col, { reserve: 1, gran: 0.4, rim: 1.2 });
  const pages = new Path2D();
  pages.rect(-w / 2 + 1.5, -h + 1.5, 3, h - 3);
  wash(g, st, pages, SB.tunic, { a: 0.8, gran: 0, rim: 0.4 });
  const band = new Path2D();
  band.rect(-w / 2, -h * 0.72, w, 1.6);
  band.rect(-w / 2, -h * 0.3, w, 1.6);
  wash(g, st, band, SB.gold, { a: 0.7, gran: 0, rim: 0 });
  pencil(g, st, p, 0.35, 0.7);
  g.restore();
};

const paintBooks = (r: Riso, st: Studio) =>
  bake(r, W_BOOKS[0] - 190, W_BOOKS[1] - 230, 380, 380, 1.6, (g) => {
    const rr = 88;
    const cols = [SB.rose, SB.coat, SB.wheatDeep, SB.leaf, '#8a6f9e', SB.apricotDeep];
    const rng = mulberry(9);
    for (const [th, n] of [[-0.75, 4], [-0.35, 7], [0.05, 5], [0.42, 8], [0.8, 3]] as [number, number][]) {
      let h = 0;
      const [bx, by] = onW(W_BOOKS, rr, th, -3);
      g.save();
      g.translate(bx, by);
      g.rotate(th);
      for (let i = 0; i < n; i++) {
        const bh = 6 + rng() * 4;
        const bw = 26 + rng() * 10;
        g.save();
        g.translate((rng() - 0.5) * 6, -h);
        g.rotate(P / 2);
        book(g, st, 0, bw / 2, bh, bw, 0, cols[Math.floor(rng() * cols.length)]);
        g.restore();
        h += bh + 0.5;
      }
      g.restore();
    }
    worldDisc(g, st, W_BOOKS, rr, '#b9a99c', 62);
    // a leaning tower of upright books on top
    const [tx, ty] = onW(W_BOOKS, rr, -0.08, -3);
    g.save();
    g.translate(tx, ty);
    g.rotate(-0.08);
    for (let i = 0; i < 6; i++) book(g, st, -14 + i * 6.2, 0, 6, 22 + ((i * 7) % 9), (i - 2.5) * 0.04, cols[(i * 2) % cols.length]);
    g.restore();
  });

const paintGym = (r: Riso, st: Studio) =>
  bake(r, W_GYM[0] - 170, W_GYM[1] - 210, 340, 360, 1.8, (g) => {
    const rr = 74;
    worldDisc(g, st, W_GYM, rr, '#b7b5a6', 63);
    const [x, y] = onW(W_GYM, rr, -0.05, -2);
    g.save();
    g.translate(x, y);
    g.rotate(-0.05);
    // a little squat rack
    const rack = new Path2D();
    rack.rect(-30, -50, 4, 50);
    rack.rect(26, -50, 4, 50);
    rack.rect(-34, -2, 12, 3);
    rack.rect(22, -2, 12, 3);
    rack.rect(-26, -36, 6, 3);
    rack.rect(20, -36, 6, 3);
    wash(g, st, rack, '#5d5a66', { reserve: 1, gran: 0.4, rim: 0.8 });
    pencil(g, st, rack, 0.4);
    // the bar, loaded and bending a little under the plates
    const bar = new Path2D();
    bar.moveTo(-52, -36.5);
    bar.quadraticCurveTo(0, -38.5, 52, -36.5);
    g.save();
    g.strokeStyle = '#6e6b74';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.stroke(bar);
    g.restore();
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const px = side * (36 + i * 4.6);
        const ph = 26 - i * 5;
        const pl = new Path2D();
        pl.roundRect(px - 2, -36.5 - ph / 2, 4, ph, 1.5);
        wash(g, st, pl, i === 0 ? SB.rose : i === 1 ? SB.coat : SB.wheatDeep, { reserve: 1, gran: 0.4, rim: 1 });
        pencil(g, st, pl, 0.35);
      }
    }
    // a dumbbell resting on the ground
    const db = new Path2D();
    db.rect(-12, -4, 14, 2.4);
    db.roundRect(-16, -8, 5, 9, 1.5);
    db.roundRect(1, -8, 5, 9, 1.5);
    g.translate(56, 0);
    g.rotate(0.12);
    wash(g, st, db, '#5d5a66', { reserve: 1, gran: 0.3, rim: 0.8 });
    g.restore();
  });

const paintCity = (r: Riso, st: Studio) =>
  bake(r, W_CITY[0] - 210, W_CITY[1] - 260, 420, 420, 1.6, (g) => {
    const rr = 84;
    // an asteroid: lumpy, not round
    const rock = blob(W_CITY[0], W_CITY[1] + 8, rr * 1.18, rr * 0.92, 44, 0.12, 0.1);
    wash(g, st, rock, '#a49aa0', { reserve: 1, a: 0.9, gran: 0.7, rim: 2.6, soft: true, grad: [W_CITY[0] - rr, W_CITY[1] - rr, W_CITY[0] + rr, W_CITY[1] + rr, '#7a7080'] });
    g.save();
    g.clip(rock);
    crater(g, st, W_CITY[0] - 30, W_CITY[1] + 40, 16, 71);
    crater(g, st, W_CITY[0] + 45, W_CITY[1] + 20, 11, 72);
    g.restore();
    pencil(g, st, rock, 0.35, 1);
    // skyline sitting on the flat top: glass cylinders in a ring, deco towers, a riverside bridge
    const base = W_CITY[1] - rr * 0.78;
    const tower = (x: number, w: number, h: number, col: string, round: boolean, spire = 0) => {
      const p = new Path2D();
      if (round) {
        p.moveTo(x - w / 2, base);
        p.lineTo(x - w / 2, base - h);
        p.ellipse(x, base - h, w / 2, w * 0.18, 0, P, 0);
        p.lineTo(x + w / 2, base);
        p.closePath();
      } else {
        p.moveTo(x - w / 2, base);
        p.lineTo(x - w / 2, base - h);
        p.lineTo(x - w * 0.3, base - h - w * 0.25);
        p.lineTo(x + w * 0.3, base - h - w * 0.25);
        p.lineTo(x + w / 2, base - h);
        p.lineTo(x + w / 2, base);
        p.closePath();
        if (spire) {
          p.moveTo(x - 1, base - h - w * 0.25);
          p.lineTo(x, base - h - w * 0.25 - spire);
          p.lineTo(x + 1, base - h - w * 0.25);
          p.closePath();
        }
      }
      wash(g, st, p, col, { reserve: 1, gran: 0.45, rim: 1.2, grad: [x - w / 2, 0, x + w / 2, 0, deepen(col, 0.35)] });
      // windows: rows of tiny pale lifts
      const win = new Path2D();
      for (let yy = base - h + 6; yy < base - 4; yy += 5.5) for (let xx = x - w / 2 + 2.5; xx < x + w / 2 - 2; xx += 4) win.rect(xx, yy, 1.6, 2.2);
      lift(g, win, 0.45);
      pencil(g, st, p, 0.35, 0.7);
    };
    tower(W_CITY[0] - 72, 16, 40, '#8796ab', false, 0);
    tower(W_CITY[0] - 50, 18, 66, '#7c8aa3', false, 14);
    tower(W_CITY[0] + 52, 16, 52, '#8f8ea6', false, 6);
    tower(W_CITY[0] + 72, 14, 34, '#9aa2b3', false, 0);
    tower(W_CITY[0] - 22, 15, 60, '#93a4bc', true);
    tower(W_CITY[0] + 24, 15, 60, '#93a4bc', true);
    tower(W_CITY[0], 22, 102, '#7f94b3', true);
    tower(W_CITY[0] - 10, 13, 50, '#a3b2c6', true);
    tower(W_CITY[0] + 11, 13, 50, '#a3b2c6', true);
    // the bridge off the edge
    const br = new Path2D();
    const bx0 = W_CITY[0] + 86;
    br.moveTo(bx0, base + 4);
    br.lineTo(bx0 + 70, base + 24);
    br.moveTo(bx0 + 14, base + 8);
    br.lineTo(bx0 + 14, base - 22);
    br.moveTo(bx0 + 54, base + 20);
    br.lineTo(bx0 + 54, base - 8);
    br.moveTo(bx0, base + 2);
    br.quadraticCurveTo(bx0 + 7, base - 2, bx0 + 14, base - 22);
    br.quadraticCurveTo(bx0 + 34, base + 8, bx0 + 54, base - 8);
    br.quadraticCurveTo(bx0 + 62, base + 6, bx0 + 70, base + 22);
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.strokeStyle = '#5c6378';
    g.lineWidth = 1.3;
    g.stroke(br);
    g.restore();
  });

const paintEarth = (r: Riso, st: Studio) =>
  bake(r, EARTH[0] - 1500, EARTH[1] - EARTH_R - 60, 3000, 1100, 0.6, (g) => {
    const disc = new Path2D();
    disc.arc(EARTH[0], EARTH[1], EARTH_R, 0, TAU);
    wash(g, st, disc, '#7fa8c9', { reserve: 1, a: 0.9, gran: 0.5, rim: 4, soft: true, grad: [EARTH[0], EARTH[1] - EARTH_R, EARTH[0], EARTH[1] - EARTH_R + 900, '#5d84ad'] });
    g.save();
    g.clip(disc);
    const rng = mulberry(5);
    for (let i = 0; i < 9; i++) {
      const x = EARTH[0] - 1300 + rng() * 2600;
      const y = EARTH[1] - EARTH_R + 80 + rng() * 800;
      wash(g, st, blob(x, y, 120 + rng() * 220, 60 + rng() * 90, 80 + i, 0.3, rng() - 0.5), rng() < 0.5 ? '#a9b884' : SB.wheat, { a: 0.75, gran: 0.6, rim: 3, soft: true });
    }
    lifts(g, EARTH[0] - 1400, EARTH[1] - EARTH_R, 2800, 900, 30, 9, 0.6, 1.2);
    g.restore();
    // a warm dawn line along the rim
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.strokeStyle = rgba(SB.apricot, 0.6);
    g.lineWidth = 26;
    g.filter = `blur(${(10 * r.scale * 0.6).toFixed(1)}px)`;
    g.stroke(disc);
    g.restore();
    pencil(g, st, disc, 0.35, 1.2);
  });

const paintClouds = (r: Riso, st: Studio) =>
  bake(r, 0, 0, 1600, 3000, 0.45, (g) => {
    const body = new Path2D();
    body.rect(-50, 520, 1700, 1960);
    const rng = mulberry(17);
    const lumps: [number, number, number][] = [];
    for (let i = 0; i < 16; i++) lumps.push([-60 + i * 112 + rng() * 40, 540 - rng() * 120, 110 + rng() * 90]);
    for (let i = 0; i < 16; i++) lumps.push([-60 + i * 112 + rng() * 40, 2460 + rng() * 120, 110 + rng() * 90]);
    for (const [x, y, rr] of lumps) blob(x, y, rr, rr * 0.8, Math.floor(x + y), 0.12, 0, body);
    wash(g, st, body, SB.paper, { reserve: 1, a: 1, gran: 0, rim: 0 });
    // shading inside the cloud bank: blue-grey bellies, apricot underlight
    g.save();
    g.clip(body);
    mottle(g, -100, 400, 1800, 2300, ['#9fb2c9', '#c3c7d8', '#e9c0a6'], 70, 18, 0.3, 1.8);
    for (const [x, y, rr] of lumps) {
      wash(g, st, blob(x + rr * 0.1, y + rr * 0.35, rr * 0.8, rr * 0.4, Math.floor(x * 3 + y), 0.15), '#b9c4d6', { a: 0.18, gran: 0.2, rim: 0 });
    }
    lifts(g, -100, 500, 1800, 2000, 40, 19, 0.7, 2);
    g.restore();
  });

/** tileable far hills */
const paintHills = (r: Riso, st: Studio) =>
  bake(r, 0, 380, FW, 300, 0.6, (g) => {
    const ridge = (base: number, amp: number, k: number, ph: number) => (x: number) =>
      base - amp * (0.5 + 0.5 * Math.sin((TAU * x * k) / FW + ph)) - amp * 0.35 * Math.sin((TAU * x * (k * 2 + 1)) / FW + ph * 2);
    const fillRidge = (f: (x: number) => number, col: string, bottom: number, seed: number) => {
      const p = new Path2D();
      p.moveTo(-40, bottom);
      for (let x = -40; x <= FW + 40; x += 20) p.lineTo(x, f(x));
      p.lineTo(FW + 40, bottom);
      p.closePath();
      wash(g, st, p, col, { reserve: 0.6, a: 0.75, gran: 0.3, rim: 2.4, soft: true, grad: [0, 440, 0, bottom, mixHex(col, SB.paper, 0.3)] });
      bloomAt(g, st, (seed * 523) % FW, 560, 70, col, seed, 0.2);
    };
    fillRidge(ridge(520, 60, 3, 0.4), '#aeb3d2', 680, 3);
    fillRidge(ridge(560, 34, 4, 2.1), '#c3cc9f', 680, 5);
    // small round trees on the nearer ridge
    const rng = mulberry(33);
    const f = ridge(560, 34, 4, 2.1);
    for (let i = 0; i < 14; i++) {
      const x = rng() * FW;
      const y = f(x) + 4;
      const tr = blob(x, y - 9, 9 + rng() * 5, 8, i + 3, 0.15);
      wash(g, st, tr, '#8d9b7e', { a: 0.75, gran: 0.4, rim: 1.4 });
    }
  });

/** tileable mid field band: rows of soft wheat strokes */
const paintField = (r: Riso, st: Studio) =>
  bake(r, 0, 540, FW, 560, 0.7, (g) => {
    const top = (x: number) => 588 - 10 * Math.sin((TAU * x * 5) / FW) - 6 * Math.sin((TAU * x * 11) / FW + 1);
    const p = new Path2D();
    p.moveTo(-40, 1100);
    for (let x = -40; x <= FW + 40; x += 16) p.lineTo(x, top(x));
    p.lineTo(FW + 40, 1100);
    p.closePath();
    wash(g, st, p, SB.wheat, { reserve: 1, a: 0.85, gran: 0.6, rim: 2, soft: true, grad: [0, 590, 0, 860, SB.wheatDeep] });
    g.save();
    g.clip(p);
    mottle(g, 0, 560, FW, 320, [SB.wheatDeep, SB.apricot, '#c9a46a'], 50, 41, 0.22, 0.8);
    const strokes = new Path2D();
    const rng = mulberry(42);
    for (let i = 0; i < 2600; i++) {
      const x = rng() * FW;
      const y = top(x) + 6 + rng() ** 1.6 * 300;
      const l = 4 + (y - 590) * 0.06;
      for (const ox of [0, x < 30 ? FW : x > FW - 30 ? -FW : 0]) {
        if (ox === 0 && x < 0) continue;
        strokes.moveTo(x + ox, y);
        strokes.lineTo(x + ox + l * 0.2, y - l);
      }
    }
    g.globalCompositeOperation = 'multiply';
    g.strokeStyle = rgba(SB.wheatDeep, 0.55);
    g.lineWidth = 1.1;
    g.lineCap = 'round';
    g.stroke(strokes);
    lifts(g, 0, 560, FW, 200, 30, 43, 0.35, 0.9);
    g.restore();
  });

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

const drawStars = (c: Ctx, s: State, ox: number, oy: number, a: number, t: number, laugh = 0) => {
  if (a <= 0.01) return;
  c.save();
  c.globalCompositeOperation = 'screen';
  for (const st of s.stars) {
    const x = ((((st.x + ox) % 1700) + 1700) % 1700) - 50;
    const y = ((((st.y + oy) % 1000) + 1000) % 1000) - 50;
    const tw = 0.65 + 0.35 * Math.sin(t * (1.3 + st.ph) + st.ph * 9);
    const lg = laugh > 0 ? 1 + laugh * 0.9 * Math.max(0, Math.sin(t * 6 - (x + y) * 0.006)) : 1;
    starAt(c, s.st, x, y, st.s * 2.2 * lg, a * tw);
    if (st.big) sparkle(c, x, y, st.s * 3.2 * lg, st.s * 0.4, '#fff4d8', a * tw * 0.8, 0.1);
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

/** prince in rig space at a world spot; ground is world y of the boots (or pelvis when given) */
const man = (c: Ctx, s: State, x: number, groundY: number, sc: number, face: number, p: ManPose, o: Partial<Parameters<typeof drawMan>[3]> & { t: number; pelvisY?: number }) => {
  c.save();
  const py = o.pelvisY ?? groundY - manLow(p) * sc;
  c.translate(x, py);
  c.scale(sc * face, sc);
  const ground = (groundY - py) / sc;
  const j = drawMan(c, s.st, p, { ground, ...o });
  c.restore();
  return { j, px: x, py, sc, face };
};
/** world position of a rig point on a drawn prince */
const manPt = (m: { px: number; py: number; sc: number; face: number }, q: Pt): Pt => [m.px + q[0] * m.sc * m.face, m.py + q[1] * m.sc];

const fox = (c: Ctx, s: State, x: number, groundY: number, sc: number, face: number, p: FoxPose, o: Partial<Parameters<typeof drawFox>[3]> & { t: number }) => {
  c.save();
  c.translate(x, groundY);
  c.scale(sc * face, sc);
  const r = drawFox(c, s.st, p, o);
  c.restore();
  const w = (q: Pt): Pt => [x + q[0] * sc * face, groundY + q[1] * sc];
  return { nose: w(r.nose), eye: w(r.eye), head: w(r.head), rump: w(r.rump), chest: w(r.chest) };
};

/** wind lean for the wheat */
const windAt = (t: number, x: number, y: number, gust = 1) => 0.1 * gust + 0.16 * gust * Math.sin(t * 1.5 - x * 0.006 + y * 0.004) + 0.05 * Math.sin(t * 2.7 + x * 0.03);

const ROWS = [0, 12, 26, 42, 60, 82, 108, 138, 172];

/** near wheat for rows [from, to), batched; push lets something part the stalks */
const wheatRows = (c: Ctx, s: State, v: Cam, t: number, from: number, to: number, o: { gust?: number; push?: (x: number, y: number) => number; clear?: (x: number) => number; scale?: number } = {}) => {
  const stalks: Stalk[] = [];
  const x0 = v.x - 800 / v.z - 80;
  const x1 = v.x + 800 / v.z + 80;
  const y0 = v.y - 450 / v.z - 140;
  const y1 = v.y + 450 / v.z + 40;
  const sc = o.scale ?? 1;
  for (let ri = from; ri < to && ri < ROWS.length; ri++) {
    const depth = ri / (ROWS.length - 1);
    const sp = (6.5 + depth * 8.5) * sc;
    const h = (32 + depth * 30) * sc;
    for (let i = Math.floor(x0 / sp); i <= Math.ceil(x1 / sp); i++) {
      const hx = hash(i * 13.17 + ri * 101.7);
      const x = i * sp + (hx - 0.5) * sp * 0.9;
      const y = gy(x) + ROWS[ri] * sc + (hash(i * 7.3 + ri * 3.1) - 0.3) * (6 + depth * 18);
      if (y < y0 || y - h > y1) continue;
      const cl = o.clear ? o.clear(x) : 1;
      stalks.push({ x, y, h: h * cl * (0.82 + 0.3 * hash(i * 3.1 + ri * 5.7)), s: (0.75 + depth * 0.95) * sc, ph: hx * 6.28, c: (i + ri) % 3 });
    }
  }
  if (!stalks.length) return;
  const gust = o.gust ?? 1;
  wheat(
    c,
    s.st,
    stalks,
    (k) => windAt(t, k.x, k.y, gust) + (o.push ? o.push(k.x, k.y - k.h) : 0),
    [SB.gold, SB.wheat, mixHex(SB.wheat, SB.wheatDeep, 0.45)],
    mixHex(SB.wheatDeep, SB.wheat, 0.2),
    { awns: true, reserve: true, a: 0.8 }
  );
};

/** the field: sky, far hills, mid field, ground band (everything behind the near wheat) */
const fieldBack = (r: Riso, s: State, C: Cam, t: number, sky: { top: string; mid: string; bot: string; sun?: [number, number, number]; stars?: number }, rise = 0) => {
  const c = r.layers[0];
  screen(r);
  skyGrad(c, sky.top, sky.mid, sky.bot, 0, 700);
  skyTexture(c, s, 0.9, 0.8 * (1 - (sky.stars ?? 0) * 0.6));
  if (sky.sun) {
    const v = layerView(C, 0.12);
    const [sx, sy] = toScreen(v, sky.sun[0], sky.sun[1]);
    sunDisc(c, s, sx, sy, 34 * Math.sqrt(v.z), sky.sun[2]);
  }
  // far hills (parallax)
  for (const [pl, p] of [[s.hills, 0.35], [s.field, 0.7]] as [Plate, number][]) {
    const v = layerView(C, p);
    // a tilt up into the sky carries the whole land down, with only a touch of parallax
    v.y -= (1 - p) * 0.9 * rise;
    applyCam(r, v);
    const xmin = v.x - 800 / v.z;
    const xmax = v.x + 800 / v.z;
    for (let k = Math.floor(xmin / FW); k <= Math.floor(xmax / FW); k++) {
      c.save();
      c.translate(k * FW, 0);
      drawPlate(c, pl, 1);
      c.restore();
    }
    // wind waves running over the mid field
    if (p === 0.7) {
      c.save();
      for (let i = 0; i < 6; i++) {
        const wx = ((t * 160 + i * 620) % 3600) + Math.floor(xmin / 3600) * 3600 - 300;
        for (const ox of [0, 3600]) {
          const e = new Path2D();
          e.ellipse(wx + ox, 640 + (i % 3) * 40, 220, 18, -0.04, 0, TAU);
          lift(c, e, 0.12);
        }
      }
      c.restore();
    }
  }
  // the near ground band, following the land
  applyCam(r, C);
  const xmin = C.x - 800 / C.z - 40;
  const xmax = C.x + 800 / C.z + 40;
  const band = new Path2D();
  band.moveTo(xmin, 1400);
  for (let x = xmin; x <= xmax; x += 24) band.lineTo(x, gy(x) - 22);
  band.lineTo(xmax, 1400);
  band.closePath();
  wash(c, s.st, band, mixHex(SB.wheat, SB.wheatDeep, 0.35), { reserve: 0.85, a: 0.85, gran: 0.55, rim: 0, grad: [0, 700, 0, 1100, deepen(SB.wheatDeep, 0.2)] });
};

/** overlay that darkens the land toward night (screen space, from the horizon down) */
const nightLand = (r: Riso, k: number, col = SB.night, y0 = 380) => {
  if (k <= 0.01) return;
  const c = r.layers[0];
  screen(r);
  const g = c.createLinearGradient(0, y0, 0, y0 + 200);
  g.addColorStop(0, rgba(col, 0));
  g.addColorStop(1, rgba(col, k));
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = g;
  c.fillRect(0, y0, 1600, 900 - y0 + 10);
  c.restore();
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

/* ---------- chapter 1: a small planet ---------- */

const chairAt = (c: Ctx, s: State) => {
  const legs = new Path2D();
  legs.rect(-11, -24, 2.6, 24);
  legs.rect(8.5, -24, 2.6, 24);
  legs.rect(-12.5, -52, 2.8, 30);
  legs.rect(-12, -46, 2.4, 2);
  const seat = new Path2D();
  seat.roundRect(-13, -26, 25, 4, 1.4);
  const back = new Path2D();
  back.roundRect(-14.5, -54, 5.6, 22, 2);
  wash(c, s.st, legs, deepen(SB.wood, 0.15), { reserve: 0.95, gran: 0.4, rim: 0.8 });
  wash(c, s.st, back, SB.wood, { reserve: 0.95, gran: 0.4, rim: 1 });
  wash(c, s.st, seat, SB.wood, { reserve: 0.95, gran: 0.4, rim: 1 });
  pencil(c, s.st, seat, 0.35);
  pencil(c, s.st, back, 0.35);
};

const broom = (c: Ctx, s: State, j: ManJoints) => {
  const a = j.wN;
  const b = j.wF;
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const top: Pt = [b[0] - ux * 12, b[1] - uy * 12];
  const end: Pt = [a[0] + ux * 30, a[1] + uy * 30];
  const h = new Path2D();
  h.moveTo(top[0], top[1]);
  h.lineTo(end[0], end[1]);
  c.save();
  c.strokeStyle = SB.wood;
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.stroke(h);
  c.restore();
  const nx = -uy;
  const ny = ux;
  const br = smoothPath(
    [[end[0] + nx * 3, end[1] + ny * 3], [end[0] + ux * 13 + nx * 6, end[1] + uy * 13 + ny * 6], [end[0] + ux * 14 - nx * 6, end[1] + uy * 14 - ny * 6], [end[0] - nx * 3, end[1] - ny * 3]],
    true,
    0.3
  );
  wash(c, s.st, br, SB.wheatDeep, { reserve: 0.95, gran: 0.5, rim: 1 });
  pencil(c, s.st, br, 0.4);
};

const wateringCan = (c: Ctx, s: State, j: ManJoints, tilt: number) => {
  c.save();
  c.translate(j.hN[0], j.hN[1] + 4);
  c.rotate(tilt);
  const body = new Path2D();
  body.roundRect(-6, -2, 13, 10, 2.5);
  const spout = new Path2D();
  spout.moveTo(6, 4);
  spout.lineTo(16, -3);
  spout.lineTo(17, -1.5);
  spout.lineTo(7, 7);
  spout.closePath();
  wash(c, s.st, spout, '#8aa0ad', { reserve: 0.95, gran: 0.3, rim: 0.8 });
  wash(c, s.st, body, '#8aa0ad', { reserve: 0.95, gran: 0.4, rim: 1.2 });
  const handle = new Path2D();
  handle.moveTo(-5, -1);
  handle.quadraticCurveTo(0, -8, 5, -1);
  c.strokeStyle = '#66808f';
  c.lineWidth = 1.3;
  c.stroke(handle);
  pencil(c, s.st, body, 0.4);
  c.restore();
  const m = c.getTransform();
  return m;
};

const drawCh1 = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  // where is the prince, what is he doing
  const thChair = keys(t, [[10.7, 0.74], [11.0, 0.84], [11.35, 0.94], [11.7, 1.04]], ease.outSine);
  const thP = keys(t, [[4.6, -0.42], [5.7, 0.07], [8.25, 0.07], [9.1, 0.66], [9.45, 0.74], [10.7, 0.74], [11.0, 0.84], [11.35, 0.94], [11.7, 1.04]], ease.inOutSine);
  const hop = t > 10.7 && t < 11.7 ? Math.abs(Math.sin(((t - 10.7) / 1 / 3) * TAU * 1.5)) * 7 : 0;
  const lift = t > 13.35 ? ease.inOutSine(seg(t, 13.35, T_SWITCH2)) * 460 : 0;

  // camera
  const camAt = (th: number, h: number, z: number, side = 0): Cam => {
    const p = onPlanet(th, h);
    return { x: p[0] + Math.cos(th) * side, y: p[1] + Math.sin(th) * side, z, rot: -th };
  };
  const followP = camAt(thP, 58, 1.75);
  const C = camKeys(t, [
    [0, { x: 800, y: 545, z: 0.66, rot: 0.06 }],
    [3.6, camAt(-0.55, 50, 1.7)],
    [4.5, camAt(-0.46, 56, 1.75)],
    [5.7, followP],
    [6.5, camAt(0.2, 40, 4.4)],
    [7.7, camAt(0.21, 38, 4.7)],
    [8.5, camAt(0.25, 58, 1.7)],
    [9.5, camAt(0.74, 45, 2.2, 40)],
    [10.7, camAt(0.74, 45, 2.2, 40)],
    [11.7, camAt(1.04, 45, 2.2, 40)],
    [12.6, camAt(1.04, 60, 2.0, 30)],
    [13.35, camAt(1.04, 90, 1.6, 10)],
  ]);
  let cam = C;
  if (t > 4.5 && t < 5.7) cam = mixCam(C, followP, pulse(t, 4.5, 4.8, 5.4, 5.7));
  if (t > 8.25 && t < 9.2) cam = { ...cam, rot: lerp(cam.rot ?? 0, -thP, 0.6) };
  if (t > 13.35) cam = camAt(1.04, 90 + lift * 0.93, 1.6 - 0.18 * seg(t, 13.35, T_SWITCH2), 10);

  // sky (screen space)
  screen(r);
  const sunset = tween(t, 8.6, 10.6, ease.inOutSine) * (1 - tween(t, 11.0, 11.6) * 0.4) + tween(t, 11.8, 13.2) * 0.4;
  const dusk = tween(t, 11.9, 13.5);
  skyGrad(c, mixHex(mixHex(SB.skyDeep, SB.dusk, sunset * 0.7), SB.night, dusk * 0.7), mixHex(SB.sky, '#c79fae', sunset * 0.8), mixHex(SB.skyHi, SB.apricot, sunset));
  skyTexture(c, s, 0.9, 1 - sunset * 0.5);
  drawStars(c, s, 0, lift * 0.25 + t * 4, 0.35 + sunset * 0.3 + dusk * 0.35, t);
  // the sun: setting, popping back up when he scoots the chair, setting again
  const alt = keys(t, [[8.5, 0.55], [10.6, -0.02], [11.0, 0.06], [11.35, 0.13], [11.7, 0.2], [13.4, -0.06]], ease.inOutSine);
  if (t > 8.2) {
    const sx = keys(t, [[8.4, 1240], [9.5, 975]]) - (t - 9.5) * 5;
    const sy = 690 - alt * 600 + lift * 1.3;
    c.save();
    c.globalCompositeOperation = 'multiply';
    const g = c.createRadialGradient(sx, sy, 20, sx, sy, 700);
    g.addColorStop(0, rgba(SB.apricot, 0.75 * sunset));
    g.addColorStop(0.5, rgba(SB.blush, 0.35 * sunset));
    g.addColorStop(1, rgba(SB.blush, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, 1600, 900);
    c.restore();
    sunDisc(c, s, sx, sy, 36, 0.4 + sunset * 0.4, tween(t, 8.2, 8.8));
  }

  applyCam(r, cam);
  drawPlate(c, s.planet);
  // volcano smoke while he sweeps
  const vm = onPlanet(TH_VOLC, 18);
  for (let i = 0; i < 4; i++) {
    const k = ((t * 0.5 + i * 0.25) % 1 + 1) % 1;
    const up = k * 26;
    const px = vm[0] + Math.sin(TH_VOLC) * up + Math.sin(t * 2 + i) * 3;
    const py = vm[1] - Math.cos(TH_VOLC) * up;
    const puff = blob(px, py, 3 + k * 6, 2.5 + k * 5, i + 1, 0.2);
    wash(c, s.st, puff, '#b7aeb6', { a: 0.5 * (1 - k), gran: 0, rim: 0.8, rimA: 0.3 * (1 - k) });
  }
  // dust when sweeping
  if (t < 4.5) {
    const sw = Math.sin(((t * 1.6) % 1) * TAU);
    for (let i = 0; i < 3; i++) {
      const p = onPlanet(TH_VOLC + 0.2 + i * 0.03, 4 + i * 3 + Math.abs(sw) * 4);
      wash(c, s.st, blob(p[0], p[1], 2 + i, 1.6 + i, 7 + i, 0.2), '#c9b9a8', { a: 0.4 * Math.abs(sw), gran: 0, rim: 0 });
    }
  }

  // the rose
  const rp = onPlanet(TH_ROSE, -2);
  c.save();
  c.translate(rp[0], rp[1]);
  c.rotate(TH_ROSE);
  c.scale(1.45, 1.45);
  const watered = tween(t, 6.6, 7.6);
  drawRose(c, s.st, 0.08 * Math.sin(t * 1.4) - watered * 0.05, 0.35 + watered * 0.45, t, 0.25 * watered + sunset * 0.2);
  c.restore();
  // the chair
  const cp = onPlanet(thChair, -1 - hop);
  c.save();
  c.translate(cp[0], cp[1]);
  c.rotate(thChair);
  chairAt(c, s);
  c.restore();

  // the prince
  let pose: ManPose = MAN_STAND;
  let face = 1;
  let seated = 0;
  if (t < 4.5) {
    pose = mixMan(manSweep(t * 1.6), MAN_STAND, tween(t, 4.2, 4.5));
    face = -1;
  } else if (t < 5.75) {
    face = t < 4.62 ? -1 : 1;
    pose = manWalk((thP * R1) / 34, tween(t, 4.6, 4.8) * (1 - tween(t, 5.55, 5.75)));
  } else if (t < 8.25) {
    pose = mixMan(MAN_STAND, MAN_KNEEL, tween(t, 5.75, 6.25) * (1 - tween(t, 7.85, 8.25)));
  } else if (t < 9.15) {
    pose = manWalk((thP * R1) / 34, tween(t, 8.25, 8.4) * (1 - tween(t, 8.95, 9.15)));
  } else {
    seated = tween(t, 9.15, 9.5);
    pose = mixMan(MAN_STAND, MAN_CHAIR, seated);
    if (t > 11.9) {
      // the paper star arrives: he looks up, reaches, takes the string
      const look = tween(t, 11.9, 12.5);
      const reach = tween(t, 12.55, 13.2);
      pose = mixMan(pose, { ...MAN_CHAIR, head: -0.42, look: -1, smile: 0.95 }, look);
      pose = mixMan(pose, { ...MAN_FLOAT, lN: MAN_CHAIR.lN, lF: MAN_CHAIR.lF }, reach);
    }
    if (t > 13.35) pose = mixMan(pose, MAN_FLOAT, tween(t, 13.35, 14.0));
  }
  const pb = onPlanet(thP, -1);
  c.save();
  c.translate(pb[0], pb[1]);
  c.rotate(thP);
  const sc = 1.0;
  let pelvisY = -manLow(pose) * sc;
  if (seated > 0) pelvisY = lerp(pelvisY, -25 - 3 - hop, seated);
  pelvisY -= lift;
  const watering = pulse(t, 6.1, 6.4, 7.6, 7.9);
  const m = man(c, s, seated > 0 ? lerp(0, 1.5, seated) : 0, 0, sc, face, pose, {
    t,
    wind: 0.32 + 0.25 * tween(t, 13.35, 14) + 0.06 * Math.sin(t * 0.7),
    scarfLift: tween(t, 13.35, 14) * -0.4,
    pelvisY,
    ground: 0,
    glow: sunset * 0.5,
    front: (j) => {
      if (t < 4.5) broom(c, s.st ? s : s, j);
      if (watering > 0.01 || (t > 5.9 && t < 8.1)) wateringCan(c, s, j, -0.5 * watering);
    },
  });
  // water drops from the spout to the rose
  if (watering > 0.2) {
    const spout = manPt(m, [m.j.hN[0] + 15, m.j.hN[1] - 2]);
    for (let i = 0; i < 6; i++) {
      const k = ((t * 1.8 + i / 6) % 1 + 1) % 1;
      const x = lerp(spout[0], 40, k);
      const y = spout[1] + k * k * 26 + k * 4;
      const d = new Path2D();
      d.ellipse(x, y, 1.1, 1.6, 0, 0, TAU);
      wash(c, s.st, d, '#8fb3d0', { a: 0.8 * watering, gran: 0, rim: 0.5 });
    }
  }
  // the paper star coming down, and lifting him away
  if (t > 11.6) {
    const hand = manPt(m, m.j.hN);
    const k = tween(t, 11.6, 13.2, ease.outSine);
    const sx = lerp(-260, hand[0] + 6, k) + Math.sin(t * 1.3) * 4;
    const sy = lerp(-420, hand[1] - 70, k) + Math.sin(t * 1.7) * 3;
    if (t > 13.0) {
      const str = new Path2D();
      str.moveTo(hand[0], hand[1]);
      str.quadraticCurveTo((hand[0] + sx) / 2 + 6, (hand[1] + sy) / 2, sx, sy + 12);
      c.save();
      c.globalAlpha = tween(t, 13.0, 13.2);
      c.strokeStyle = rgba(SB.tunic, 0.75);
      c.lineWidth = 0.7;
      c.stroke(str);
      c.restore();
    }
    c.save();
    c.translate(sx, sy);
    drawPaperStar(c, s.st, 15, Math.sin(t * 0.8) * 0.15, 0.8 + dusk * 0.2);
    c.restore();
  }
  c.restore();
};

/* ---------- chapter 2: little worlds ---------- */

const princeX2 = (t: number) => keys(t, [[T_SWITCH2, 0], [16.4, 900], [18.6, 2000], [21.0, 3200], [23.0, 4250], [24.5, 5300], [25.6, 5900]], ease.inOutSine);
const princeY2 = (t: number) => 300 + 34 * Math.sin((t - T_SWITCH2) * 0.9) + keys(t, [[23.6, 0], [25.6, 520]], ease.inSine);

const drawCh2 = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  const px = princeX2(t);
  const py = princeY2(t);
  // matched to the end of chapter 1: same scale, same screen spot
  const z = keys(t, [[T_SWITCH2, 1.42], [15.8, 1.12], [17.2, 1.22], [19.0, 1.05], [20.6, 2.5], [21.6, 2.6], [22.7, 0.85], [23.7, 0.9], [25.4, 2.6]], ease.inOutSine);
  const leadX = keys(t, [[T_SWITCH2, 0], [15.8, 150], [17.4, 120], [19.4, 160], [20.6, -10], [21.6, 0], [22.7, 120], [24.0, 80], [25.4, 0]], ease.inOutSine);
  const leadY = keys(t, [[T_SWITCH2, 0], [15.8, 60], [19.4, 70], [20.6, -40], [21.6, -40], [22.7, 120], [24.0, 140], [25.4, 10]], ease.inOutSine);
  const C: Cam = { x: px + leadX, y: py + 46 + leadY, z };
  screen(r);
  // continuous with the sunset sky chapter 1 ended on, cooling into the night between worlds
  const deep = tween(t, T_SWITCH2, 17, ease.inOutSine);
  skyGrad(
    c,
    mixHex(mixHex(mixHex(SB.skyDeep, SB.dusk, 0.7), SB.night, 0.7), mixHex(SB.dusk, SB.night, 0.55), deep),
    mixHex(mixHex(SB.sky, '#c79fae', 0.8), mixHex(SB.dusk, '#6f7fb0', 0.5), deep),
    mixHex(SB.apricot, '#a9a2c4', deep)
  );
  skyTexture(c, s, 1, 0.5);
  // continuous with chapter 1's starfield offset
  drawStars(c, s, -(C.x - 0) * 0.08, 460 * 0.25 + T_SWITCH2 * 4 + (t - T_SWITCH2) * 4, 0.95, t);
  // distant tiny worlds far behind (parallax)
  const vfar = layerView(C, 0.25);
  applyCam(r, vfar);
  for (let i = 0; i < 8; i++) {
    const x = i * 700 + 200;
    const y = 200 + ((i * 137) % 400);
    const d = new Path2D();
    d.arc(x, y, 10 + (i % 3) * 5, 0, TAU);
    wash(c, s.st, d, i % 2 ? '#b7a7c2' : '#a9bcc9', { reserve: 0.3, a: 0.5, gran: 0.3, rim: 1 });
  }
  applyCam(r, C);
  // the worlds
  drawPlate(c, s.worlds.lamp);
  drawPlate(c, s.worlds.books);
  drawPlate(c, s.worlds.gym);
  drawPlate(c, s.worlds.city);
  // lamplighter: his lamp switches on and off, his little day racing by
  const on = Math.sin(t * 5.2) > 0 ? 1 : 0;
  const lampTip = onW(W_LAMP, 62, 0.18, 46);
  const lampP: Pt = [lampTip[0] + Math.cos(0.18) * 10, lampTip[1] + Math.sin(0.18) * 10];
  if (on) {
    c.save();
    c.globalCompositeOperation = 'screen';
    glowAt(c, s.st, lampP[0], lampP[1], 70, 0.9);
    c.restore();
    sparkle(c, lampP[0], lampP[1], 5, 1.4, '#fff1c4', 0.95);
    c.globalAlpha = 1;
  }
  {
    // the lamplighter, tiny, hat and pole
    const base = onW(W_LAMP, 62, -0.1, -1);
    c.save();
    c.translate(base[0], base[1]);
    c.rotate(-0.1);
    const body = smoothPath([[-4, 0], [-4.5, -12], [-2, -17], [2, -17], [4.5, -12], [4, 0]], true, 0.4);
    wash(c, s.st, body, '#6d7a9c', { reserve: 1, gran: 0.3, rim: 0.8 });
    const hd = new Path2D();
    hd.arc(0, -20.5, 3.6, 0, TAU);
    wash(c, s.st, hd, SB.skin, { reserve: 1, gran: 0, rim: 0.6 });
    const hat = new Path2D();
    hat.rect(-4.5, -24.5, 9, 2);
    hat.rect(-2.8, -29, 5.6, 4.6);
    wash(c, s.st, hat, '#3f4660', { reserve: 1, gran: 0.2, rim: 0.4 });
    const pole = new Path2D();
    const reach = on ? 0.5 : 0.2;
    pole.moveTo(3, -12);
    pole.lineTo(3 + Math.sin(reach) * 30, -12 - Math.cos(reach) * 30);
    c.strokeStyle = SB.wood;
    c.lineWidth = 1.2;
    c.stroke(pole);
    pencil(c, s.st, body, 0.35);
    c.restore();
  }
  // book pages fluttering off like birds
  for (let i = 0; i < 4; i++) {
    const k = ((t * 0.28 + i * 0.25) % 1 + 1) % 1;
    const bx = W_BOOKS[0] - 40 + i * 24 + k * 160;
    const by = W_BOOKS[1] - 120 - k * 120 - Math.sin(k * 6 + i) * 10;
    const flap = Math.sin(t * 9 + i * 2) * 0.8;
    const pg = new Path2D();
    pg.moveTo(bx, by);
    pg.lineTo(bx - 9, by - 5 * flap - 2);
    pg.lineTo(bx - 8, by + 3);
    pg.closePath();
    pg.moveTo(bx, by);
    pg.lineTo(bx + 9, by - 5 * flap - 2);
    pg.lineTo(bx + 8, by + 3);
    pg.closePath();
    wash(c, s.st, pg, SB.tunic, { reserve: 1, a: 0.6 * Math.sin(k * P), gran: 0, rim: 0.6 });
    pencil(c, s.st, pg, 0.4 * Math.sin(k * P));
  }
  // city windows twinkling
  for (let i = 0; i < 14; i++) {
    const wx = W_CITY[0] - 70 + ((i * 53) % 150);
    const wy = W_CITY[1] - 84 * 0.78 - 8 - ((i * 37) % 60);
    const a = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
    c.save();
    c.globalCompositeOperation = 'screen';
    starAt(c, s.st, wx, wy, 4, a * 0.8);
    c.restore();
  }
  c.globalAlpha = 1;
  // Earth rising at the end
  drawPlate(c, s.earth);

  // the prince and his star
  const flex = pulse(t, 20.4, 20.9, 21.7, 22.2);
  const pose0 = mixMan(MAN_FLOAT, { ...MAN_FLOAT, aF: [-1.62, -3.05, -3.1], smile: 1, blink: 1, head: 0.05, look: 0 }, flex);
  const lean = Math.sin(t * 0.9) * 0.05;
  const pose: ManPose = { ...pose0, spine: pose0.spine + lean, lN: [pose0.lN[0] + Math.sin(t * 1.3) * 0.08, pose0.lN[1], pose0.lN[2]], lF: [pose0.lF[0] + Math.sin(t * 1.3 + 1) * 0.08, pose0.lF[1], pose0.lF[2]] };
  const look = keys(t, [[T_SWITCH2, -0.6], [15.4, 0.5], [17, 0.6], [19, 0.3], [23, 0.6]]);
  const descend = tween(t, 23.6, 25.4);
  const m = man(c, s, px, 0, 1.0, 1, { ...pose, head: lerp(pose.head, 0.3, look > 0 ? 0.4 : 0) + descend * 0.2, look }, {
    t,
    pelvisY: py,
    ground: 1e9,
    farFront: flex > 0.3,
    wind: 0.55 - descend * 0.3,
    scarfLift: -0.35 + descend * 0.9,
  });
  const hand = manPt(m, m.j.hN);
  const sx = hand[0] - 6 + Math.sin(t * 1.1) * 4;
  const sy = hand[1] - 72 + Math.sin(t * 1.6) * 3;
  const str = new Path2D();
  str.moveTo(hand[0], hand[1]);
  str.quadraticCurveTo((hand[0] + sx) / 2 - 6, (hand[1] + sy) / 2, sx, sy + 12);
  c.save();
  c.strokeStyle = rgba(SB.tunic, 0.75);
  c.lineWidth = 0.8;
  c.stroke(str);
  c.restore();
  c.save();
  c.translate(sx, sy);
  drawPaperStar(c, s.st, 15, Math.sin(t * 0.8) * 0.15, 1);
  c.restore();

  // cloud wipe into the dawn
  if (t > 24.4) {
    screen(r);
    const Y = keys(t, [[24.4, 900], [T3, -1050], [26.3, -3050]], ease.inOutSine);
    c.save();
    c.translate(0, Y);
    drawPlate(c, s.clouds);
    c.restore();
  }
};

/* ---------- chapters 3-6: the field ---------- */

interface Sky {
  top: string;
  mid: string;
  bot: string;
  sun?: [number, number, number];
  stars?: number;
}

/** sky by time of day: 0 night, 0.15 dawn, 0.5 noon, 0.8 golden, 0.9 dusk, 1 night */
const skyAt = (tod: number, sunX = 900): Sky => {
  const top = ramp([[0, SB.nightDeep], [0.13, '#6f7fae'], [0.25, SB.skyDeep], [0.6, SB.skyDeep], [0.8, '#a49ac0'], [0.9, '#7b6fa2'], [1, SB.nightDeep]], tod);
  const mid = ramp([[0, SB.night], [0.13, '#c8a3b2'], [0.25, SB.sky], [0.6, SB.sky], [0.8, '#f0b896'], [0.9, '#c98a96'], [1, SB.night]], tod);
  const bot = ramp([[0, SB.dusk], [0.13, SB.apricot], [0.25, SB.skyHi], [0.6, SB.skyHi], [0.8, SB.gold], [0.9, SB.apricotDeep], [1, SB.dusk]], tod);
  const k = clamp((tod - 0.1) / 0.8);
  const sun: [number, number, number] | undefined = tod > 0.08 && tod < 0.93 ? [sunX - 700 + k * 1400, 620 - Math.sin(k * P) * 470, 1 - Math.sin(k * P)] : undefined;
  return { top, mid, bot, sun, stars: clamp(1 - Math.min(tod, 1 - tod) * 7) };
};
const nightness = (tod: number) => clamp(1 - Math.min(tod, 1 - tod) * 6.5);

/** starfield offset in the field, shared with chapter 7 so the stars carry across */
const C6_END: Cam = { x: HILL_X - 20, y: gy(HILL_X - 30) + 30 - manLow(MAN_FLOAT) - 900 + 80, z: 1.1 };
const starOff6 = (C: Cam): Pt => [-C.x * 0.05, -C.y * 0.05 + Math.max(0, gy(HILL_X) - 120 - C.y) * 0.4];

const hand3 = (t: number) => {
  // prince x in the field during chapter 3-4
  return keys(t, [[28.6, 700], [31.6, 905]], ease.inOutSine);
};

const drawField = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];

  /* --- who is where --- */
  // prince
  let px = 700;
  let pGround = gy(700) + 30;
  let pose: ManPose = MAN_STAND;
  let pFace = 1;
  let pelvisOverride: number | undefined;
  let star: Pt | null = null;
  let starGlow = 1;
  let reachK = 0;
  // fox
  let fx = 1190;
  let fGround = gy(1190) + 34;
  let fPose: FoxPose = FOX_PEEK;
  let fFace = -1;
  let fOn = t > 30.6;
  let wag = 0;
  let lookUp = 0;
  let tod = 0.2;
  let gust = 1;

  if (t < T4) {
    // landing at dawn, then walking with a hand on the wheat
    tod = keys(t, [[T3, 0.13], [T4, 0.22]], ease.linear);
    const land = tween(t, T3, 27.7, ease.outSine);
    const airY = lerp(-260, pGround - manLow(MAN_FLOAT), land);
    if (t < 27.75) {
      pose = MAN_FLOAT;
      pelvisOverride = airY;
    } else if (t < 28.6) {
      const k = tween(t, 27.75, 28.1);
      pose = mixMan(mixMan(MAN_FLOAT, { ...MAN_STAND, lN: [0.5, -0.3, P / 2], lF: [0.35, -0.4, P / 2], spine: 0.2 }, k), MAN_STAND, tween(t, 28.1, 28.6));
    } else {
      px = hand3(t);
      pGround = gy(px) + 30;
      const w = manWalk((px - 700) / 30, 0.75 * tween(t, 28.6, 28.9) * (1 - tween(t, 31.3, 31.6)));
      const brush = tween(t, 29.0, 29.6);
      pose = { ...w, aN: [lerp(w.aN[0], 0.45, brush), lerp(w.aN[1], 0.95, brush), lerp(w.aN[2], 1.15, brush)], head: lerp(w.head, 0.35, brush), look: brush * 0.8 };
    }
    // the star: carries him down, then rises away to be the morning star
    const rel = tween(t, 27.8, 30.2, ease.inOutSine);
    if (t < 27.8) star = null;
    else star = [lerp(px + 10, 1260, rel), lerp(pGround - 165, 120, rel)];
    starGlow = 1 - rel * 0.6;
    fOn = t > 30.6;
    fPose = { ...FOX_PEEK, y: 36 - 26 * (1 - tween(t, 30.9, 31.9)) };
  } else if (t < T5) {
    // the days: he sits a little closer each day, she softens day by day
    const dayT = [[33.9, 0.16], [36.1, 0.86], [36.8, 1.14], [38.9, 1.86], [39.6, 2.14], [41.8, 2.86], [42.5, 3.15], [46, 3.4]] as [number, number][];
    const dayK = t < 33.9 ? 0.15 + (t - T4) * 0.0 : keys(t, dayT, ease.linear);
    tod = ((dayK % 1) + 1) % 1;
    const day = Math.floor(dayK);
    // positions
    const sitX = keys(t, [[33.2, 905], [33.6, 905], [36.4, 905], [36.9, 990], [39.2, 990], [39.7, 1070], [43.0, 1070]], ease.inOutSine);
    px = sitX;
    pGround = gy(px) + 30;
    const sitting = tween(t, 32.9, 33.7);
    const scoot = (t > 36.3 && t < 37.0) || (t > 39.1 && t < 39.8) ? Math.abs(Math.sin((t - 36.3) * 9)) : 0;
    pose = mixMan(MAN_STAND, MAN_SITG, sitting);
    pelvisOverride = sitting > 0.99 ? pGround - 4 - scoot * 3 : lerp(pGround - manLow(MAN_STAND), pGround - 4, sitting);
    // reaching his hand out on day four
    reachK = tween(t, 43.0, 43.6) * (1 - tween(t, 45.0, 45.5));
    pose = mixMan(pose, MAN_REACH, reachK);
    if (t > 45.0) pose = mixMan(pose, { ...MAN_SITG, aN: [1.05, 1.35, 1.4], smile: 1, head: 0.15, blink: 1 }, tween(t, 45.0, 45.6));
    // the fox
    fx = keys(t, [[42.6, 1240], [44.3, 1150], [45.4, 1150], [45.9, 1135]], ease.inOutSine);
    fGround = gy(fx) + 34;
    const peek = { ...FOX_PEEK, blink: t > 32.2 && t < 32.36 ? 1 : 0 };
    if (t < 33.4) fPose = mixFox(peek, FOX_WARY, tween(t, 32.8, 33.4));
    else if (day < 1) fPose = mixFox(FOX_WARY, { ...FOX_CROUCH, ears: 0.3 }, tween(t, 34, 35.4));
    else if (day < 2) fPose = mixFox({ ...FOX_CROUCH, ears: 0.3 }, { ...FOX_CROUCH, ears: 0.0, neck: -0.65, head: -0.05 }, tween(t, 36.8, 38.0));
    else fPose = mixFox({ ...FOX_CROUCH, ears: 0.0, neck: -0.65, head: -0.05 }, FOX_CURIOUS, tween(t, 39.6, 40.8));
    if (t > 40.8) wag = 0.4 * tween(t, 40.8, 41.5);
    if (t > 42.5) {
      // she stands and walks to him
      const walking = tween(t, 42.5, 42.9) * (1 - tween(t, 44.1, 44.4));
      const stood = mixFox(FOX_CURIOUS, FOX_STAND, tween(t, 42.5, 42.9));
      fPose = walking > 0.01 ? mixFox(stood, foxWalk(((1240 - fx) / 0.5) / 34), walking) : stood;
      if (t > 44.3) {
        // the sniff: nose to his hand, a nudge under it
        const sniff = 0.05 * Math.sin(t * 22) * pulse(t, 44.4, 44.6, 44.9, 45.0);
        fPose = mixFox(FOX_STAND, { ...FOX_STAND, neck: -0.32, head: 0.18 + sniff, ears: 0.15, tail: 0.75 }, tween(t, 44.3, 44.6));
        if (t > 44.95) fPose = mixFox(fPose, { ...FOX_STAND, neck: -0.25, head: 0.42, ears: 0.6, blink: 1, tail: 0.85 }, tween(t, 44.95, 45.3));
        if (t > 45.5) fPose = mixFox(fPose, { ...FOX_SIT, neck: -0.9, head: 0.15, blink: 0.4, ears: 0.3 }, tween(t, 45.5, 46.0));
        wag = 0.9;
      }
    }
  } else if (t < T6) {
    // our days: running, resting, the wheat becoming her colour
    tod = keys(t, [[T5, 0.45], [50, 0.7], [53, 0.8], [T6, 0.84]], ease.linear);
    gust = 1.3;
    const runX = keys(t, [[T5, 1115], [46.3, 1130], [50.2, 2620], [51.0, HILL_X - 20]], (k) => k);
    fx = runX + 40;
    const manRunX = keys(t, [[T5, 1070], [46.5, 1080], [50.3, 2560], [51.0, HILL_X - 70]], (k) => k);
    px = manRunX;
    pGround = gy(px) + 30;
    fGround = gy(fx) + 34;
    // she turns (flip) and bounds off; he gets up and follows
    fFace = t < 46.22 ? -1 : 1;
    const turn = t > 46.0 && t < 46.45 ? Math.cos(((t - 46.0) / 0.45) * P) : null;
    if (turn !== null) fFace = turn < 0 ? Math.max(-1, turn * 1.0) : turn;
    if (Math.abs(fFace) < 0.15) fFace = fFace < 0 ? -0.15 : 0.15;
    const runK = tween(t, 46.2, 46.5) * (1 - tween(t, 50.2, 50.8));
    const rest = tween(t, 50.6, 51.6);
    fPose = mixFox(mixFox(FOX_SIT, foxRun(t * 2.4), runK), FOX_REST, rest);
    if (t > 46.4 && t < 50.4) fGround -= Math.max(0, Math.sin(t * 2.4 * TAU + 0.3)) * 10;
    // fox lands lying beside him, head on his knee
    if (t > 50.5) {
      fx = lerp(fx, HILL_X - 6, tween(t, 50.5, 51.4));
      fGround = gy(fx) + 40;
      fFace = -1;
    }
    const mRunK = tween(t, 46.5, 46.9) * (1 - tween(t, 50.1, 50.6));
    pose = mixMan(MAN_SITG, manRun(t * 1.9), mRunK);
    const sitBack = tween(t, 50.4, 51.2);
    pose = mixMan(pose, MAN_REST, sitBack);
    pelvisOverride = mRunK > 0.5 ? undefined : lerp(pGround - manLow(pose), pGround - 4, Math.max(sitBack, 1 - tween(t, 46.3, 46.7)));
    if (t > 51.2) pelvisOverride = pGround - 4;
    wag = rest * 0.25;
  } else {
    // going home: dusk on the hill, foreheads together, then the star takes him up
    tod = keys(t, [[T6, 0.86], [59, 0.91], [T7, 0.99]], ease.linear);
    fx = HILL_X + 40;
    fGround = gy(fx) + 30;
    fFace = -1;
    px = HILL_X - 30;
    pGround = gy(px) + 30;
    const bow = pulse(t, T6 + 0.2, 57.3, 58.6, 59.2);
    fPose = mixFox({ ...FOX_SIT, neck: -0.8, head: 0.3, blink: 0.9, ears: 0.4 }, FOX_LOOKUP, tween(t, 59.0, 60.0));
    lookUp = -0.2 * tween(t, 60, 62);
    pose = mixMan(MAN_KNEEL, MAN_BOW, bow);
    const rise = tween(t, 59.3, 63.8, ease.inOutSine);
    if (t > 59.0) pose = mixMan(pose, { ...MAN_FLOAT, aF: [2.2 + Math.sin(t * 6) * 0.25, 2.9 + Math.sin(t * 6) * 0.3, 3.0], head: 0.35, look: 0.8, smile: 0.9 }, tween(t, 59.0, 59.6));
    pelvisOverride = pGround - manLow(pose) - rise * 900;
    star = [px + 6, pGround - manLow(pose) - rise * 900 - 112];
    starGlow = tween(t, 57.4, 58.8);
    if (t < 58.8) star = [lerp(px + 260, px + 6, tween(t, 57.4, 58.8, ease.outSine)), lerp(pGround - 420, pGround - 175, tween(t, 57.4, 58.8, ease.outSine))];
    wag = 0.15;
    gust = 1.6;
  }

  /* --- camera --- */
  const sitCam = (t: number) => {
    const mid = (px + fx) / 2;
    return { x: mid, y: gy(mid) - 26, z: keys(t, [[33.6, 2.0], [36.4, 2.15], [39.2, 2.35], [42, 2.6]]) };
  };
  let C: Cam;
  if (t < T4 + 0.05) {
    C = camKeys(t, [
      [T3, { x: 760, y: 170, z: 1.0 }],
      [27.7, { x: 800, y: 470, z: 1.0 }],
      [28.6, { x: 790, y: 560, z: 1.5 }],
      [29.4, { x: hand3(29.4) + 40, y: 650, z: 2.1 }],
      [30.4, { x: hand3(30.4) + 60, y: 690, z: 2.8 }],
      [31.6, { x: 1150, y: 720, z: 3.1 }],
    ]);
  } else if (t < T5) {
    C = camKeys(t, [
      [T4, { x: 1150, y: 720, z: 3.1 }],
      [32.6, { x: 1175, y: 718, z: 3.4 }],
      [33.6, sitCam(33.6)],
      [36.4, sitCam(36.4)],
      [39.2, sitCam(39.2)],
      [42.1, sitCam(42.1)],
      [43.4, { x: 1110, y: gy(1110) - 30, z: 2.6 }],
      [44.2, { x: 1112, y: gy(1110) - 34, z: 5.6 }],
      [45.1, { x: 1112, y: gy(1110) - 36, z: 6.0 }],
      [46.0, { x: 1100, y: gy(1100) - 30, z: 2.4 }],
    ]);
    if (t > 33.6 && t < 42.1) C = { ...sitCam(t), x: C.x + keys(t, [[33.6, -50], [36.1, 40], [36.8, 40], [38.9, -35], [39.6, -35], [42.1, 10]]) };
  } else if (t < T_MORPH) {
    const follow = (px + fx) / 2 + 120;
    C = camKeys(t, [
      [T5, { x: 1100, y: gy(1100) - 30, z: 2.4 }],
      [46.8, { x: follow, y: gy(follow) - 50, z: 2.0 }],
    ]);
    if (t > 46.8 && t < 50.4) C = { x: follow, y: gy(follow) - 50, z: 2.0 };
    if (t >= 50.4) {
      C = camKeys(t, [
        [50.4, { x: (px + fx) / 2 + 120, y: gy((px + fx) / 2 + 120) - 50, z: 2.0 }],
        [51.8, { x: HILL_X - 20, y: gy(HILL_X) - 20, z: 3.4 }],
        [53.0, { x: HILL_X - 14, y: gy(HILL_X) - 16, z: 3.8 }],
        [T_MORPH, { x: HILL_X + 14, y: gy(HILL_X) + 4, z: 10 }],
      ]);
    }
  } else if (t < T6) {
    C = camKeys(t, [
      [T_MORPH, { x: HILL_X, y: 520, z: 1.7 }],
      [T6, { x: HILL_X, y: 560, z: 1.05 }],
    ], ease.outCubic);
  } else {
    C = camKeys(t, [
      [T6, { x: HILL_X, y: 560, z: 1.05 }],
      [57.6, { x: HILL_X + 5, y: gy(HILL_X) - 40, z: 2.8 }],
      [58.6, { x: HILL_X + 5, y: gy(HILL_X) - 44, z: 3.1 }],
      [59.6, { x: HILL_X, y: gy(HILL_X) - 70, z: 1.9 }],
      [62.6, { x: HILL_X - 10, y: gy(HILL_X) - 420, z: 1.3 }],
      [63.99, C6_END],
    ]);
    // keep him in frame as the star carries him up
    if (t > 60.4 && pelvisOverride !== undefined) {
      const follow: Cam = { x: px + 10, y: pelvisOverride + 80, z: C.z };
      C = mixCam(C, follow, tween(t, 60.4, 62.2));
    }
  }

  /* --- paint --- */
  const sky = skyAt(tod, C.x);
  const tilt = t > T6 ? Math.max(0, gy(HILL_X) - 70 - C.y) : 0;
  fieldBack(r, s, C, t, sky, tilt);
  applyCam(r, C);
  const night = nightness(tod) * (t < T5 ? 1 : 0.7);
  const tint: [string, number] = [SB.night, night * 0.55 + (t > T6 ? tween(t, T6, T7) * 0.25 : 0)];
  const glow = t > 50 && t < T6 + 2 ? 0.5 : sky.sun && sky.sun[2] > 0.6 ? 0.35 : 0;
  const pushHand = (x: number, y: number) => {
    if (t < 29 || t > 31.8) return 0;
    const hx = px + 22;
    const hy = pGround - 52;
    const d = Math.hypot(x - hx, (y - hy) * 1.5);
    return d < 26 ? ((x - hx) / 26) * 0.6 * (1 - d / 26) : 0;
  };
  const pushRun = (x: number, y: number) => {
    if (t < 46.3 || t > 50.6) return 0;
    let v = 0;
    for (const cx of [px, fx]) {
      const d = Math.abs(x - cx);
      if (d < 30 && y > pGround - 90) v += 0.5 * (1 - d / 30) * Math.sign(x - cx + 0.01);
    }
    return v;
  };
  const push = (x: number, y: number) => pushHand(x, y) + pushRun(x, y);
  const clear = (x: number) => {
    let f = 1;
    if (t > 30 && t < 33.6) f = 1 + 0.75 * clamp(1 - Math.abs(x - 1190) / 140) * (1 - tween(t, 32.9, 33.6));
    if (t > 32.6 && t < 46.4) f = Math.min(f, 1 - 0.55 * tween(t, 32.8, 33.8) * (1 - tween(t, 46.0, 46.4)) * clamp(1 - Math.abs(x - 1080) / 260) ** 0.5);
    if (t > 50.2) f = Math.min(f, 1 - 0.8 * tween(t, 50.2, 51.4) * clamp(1 - Math.abs(x - HILL_X) / 240) ** 0.4);
    return f;
  };
  const wo = { gust, push, clear };
  const pRow = 3;
  const fRow = 3;
  wheatRows(c, s, C, t, 0, pRow, wo);
  // the paper star (behind him while it descends)
  if (star) {
    c.save();
    c.translate(star[0], star[1]);
    const sc = t < T4 ? 1 - tween(t, 28.4, 30.2) * 0.65 : 1;
    drawPaperStar(c, s.st, 15 * sc, Math.sin(t * 0.8) * 0.15, starGlow);
    c.restore();
  }
  // the fox
  if (fOn) {
    fox(c, s, fx, fGround, 0.5, fFace, fPose, { t, wag, tint, glow, lookUp });
  }
  // the prince
  const m = man(c, s, px, pGround, 1, pFace, pose, {
    t,
    pelvisY: pelvisOverride,
    wind: 0.32 + (t > 46.4 && t < 50.4 ? 0.5 : 0) + (t > T6 ? 0.25 : 0),
    scarfLift: t > 59.3 ? -0.4 : 0,
    tint,
    glow,
  });
  // the string to the star
  if (star && (t < T4 ? t < 27.8 : t > 58.8)) {
    const hand = manPt(m, m.j.hN);
    const str = new Path2D();
    str.moveTo(hand[0], hand[1]);
    str.quadraticCurveTo((hand[0] + star[0]) / 2 - 5, (hand[1] + star[1]) / 2, star[0], star[1] + 12);
    c.save();
    c.strokeStyle = rgba(SB.tunic, 0.75);
    c.lineWidth = 0.8;
    c.stroke(str);
    c.restore();
  }
  if (t < 27.8 && star === null && t > T3) {
    // descending under the star
    const hand = manPt(m, m.j.hN);
    const sx = hand[0] - 6;
    const sy = hand[1] - 72;
    const str = new Path2D();
    str.moveTo(hand[0], hand[1]);
    str.quadraticCurveTo(hand[0] - 8, (hand[1] + sy) / 2, sx, sy + 12);
    c.save();
    c.strokeStyle = rgba(SB.tunic, 0.75);
    c.lineWidth = 0.8;
    c.stroke(str);
    c.restore();
    c.save();
    c.translate(sx, sy);
    drawPaperStar(c, s.st, 15, Math.sin(t * 0.8) * 0.15, 1);
    c.restore();
  }
  // wheat in front of them
  wheatRows(c, s, C, t, Math.max(pRow, fRow), ROWS.length, wo);
  nightLand(r, night * 0.35, SB.night, toScreen(layerView(C, 0.7), 0, 590)[1] - 40);
  if (t > 50) warmWash(r, 0.25 * tween(t, 50, 52.5) * (1 - tween(t, 58, 61.5)));
  if (sky.stars && sky.stars > 0.05) {
    screen(r);
    const so = starOff6(C);
    drawStars(r.layers[0], s, so[0], so[1], sky.stars * (0.6 + 0.4 * tween(t, 61.5, T7)), t);
  }

  // fur -> wheat: brush strokes of her coat become the wheat
  if (t > 53.6 && t < 55.6) {
    screen(r);
    const k = tween(t, T_MORPH - 0.1, 55.4, ease.inOutCubic);
    const cover = tween(t, 53.6, 54.2) * (1 - tween(t, 55.0, 55.6));
    if (cover > 0.01) {
      c.save();
      c.globalAlpha = cover * (1 - k) * 0.9;
      c.fillStyle = mixHex(SB.fox, SB.paper, 0.35);
      c.fillRect(0, 0, 1600, 900);
      c.restore();
      const cols = [SB.fox, SB.foxDeep, SB.foxPale];
      const wcols = [SB.gold, SB.wheat, SB.wheatPale];
      const paths = cols.map(() => new Path2D());
      for (const f of s.fur) {
        const pts: Pt[] = [0, 1, 2, 3].map((i) => [lerp(f.a[i][0], f.b[i][0], k) + Math.sin(t * 2 + f.b[0][0] * 0.01) * 6 * k * (i / 3), lerp(f.a[i][1], f.b[i][1], k)] as Pt);
        ribbon(pts, (q) => Math.sin(Math.min(1, q * 1.1 + 0.05) * P) * lerp(f.w, f.w * 0.22, k) + 1, paths[f.c]);
      }
      paths.forEach((p, i) => {
        c.save();
        c.globalAlpha = cover;
        wash(c, s.st, p, mixHex(cols[i], wcols[i], k), { reserve: 0.9 * (1 - k * 0.3), a: 0.85 * (1 - k * 0.45), gran: 0.4, rim: 2, rimA: 0.5 * (1 - k * 0.5) });
        c.restore();
      });
    }
  }
};

/* ---------- chapter 7: stars that laugh ---------- */

/** Luna's constellation: ear tips, head, chest, paws, haunch, tail (screen space, sitting, facing left) */
const CONST: Pt[] = [
  [905, 150], [897, 196], [840, 226], [872, 243], [878, 300], [878, 420], [965, 420], [1006, 362], [962, 282], [936, 214], [943, 158], [922, 200],
  [1040, 428], [1086, 402], [1094, 360],
];
const CONST_LINES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 0], [6, 12], [12, 13], [13, 14]];
/** her eye: the star that shines back */
const EYE: Pt = [873, 214];

const C7_START: Cam = { x: C1[0] + 310, y: C1[1] + 760 - manLow(MAN_FLOAT) - 10 + 80, z: 1.1, rot: 0 };

const drawCh7 = (r: Riso, s: State, t: number) => {
  const c = r.layers[0];
  // he arrives from below, arcing up over the planet to land beside the rose
  const thLand = 0.08;
  const arrive = tween(t, T7, 66.2, ease.inOutSine);
  const startP: Pt = [C1[0] + 300, C1[1] + 760];
  const endP = onPlanet(thLand, 0);
  const ctrl: Pt = [C1[0] + 360, C1[1] - 260];
  const bz = (k: number): Pt => [
    (1 - k) * (1 - k) * startP[0] + 2 * (1 - k) * k * ctrl[0] + k * k * endP[0],
    (1 - k) * (1 - k) * startP[1] + 2 * (1 - k) * k * ctrl[1] + k * k * endP[1],
  ];
  const pp = bz(arrive);
  const camRot = -thLand * arrive;
  const C = camKeys(t, [
    [T7, C7_START],
    [65.0, { x: C1[0] + 300, y: C1[1] + 300, z: 1.15, rot: 0 }],
    [66.2, { x: endP[0] + 30, y: endP[1] - 60, z: 1.6, rot: camRot }],
    [67.0, { x: endP[0] + 8, y: endP[1] - 82, z: 4.2, rot: -thLand }],
    [68.6, { x: endP[0] + 10, y: endP[1] - 84, z: 4.4, rot: -thLand }],
    [69.4, { x: C1[0] + 20, y: C1[1] - 700, z: 1.0, rot: -thLand * 0.3 }],
    [71.0, { x: C1[0] + 20, y: C1[1] - 720, z: 1.0, rot: -thLand * 0.3 }],
    [72.8, { x: C1[0] + 330, y: C1[1] - 250, z: 1.55, rot: -0.04 }],
  ]);
  screen(r);
  const dawn = tween(t, 71.0, 73.0);
  const sk = skyAt(0.99);
  skyGrad(c, sk.top, mixHex(sk.mid, '#5b5f93', dawn * 0.4), mixHex(sk.bot, '#6f6a9c', dawn * 0.6), 0, 700);
  skyTexture(c, s, 0.9, 0.8 * (1 - (sk.stars ?? 0) * 0.6));
  if (dawn > 0.01) {
    // the gold comes back as light from below the planet's horizon, not mixed into the blue
    const g = c.createLinearGradient(0, 900, 0, 330);
    g.addColorStop(0, rgba(SB.gold, 0.85 * dawn));
    g.addColorStop(0.45, rgba(SB.apricot, 0.4 * dawn));
    g.addColorStop(1, rgba(SB.apricot, 0));
    c.save();
    c.globalCompositeOperation = 'screen';
    c.fillStyle = g;
    c.fillRect(0, 300, 1600, 610);
    c.restore();
  }
  const laugh = tween(t, 70.4, 71.0) * (1 - tween(t, 72.6, 74.2) * 0.5);
  const so = starOff6(C6_END);
  drawStars(c, s, so[0] - (C.x - C7_START.x) * 0.08, so[1] - (C.y - C7_START.y) * 0.2, 1, t, laugh);
  // her constellation, in the sky (screen space, a gentle parallax with the camera's tilt)
  screen(r);
  const cdy = keys(t, [[68.6, -420], [69.5, 0], [71.0, 0], [72.8, -95]], ease.inOutSine);
  const cdx = keys(t, [[71.0, -120], [72.8, 60]], ease.inOutSine);
  const drawK = tween(t, 69.2, 70.6, ease.inOutSine);
  const fillK = tween(t, 70.2, 71.2);
  c.save();
  c.translate(cdx, cdy);
  if (fillK > 0) {
    const body = smoothPath(CONST.slice(0, 12), true, 0.3);
    const tail = ribbon([CONST[6], CONST[12], CONST[13], CONST[14]], (q) => 4 + Math.sin(q * P) * 26);
    c.save();
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = 0.2 * fillK;
    c.fillStyle = SB.apricot;
    c.fill(body);
    c.fill(tail);
    c.restore();
  }
  if (drawK > 0) {
    const lines = new Path2D();
    CONST_LINES.forEach(([a, b], i) => {
      const k = clamp(drawK * CONST_LINES.length - i);
      if (k <= 0) return;
      lines.moveTo(CONST[a][0], CONST[a][1]);
      lines.lineTo(lerp(CONST[a][0], CONST[b][0], k), lerp(CONST[a][1], CONST[b][1], k));
    });
    c.save();
    c.globalCompositeOperation = 'screen';
    c.strokeStyle = rgba(SB.gold, 0.65);
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    c.stroke(lines);
    c.restore();
  }
  c.save();
  c.globalCompositeOperation = 'screen';
  CONST.forEach((p, i) => {
    const on = clamp(drawK * CONST.length * 1.05 - i);
    if (on <= 0) return;
    const tw = 0.75 + 0.25 * Math.sin(t * 3 + i * 1.3) + laugh * 0.5 * Math.max(0, Math.sin(t * 7 - i));
    starAt(c, s.st, p[0], p[1], 5.5 * tw, on);
    if (i === 0 || i === 10 || i === 5 || i === 14) sparkle(c, p[0], p[1], 8 * tw, 1.4, '#ffefc4', on * 0.9, 0.05);
  });
  c.restore();
  c.restore();
  c.globalAlpha = 1;

  // the star that shines back: first seen over his face, then it settles as her eye
  {
    screen(r);
    const k = tween(t, 67.5, 68.1);
    const settle = tween(t, 68.6, 69.6, ease.inOutSine);
    const p: Pt = [lerp(1240, EYE[0] + cdx, settle), lerp(170, EYE[1] + cdy, settle)];
    const tw = 0.75 + 0.25 * Math.sin(t * 5) + laugh * 0.4 * Math.max(0, Math.sin(t * 8));
    c.save();
    c.globalCompositeOperation = 'screen';
    const big = 1 + (1 - settle) * 0.6;
    glowAt(c, s.st, p[0], p[1], 60 * tw * big, k * 0.85);
    starAt(c, s.st, p[0], p[1], 10 * tw * big, k);
    sparkle(c, p[0], p[1], 20 * tw * big, 2.2, '#ffe6a8', k, 0.05 + Math.sin(t * 0.7) * 0.05);
    c.restore();
    c.globalAlpha = 1;
  }

  // the planet, with a gold rim of a new sunrise behind it
  applyCam(r, C);
  if (dawn > 0) {
    c.save();
    c.globalCompositeOperation = 'screen';
    glowAt(c, s.st, C1[0] + 40, C1[1] + 60, R1 * 3.2, dawn * 0.8);
    c.restore();
    c.globalAlpha = 1;
  }
  drawPlate(c, s.planet);
  c.save();
  c.globalCompositeOperation = 'multiply';
  const nd = new Path2D();
  nd.arc(C1[0], C1[1], R1 + 2, 0, TAU);
  c.globalAlpha = 0.4 * (1 - dawn * 0.5);
  c.fillStyle = SB.dusk;
  c.fill(nd);
  c.restore();
  const rp = onPlanet(TH_ROSE, -2);
  c.save();
  c.translate(rp[0], rp[1]);
  c.rotate(TH_ROSE);
  drawRose(c, s.st, 0.08 * Math.sin(t * 1.4), 0.85, t, 0.35);
  c.restore();
  // the chair where it was left
  const cp = onPlanet(1.04, -1);
  c.save();
  c.translate(cp[0], cp[1]);
  c.rotate(1.04);
  chairAt(c, s);
  c.restore();

  // the prince
  const land = tween(t, 65.8, 66.6);
  let pose = mixMan(MAN_FLOAT, MAN_STAND, tween(t, 65.9, 66.4));
  pose = mixMan(pose, MAN_LOOKUP, tween(t, 66.4, 67.0));
  if (t > 68.2) pose = mixMan(pose, { ...MAN_LOOKUP, smile: 1, blink: pulse(t, 70.6, 70.8, 71.4, 71.6) }, tween(t, 68.2, 68.8));
  c.save();
  const ang = lerp(0.35, thLand, land);
  c.translate(t < 66.2 ? pp[0] : endP[0], t < 66.2 ? pp[1] : endP[1]);
  c.rotate(ang);
  const seat = tween(t, 66.4, 67.0);
  const pelvisY = lerp(-manLow(pose), -4, seat);
  const m = man(c, s, 0, 0, 1, 1, pose, { t, pelvisY: t < 66.0 ? pelvisY - (1 - arrive) * 10 : pelvisY, wind: 0.3 + 0.1 * Math.sin(t * 0.8), tint: [SB.night, 0.3 * (1 - dawn)], glow: 0.25 + dawn * 0.4 });
  // the star lets him go and floats up to its place
  const rel = tween(t, 66.1, 68.0);
  const hand = manPt(m, m.j.hN);
  const sx = lerp(hand[0] - 6, 120, rel);
  const sy = lerp(hand[1] - 72, -300, rel);
  if (rel < 0.99) {
    if (rel < 0.05) {
      const str = new Path2D();
      str.moveTo(hand[0], hand[1]);
      str.quadraticCurveTo(hand[0] - 8, (hand[1] + sy) / 2, sx, sy + 12);
      c.strokeStyle = rgba(SB.tunic, 0.75);
      c.lineWidth = 0.8;
      c.stroke(str);
    }
    c.save();
    c.translate(sx, sy);
    drawPaperStar(c, s.st, 15 * (1 - rel * 0.6), Math.sin(t * 0.8) * 0.15, 1 - rel * 0.5);
    c.restore();
  }
  c.restore();
  c.globalAlpha = 1;

  // the title
  screen(r);
  const ta = tween(t, 72.4, 73.6);
  title(c, 'The Prince and the Fox', 1130, 800, 38, ta * 0.9, '#5a3a34');
};

/* ---------- the film ---------- */

export const littlePrinceFilm: RisoFilm<State> = {
  id: 'little-prince',
  title: 'The Prince and the Fox',
  caption: 'A storybook in watercolour: a bearded prince leaves his one rose, finds a fawn fox in a field of wheat, and learns that the wheat, and one star, will always be hers.',
  theme: 'Luna',
  category: 'Luna',
  motif: 'Gold: the paper star, the wheat, her coat, the sunset, and at last a star that shines back',
  duration: DURATION,
  series: 'Storybook',
  mode: 'direct',
  paper: SB.paper,
  paperTexture: true,
  grain: 0.06,
  inks: [{ color: SB.sky }, { color: SB.apricot }, { color: SB.rose }, { color: SB.fox }, { color: SB.coat }],
  scenes: [
    { at: 0, label: 'A small planet' },
    { at: T2, label: 'Little worlds' },
    { at: T3 - 0.3, label: 'A field of gold' },
    { at: T4, label: 'The fox in the wheat' },
    { at: T5, label: 'Our days' },
    { at: T6, label: 'Going home' },
    { at: T7, label: 'Stars that laugh' },
  ],
  posterTime: 73.8,

  setup(r) {
    const st = makeStudio(r);
    const rng = mulberry(2024);
    const stars: Star[] = [];
    for (let i = 0; i < 170; i++) {
      const big = rng() < 0.08;
      stars.push({ x: rng() * 1700, y: rng() * 1000, s: big ? 3 + rng() * 2 : 0.8 + rng() * rng() * 2.2, ph: rng() * 3, big });
    }
    // fur strokes (screen space), each with a matching wheat stalk
    const fur: State['fur'] = [];
    const fr = mulberry(77);
    for (let i = 0; i < 110; i++) {
      const x = -60 + fr() * 1720;
      const y = -60 + fr() * 1020;
      const a = -0.5 + fr() * 0.25 + Math.sin(y * 0.004) * 0.2;
      const l = 120 + fr() * 140;
      const A: Pt[] = [0, 1, 2, 3].map((k) => [x + Math.cos(a) * l * (k / 3) + Math.sin(k) * 12, y + Math.sin(a) * l * (k / 3) + (k === 1 || k === 2 ? 14 : 0)] as Pt);
      const bx = -20 + (i / 110) * 1640 + (fr() - 0.5) * 20;
      const by = 900 + 20;
      const h = 260 + fr() * 300;
      const lean = 0.08 + fr() * 0.08;
      const B: Pt[] = [0, 1, 2, 3].map((k) => [bx + Math.sin(lean) * h * (k / 3) * (k / 3), by - h * (k / 3)] as Pt);
      fur.push({ a: A, b: B, w: 16 + fr() * 14, c: Math.floor(fr() * 3) });
    }
    return {
      st,
      skyTex: paintSkyTex(r, st),
      skyLift: paintSkyLift(r),
      planet: paintPlanet(r, st),
      worlds: { lamp: paintLamp(r, st), books: paintBooks(r, st), gym: paintGym(r, st), city: paintCity(r, st) },
      earth: paintEarth(r, st),
      clouds: paintClouds(r, st),
      hills: paintHills(r, st),
      field: paintField(r, st),
      stars,
      fur,
    };
  },

  draw(r, t, s) {
    if (t < T_SWITCH2) drawCh1(r, s, t);
    else if (t < T3) drawCh2(r, s, t);
    else if (t < T7) drawField(r, s, t);
    else drawCh7(r, s, t);
    // the cloud bank keeps sweeping up over the dawn after the switch
    if (t >= T3 && t < 26.7) {
      screen(r);
      const Y = keys(t, [[24.4, 900], [T3, -1050], [26.3, -3050]], ease.inOutSine);
      const c = r.layers[0];
      c.save();
      c.translate(0, Y);
      drawPlate(c, s.clouds);
      c.restore();
    }
    finish(r, s.st, 0.42, 1);
  },
};
