import type { RisoFilm, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, mulberry, hash } from '../riso/kit';
import {
  LW,
  LH,
  mk,
  mix,
  u32Of,
  cyc,
  makePx,
  begin,
  present,
  dither,
  vGrad,
  glow,
  clearPx,
  disc,
  iris,
  crisp,
  starfield,
  bake,
  spr,
  flipX,
  tint,
  figure,
  lookPal,
  walkPose,
  text,
  windowBox,
  texFrom,
  markCycle,
  mode7,
  project7,
  starPath,
  capsule,
  shade,
  type Px,
  type Look,
  type Pose,
  type Joints,
  type Tex,
  type Cam7,
  type TextStyle,
} from '../styles/pixel16';

/* ---------- palette ---------- */

const OUT = '#120c1c';
const NIGHT = ['#05041a', '#0b0a2e', '#16154a', '#262466', '#3a3478'];
const DAWN = ['#2a2a78', '#5a3c94', '#a24e8e', '#ec7a6e', '#ffb46a', '#ffe8a0'];
const STAR = ['#3a3a8a', '#a0a0e8', '#ffffff'];
const GOLD = ['#fff8d0', '#ffe890', '#ffd050', '#ffb030', '#f08a20', '#d06018', '#a04010'];
const CRYS = ['#ffffff', '#c8fbff', '#8aeaff', '#4ac0f0', '#2a7ac8', '#1a4a90'];
const FLAME = ['#ffe080', '#ffb040', '#ff7a20', '#e04a10'];
const LAVA = ['#ff5a1a', '#ff8a2a', '#ffc040', '#ff8a2a'];
const SEA = ['#14306a', '#1a3c7a', '#22508e', '#2e66a2', '#1a3c7a'];

const BIG: TextStyle = { fill: GOLD, outline: '#2a0e1a', shadow: '#2a0e1a', bold: true };
const WHITE: TextStyle = { fill: '#ffffff', shadow: '#0a0a30' };
const GREY: TextStyle = { fill: '#a8b0e0', shadow: '#0a0a30' };

/* ---------- the party (original characters) ---------- */

const sword = (c: Ctx, j: Joints) => {
  const a = j.farmF;
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  const [hx, hy] = j.handF;
  // guard
  c.fillStyle = '#e0b040';
  const g = new Path2D();
  capsule(g, [hx - dy * 3, hy + dx * 3], 0.9, [hx + dy * 3, hy - dx * 3], 0.9);
  c.fill(g);
  // blade
  const b = new Path2D();
  capsule(b, [hx + dx * 1.5, hy + dy * 1.5], 1.4, [hx + dx * 17, hy + dy * 17], 0.6);
  shade(c, b, '#f0f4ff', '#9aa4c8', 0.6, -0.6);
  // pommel
  c.fillStyle = '#8a5030';
  c.beginPath();
  c.arc(hx - dx * 2.2, hy - dy * 2.2, 1.1, 0, TAU);
  c.fill();
};

const ren: Look = {
  skin: '#f0b890',
  skinS: '#b87458',
  hair: '#d8383a',
  hairS: '#8a1a2a',
  top: '#2a5ab8',
  topS: '#1a3a7a',
  bot: '#3a3050',
  botS: '#241e36',
  shoe: '#8a5030',
  shoeS: '#5a3020',
  eye: '#1a0e14',
  sleeve: '#e8e8f0',
  sleeveS: '#a0a0c0',
  headR: 4.7,
  torso: 10,
  thigh: 8,
  shin: 8,
  uarm: 6,
  farm: 5.6,
  legW: 3.8,
  armW: 3.1,
  chestW: 9,
  hipW: 7.2,
  robe: 5,
  hairFn: (c, j, l, back) => {
    const [hx, hy] = j.head;
    const R = l.headR;
    if (back) {
      // headband tails
      c.fillStyle = '#f4f4ff';
      const p = new Path2D();
      p.moveTo(hx - R * 0.8, hy - R * 0.5);
      p.quadraticCurveTo(hx - R * 2.2, hy - R * 0.2, hx - R * 2.9, hy + R * 0.6);
      p.lineTo(hx - R * 2.1, hy + R * 0.1);
      p.quadraticCurveTo(hx - R * 1.6, hy + R * 0.6, hx - R * 2.2, hy + R * 1.3);
      p.quadraticCurveTo(hx - R * 1.2, hy + R * 0.3, hx - R * 0.6, hy - R * 0.1);
      p.closePath();
      c.fill(p);
      return;
    }
    // spiky crimson hair
    const p = new Path2D();
    const spikes: [number, number][] = [
      [-1.1, 0.4],
      [-1.9, 0.1],
      [-1.2, -0.4],
      [-2.0, -0.9],
      [-0.9, -1.0],
      [-1.0, -1.9],
      [-0.1, -1.25],
      [0.5, -1.95],
      [0.6, -1.05],
      [1.5, -1.2],
      [1.0, -0.55],
      [1.25, -0.15],
      [0.5, -0.5],
      [0.1, -0.2],
      [-0.4, -0.3],
      [-0.5, 0.5],
    ];
    spikes.forEach(([x, y], i) => (i ? p.lineTo(hx + x * R, hy + y * R) : p.moveTo(hx + x * R, hy + y * R)));
    p.closePath();
    shade(c, p, l.hair, l.hairS, 0.8, 0.8);
    // headband
    c.fillStyle = '#f4f4ff';
    c.fillRect(Math.round(hx - R * 0.9), Math.round(hy - R * 0.62), Math.round(R * 1.9), 2);
  },
  over: (c, j) => {
    // belt
    const s = Math.sin(j.lean);
    const co = Math.cos(j.lean);
    const p = new Path2D();
    const P = (v: number, u: number): [number, number] => [j.hip[0] + v * co + u * s, j.hip[1] + v * s - u * co];
    p.moveTo(...P(-4, 0.6));
    p.lineTo(...P(4, 0.6));
    p.lineTo(...P(4, 2.6));
    p.lineTo(...P(-4, 2.6));
    p.closePath();
    c.fillStyle = '#6a3a20';
    c.fill(p);
    c.fillStyle = '#e0b040';
    const q = P(2.4, 1.6);
    c.fillRect(Math.round(q[0]), Math.round(q[1]) - 1, 2, 2);
  },
  front: (c, j) => sword(c, j),
};

const mira: Look = {
  skin: '#f8c8a8',
  skinS: '#c08a70',
  hair: '#f0d070',
  hairS: '#b08a3a',
  top: '#7a4ac0',
  topS: '#4a2a80',
  bot: '#4a2a80',
  botS: '#2e1a58',
  shoe: '#4a2a50',
  shoeS: '#2a1830',
  eye: '#1a0e30',
  sleeve: '#7a4ac0',
  sleeveS: '#4a2a80',
  headR: 4.6,
  torso: 9,
  thigh: 7.5,
  shin: 7.5,
  uarm: 5.6,
  farm: 5.2,
  legW: 3.2,
  armW: 2.8,
  chestW: 7.6,
  hipW: 6.6,
  robe: 14,
  behind: (c, j) => {
    // staff, held upright
    const [hx, hy] = j.handF;
    c.fillStyle = '#8a5a30';
    c.fillRect(Math.round(hx) - 0.5, Math.round(hy - 15), 1.6, 28);
  },
  hairFn: (c, j, l, back) => {
    const [hx, hy] = j.head;
    const R = l.headR;
    if (back) {
      const p = new Path2D();
      p.moveTo(hx - R * 0.2, hy - R * 0.6);
      p.quadraticCurveTo(hx - R * 1.6, hy + R * 0.2, hx - R * 1.5, hy + R * 2.6);
      p.lineTo(hx - R * 0.4, hy + R * 2.2);
      p.quadraticCurveTo(hx - R * 0.2, hy + R * 0.8, hx + R * 0.4, hy + R * 0.2);
      p.closePath();
      shade(c, p, l.hair, l.hairS, 0.8, -0.4);
      return;
    }
    // fringe
    c.fillStyle = l.hair;
    const f = new Path2D();
    f.moveTo(hx - R * 1.0, hy + R * 0.3);
    f.quadraticCurveTo(hx - R * 0.9, hy - R * 1.0, hx + R * 0.6, hy - R * 0.9);
    f.lineTo(hx + R * 1.05, hy - R * 0.2);
    f.lineTo(hx + R * 0.4, hy - R * 0.45);
    f.lineTo(hx - R * 0.3, hy - R * 0.2);
    f.lineTo(hx - R * 0.5, hy + R * 0.6);
    f.closePath();
    c.fill(f);
    // the wide-brim pointed hat, tip bent back
    const brim = new Path2D();
    brim.ellipse(hx + R * 0.1, hy - R * 0.75, R * 2.2, R * 0.48, -0.08, 0, TAU);
    const cone = new Path2D();
    cone.moveTo(hx - R * 1.0, hy - R * 0.85);
    cone.quadraticCurveTo(hx - R * 0.2, hy - R * 2.6, hx - R * 1.4, hy - R * 3.6);
    cone.quadraticCurveTo(hx + R * 0.6, hy - R * 2.6, hx + R * 1.1, hy - R * 0.85);
    cone.closePath();
    shade(c, cone, '#5a3aa0', '#3a2470', 1, 0);
    shade(c, brim, '#5a3aa0', '#3a2470', 0, -0.8);
    c.fillStyle = '#e0b040';
    c.fillRect(Math.round(hx - R * 0.9), Math.round(hy - R * 1.25), Math.round(R * 1.9), 1);
  },
  front: (c, j) => {
    // staff head: a glowing orb in a hook
    const [hx, hy] = j.handF;
    c.fillStyle = '#8a5a30';
    c.beginPath();
    c.arc(Math.round(hx) + 1.5, Math.round(hy - 16), 2.6, Math.PI * 0.9, Math.PI * 2.2);
    c.lineWidth = 1.2;
    c.strokeStyle = '#8a5a30';
    c.stroke();
    c.fillStyle = '#8aeaff';
    c.beginPath();
    c.arc(Math.round(hx) + 1, Math.round(hy - 16), 1.8, 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillRect(Math.round(hx), Math.round(hy - 17), 1, 1);
  },
};

const bo: Look = {
  skin: '#b07450',
  skinS: '#744630',
  hair: '#1e1416',
  hairS: '#0c0808',
  top: '#e07a2a',
  topS: '#a04a1a',
  bot: '#e07a2a',
  botS: '#a04a1a',
  shoe: '#3a2a24',
  shoeS: '#22180f',
  eye: '#120a0a',
  sleeve: '#b07450',
  sleeveS: '#744630',
  hand: '#a8b0c8',
  headR: 4.9,
  torso: 11,
  thigh: 8.5,
  shin: 8,
  uarm: 6.2,
  farm: 5.8,
  legW: 4.8,
  armW: 4.3,
  chestW: 12.5,
  hipW: 9,
  hairFn: (c, j, l, back) => {
    const [hx, hy] = j.head;
    const R = l.headR;
    if (back) return;
    const p = new Path2D();
    p.moveTo(hx - R * 1.05, hy + R * 0.2);
    p.quadraticCurveTo(hx - R * 1.1, hy - R * 1.15, hx + R * 0.4, hy - R * 1.1);
    p.quadraticCurveTo(hx + R * 1.1, hy - R * 0.9, hx + R * 1.0, hy - R * 0.45);
    p.lineTo(hx - R * 0.3, hy - R * 0.4);
    p.lineTo(hx - R * 0.55, hy + R * 0.45);
    p.closePath();
    c.fillStyle = l.hair;
    c.fill(p);
    // topknot
    c.beginPath();
    c.arc(hx - R * 0.5, hy - R * 1.35, R * 0.45, 0, TAU);
    c.fill();
    // brow band
    c.fillStyle = '#d8323e';
    c.fillRect(Math.round(hx - R * 0.95), Math.round(hy - R * 0.55), Math.round(R * 1.95), 1);
  },
  over: (c, j) => {
    // black belt and the gi's crossed collar
    const s = Math.sin(j.lean);
    const co = Math.cos(j.lean);
    const P = (v: number, u: number): [number, number] => [j.hip[0] + v * co + u * s, j.hip[1] + v * s - u * co];
    const b = new Path2D();
    b.moveTo(...P(-5, 0.6));
    b.lineTo(...P(5.4, 0.6));
    b.lineTo(...P(5.4, 3));
    b.lineTo(...P(-5, 3));
    b.closePath();
    c.fillStyle = '#1e1416';
    c.fill(b);
    const v = new Path2D();
    v.moveTo(...P(1, 10.5));
    v.lineTo(...P(5.5, 10.5));
    v.lineTo(...P(3, 5));
    v.closePath();
    c.fillStyle = '#b07450';
    c.fill(v);
  },
};

const PALS = {
  ren: lookPal(ren, ['#f4f4ff', '#6a3a20', '#e0b040', '#f0f4ff', '#9aa4c8', '#8a5030']),
  mira: lookPal(mira, ['#5a3aa0', '#3a2470', '#e0b040', '#8a5a30', '#8aeaff', '#ffffff']),
  bo: lookPal(bo, ['#d8323e', '#1e1416']),
};

type Who = 'ren' | 'mira' | 'bo';
const LOOKS: Record<Who, Look> = { ren, mira, bo };

const POSES: Record<Who, Record<string, Pose>> = {
  ren: {
    idle: { lean: 0.12, bob: 0, legF: [0.4, 0.25], legB: [-0.32, 0.3], armF: [0.9, 0.55], armB: [-0.3, 0.7] },
    hurt: { lean: -0.3, bob: 1, legF: [0.5, 0.6], legB: [-0.2, 0.5], armF: [-0.4, 1.1], armB: [-0.9, 0.5] },
    kneel: { lean: 0.42, bob: 6, legF: [1.35, 2.3], legB: [-0.15, 2.5], armF: [0.75, -0.6], armB: [0.2, 0.7] },
    jump: { lean: 0.1, bob: -1, legF: [1.0, 1.7], legB: [0.3, 1.4], armF: [2.9, 0.1], armB: [2.6, 0.3] },
    thrust: { lean: 0.7, bob: 0, legF: [1.0, 1.3], legB: [-0.7, 1.1], armF: [1.65, 0], armB: [-1.3, 0.3] },
    win: { lean: 0.02, bob: 0, legF: [0.35, 0.15], legB: [-0.35, 0.15], armF: [3.05, 0.05], armB: [0.15, 0.9] },
  },
  mira: {
    idle: { lean: 0.02, bob: 0, legF: [0.25, 0.2], legB: [-0.2, 0.2], armF: [0.6, 0.9], armB: [-0.2, 0.6] },
    hurt: { lean: -0.3, bob: 1, legF: [0.4, 0.5], legB: [-0.25, 0.4], armF: [0.2, 1.0], armB: [-0.9, 0.6] },
    win: { lean: -0.05, bob: -1, legF: [0.3, 0.2], legB: [-0.3, 0.6], armF: [2.4, 0.4], armB: [-0.8, 0.5] },
  },
  bo: {
    idle: { lean: 0.14, bob: 1, legF: [0.55, 0.5], legB: [-0.45, 0.4], armF: [0.95, 2.0], armB: [0.55, 2.1] },
    hurt: { lean: -0.32, bob: 1.5, legF: [0.5, 0.7], legB: [-0.3, 0.6], armF: [-0.3, 1.3], armB: [-0.8, 1.0] },
    win: { lean: 0.02, bob: 0, legF: [0.45, 0.3], legB: [-0.45, 0.3], armF: [2.95, 0.25], armB: [0.6, 2.1] },
  },
};

/* ---------- the boss: a hollow stone king with a stolen crystal in its chest ---------- */

const BOSS_PAL = ['#8e88aa', '#6a6488', '#4e4870', '#36304e', '#24203a', '#2a2440', '#4a4068', '#ff5a1a', '#120c1c', '#c8c0e0'];
const rock = (cx: number, cy: number, rx: number, ry: number, seed: number, jag = 0.12, rot = 0) => {
  const p = new Path2D();
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + (hash(seed * 31 + i) - 0.5) * jag * 2;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    const X = cx + x * Math.cos(rot) - y * Math.sin(rot);
    const Y = cy + x * Math.sin(rot) + y * Math.cos(rot);
    if (i) p.lineTo(X, Y);
    else p.moveTo(X, Y);
  }
  p.closePath();
  return p;
};

/** Stone with a lit top-right and a dark bottom-left, plus a rim highlight */
const stone = (c: Ctx, p: Path2D, base = '#6a6488', dark = '#46406a', light = '#8e88aa') => {
  c.fillStyle = '#36304e';
  c.fill(p);
  c.save();
  c.clip(p);
  c.translate(1.8, -1.6);
  c.fillStyle = dark;
  c.fill(p);
  c.translate(1.6, -1.4);
  c.fillStyle = base;
  c.fill(p);
  c.translate(1.2, -1.2);
  c.fillStyle = light;
  c.fill(p);
  c.translate(-0.6, 0.6);
  c.fillStyle = base;
  c.fill(p);
  c.restore();
};

type ArmPose = 'idle' | 'raise' | 'slam';
const paintBoss = (arm: ArmPose) =>
  bake(170, 150, (c) => {
    // back arm
    stone(c, rock(34, 64, 16, 14, 1));
    stone(c, rock(24, 92, 12, 16, 2, 0.1, 0.3));
    stone(c, rock(22, 122, 15, 13, 3));
    // legs
    stone(c, rock(50, 128, 15, 16, 4));
    stone(c, rock(96, 128, 16, 16, 5));
    stone(c, rock(46, 142, 18, 6, 6, 0.05));
    stone(c, rock(100, 142, 19, 6, 7, 0.05));
    // body
    stone(c, rock(72, 82, 46, 40, 8, 0.08));
    // chest cavity (the crystal sits here)
    c.fillStyle = '#120c1c';
    c.beginPath();
    c.ellipse(84, 78, 11, 13, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#24203a';
    c.beginPath();
    c.ellipse(86, 76, 8, 10, 0, 0, TAU);
    c.fill();
    // pauldrons
    stone(c, rock(36, 50, 20, 16, 9));
    stone(c, rock(112, 50, 20, 16, 10));
    // head + crown of horns
    stone(c, rock(80, 30, 15, 13, 11));
    for (const [x, h, lean] of [
      [66, 18, -0.5],
      [72, 24, -0.25],
      [80, 28, 0],
      [88, 24, 0.25],
      [94, 18, 0.5],
    ] as const) {
      const p = new Path2D();
      p.moveTo(x - 3.5, 22);
      p.lineTo(x + Math.sin(lean) * h, 22 - h * Math.cos(lean) * 0.9);
      p.lineTo(x + 3.5, 22);
      p.closePath();
      shade(c, p, '#4a4068', '#2a2440', 1, -0.5);
    }
    // brow ridge (eyes are drawn live)
    c.fillStyle = '#24203a';
    c.fillRect(82, 28, 16, 3);
    c.fillStyle = '#120c1c';
    c.fillRect(85, 31, 4, 2);
    c.fillRect(93, 31, 4, 2);
    // front arm
    if (arm === 'idle') {
      stone(c, rock(124, 82, 12, 16, 12, 0.1, -0.2));
      stone(c, rock(130, 116, 16, 14, 13));
    } else if (arm === 'raise') {
      stone(c, rock(128, 30, 12, 16, 12, 0.1, 0.5));
      stone(c, rock(138, 10, 16, 12, 13));
    } else {
      stone(c, rock(134, 76, 18, 11, 12, 0.1, 0.4));
      stone(c, rock(154, 128, 16, 16, 13));
    }
  }, { pal: BOSS_PAL, outline: OUT, diag: false });

/** Lava cracks over the boss, one tinted copy per palette-cycle step */
const paintCracks = () => {
  const base = mk(170, 150);
  const c = base.ctx;
  c.fillStyle = '#ffffff';
  const line = (pts: [number, number][]) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
      for (let k = 0; k <= n; k++) c.fillRect(Math.round(lerp(x0, x1, k / n)), Math.round(lerp(y0, y1, k / n)), 1, 1);
    }
  };
  line([
    [52, 62],
    [58, 74],
    [54, 88],
    [62, 100],
  ]);
  line([
    [96, 96],
    [104, 104],
    [102, 114],
  ]);
  line([
    [40, 96],
    [48, 104],
  ]);
  line([
    [74, 44],
    [70, 52],
  ]);
  line([
    [110, 60],
    [104, 66],
  ]);
  return LAVA.map((col) => tint(base.canvas, col));
};

/* ---------- crystal and star (the motif) ---------- */

/** Gem with turning facets; frame 0..7 */
const paintCrystal = (w: number, h: number, frame: number) =>
  bake(w + 2, h + 2, (c) => {
    const cx = (w + 2) / 2;
    const top = 1;
    const mid = 1 + h * 0.38;
    const bot = h + 1;
    const ph = (frame / 8) * Math.PI;
    const xs = [0, 1, 2, 3].map((i) => Math.cos(ph + (i * Math.PI) / 2) * (w / 2));
    const zs = [0, 1, 2, 3].map((i) => Math.sin(ph + (i * Math.PI) / 2));
    const facets: { z: number; p: Path2D; col: string }[] = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const z = (zs[i] + zs[j]) / 2;
      if (z < -0.05) continue;
      const lit = clamp(0.5 + (xs[i] + xs[j]) / w * 0.6 + z * 0.3);
      const up = new Path2D();
      up.moveTo(cx, top);
      up.lineTo(cx + xs[i], mid);
      up.lineTo(cx + xs[j], mid);
      up.closePath();
      const dn = new Path2D();
      dn.moveTo(cx, bot);
      dn.lineTo(cx + xs[i], mid);
      dn.lineTo(cx + xs[j], mid);
      dn.closePath();
      facets.push({ z, p: up, col: CRYS[Math.round((1 - lit) * 3)] });
      facets.push({ z, p: dn, col: CRYS[Math.min(5, Math.round((1 - lit) * 3) + 2)] });
    }
    facets.sort((a, b) => a.z - b.z);
    for (const f of facets) {
      c.fillStyle = f.col;
      c.fill(f.p);
    }
    c.fillStyle = '#ffffff';
    c.fillRect(Math.round(cx - w * 0.15), Math.round(mid - h * 0.2), 1, Math.max(1, Math.round(h * 0.12)));
  }, { pal: CRYS, outline: '#0e2050' });

/** The four-point star, painted crisp with a hot core */
const drawStar = (px: Px, x: number, y: number, R: number, rot: number, t: number) => {
  crisp(
    px,
    (q) => {
      q.fillStyle = cyc(GOLD, 3, t, 6);
      q.fill(starPath(x, y, R, R * 0.28, 4, rot));
      q.fillStyle = GOLD[1];
      q.fill(starPath(x, y, R * 0.72, R * 0.18, 4, rot));
      q.fillStyle = '#ffffff';
      q.fill(starPath(x, y, R * 0.42, R * 0.1, 4, rot));
      q.beginPath();
      q.arc(x, y, Math.max(1, R * 0.12), 0, TAU);
      q.fill();
    },
    x - R - 2,
    y - R - 2,
    R * 2 + 4,
    R * 2 + 4
  );
};

/* ---------- chibi map sprites (seen from behind) ---------- */

const paintChibi = (who: Who, frame: number) =>
  bake(20, 26, (c) => {
    const step = [0, 1, 0, -1][frame];
    const bob = frame % 2 ? -1 : 0;
    const L = LOOKS[who];
    const cx = 10;
    const by = 24 + bob;
    // legs
    c.fillStyle = L.botS;
    c.fillRect(cx - 3.5, by - 7 - Math.max(0, step), 3, 6 + Math.max(0, step));
    c.fillRect(cx + 0.5, by - 7 - Math.max(0, -step), 3, 6 + Math.max(0, -step));
    c.fillStyle = L.shoeS;
    c.fillRect(cx - 3.5, by - 2 - Math.max(0, step) * 1.5, 3, 2);
    c.fillRect(cx + 0.5, by - 2 - Math.max(0, -step) * 1.5, 3, 2);
    // body
    const w = who === 'bo' ? 13 : who === 'mira' ? 10 : 11;
    const body = new Path2D();
    body.moveTo(cx - w / 2, by - 6);
    body.lineTo(cx - w / 2 + 1, by - 14);
    body.lineTo(cx + w / 2 - 1, by - 14);
    body.lineTo(cx + w / 2, by - 6);
    body.closePath();
    if (who === 'mira') {
      body.moveTo(cx - 6, by - 2);
      body.lineTo(cx - 4, by - 14);
      body.lineTo(cx + 4, by - 14);
      body.lineTo(cx + 6, by - 2);
      body.closePath();
    }
    shade(c, body, L.top, L.topS, 1.2, 0);
    // arms swinging
    c.fillStyle = L.sleeveS ?? L.topS;
    c.fillRect(cx - w / 2 - 1.5, by - 13 + step, 2, 6);
    c.fillRect(cx + w / 2 - 0.5, by - 13 - step, 2, 6);
    if (who === 'ren') {
      // sword on the back
      c.fillStyle = '#c8d0e8';
      c.save();
      c.translate(cx, by - 12);
      c.rotate(0.6);
      c.fillRect(-1, -7, 2, 13);
      c.fillStyle = '#e0b040';
      c.fillRect(-2.5, -1, 5, 1.5);
      c.restore();
    }
    // head from behind
    c.fillStyle = L.hair;
    c.beginPath();
    c.arc(cx, by - 19, who === 'bo' ? 5.6 : 5.4, 0, TAU);
    c.fill();
    c.fillStyle = L.hairS;
    c.beginPath();
    c.arc(cx - 1.4, by - 18, 3.6, 0, TAU);
    c.fill();
    if (who === 'ren') {
      c.fillStyle = L.hair;
      for (const [x, y] of [
        [-5, -22],
        [-1, -26],
        [4, -24],
        [6, -19],
        [-6, -17],
      ]) {
        c.beginPath();
        c.moveTo(cx + x, by + y);
        c.lineTo(cx + x * 0.3, by - 19);
        c.lineTo(cx + x * 0.3 + 2, by - 18);
        c.fill();
      }
      c.fillStyle = '#f4f4ff';
      c.fillRect(cx - 5, by - 20, 10, 1.5);
    } else if (who === 'mira') {
      c.fillStyle = '#3a2470';
      c.beginPath();
      c.ellipse(cx, by - 21, 9, 2.2, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#5a3aa0';
      c.beginPath();
      c.moveTo(cx - 4.5, by - 22);
      c.quadraticCurveTo(cx, by - 30, cx + 3, by - 34);
      c.quadraticCurveTo(cx + 2, by - 28, cx + 4.5, by - 22);
      c.fill();
      c.fillStyle = L.hair;
      c.fillRect(cx - 4, by - 18, 8, 6);
    } else {
      c.fillStyle = L.hair;
      c.beginPath();
      c.arc(cx, by - 25, 2, 0, TAU);
      c.fill();
      c.fillStyle = '#d8323e';
      c.fillRect(cx - 5.5, by - 20, 11, 1);
    }
  }, { outline: OUT });

/** Ren's portrait for the limit cut-in */
const paintPortrait = () =>
  bake(96, 64, (c) => {
    const S = 4.2;
    const hx = 52;
    const hy = 34;
    // neck + collar
    c.fillStyle = '#b87458';
    c.fillRect(hx - 8, hy + 14, 14, 14);
    c.fillStyle = '#2a5ab8';
    c.beginPath();
    c.moveTo(hx - 30, 64);
    c.quadraticCurveTo(hx - 20, hy + 20, hx - 2, hy + 22);
    c.quadraticCurveTo(hx + 18, hy + 22, hx + 30, 64);
    c.fill();
    c.fillStyle = '#e8e8f0';
    c.beginPath();
    c.moveTo(hx - 8, hy + 20);
    c.lineTo(hx + 2, hy + 30);
    c.lineTo(hx + 10, hy + 20);
    c.fill();
    // face (three-quarter, facing right)
    const face = new Path2D();
    face.moveTo(hx - 4.4 * S, hy - 2 * S);
    face.quadraticCurveTo(hx - 4.6 * S, hy + 2.4 * S, hx - 1 * S, hy + 4.4 * S);
    face.quadraticCurveTo(hx + 2.4 * S, hy + 4.8 * S, hx + 4 * S, hy + 1.8 * S);
    face.quadraticCurveTo(hx + 4.4 * S, hy - 1 * S, hx + 3.6 * S, hy - 3 * S);
    face.closePath();
    shade(c, face, '#f0b890', '#c88468', 2.2, -0.8);
    // eye: white, iris, pupil, highlight
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(hx + 1.6 * S, hy + 0.2 * S, 1.3 * S, 0.95 * S, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#2a6ad0';
    c.beginPath();
    c.ellipse(hx + 2.0 * S, hy + 0.25 * S, 0.75 * S, 0.9 * S, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#10142a';
    c.beginPath();
    c.ellipse(hx + 2.15 * S, hy + 0.3 * S, 0.38 * S, 0.55 * S, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillRect(Math.round(hx + 1.6 * S), Math.round(hy - 0.4 * S), 2, 2);
    // brow, set hard
    c.fillStyle = '#5a1018';
    c.beginPath();
    c.moveTo(hx + 0.2 * S, hy - 1.3 * S);
    c.lineTo(hx + 3.4 * S, hy - 0.9 * S);
    c.lineTo(hx + 3.2 * S, hy - 0.5 * S);
    c.lineTo(hx + 0.4 * S, hy - 0.9 * S);
    c.fill();
    // eyelid line
    c.fillStyle = '#10142a';
    c.fillRect(Math.round(hx + 0.6 * S), Math.round(hy - 0.75 * S), Math.round(2.3 * S), 1);
    // mouth
    c.fillStyle = '#8a3a3a';
    c.fillRect(Math.round(hx + 1.4 * S), Math.round(hy + 2.8 * S), 6, 1);
    // ear
    c.fillStyle = '#c88468';
    c.beginPath();
    c.ellipse(hx - 2.6 * S, hy + 0.6 * S, 0.7 * S, 1.0 * S, 0, 0, TAU);
    c.fill();
    // hair spikes
    const hair = new Path2D();
    const pts: [number, number][] = [
      [-5.2, 1.2],
      [-7.6, -0.4],
      [-5.4, -1.8],
      [-8.2, -4.4],
      [-4.6, -4.2],
      [-5.4, -7.6],
      [-1.8, -5.4],
      [0.6, -8.4],
      [1.6, -5.2],
      [5.0, -6.4],
      [4.0, -3.2],
      [6.6, -2.2],
      [3.6, -1.6],
      [2.6, -2.2],
      [1.0, -1.4],
      [-0.6, -2.4],
      [-2.4, -1.0],
      [-3.4, 1.6],
    ];
    pts.forEach(([x, y], i) => (i ? hair.lineTo(hx + x * S, hy + y * S) : hair.moveTo(hx + x * S, hy + y * S)));
    hair.closePath();
    shade(c, hair, '#d8383a', '#8a1a2a', 2, 1.6);
    // headband
    c.fillStyle = '#f4f4ff';
    c.beginPath();
    c.moveTo(hx - 4.4 * S, hy - 2.6 * S);
    c.lineTo(hx + 3.8 * S, hy - 2.2 * S);
    c.lineTo(hx + 3.7 * S, hy - 1.5 * S);
    c.lineTo(hx - 4.5 * S, hy - 1.8 * S);
    c.fill();
  }, {
    pal: ['#b87458', '#2a5ab8', '#e8e8f0', '#f0b890', '#c88468', '#ffffff', '#2a6ad0', '#10142a', '#5a1018', '#8a3a3a', '#d8383a', '#8a1a2a', '#f4f4ff'],
    outline: OUT,
  });

/* ---------- world map ---------- */

const MAP = 512;
const PATH: [number, number][] = [
  [262, 440],
  [252, 380],
  [276, 322],
  [300, 268],
  [292, 214],
  [282, 172],
];
const CAVE: [number, number] = [282, 150];

const pathAt = (k: number): { p: [number, number]; d: [number, number] } => {
  const lens = [0];
  for (let i = 1; i < PATH.length; i++) lens.push(lens[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]));
  const L = lens[lens.length - 1];
  const target = clamp(k) * L;
  let i = 1;
  while (i < PATH.length - 1 && lens[i] < target) i++;
  const f = clamp((target - lens[i - 1]) / (lens[i] - lens[i - 1] || 1));
  const a = PATH[i - 1];
  const b = PATH[i];
  const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { p: [lerp(a[0], b[0], f), lerp(a[1], b[1], f)], d: [(b[0] - a[0]) / dl, (b[1] - a[1]) / dl] };
};

const paintMap = (rng: () => number) => {
  const { canvas, ctx: c } = mk(MAP, MAP, true);
  // sea everywhere, then land
  c.fillStyle = '#010101';
  c.fillRect(0, 0, MAP, MAP);
  for (let y = 0; y < MAP; y += 2) for (let x = 0; x < MAP; x += 4) if (hash(x * 0.37 + y * 1.91) < 0.5) {
    c.fillStyle = ['#010101', '#020202', '#030303', '#040404'][Math.floor(hash(x * 3.1 + y * 0.7) * 4)];
    c.fillRect(x, y, 4, 1);
  }
  // continent: blobby polar outline
  const land = new Path2D();
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU;
    const rr = 190 + Math.sin(a * 3 + 1) * 26 + Math.sin(a * 7) * 12 + (hash(i) - 0.5) * 14;
    const x = 270 + Math.cos(a) * rr;
    const y = 290 + Math.sin(a) * rr * 0.92;
    if (i) land.lineTo(x, y);
    else land.moveTo(x, y);
  }
  land.closePath();
  c.save();
  c.clip(land);
  c.fillStyle = '#4a9a4a';
  c.fillRect(0, 0, MAP, MAP);
  for (let i = 0; i < 9000; i++) {
    c.fillStyle = rng() < 0.5 ? '#3e8a42' : '#5aaa52';
    c.fillRect(Math.floor(rng() * MAP), Math.floor(rng() * MAP), 2, 1);
  }
  // forests: dense dark clumps
  for (let f = 0; f < 14; f++) {
    const fx = 120 + rng() * 300;
    const fy = 180 + rng() * 260;
    if (Math.abs(fx - 270) < 40 && fy > 200) continue;
    for (let i = 0; i < 120; i++) {
      const a = rng() * TAU;
      const rr = Math.sqrt(rng()) * 30;
      const x = Math.round(fx + Math.cos(a) * rr);
      const y = Math.round(fy + Math.sin(a) * rr * 0.8);
      c.fillStyle = '#1e5a2e';
      c.fillRect(x - 2, y - 1, 5, 3);
      c.fillStyle = '#2e7a3a';
      c.fillRect(x - 1, y - 1, 3, 1);
    }
  }
  // highlands around the cave
  for (let i = 0; i < 1600; i++) {
    const a = rng() * TAU;
    const rr = Math.sqrt(rng()) * 90;
    c.fillStyle = rng() < 0.5 ? '#8a7a5a' : '#7a6a4a';
    c.fillRect(Math.round(282 + Math.cos(a) * rr * 1.4), Math.round(130 + Math.sin(a) * rr * 0.6), 3, 2);
  }
  c.restore();
  // beach rim
  c.strokeStyle = '#e8d8a0';
  c.lineWidth = 3;
  c.stroke(land);
  // river from the highlands to the sea (cycled like the sea)
  c.strokeStyle = '#020202';
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(330, 140);
  c.bezierCurveTo(380, 220, 330, 300, 420, 400);
  c.stroke();
  // the road
  c.strokeStyle = '#d8c088';
  c.lineWidth = 5;
  c.beginPath();
  PATH.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
  c.strokeStyle = '#b89a68';
  c.lineWidth = 1;
  c.stroke();
  // AA cleanup: snap to hard edges by re-quantising alpha later (texture is opaque)
  const tex = texFrom(canvas);
  // kill anti-aliased in-between sea colours: anything very dark becomes sea slot 0
  for (let i = 0; i < tex.d.length; i++) {
    const p = tex.d[i];
    const r = p & 255;
    const g = (p >> 8) & 255;
    const b = (p >> 16) & 255;
    if (r < 8 && g < 8 && b < 8 && !(r === g && g === b && r >= 1 && r <= 4)) tex.d[i] = u32Of('#010101');
  }
  markCycle(tex, '#010101', 0);
  markCycle(tex, '#020202', 1);
  markCycle(tex, '#030303', 2);
  markCycle(tex, '#040404', 3);
  return tex;
};

const paintMountain = (seed: number, cave: boolean) =>
  bake(64, 48, (c) => {
    const p = new Path2D();
    p.moveTo(2, 47);
    p.lineTo(18, 20 + hash(seed) * 6);
    p.lineTo(26, 24);
    p.lineTo(34, 4 + hash(seed + 1) * 6);
    p.lineTo(44, 18);
    p.lineTo(50, 14 + hash(seed + 2) * 6);
    p.lineTo(62, 47);
    p.closePath();
    c.fillStyle = '#5a4a3a';
    c.fill(p);
    c.save();
    c.clip(p);
    c.fillStyle = '#8a7458';
    c.beginPath();
    c.moveTo(34, 0);
    c.lineTo(64, 48);
    c.lineTo(40, 48);
    c.lineTo(30, 20);
    c.fill();
    c.fillStyle = '#f0f0ff';
    c.beginPath();
    c.moveTo(34, 2);
    c.lineTo(41, 14);
    c.lineTo(36, 12);
    c.lineTo(32, 15);
    c.lineTo(28, 12);
    c.fill();
    c.fillStyle = '#3a2e26';
    c.fillRect(0, 42, 64, 6);
    c.restore();
    if (cave) {
      c.fillStyle = '#0a0610';
      c.beginPath();
      c.moveTo(25, 47);
      c.quadraticCurveTo(25, 33, 33, 33);
      c.quadraticCurveTo(41, 33, 41, 47);
      c.fill();
    }
  }, { pal: ['#5a4a3a', '#8a7458', '#f0f0ff', '#3a2e26', '#0a0610'], outline: OUT });

const paintTree = () =>
  bake(12, 16, (c) => {
    c.fillStyle = '#5a3a20';
    c.fillRect(5, 11, 2, 5);
    const p = new Path2D();
    p.moveTo(6, 0);
    p.lineTo(11, 12);
    p.lineTo(1, 12);
    p.closePath();
    shade(c, p, '#2e8a3e', '#1a5a2a', 1.2, -0.4);
  }, { pal: ['#5a3a20', '#2e8a3e', '#1a5a2a'], outline: OUT });

const paintCloud = (seed: number) =>
  bake(56, 24, (c) => {
    c.fillStyle = '#9aa8d8';
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.arc(10 + i * 7 + hash(seed + i) * 4, 15 - Math.sin((i / 5) * Math.PI) * 6, 7 + hash(seed + i * 3) * 3, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#e8eeff';
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.arc(9 + i * 7 + hash(seed + i) * 4, 13 - Math.sin((i / 5) * Math.PI) * 6, 5 + hash(seed + i * 3) * 3, 0, TAU);
      c.fill();
    }
  }, { pal: ['#9aa8d8', '#e8eeff'], outline: null });

/* ---------- cave + arena backdrops ---------- */

const paintCaveBack = (rng: () => number) => {
  const W = 800;
  const { canvas, ctx: c } = mk(W, LH);
  vGrad(c, 0, 0, W, LH, ['#0a0818', '#160f2c', '#22183e', '#1a1230'], 1);
  // far stalactites and columns
  for (let x = 0; x < W; x += 14 + Math.floor(rng() * 20)) {
    const h = 20 + rng() * 60;
    const w = 6 + rng() * 10;
    c.fillStyle = '#120c24';
    c.beginPath();
    c.moveTo(x - w, 0);
    c.lineTo(x + w, 0);
    c.lineTo(x + 1, h);
    c.lineTo(x - 1, h);
    c.fill();
  }
  for (let x = 30; x < W; x += 90 + Math.floor(rng() * 60)) {
    const w = 18 + rng() * 14;
    c.fillStyle = dither(c, '#1a1234', '#241a44', 0.5);
    c.fillRect(Math.round(x), 0, Math.round(w), LH);
    c.fillStyle = '#2e2254';
    c.fillRect(Math.round(x + w - 2), 0, 2, LH);
  }
  const cv = mk(W, LH, true);
  cv.ctx.drawImage(canvas, 0, 0);
  // snap away anti-aliasing on the triangles
  const img = cv.ctx.getImageData(0, 0, W, LH);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  cv.ctx.putImageData(img, 0, 0);
  return cv.canvas;
};

interface Crys {
  x: number;
  y: number;
  s: number;
}

const paintCaveMid = (rng: () => number) => {
  const W = 1000;
  const { canvas, ctx: c } = mk(W, LH);
  const crystals: Crys[] = [];
  const torches: Crys[] = [];
  // rock shelves and the floor ridge
  const ridge = new Path2D();
  ridge.moveTo(0, LH);
  for (let x = 0; x <= W; x += 10) ridge.lineTo(x, 150 + Math.sin(x * 0.02) * 10 + (hash(x) - 0.5) * 8);
  ridge.lineTo(W, LH);
  ridge.closePath();
  c.fillStyle = '#2a1e4a';
  c.fill(ridge);
  for (let x = 0; x < W; x += 2) {
    const y = 150 + Math.sin(x * 0.02) * 10 + (hash(Math.floor(x / 10) * 10) - 0.5) * 8;
    c.fillStyle = '#3e2e66';
    c.fillRect(x, Math.round(y), 2, 1);
  }
  // ceiling mass
  const ceil = new Path2D();
  ceil.moveTo(0, 0);
  for (let x = 0; x <= W; x += 8) ceil.lineTo(x, 22 + Math.sin(x * 0.031) * 8 + (hash(x * 0.3) - 0.5) * 10);
  ceil.lineTo(W, 0);
  ceil.closePath();
  c.fillStyle = '#1e1636';
  c.fill(ceil);
  for (let x = 20; x < W; x += 60 + Math.floor(rng() * 50)) {
    // crystal clusters in the walls
    const y = 60 + rng() * 70;
    crystals.push({ x, y, s: 3 + rng() * 4 });
  }
  for (let x = 120; x < W; x += 210) torches.push({ x, y: 98, s: 1 });
  const cv = mk(W, LH, true);
  cv.ctx.drawImage(canvas, 0, 0);
  const img = cv.ctx.getImageData(0, 0, W, LH);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
  cv.ctx.putImageData(img, 0, 0);
  return { canvas: cv.canvas, crystals, torches };
};

const paintCaveFloor = () => {
  const W = 1000;
  const { canvas, ctx: c } = mk(W, 60);
  vGrad(c, 0, 0, W, 60, ['#3a2c5a', '#241a40', '#140e26'], 1);
  for (let x = 0; x < W; x += 3) {
    c.fillStyle = '#5a4a80';
    c.fillRect(x, Math.round(Math.sin(x * 0.05) * 1.2), 3, 1);
  }
  for (let i = 0; i < 260; i++) {
    const x = hash(i * 1.3) * W;
    const y = 4 + hash(i * 2.7) * 50;
    c.fillStyle = hash(i) < 0.5 ? '#2a1e48' : '#4a3a70';
    c.fillRect(Math.round(x), Math.round(y), 2 + Math.round(hash(i * 5) * 4), 1);
  }
  return canvas;
};

const paintStalactites = (rng: () => number) => {
  const W = 1200;
  const { canvas, ctx: c } = mk(W, LH, true);
  for (let x = 0; x < W; x += 50 + Math.floor(rng() * 90)) {
    const h = 30 + rng() * 50;
    const w = 10 + rng() * 14;
    c.fillStyle = '#08060f';
    c.beginPath();
    c.moveTo(x - w, 0);
    c.quadraticCurveTo(x - w * 0.3, h * 0.5, x, h);
    c.quadraticCurveTo(x + w * 0.3, h * 0.5, x + w, 0);
    c.fill();
  }
  for (let x = 40; x < W; x += 140 + Math.floor(rng() * 120)) {
    const h = 18 + rng() * 22;
    const w = 16 + rng() * 16;
    c.fillStyle = '#08060f';
    c.beginPath();
    c.moveTo(x - w, LH);
    c.quadraticCurveTo(x - w * 0.2, LH - h, x, LH - h);
    c.quadraticCurveTo(x + w * 0.4, LH - h * 0.7, x + w, LH);
    c.fill();
  }
  const img = c.getImageData(0, 0, W, LH);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
  c.putImageData(img, 0, 0);
  return canvas;
};

const paintArenaWall = (rng: () => number) => {
  const { canvas, ctx: c } = mk(LW, 110, true);
  vGrad(c, 0, 0, LW, 110, ['#0c0820', '#1e1440', '#33235c', '#4a3070'], 1);
  for (let i = 0; i < 26; i++) {
    const x = rng() * LW;
    const w = 14 + rng() * 26;
    const h = 30 + rng() * 60;
    c.fillStyle = dither(c, '#140e2c', '#1e1640', 0.4);
    c.beginPath();
    c.moveTo(x - w / 2, 110);
    c.lineTo(x - w * 0.15, 110 - h);
    c.lineTo(x + w * 0.2, 110 - h * 0.85);
    c.lineTo(x + w / 2, 110);
    c.fill();
  }
  for (let i = 0; i < 20; i++) {
    const x = rng() * LW;
    const h = 10 + rng() * 30;
    c.fillStyle = '#0a0618';
    c.beginPath();
    c.moveTo(x - 6, 0);
    c.lineTo(x, h);
    c.lineTo(x + 6, 0);
    c.fill();
  }
  const img = c.getImageData(0, 0, LW, 110);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  c.putImageData(img, 0, 0);
  return canvas;
};

const paintArenaFloor = () => {
  const { canvas, ctx: c } = mk(256, 256, true);
  c.fillStyle = '#3a2e58';
  c.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      const o = (y / 32) % 2 ? 16 : 0;
      c.fillStyle = (x + y) % 64 ? '#463866' : '#3e3060';
      c.fillRect((x + o) % 256, y, 31, 31);
      c.fillStyle = '#5a4a80';
      c.fillRect((x + o) % 256, y, 31, 1);
      c.fillStyle = '#2a2044';
      c.fillRect((x + o) % 256, y + 31, 32, 1);
    }
  }
  // glowing lava seams (cycled)
  c.fillStyle = '#010101';
  c.fillRect(0, 127, 256, 2);
  c.fillStyle = '#020202';
  c.fillRect(127, 0, 2, 256);
  const tex = texFrom(canvas);
  markCycle(tex, '#010101', 0);
  markCycle(tex, '#020202', 1);
  return tex;
};

/* ---------- sunrise ---------- */

const paintCliff = () =>
  bake(220, 90, (c) => {
    c.fillStyle = '#1a0e24';
    c.beginPath();
    c.moveTo(0, 90);
    c.lineTo(0, 30);
    c.lineTo(40, 26);
    c.lineTo(110, 22);
    c.lineTo(150, 26);
    c.lineTo(170, 34);
    c.lineTo(178, 48);
    c.lineTo(186, 56);
    c.lineTo(192, 90);
    c.closePath();
    c.fill();
    c.fillStyle = '#3a1e3a';
    c.beginPath();
    c.moveTo(40, 26);
    c.lineTo(110, 22);
    c.lineTo(150, 26);
    c.lineTo(170, 34);
    c.lineTo(166, 36);
    c.lineTo(110, 26);
    c.lineTo(40, 29);
    c.fill();
    // grass tufts
    c.fillStyle = '#2a1a30';
    for (let x = 4; x < 170; x += 7) c.fillRect(x, 23 + Math.round(Math.sin(x) * 1.5), 2, 4);
  }, { pal: ['#1a0e24', '#3a1e3a', '#2a1a30'], outline: null });

/* ---------- state ---------- */

interface State {
  px: Px;
  ui: Px;
  stars: [number, number, number][];
  party: Record<Who, Record<string, HTMLCanvasElement>>;
  walk: Record<Who, HTMLCanvasElement[]>;
  chibi: Record<Who, HTMLCanvasElement[]>;
  boss: Record<ArmPose, HTMLCanvasElement>;
  bossWhite: Record<ArmPose, HTMLCanvasElement>;
  bossDark: HTMLCanvasElement;
  cracks: HTMLCanvasElement[];
  gem: HTMLCanvasElement[];
  bigGem: HTMLCanvasElement[];
  portrait: HTMLCanvasElement;
  map: Tex;
  mountain: HTMLCanvasElement;
  caveMtn: HTMLCanvasElement;
  tree: HTMLCanvasElement;
  clouds: HTMLCanvasElement[];
  mapItems: { u: number; v: number; k: number }[];
  caveBack: HTMLCanvasElement;
  caveMid: HTMLCanvasElement;
  caveCrys: Crys[];
  caveTorch: Crys[];
  caveFloor: HTMLCanvasElement;
  stal: HTMLCanvasElement;
  arenaWall: HTMLCanvasElement;
  arenaFloor: Tex;
  cliff: HTMLCanvasElement;
  partySil: Record<Who, HTMLCanvasElement>;
  partyRim: Record<Who, HTMLCanvasElement>;
}

/* ---------- scene painters ---------- */

const R = (c: Ctx, col: string | CanvasPattern, x: number, y: number, w: number, h: number) => {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/** A cluster of three crystal shards standing on (x, y), facets palette-cycled */
const shards = (c: Ctx, x: number, y: number, h: number, t: number) => {
  const one = (x0: number, hh: number, w: number, i: number) => {
    for (let j = 0; j < hh; j++) {
      const k = j / hh;
      const half = Math.max(0, Math.round(w * (j < hh * 0.25 ? j / (hh * 0.25) : 1) * 0.5));
      const yy = Math.round(y - hh + j);
      R(c, cyc(CRYS, i + 1, t, 3), x0 - half, yy, half, 1);
      R(c, cyc(CRYS, i + 3, t, 3), x0, yy, half + 1, 1);
      if (k > 0.3 && k < 0.5) R(c, '#ffffff', x0 - half, yy, 1, 1);
    }
  };
  one(Math.round(x - h * 0.6), Math.round(h * 1.2), Math.max(2, Math.round(h * 0.5)), 0);
  one(Math.round(x + h * 0.6), Math.round(h * 1.0), Math.max(2, Math.round(h * 0.45)), 2);
  one(Math.round(x), Math.round(h * 1.9), Math.max(3, Math.round(h * 0.7)), 1);
};

/* Title (0 .. 3.4): star, title, PRESS START, then the camera tilts down to the map */
const MAP_T0 = 2.7;
const MAP_T1 = 3.6;
const mapHor = (t: number) => lerp(300, 66, tween(t, MAP_T0, MAP_T1, ease.inOutCubic));

/** The star (motif): it hangs over the title, then glides down to rest above the cave */
const titleStar = (s: State, t: number, target: [number, number], lift: number) => {
  const c = s.px.c;
  {
    const grow = tween(t, 0.15, 1.1, ease.outBack);
    const pulse = 1 + Math.sin(t * 5) * 0.08;
    let x = 200;
    let y = 62 - lift;
    let R0 = 22 * grow * pulse;
    if (t > MAP_T0) {
      // it streaks down toward the cave on the map
      const k = tween(t, MAP_T0, MAP_T0 + 0.9, ease.inOutSine);
      x = lerp(200, target[0], k);
      y = lerp(62, target[1], k);
      R0 = lerp(22, 6, k);
    }
    // halo
    glow(c, x, y, R0 * 2.4, '#262050', 0.5);
    drawStar(s.px, x, y, R0, Math.sin(t * 1.5) * 0.08, t);
  }
};

const drawTitleSky = (s: State, t: number, hor: number, target: [number, number]) => {
  const c = s.px.c;
  const lift = 300 - hor; // how far the sky has scrolled up
  vGrad(c, 0, -lift * 0.5, LW, 300, NIGHT, 1);
  starfield(c, s.stars, t, STAR, 0, -lift * 0.5, Math.min(LH, hor));
  if (t <= MAP_T0) titleStar(s, t, target, lift);
  // title lettering
  const tk = tween(t, 0.7, 1.3, ease.outBack);
  if (tk > 0) {
    const y = lerp(-30, 104, tk) - lift;
    text(c, 'SAVE POINT', 200, y, BIG, 3, 0.5);
  }
  if (t > 1.5 && t < MAP_T0 + 0.3) {
    const pressed = t > 2.35;
    const blink = pressed ? Math.floor(t * 16) % 2 : Math.floor(t * 2.4) % 2;
    if (blink === 0) text(c, 'PRESS START', 200, 150 - lift, { fill: '#ffffff', outline: '#1a1440' }, 1, 0.5);
  }
};

/* World map (3.0 .. 6.9) */
const MAP_WALK0 = 3.4;
const MAP_WALK1 = 6.3;

const mapCam = (t: number) => {
  const k = tween(t, MAP_WALK0, MAP_WALK1, ease.inOutSine);
  const lead = pathAt(k);
  // heading follows the path direction, smoothed by sampling ahead
  const ahead = pathAt(Math.min(1, k + 0.12));
  const dx = ahead.p[0] - lead.p[0] + lead.d[0] * 6;
  const dy = ahead.p[1] - lead.p[1] + lead.d[1] * 6;
  const a = Math.atan2(dx, -dy) + Math.sin(t * 0.6) * 0.05;
  const back = lerp(74, 52, tween(t, 5.6, 6.6));
  const hor = mapHor(t);
  const cam: Cam7 = {
    x: lead.p[0] - Math.sin(a) * back,
    y: lead.p[1] + Math.cos(a) * back,
    a,
    h: lerp(34, 22, tween(t, 5.4, 6.7)),
    hor,
    f: 200,
  };
  return { cam, k, lead };
};

const drawMap = (s: State, t: number) => {
  const c = s.px.c;
  const { cam, k } = mapCam(t);
  // sky above the horizon is the title sky (it scrolled up)
  const cp = project7(cam, CAVE[0], CAVE[1]);
  const glint: [number, number] = cp ? [cp.x, cp.y - 30 * cp.s * 0.6 - 4] : [200, cam.hor];
  drawTitleSky(s, t, cam.hor, glint);
  if (cam.hor >= LH) {
    if (t > MAP_T0 && t < MAP_T0 + 0.9) titleStar(s, t, glint, 0);
    return { cam, k };
  }
  // horizon haze
  vGrad(c, 0, Math.round(cam.hor) - 12, LW, 13, ['#262466', '#3a3478', '#4a4a8a'], 1);
  const sea = SEA.map((q) => u32Of(q));
  const cycle = [0, 1, 2, 3].map((i) => sea[(i + Math.floor(t * 4)) % sea.length]);
  mode7(s.px, s.map, cam, { fog: '#3a3a7a', fogNear: 120, fogFar: 700, fogMax: 0.8, cycle });
  // moonlight colour math over the floor
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = '#8a92d8';
  c.fillRect(0, Math.floor(cam.hor) + 1, LW, LH);
  c.restore();
  // sprites: mountains, trees, the cave, clouds, the party
  type It = { z: number; draw: () => void };
  const its: It[] = [];
  for (const m of s.mapItems) {
    const p = project7(cam, m.u, m.v);
    if (!p || p.z > 900) continue;
    const img = m.k === 0 ? s.mountain : m.k === 1 ? s.tree : s.caveMtn;
    if (m.k === 1 && p.z < 26) continue;
    const hw = m.k === 1 ? 4.5 : 34;
    its.push({
      z: p.z,
      draw: () => {
        const sc = (hw * p.s) / (img.width / 2);
        const w = img.width * sc;
        const h = img.height * sc;
        if (h < 1) return;
        c.drawImage(img, Math.round(p.x - w / 2), Math.round(p.y - h + 1), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      },
    });
  }
  // party: Ren leads, Mira and Bo follow along the path
  const order: Who[] = ['ren', 'mira', 'bo'];
  order.forEach((who, i) => {
    const kk = tween(t, MAP_WALK0, MAP_WALK1, ease.inOutSine) - i * 0.022;
    const q = pathAt(Math.max(0, kk));
    const side = [0, -5, 5][i];
    const p = project7(cam, q.p[0] - q.d[1] * side, q.p[1] + q.d[0] * side);
    if (!p) return;
    const walking = t > MAP_WALK0 && t < MAP_WALK1 + 0.1;
    const fr = walking ? Math.floor(t * 8 + i) % 4 : 0;
    its.push({
      z: p.z,
      draw: () => {
        const img = s.chibi[who][fr];
        c.fillStyle = '#1a2a3a';
        c.fillRect(Math.round(p.x - 5), Math.round(p.y), 10, 1);
        spr(c, img, p.x, p.y + 1, 10, 25);
      },
    });
  });
  // clouds drifting low over the map
  for (let i = 0; i < 5; i++) {
    const u = 180 + i * 60 + Math.sin(i * 2.1) * 30 + t * 6;
    const v = 360 - i * 50;
    const p = project7(cam, u, v);
    if (!p || p.z < 20 || p.z > 600) continue;
    const img = s.clouds[i % s.clouds.length];
    its.push({
      z: p.z - 0.5,
      draw: () => {
        const sc = p.s * 0.9;
        const w = img.width * sc;
        const h = img.height * sc;
        c.save();
        c.globalAlpha = 0.85;
        c.drawImage(img, Math.round(p.x - w / 2), Math.round(p.y - h - 46 * p.s), Math.round(w), Math.round(h));
        c.restore();
      },
    });
  }
  its.sort((a, b) => b.z - a.z);
  for (const it of its) it.draw();
  if (t > MAP_T0 && t < MAP_T0 + 0.9) titleStar(s, t, glint, 0);
  // the star's glint, resting above the cave: it shows the way
  {
    if (cp && t > MAP_T0 + 0.88) {
      const tw = 0.7 + 0.3 * Math.sin(t * 7);
      glow(c, glint[0], glint[1], 10, '#2a2410', 0.3);
      drawStar(s.px, glint[0], glint[1], 5 + 2 * tw, 0, t);
    }
  }
  return { cam, k };
};

/* Cave (6.9 .. 9.2): side view, the party walks left toward the dark */
const CAVE_T0 = 6.85;
const caveCamX = (t: number) => 600 - 46 * Math.max(0, Math.min(t, 8.0) - CAVE_T0) - 10 * Math.max(0, t - 8.0);

const drawCave = (s: State, t: number) => {
  const c = s.px.c;
  const camX = caveCamX(t);
  const shake = t > 8.35 && t < 8.9 ? Math.round(Math.sin(t * 90) * 2) : 0;
  c.drawImage(s.caveBack, -Math.round(camX * 0.3) - 100, shake);
  // mid rock + crystals + torches
  const mo = Math.round(camX * 0.65);
  c.drawImage(s.caveMid, -mo, shake);
  for (const k of s.caveCrys) {
    const x = k.x - mo;
    if (x < -10 || x > LW + 10) continue;
    glow(c, x, k.y + shake - 2, k.s * 4, '#0a2a3a', 0.3);
    shards(c, x, k.y + shake + k.s, k.s, t);
  }
  for (const k of s.caveTorch) {
    const x = k.x - mo;
    if (x < -20 || x > LW + 20) continue;
    glow(c, x, k.y - 4 + shake, 30 + Math.sin(t * 13 + x) * 2, '#3a1a08', 0.25);
    R(c, '#3a2a20', x - 1, k.y + shake, 3, 10);
    R(c, '#5a4030', x - 2, k.y + shake, 5, 2);
    const fr = Math.floor(t * 12);
    for (let i = 0; i < 4; i++) {
      const h = 7 - i * 1.6 + ((fr + i) % 3) - 1;
      R(c, FLAME[(i + fr) % 4], x - 2 + (i % 2), k.y - h + shake, 4 - (i > 1 ? 2 : 0), h);
    }
  }
  // the boss waiting in the dark (to the left), eyes open
  {
    const bx = 120 - camX + 500;
    const by = 186 + shake;
    spr(c, s.bossDark, bx, by, 70, 145);
    const eyes = tween(t, 7.9, 8.2);
    if (eyes > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#3a0808';
      disc(c, bx + 17, by - 113, 5 * eyes);
      disc(c, bx + 25, by - 113, 5 * eyes);
      c.restore();
      R(c, '#ff3a3a', bx + 15, by - 114, 4, Math.max(1, Math.round(2 * eyes)));
      R(c, '#ff3a3a', bx + 23, by - 114, 4, Math.max(1, Math.round(2 * eyes)));
    }
    // the stolen crystal glows in its chest: the motif, held hostage
    const glow = 0.5 + 0.5 * Math.sin(t * 4);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = '#0a2030';
    disc(c, bx + 14, by - 69, 10 + glow * 4);
    c.restore();
    spr(c, s.gem[Math.floor(t * 8) % 8], bx + 14, by - 69, 7, 10);
  }
  // floor
  c.drawImage(s.caveFloor, -Math.round(camX) % 1000, 172 + shake);
  c.drawImage(s.caveFloor, (-Math.round(camX) % 1000) + 1000, 172 + shake);
  // party walking left (sprites face left)
  const order: Who[] = ['ren', 'mira', 'bo'];
  const walking = t < 8.0;
  order.forEach((who, i) => {
    const wx = 800 - 46 * Math.max(0, Math.min(t, 8.0) - CAVE_T0) - 10 * Math.max(0, t - 8.0) - 160 + i * 30;
    const x = wx - camX + 40;
    const fr = walking ? Math.floor(t * 8 + i * 2) % 8 : 0;
    const img = walking ? s.walk[who][fr] : s.party[who].idle;
    spr(c, img, x, 178 + shake, 26, 48);
  });
  // "!" over Ren
  if (t > 8.05 && t < 8.7) {
    const x = 800 - 46 * (8.0 - CAVE_T0) - 160 - camX + 40 - 4;
    const k = tween(t, 8.05, 8.15, ease.outBack);
    windowBox(c, x - 8, 104 - 6 * k, 15, 16, undefined, k);
    if (k > 0.8) text(c, '!', x - 3, 109 - 6 * k, { fill: '#ffd040', outline: '#1a0a20', bold: true });
  }
  // dripping water
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.9 + i * 0.27) % 1;
    const x = ((i * 97 + 40) % LW) | 0;
    R(c, '#8ac0ff', x, 30 + ph * 150, 1, 2);
  }
  // foreground stalactites
  c.drawImage(s.stal, -Math.round(camX * 1.4) % 1200 - 200, 0);
};

/* Battle (9.2 .. 14.8) */
const BOSS_X = 108;
const BOSS_Y = 168;
const SLOTS: Record<Who, [number, number]> = { mira: [326, 116], ren: [296, 138], bo: [334, 160] };
const HP: Record<Who, [number, number]> = { ren: [980, 174], mira: [760, 473], bo: [1450, 1044] };
const HIT_T = 10.25;

const drawBattleBack = (s: State, t: number, dark: number) => {
  const c = s.px.c;
  // wavy back wall (HDMA-style per-row offsets)
  for (let y = 0; y < 110; y++) {
    const off = Math.round(Math.sin(y * 0.18 + t * 2.4) * 1.5 * (1 - y / 140));
    c.drawImage(s.arenaWall, 0, y, LW, 1, off, y, LW, 1);
    if (off > 0) c.drawImage(s.arenaWall, 0, y, 1, 1, 0, y, off, 1);
  }
  // crystal clusters glowing in the wall
  for (let i = 0; i < 6; i++) {
    const x = 30 + i * 68;
    const y = 78 + (i % 2) * 18;
    glow(c, x, y - 4, 16, '#0a2232', 0.3);
    shards(c, x, y, 5 + (i % 3), t + i);
  }
  const cam: Cam7 = { x: 128 + Math.sin(t * 0.3) * 6, y: 210, a: Math.sin(t * 0.25) * 0.06, h: 28, hor: 106, f: 160 };
  const cycle = [0, 1].map((i) => u32Of(cyc(LAVA, i, t, 6)));
  mode7(s.px, s.arenaFloor, cam, { fog: '#1a1236', fogNear: 60, fogFar: 300, fogMax: 0.75, cycle });
  if (dark > 0) {
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = mix('#ffffff', '#1a1640', dark);
    c.fillRect(0, 0, LW, LH);
    c.restore();
  }
};

const dmgStyle: TextStyle = { fill: '#ffffff', outline: '#1a0a20', bold: true };
const dmgNumber = (c: Ctx, n: string, x: number, y: number, t: number, t0: number, st = dmgStyle, scale = 1) => {
  if (t < t0 || t > t0 + 1.1) return;
  const a = t - t0;
  const b = Math.abs(Math.sin(a * 9)) * Math.exp(-a * 5) * 12;
  text(c, n, x, y - b - Math.min(a, 0.2) * 20, st, scale, 0.5);
};

const drawBattle = (s: State, t: number) => {
  const c = s.px.c;
  // the special darkens the arena
  const dark = Math.min(tween(t, 12.45, 12.7), 1 - tween(t, 13.4, 13.9)) * 0.75;
  drawBattleBack(s, t, dark);
  if (dark > 0.1) starfield(c, s.stars, t, STAR, 0, 0, 104);

  const shake = (t > HIT_T && t < HIT_T + 0.4 ? Math.round(Math.sin(t * 80) * 3 * (1 - (t - HIT_T) / 0.4)) : 0) + (t > 13.15 && t < 13.75 ? Math.round(Math.sin(t * 95) * 4 * (1 - (t - 13.15) / 0.6)) : 0);
  const impact = t > 13.15 && t < 13.31;

  // boss
  const dying = seg(t, 13.75, 14.6);
  const bossPose: ArmPose = t > 9.75 && t < HIT_T ? 'raise' : t >= HIT_T && t < HIT_T + 0.5 ? 'slam' : 'idle';
  const breathe = Math.round(Math.sin(t * 2.2) * 1.2);
  const bx = BOSS_X + shake;
  const by = BOSS_Y + breathe;
  const hitFlash = t > 13.3 && t < 13.75 && Math.floor(t * 20) % 2 === 0;
  if (dying < 1) {
    const img = impact || hitFlash ? s.bossWhite[bossPose] : s.boss[bossPose];
    if (dying <= 0) {
      spr(c, img, bx, by, 70, 145);
      // lava cracks cycle
      if (!impact) spr(c, s.cracks[Math.floor(t * 8) % s.cracks.length], bx, by, 70, 145);
    } else {
      // melt: rows shear apart and vanish from the top down
      const top = by - 145;
      const cut = dying * 150;
      for (let y = 0; y < 150; y++) {
        if (y < cut) continue;
        const off = Math.round(Math.sin(y * 0.4 + t * 30) * 14 * dying);
        c.drawImage(s.bossWhite.idle, 0, y, 170, 1, bx - 70 + off, top + y, 170, 1);
      }
      // dust rising off the cut line
      for (let i = 0; i < 40; i++) {
        const x = bx - 60 + hash(i * 3.3) * 130;
        const y = top + cut - ((t * 60 + hash(i) * 40) % 40);
        R(c, i % 3 ? '#c8c0e0' : '#ffffff', x, y, 1, 1);
      }
    }
    // eyes
    if (!impact && dying <= 0) {
      R(c, cyc(['#ff3a3a', '#ff8a5a', '#ff3a3a', '#c02020'], 0, t, 5), bx + 15, by - 114, 4, 2);
      R(c, cyc(['#ff3a3a', '#ff8a5a', '#ff3a3a', '#c02020'], 0, t, 5), bx + 23, by - 114, 4, 2);
    }
  }
  // the crystal in the boss's chest (survives the boss)
  {
    const gx = bx + 14;
    let gy = by - 69;
    if (t > 14.0) {
      gy -= 12 * tween(t, 14.0, 14.6, ease.outCubic);
    }
    const glow = 0.5 + 0.5 * Math.sin(t * 4);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = '#0a2030';
    disc(c, gx, gy, 10 + glow * 4 + (t > 13.75 ? 8 : 0));
    c.restore();
    spr(c, impact ? tint(s.gem[0], '#ffffff') : s.gem[Math.floor(t * 8) % 8], gx, gy, 7, 10);
  }

  // party
  const order: Who[] = ['mira', 'ren', 'bo'];
  for (const who of order) {
    let [x, y] = SLOTS[who];
    let img = s.party[who].idle;
    const hurt = t > HIT_T + 0.05 && t < HIT_T + 0.5;
    if (hurt) {
      img = s.party[who].hurt;
      x += Math.round(6 * Math.sin(seg(t, HIT_T, HIT_T + 0.5) * Math.PI));
    }
    if (who === 'ren') {
      if (t > HIT_T + 0.5 && t < 12.35) img = s.party.ren.kneel;
      if (t >= 12.35 && t < 12.55) {
        img = s.party.ren.jump;
        y -= 200 * ease.inCubic(seg(t, 12.35, 12.55));
      }
      if (t >= 12.55 && t < 13.75) continue; // he is riding the star
      if (t >= 13.75 && t < 14.0) {
        img = s.party.ren.jump;
        y -= 120 * (1 - ease.outCubic(seg(t, 13.75, 14.0)));
      }
    }
    if (t > 14.6) img = s.party[who].win;
    const bob = img === s.party[who].idle ? Math.round(Math.sin(t * 3 + x) * 0.6) : 0;
    if (impact) img = tint(img, '#ffffff');
    if (hurt && Math.floor(t * 24) % 2 === 0) img = tint(img, '#ffffff');
    spr(c, img, x + shake, y + bob, 26, 48);
    // victory sparkle for Mira's staff
    if (who === 'mira' && t > 14.7) {
      for (let i = 0; i < 4; i++) {
        const a = t * 4 + (i * TAU) / 4;
        R(c, cyc(CRYS, i, t, 6), x - 10 + Math.cos(a) * 7, y - 44 + Math.sin(a) * 4, 1, 1);
      }
    }
  }

  // the boss's slam: shockwave across the floor + damage numbers
  if (t > HIT_T && t < HIT_T + 0.5) {
    const k = seg(t, HIT_T, HIT_T + 0.5);
    crisp(s.px, (q) => {
      q.strokeStyle = k < 0.5 ? '#ffe8a0' : '#ff8a3a';
      q.lineWidth = 3 * (1 - k) + 1;
      q.beginPath();
      q.ellipse(170, 170, 40 + k * 220, 8 + k * 30, 0, Math.PI * 1.02, Math.PI * 1.98, true);
      q.stroke();
    }, 0, 120, LW, 105);
  }
  dmgNumber(c, '806', SLOTS.ren[0], SLOTS.ren[1] - 52, t, HIT_T + 0.08);
  dmgNumber(c, '287', SLOTS.mira[0], SLOTS.mira[1] - 52, t, HIT_T + 0.14);
  dmgNumber(c, '406', SLOTS.bo[0], SLOTS.bo[1] - 52, t, HIT_T + 0.2);

  // the special: the star falls with Ren on it
  if (t > 12.55 && t < 13.3) {
    const k = tween(t, 12.55, 13.18, ease.inSine);
    const sx = lerp(380, bx + 14, k);
    const sy = lerp(-30, by - 69, k);
    const Rr = lerp(14, 46, k);
    // trail
    for (let i = 0; i < 16; i++) {
      const kk = Math.max(0, k - i * 0.03);
      const tx = lerp(380, bx + 14, kk) + Math.sin(i * 2.1 + t * 20) * 3;
      const ty = lerp(-30, by - 69, kk);
      R(c, cyc(GOLD, i, t, 10), tx, ty, Math.max(1, 4 - i * 0.2), Math.max(1, 4 - i * 0.2));
    }
    glow(c, sx, sy, Rr * 2, '#4a3a10', 0.45);
    drawStar(s.px, sx, sy, Rr, t * 3, t);
    if (!impact) spr(c, s.party.ren.thrust, sx + Rr * 0.3, sy - Rr * 0.2, 26, 48);
  }
  // impact frame: everything flips to black / white for a beat
  if (impact) {
    const inv = t > 13.23;
    c.save();
    c.globalCompositeOperation = inv ? 'difference' : 'source-over';
    if (!inv) {
      // black frame with white silhouettes already drawn: punch out everything else
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = '#000000';
      c.globalAlpha = 0.85;
      c.fillRect(0, 0, LW, LH);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      spr(c, s.bossWhite.idle, bx, by, 70, 145);
      drawStar(s.px, bx + 14, by - 69, 52, 0, t);
    } else {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, LW, LH);
    }
    c.restore();
  }
  // the burst after impact
  if (t > 13.25 && t < 14.2) {
    const k = seg(t, 13.25, 14.2);
    const cx = bx + 14;
    const cy = by - 69;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const rr = (k * 260 + i * 26) % 260;
      crisp(s.px, (q) => {
        q.strokeStyle = cyc(['#5a3a08', '#3a2a5a', '#5a4a10', '#2a3a5a'], i, t, 8);
        q.lineWidth = 6 * (1 - k) + 2;
        q.beginPath();
        q.arc(cx, cy, rr, 0, TAU);
        q.stroke();
      });
    }
    crisp(s.px, (q) => {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + 0.2;
        const r1 = 30 + k * 300;
        q.fillStyle = i % 2 ? '#4a3a10' : '#3a3a6a';
        q.beginPath();
        q.moveTo(cx + Math.cos(a - 0.05) * 20, cy + Math.sin(a - 0.05) * 20);
        q.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        q.lineTo(cx + Math.cos(a + 0.05) * 20, cy + Math.sin(a + 0.05) * 20);
        q.fill();
      }
    });
    c.fillStyle = mix('#000000', '#6a6a6a', 1 - k);
    c.fillRect(0, 0, LW, LH);
    c.restore();
  }
  // 9999
  if (t > 13.32 && t < 14.4) {
    const a = t - 13.32;
    const b = Math.abs(Math.sin(a * 8)) * Math.exp(-a * 4) * 20;
    text(c, '9999', bx + 10, by - 150 - b, BIG, 2, 0.5);
  }

  return { shake, bx, by };
};


/** Screen-fixed battle UI: it does not zoom or shake with the scene */
const drawBattleUI = (s: State, t: number, c: Ctx) => {
  // menus
  const showUi = t < 12.45 || t > 14.5;
  if (showUi) {
    const k = (t < 9.5 ? tween(t, 9.25, 9.5) : 1) * (1 - tween(t, 14.95, 15.15));
    windowBox(c, 2, 168, 120, 55, undefined, k);
    windowBox(c, 124, 168, 274, 55, undefined, k);
    if (k > 0.95) {
      text(c, 'HOLLOW KING', 10, 176, WHITE);
      const rows: Who[] = ['ren', 'mira', 'bo'];
      rows.forEach((who, i) => {
        const y = 176 + i * 15;
        const [mx, after] = HP[who];
        const hk = tween(t, HIT_T + 0.15 + i * 0.06, HIT_T + 0.6 + i * 0.06);
        const hp = Math.round(lerp(mx, after, hk));
        const low = hp < mx * 0.25;
        text(c, who.toUpperCase(), 134, y, WHITE);
        text(c, 'HP', 174, y, GREY);
        text(c, `${hp}`.padStart(4, ' '), 216, y, { fill: low ? '#ffd040' : '#ffffff', shadow: '#0a0a30' }, 1, 1);
        text(c, `/${mx}`, 218, y, GREY);
        // limit gauge
        const lim = who === 'ren' ? (t > 12.45 ? 0.05 : lerp(0.35, 1, tween(t, HIT_T + 0.3, 11.1))) : who === 'mira' ? 0.4 : 0.55;
        R(c, '#0a0a30', 300, y + 1, 90, 5);
        const full = lim >= 0.999;
        R(c, full ? cyc(['#ff5a5a', '#ffd040', '#5aff8a', '#5ac8ff', '#c85aff'], 0, t, 14) : '#e0a040', 301, y + 2, Math.round(88 * lim), 3);
        if (full && who === 'ren') text(c, 'LIMIT', 345, y - 1, { fill: '#ffffff', outline: '#a01a3a' }, 1, 0.5);
      });
    }
  }
  // command window, cursor to LIMIT, then STARFALL
  if (t > 11.0 && t < 12.45) {
    const k = tween(t, 11.0, 11.15, ease.outCubic);
    windowBox(c, 6, 100, 70, 64, undefined, k);
    if (k > 0.95) {
      const items = ['FIGHT', 'MAGIC', 'ITEM', 'LIMIT'];
      items.forEach((it, i) => text(c, it, 24, 108 + i * 13, i === 3 ? { fill: cyc(['#ffffff', '#ffd040', '#ff8a5a', '#ffd040'], 0, t, 10), shadow: '#0a0a30' } : WHITE));
      const sel = t < 11.35 ? 0 : t < 11.5 ? 1 : t < 11.65 ? 2 : 3;
      const blink = t > 11.85 && Math.floor(t * 14) % 2 === 0;
      if (!blink) {
        // pointing-hand cursor
        const cy = 108 + sel * 13;
        R(c, '#ffffff', 10, cy + 2, 8, 3);
        R(c, '#ffffff', 16, cy + 1, 4, 5);
        R(c, '#a0a0c0', 10, cy + 4, 9, 1);
        R(c, '#0a0a30', 9, cy + 1, 1, 5);
      }
    }
  }
  // limit cut-in band with the portrait
  if (t > 11.95 && t < 12.6) {
    const kin = tween(t, 11.95, 12.12, ease.outCubic);
    const kout = tween(t, 12.42, 12.6, ease.inCubic);
    const bh = Math.round(64 * kin * (1 - kout));
    const y0 = 62 + Math.round((64 - bh) / 2);
    if (bh > 0) {
      R(c, '#0a0820', 0, y0, LW, bh);
      R(c, '#ffd040', 0, y0, LW, 1);
      R(c, '#ffd040', 0, y0 + bh - 1, LW, 1);
      c.save();
      c.beginPath();
      c.rect(0, y0 + 1, LW, Math.max(0, bh - 2));
      c.clip();
      // speed lines
      for (let i = 0; i < 18; i++) {
        const yy = y0 + 3 + ((i * 23) % Math.max(1, bh - 4));
        const xx = LW - ((t * 1400 + i * 157) % (LW + 60));
        R(c, i % 2 ? '#2a2a6a' : '#4a3a8a', xx, yy, 40, 1);
      }
      const px = lerp(LW, 236, kin) - kout * 40;
      c.drawImage(s.portrait, Math.round(px), 62, 96, 64);
      text(c, 'STARFALL', lerp(-80, 40, kin), 88, BIG, 2);
      c.restore();
    }
  }
  // the opening mosaic flash comes from present(); the victory banner
  if (t > 14.75) {
    const k = tween(t, 14.75, 14.95, ease.outCubic) * (1 - tween(t, 15.0, 15.18));
    windowBox(c, 140, 8, 120, 34, undefined, k);
    if (k > 0.95) {
      text(c, 'VICTORY!', 200, 13, BIG, 1, 0.5);
      text(c, 'EXP 4800', 200, 28, WHITE, 1, 0.5);
    }
  }
};

/* Save + sunrise (15.4 .. 19) */
const drawSave = (s: State, t: number) => {
  const c = s.px.c;
  // the arena dims; the crystal floats forward and grows into the save crystal
  drawBattleBack(s, t, 0.9 * tween(t, 15.2, 16.0));
  const k = tween(t, 15.2, 16.1, ease.inOutCubic);
  const gx = lerp(BOSS_X + 14, 200, k);
  const gy = lerp(BOSS_Y - 81, 96, k) + Math.sin(t * 2.5) * 2;
  const fr = Math.floor(t * 7) % 8;
  const pulse = t > 16.75 ? tween(t, 16.75, 17.3, ease.outCubic) : 0;
  // radial glow
  const gr = lerp(14, 60, k) + pulse * 40;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = '#0a1a2a';
  disc(c, gx, gy, gr * 1.6);
  c.fillStyle = '#0e2a3a';
  disc(c, gx, gy, gr);
  c.fillStyle = '#16384a';
  disc(c, gx, gy, gr * 0.55);
  c.restore();
  // rising motes, palette cycled
  for (let i = 0; i < 22; i++) {
    const ph = (t * 0.5 + hash(i)) % 1;
    const x = gx + (hash(i * 3.7) - 0.5) * 90;
    const y = gy + 50 - ph * 110;
    R(c, cyc(CRYS, i, t, 6), x, y, 1, ph > 0.8 ? 1 : 2);
  }
  // pedestal ring on the floor
  crisp(s.px, (q) => {
    q.strokeStyle = cyc(CRYS, 2, t, 4);
    q.lineWidth = 1;
    q.beginPath();
    q.ellipse(gx, 150, 30 * k + 4, 6 * k + 1, 0, 0, TAU);
    q.stroke();
  }, 0, 130, LW, 40);
  const sc = k < 0.5 ? 1 : 2;
  const img = k < 0.5 ? s.gem[fr] : s.bigGem[fr];
  spr(c, img, gx, gy, img.width / 2, img.height / 2, k < 0.5 ? 1 + k * 2 : sc * (0.85 + 0.15 * k));
  // party, still in victory poses, at the sides
  for (const who of ['mira', 'ren', 'bo'] as Who[]) spr(c, s.party[who].win, SLOTS[who][0], SLOTS[who][1], 26, 48);
  return { gx, gy };
};


const drawSaveUI = (t: number, c: Ctx) => {
  // the save dialogue
  if (t > 16.1) {
    const wk = tween(t, 16.1, 16.25, ease.outCubic) * (1 - tween(t, 17.05, 17.2));
    windowBox(c, 100, 168, 200, 46, undefined, wk);
    if (wk > 0.95) {
      if (t < 16.75) {
        text(c, 'SAVE YOUR JOURNEY?', 200, 176, WHITE, 1, 0.5);
        text(c, 'YES', 170, 194, WHITE);
        text(c, 'NO', 222, 194, GREY);
        if (Math.floor(t * 4) % 2 === 0 || t > 16.55) {
          R(c, '#ffffff', 156, 196, 8, 3);
          R(c, '#ffffff', 162, 195, 4, 5);
        }
      } else {
        text(c, 'SAVED.', 200, 186, { fill: cyc(['#ffffff', '#c8fbff', '#8aeaff', '#c8fbff'], 0, t, 8), shadow: '#0a0a30' }, 1, 0.5);
      }
    }
  }
};

const SUN: [number, number] = [276, 128];
const drawSunrise = (s: State, t: number) => {
  const c = s.px.c;
  const k = tween(t, 17.3, 19, ease.outCubic);
  vGrad(c, 0, 0, LW, 150, DAWN, 1);
  // sun rising + its rays
  const sy = SUN[1] - k * 18;
  c.save();
  c.globalCompositeOperation = 'lighter';
  crisp(s.px, (q) => {
    q.fillStyle = dither(q, '#000000', '#2a1408', 0.5);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + t * 0.08;
      q.beginPath();
      q.moveTo(SUN[0], sy);
      q.lineTo(SUN[0] + Math.cos(a - 0.07) * 420, sy + Math.sin(a - 0.07) * 420);
      q.lineTo(SUN[0] + Math.cos(a + 0.07) * 420, sy + Math.sin(a + 0.07) * 420);
      q.fill();
    }
  }, 0, 0, LW, 150);
  c.restore();
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = '#3a1a10';
  disc(c, SUN[0], sy, 56);
  c.fillStyle = '#4a2a12';
  disc(c, SUN[0], sy, 36);
  c.restore();
  c.fillStyle = '#ffe080';
  disc(c, SUN[0], sy, 22);
  c.fillStyle = dither(c, '#ffe080', '#fff8d0', 0.5);
  disc(c, SUN[0] - 2, sy - 3, 15);
  // distant mountains
  crisp(s.px, (q) => {
    q.fillStyle = '#7a3a6a';
    q.beginPath();
    q.moveTo(0, 150);
    for (let x = 0; x <= LW; x += 20) q.lineTo(x, 132 - Math.abs(Math.sin(x * 0.019 + 1)) * 22 - (hash(x) - 0.5) * 6);
    q.lineTo(LW, 150);
    q.fill();
    q.fillStyle = '#5a2a5a';
    q.beginPath();
    q.moveTo(0, 152);
    for (let x = 0; x <= LW; x += 26) q.lineTo(x, 142 - Math.abs(Math.sin(x * 0.027 + 2.4)) * 14);
    q.lineTo(LW, 152);
    q.fill();
  }, 0, 90, LW, 70);
  // sea of clouds (palette-cycled bands)
  const CL = ['#ffb4a0', '#f08a8a', '#c86a8a', '#9a5a8e', '#f08a8a'];
  for (let y = 148; y < LH; y++) {
    const kk = (y - 148) / (LH - 148);
    for (let x = 0; x < LW; x += 6) {
      const i = Math.floor(kk * 3 + Math.sin(x * 0.04 + y * 0.3) * 0.8 + 0.5);
      R(c, cyc(CL, i, t, 2), x, y, 6, 1);
    }
  }
  // sun path on the clouds
  for (let i = 0; i < 9; i++) {
    const y = 150 + i * i * 0.9;
    const w = 10 + i * 3 + Math.sin(t * 5 + i) * 3;
    R(c, i % 2 ? '#ffe080' : '#fff8d0', SUN[0] - w / 2 + Math.sin(t * 3 + i) * 2, y, w, 1);
  }
  // birds crossing the light
  for (let i = 0; i < 3; i++) {
    const bx = 330 - (t - 17.3) * (16 + i * 4) + i * 22;
    const by = 92 + i * 7 + Math.sin(t * 2 + i) * 2;
    const up = Math.floor(t * 6 + i) % 2 === 0;
    R(c, '#2a1030', bx - 2, by + (up ? -1 : 1), 2, 1);
    R(c, '#2a1030', bx, by, 1, 1);
    R(c, '#2a1030', bx + 1, by + (up ? -1 : 1), 2, 1);
  }
  // cliff + party silhouettes facing the sun
  spr(c, s.cliff, 0, 225, 0, 90);
  const sil = s.partySil;
  const at: [Who, number, number][] = [
    ['bo', 74, 161],
    ['ren', 118, 158],
    ['mira', 160, 160],
  ];
  // warm rim light on the sun side, then the silhouette
  for (const [who, x, y] of at) spr(c, s.partyRim[who], x + 1, y, 26, 48);
  for (const [who, x, y] of at) spr(c, sil[who], x, y, 26, 48);
  // the star glint on the sun: the motif comes to rest
  const gl = 0.5 + 0.5 * Math.sin(t * 3);
  drawStar(s.px, SUN[0], sy, 12 + gl * 6, 0, t);
  // title bookend
  if (t > 17.95) {
    const tk = tween(t, 17.95, 18.4, ease.outBack);
    text(c, 'SAVE POINT', 200, lerp(-20, 22, tk), BIG, 2, 0.5);
    if (t > 18.35) text(c, 'GAME SAVED', 200, 46, { fill: '#fff0d0', outline: '#2a0e1a', spacing: 2 }, 1, 0.5);
  }
};

/* ---------- film ---------- */

export const pixelDungeonFilm: RisoFilm<State> = {
  id: 'pixel-dungeon',
  title: 'Save Point',
  caption: 'A tiny 16-bit quest: the title star leads a party of three to a cave, a boss, a limit break, and a sunrise worth saving.',
  theme: 'Games',
  motif: 'the glowing star / save crystal',
  series: '16-bit',
  mode: 'direct',
  duration: 19,
  paper: '#05041a',
  grain: 0,
  inks: [{ color: '#ffd050' }, { color: '#8aeaff' }, { color: '#2a5ab8' }, { color: '#d8383a' }, { color: '#7a4ac0' }],
  scenes: [
    { at: 0, label: 'Title' },
    { at: 3.0, label: 'World map' },
    { at: 6.85, label: 'The cave' },
    { at: 9.2, label: 'Boss battle' },
    { at: 15.2, label: 'Save point' },
  ],
  posterTime: 13.05,

  setup() {
    const rng = mulberry(4242);
    const px = makePx();
    const fig = (who: Who, p: Pose) => bake(52, 56, (q) => figure(q, LOOKS[who], p, 26, 31), { pal: PALS[who], outline: OUT });
    const party = {} as Record<Who, Record<string, HTMLCanvasElement>>;
    const walk = {} as Record<Who, HTMLCanvasElement[]>;
    const chibi = {} as Record<Who, HTMLCanvasElement[]>;
    const partySil = {} as Record<Who, HTMLCanvasElement>;
    const partyRim = {} as Record<Who, HTMLCanvasElement>;
    for (const who of ['ren', 'mira', 'bo'] as Who[]) {
      party[who] = {};
      for (const [k, p] of Object.entries(POSES[who])) party[who][k] = flipX(fig(who, p));
      walk[who] = Array.from({ length: 8 }, (_, i) => flipX(fig(who, walkPose(i / 8, who === 'bo' ? 0.1 : 0.06))));
      chibi[who] = [0, 1, 2, 3].map((f) => paintChibi(who, f));
      // the final silhouettes face right, toward the sun
      const salute: Pose =
        who === 'ren'
          ? { lean: 0.02, bob: 0, legF: [0.4, 0.15], legB: [-0.4, 0.15], armF: [2.45, 0.15], armB: [0.1, 0.6] }
          : who === 'bo'
            ? { lean: 0.05, bob: 0, legF: [0.45, 0.3], legB: [-0.45, 0.3], armF: [2.35, 0.5], armB: [0.5, 2.0] }
            : POSES.mira.idle;
      const f = fig(who, salute);
      partySil[who] = tint(f, '#1a0e24');
      partyRim[who] = tint(f, '#ff9a6a');
    }
    // silhouettes need their right-facing anchor flipped too
    const boss = { idle: paintBoss('idle'), raise: paintBoss('raise'), slam: paintBoss('slam') };
    const mapItems: { u: number; v: number; k: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI - Math.PI;
      const rr = 30 + rng() * 80;
      const u = CAVE[0] + Math.cos(a) * rr * 1.5;
      const v = CAVE[1] + 10 + Math.sin(a) * rr * 0.5;
      if (Math.abs(u - CAVE[0]) < 26 && Math.abs(v - CAVE[1]) < 20) continue;
      mapItems.push({ u, v, k: 0 });
    }
    for (let i = 0; i < 90; i++) {
      const u = 110 + rng() * 320;
      const v = 190 + rng() * 260;
      if (Math.abs(u - 272) < 26) continue;
      mapItems.push({ u, v, k: 1 });
    }
    mapItems.push({ u: CAVE[0], v: CAVE[1], k: 2 });
    const mid = paintCaveMid(rng);
    return {
      px,
      ui: makePx(),
      stars: Array.from({ length: 80 }, () => [rng() * LW, rng() * 300, rng()] as [number, number, number]),
      party,
      walk,
      chibi,
      boss,
      bossWhite: { idle: tint(boss.idle, '#ffffff'), raise: tint(boss.raise, '#ffffff'), slam: tint(boss.slam, '#ffffff') },
      bossDark: tint(boss.idle, '#0a0616'),
      cracks: paintCracks(),
      gem: Array.from({ length: 8 }, (_, i) => paintCrystal(12, 18, i)),
      bigGem: Array.from({ length: 8 }, (_, i) => paintCrystal(22, 34, i)),
      portrait: paintPortrait(),
      map: paintMap(rng),
      mountain: paintMountain(3, false),
      caveMtn: paintMountain(9, true),
      tree: paintTree(),
      clouds: [paintCloud(1), paintCloud(7)],
      mapItems,
      caveBack: paintCaveBack(rng),
      caveMid: mid.canvas,
      caveCrys: mid.crystals,
      caveTorch: mid.torches,
      caveFloor: paintCaveFloor(),
      stal: paintStalactites(rng),
      arenaWall: paintArenaWall(rng),
      arenaFloor: paintArenaFloor(),
      cliff: paintCliff(),
      partySil,
      partyRim,
    };
  },

  draw(r, t, s) {
    const px = s.px;
    const c = px.c;
    begin(px, '#05041a');

    /* title + world map */
    if (t < 6.9) {
      const { cam } = drawMap(s, t);
      // iris closes on the cave mouth
      if (t > 6.25) {
        const p = project7(cam, CAVE[0], CAVE[1]);
        const cx = p ? p.x : 200;
        const cy = p ? p.y - 6 : 110;
        iris(c, cx, cy, lerp(260, 3, tween(t, 6.25, 6.85, ease.inOutSine)));
      }
      const zoom = t < MAP_T0 ? lerp(1.15, 1, tween(t, 0, 1.4, ease.outCubic)) : 1;
      present(r, px, { zoom, zx: 200, zy: 80 });
      return;
    }

    /* cave */
    if (t < 9.2) {
      drawCave(s, t);
      if (t < 7.3) iris(c, 250, 150, lerp(3, 260, tween(t, 6.9, 7.3, ease.inOutSine)));
      // swirl into battle
      const sw = tween(t, 8.55, 9.2, ease.inCubic);
      if (sw > 0.8) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = mix('#000000', '#ffffff', (sw - 0.8) * 5);
        c.fillRect(0, 0, LW, LH);
        c.restore();
      }
      const zoom = 1 + 0.55 * tween(t, 7.95, 8.5, ease.inOutCubic) + 0.4 * sw;
      present(r, px, {
        zoom,
        zx: lerp(200, 140, tween(t, 7.95, 8.5)),
        zy: lerp(112, 80, tween(t, 7.95, 8.5)),
        mosaic: 1 + Math.round(sw * 12),
        wave: sw > 0 ? (y) => Math.sin(y * 0.12 + t * 20) * sw * 30 : undefined,
      });
      return;
    }

    /* battle */
    if (t < 15.2) {
      const b = drawBattle(s, t);
      // mosaic resolves into the battle
      const m = t < 9.6 ? Math.round(lerp(12, 1, tween(t, 9.2, 9.6))) : 1;
      // camera: wide, push to the boss on its attack, to Ren for the limit, out for the special
      let zoom = 1;
      let zx = 200;
      let zy = 112;
      const atk = Math.min(tween(t, 9.7, 10.0), 1 - tween(t, 10.6, 10.9));
      zoom += 0.3 * atk;
      zx = lerp(zx, 150, atk);
      zy = lerp(zy, 100, atk);
      const lim = Math.min(tween(t, 10.9, 11.2), 1 - tween(t, 11.9, 12.1));
      zoom += 0.35 * lim;
      zx = lerp(zx, 260, lim);
      zy = lerp(zy, 130, lim);
      const sp = Math.min(tween(t, 13.0, 13.15), 1 - tween(t, 13.4, 13.8));
      zoom += 0.25 * sp;
      zx = lerp(zx, b.bx + 14, sp);
      zy = lerp(zy, b.by - 69, sp);
      const vic = tween(t, 14.6, 15.2, ease.inOutSine);
      zoom += 0.2 * vic;
      zx = lerp(zx, 250, vic);
      zy = lerp(zy, 110, vic);
      present(r, px, { mosaic: m, zoom, zx, zy });
      clearPx(s.ui);
      drawBattleUI(s, t, s.ui.c);
      present(r, s.ui);
      return;
    }

    /* save crystal, then the sunrise */
    if (t < 17.3) {
      const g = drawSave(s, t);
      // the crystal's light swells to fill the screen
      const fill = tween(t, 16.95, 17.3, ease.inCubic);
      if (fill > 0) {
        c.fillStyle = dither(c, '#8aeaff', '#ffffff', 0.5);
        disc(c, g.gx, g.gy, fill * 280 + 6);
        c.fillStyle = '#ffffff';
        disc(c, g.gx, g.gy, fill * 270);
      }
      const zk = tween(t, 15.2, 16.4, ease.inOutSine);
      const zoom = lerp(1.2, 1.35, zk);
      present(r, px, { zoom, zx: lerp(250, g.gx, zk), zy: lerp(110, g.gy + 10, zk) });
      clearPx(s.ui);
      drawSaveUI(t, s.ui.c);
      present(r, s.ui);
      return;
    }
    drawSunrise(s, t);
    // white glare collapses into the sun
    const glare = 1 - tween(t, 17.3, 17.9, ease.outCubic);
    if (glare > 0) {
      const gy = SUN[1] - 18 * tween(t, 17.3, 19, ease.outCubic);
      const gr = 24 + glare * 380;
      c.fillStyle = dither(c, '#fff8d0', '#ffffff', 0.5);
      disc(c, SUN[0], gy, gr);
      c.fillStyle = '#ffffff';
      disc(c, SUN[0], gy, gr * 0.86);
    }
    present(r, px, { zoom: lerp(1.25, 1, tween(t, 17.3, 18.1, ease.inOutCubic)), zx: SUN[0], zy: 120 });
  },
};
