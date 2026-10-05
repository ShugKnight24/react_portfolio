import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import { TAU, circlePts, clamp, ease, hash, lerp, morph, morphPair, mulberry, seg, tween, type Pt } from '../riso/kit';
import {
  POP,
  REG,
  posterFinish,
  balloon,
  boom,
  brush,
  burstPts,
  caption,
  circPath,
  dotField,
  dots,
  drop,
  ellPath,
  eye,
  figure,
  focusLines,
  group,
  inked,
  keyline,
  letter,
  mix,
  panel,
  plate,
  polyP,
  rectPath,
  rgba,
  rrPath,
  shake,
  smoothP,
  speedLines,
  thought,
  type Look,
  type Pose,
} from '../styles/popart';

/*
 * Deploy Friday: the status light is the motif. Friday 4:59 PM, a sweaty close-up behind the
 * glasses; the camera tilts down the page to a trembling finger over Enter; the panel pulls back
 * into a strip of pipeline panels whose lights go green one by one until PROD turns red; we dive
 * into the red light and it becomes the alarm of a glitch monster made of error dialogs; it
 * swallows the frame, the page slashes open on our hero striking Enter (KAPOW), the burst cools
 * into a green dashboard light, and the light grows into the sunset he walks off into.
 */

const DUR = 19;

/* timing */
const T_TILT0 = 2.4;
const T_TILT1 = 3.15;
const T_PRESS = 4.05;
const T_OUT0 = 4.35;
const T_OUT1 = 5.25;
const T_PAN1 = 7.35;
const T_LIGHT = [4.15, 5.55, 6.35, 7.15] as const;
const T_RED = 7.15;
const T_DIVE0 = 7.55;
const T_S3 = 8.6;
const T_LUNGE0 = 11.1;
const T_S4 = 11.8;
const T_WIND1 = 12.38;
const T_HIT = 12.5;
const T_DASH0 = 13.45;
const T_DASH1 = 13.95;
const T_SUN0 = 14.55;
const T_SUN1 = 15.35;

/* page layout for scenes 1-2: panels 1520 x 820 with 40 px gutters */
const PW = 1520;
const PH = 820;
const STEP = 1560;
const ROW2 = 860;
const LIGHT: Pt = [1400, 190];

const SKIN_BASE = '#fde4cb';
const SKIN_DOT = '#ec8a76';

const HERO: Look = {
  skin: POP.skin,
  top: POP.cyan,
  topKind: 'hoodie',
  bottom: POP.blue,
  bottomKind: 'pants',
  shoe: POP.red,
  hair: POP.black,
  glasses: true,
  beard: true,
  lw: 3.4,
};

const SIL = '#1b1530';
const HERO_SIL: Look = {
  skin: SIL,
  top: SIL,
  topKind: 'hoodie',
  bottom: SIL,
  bottomKind: 'pants',
  shoe: SIL,
  hair: SIL,
  glasses: true,
  beard: true,
  lw: 2.6,
};

interface Dialog {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  label: string;
  from: Pt;
  delay: number;
}

interface State {
  monster: HTMLCanvasElement;
  dialogs: Dialog[];
  sky: HTMLCanvasElement;
  burstA: Pt[];
  circB: Pt[];
}

const LABELS = ['ERROR 500', 'NULL', '404', 'TIMEOUT', 'SEGFAULT', 'NAN', 'UNDEFINED', 'OOM', '502', 'STACK OVERFLOW', 'FATAL', 'PANIC', 'ERR', '503'];

/* ---------- small drawing bits ---------- */

const W2 = (c: Ctx, fn: () => void) => {
  c.save();
  fn();
  c.restore();
};

const logLerp = (a: number, b: number, k: number) => Math.exp(lerp(Math.log(a), Math.log(b), k));

const lightColor = (state: number) => (state === 2 ? POP.green : state === 3 ? POP.red : state === 1 ? POP.yellow : POP.grey);

/** Status light: black bezel, coloured lens, glint; state 0 off, 1 pending, 2 ok, 3 fail */
const statusLight = (c: Ctx, x: number, y: number, r: number, state: number, pulse: number, col?: string, glint = 1) => {
  const color = col ?? lightColor(state);
  if (state >= 2 || pulse > 0) {
    // glow rays
    const rays = new Path2D();
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + pulse * 0.4;
      const r0 = r * 1.35;
      const r1 = r * (1.75 + 0.25 * Math.sin(pulse * 6 + i));
      rays.moveTo(x + Math.cos(a - 0.08) * r0, y + Math.sin(a - 0.08) * r0);
      rays.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      rays.lineTo(x + Math.cos(a + 0.08) * r0, y + Math.sin(a + 0.08) * r0);
      rays.closePath();
    }
    inked(c, rays, color, r * 0.04);
  }
  inked(c, circPath(x, y, r * 1.28), POP.black, 0);
  inked(c, circPath(x, y, r), color, r * 0.08);
  if (glint > 0) {
    c.save();
    c.globalAlpha = glint;
    c.fillStyle = POP.white;
    c.fill(ellPath(x - r * 0.38, y - r * 0.42, r * 0.26, r * 0.15, -0.7));
    c.fill(circPath(x - r * 0.05, y - r * 0.62, r * 0.07));
    c.restore();
  }
  if (state === 2 && glint > 0) {
    const ck = new Path2D();
    brush(
      [
        [x - r * 0.42, y + r * 0.02],
        [x - r * 0.12, y + r * 0.34],
        [x + r * 0.45, y - r * 0.36],
      ],
      r * 0.22,
      ck,
      0.3,
      0.4
    );
    c.fillStyle = POP.white;
    c.fill(ck);
  }
};

/** A keycap seen from above-front: top face, deep front side, label */
const keycap = (c: Ctx, x: number, y: number, w: number, h: number, depth: number, label: string, size: number, press = 0, face: string = POP.cream) => {
  const d = depth * (1 - press * 0.7);
  const yy = y + depth - d;
  const side = rrPath(x - 4, yy + 8, w + 8, h + d, 18);
  inked(c, side, mix(face, POP.navy, 0.35), 4);
  const top = rrPath(x, yy, w, h, 16);
  inked(c, top, face, 4);
  W2(c, () => {
    c.clip(top);
    c.fillStyle = dots(c, rgba(POP.cyan, 0.35), 12, 2.4);
    c.fill(rrPath(x, yy + h * 0.55, w, h, 16));
    c.fillStyle = rgba(POP.white, 0.8);
    c.fill(rrPath(x + 10, yy + 8, w * 0.4, 8, 4));
  });
  if (label) letter(c, label, x + w / 2, yy + h / 2 - size / 2, size, 0.5, POP.black, 0.16, w);
  return yy;
};

/* ---------- scene 1: the eyes ---------- */

const drawFace = (c: Ctx, t: number) => {
  panel(
    c,
    40,
    40,
    PW,
    PH,
    () => {
      c.fillStyle = SKIN_BASE;
      c.fillRect(40, 40, PW, PH);
      c.fillStyle = dots(c, SKIN_DOT, 14, 2.7);
      c.fillRect(40, 40, PW, PH);
      // cheek / nose shadows in denser dots
      const sh = new Path2D();
      sh.moveTo(810, 520);
      sh.bezierCurveTo(850, 620, 860, 720, 830, 800);
      sh.lineTo(900, 870);
      sh.lineTo(960, 870);
      sh.bezierCurveTo(900, 760, 880, 620, 810, 520);
      c.fillStyle = dots(c, POP.red, 14, 4.2);
      c.fill(sh);
      c.fill(ellPath(1500, 640, 160, 320, 0.1));
      c.fill(ellPath(100, 640, 160, 320, -0.1));
      // hair fringe across the top
      const hair = new Path2D();
      hair.moveTo(20, 20);
      hair.lineTo(1580, 20);
      hair.lineTo(1580, 230);
      for (let i = 0; i <= 14; i++) {
        const x = 1580 - (i / 14) * 1560;
        const y = 190 + Math.sin(i * 1.7) * 26 + (i % 2 ? 40 : -10) - Math.abs(i - 7) * 4;
        hair.lineTo(x, y);
      }
      hair.closePath();
      inked(c, hair, POP.black, 0);
      const hl = new Path2D();
      for (let i = 0; i < 9; i++) {
        const x = 160 + i * 160 + hash(i) * 40;
        brush(
          [
            [x, 60],
            [x + 30, 110],
            [x + 40, 160],
          ],
          16,
          hl,
          0.8,
          1
        );
      }
      c.fillStyle = POP.blue;
      c.fill(hl);
      // eyes
      const look: Pt = t < 1.6 ? [0.25, -0.05] : [lerp(0.25, 0.05, tween(t, 1.6, 2.0)), lerp(-0.05, 1, tween(t, 1.6, 2.0))];
      const blink = Math.max(0, 1 - Math.abs(t - 1.0) / 0.09);
      const lid = Math.max(blink, tween(t, 1.6, 2.0) * 0.35);
      const tremble = Math.sin(t * 40) * 0.02 * seg(t, 0.4, 2);
      for (const side of [-1, 1]) {
        W2(c, () => {
          c.translate(800 + side * 270, 520);
          c.scale(side * 150, 150);
          eye(c, { look: [look[0] * side, look[1]], lid, brow: -0.28 + tremble, browTilt: 0.35, iris: POP.cyan });
        });
      }
      // glasses: thick frames, tinted lenses with glints and a reflected terminal
      const lens = (cx: number) => rrPath(cx - 205, 395, 410, 270, 70);
      for (const side of [-1, 1]) {
        const cx = 800 + side * 270;
        const lp = lens(cx);
        W2(c, () => {
          c.clip(lp);
          c.fillStyle = rgba(POP.cyan, 0.13);
          c.fill(lp);
          c.fillStyle = rgba(POP.white, 0.55);
          const g = new Path2D();
          const gx = cx - 150 + side * 10;
          g.moveTo(gx, 395);
          g.lineTo(gx + 60, 395);
          g.lineTo(gx - 80, 665);
          g.lineTo(gx - 140, 665);
          g.closePath();
          g.moveTo(gx + 95, 395);
          g.lineTo(gx + 120, 395);
          g.lineTo(gx - 20, 665);
          g.lineTo(gx - 45, 665);
          g.closePath();
          c.fill(g);
          // terminal reflection
          const rx = cx + 60;
          const ry = 560;
          c.fillStyle = rgba(POP.navy, 0.55);
          c.fill(rrPath(rx, ry, 120, 76, 8));
          c.fillStyle = rgba(POP.green, 0.9);
          for (let i = 0; i < 4; i++) c.fillRect(rx + 12, ry + 12 + i * 15, 30 + hash(i + side) * 70, 6);
        });
        keyline(c, lp, 20);
      }
      const bridge = new Path2D();
      bridge.moveTo(675, 470);
      bridge.quadraticCurveTo(800, 430, 925, 470);
      keyline(c, bridge, 18);
      const arms = new Path2D();
      arms.moveTo(325, 470);
      arms.lineTo(40, 440);
      arms.moveTo(1475, 470);
      arms.lineTo(1560, 460);
      keyline(c, arms, 16);
      // nose
      const nose = new Path2D();
      brush(
        [
          [770, 560],
          [760, 680],
          [748, 790],
          [790, 830],
        ],
        12,
        nose
      );
      c.fillStyle = POP.black;
      c.fill(nose);
      // little sweat beads, then the big drop rolling down the temple
      drop(c, 240, 340 + Math.sin(t * 3) * 2, 13, 0.2, 3);
      drop(c, 1380, 300, 10, -0.2, 3);
      const grow = tween(t, 0.3, 1.0, ease.outBack);
      const roll = tween(t, 1.25, 2.6, ease.inCubic);
      if (grow > 0) {
        const dx = 1290 + roll * 40;
        const dy = 330 + roll * 520;
        if (roll > 0) {
          const trail = new Path2D();
          brush(
            [
              [1290, 330],
              [1290 + roll * 20, 330 + roll * 260],
              [dx, dy - 20],
            ],
            8,
            trail,
            0.6,
            0.2
          );
          c.fillStyle = rgba(POP.white, 0.8);
          c.fill(trail);
        }
        drop(c, dx, dy, 26 * grow, 0.15, 4);
      }
    },
    10
  );
  caption(c, 70, 64, 0, 74, ['FRIDAY, 4:59 P.M.'], 34, POP.yellow, 4, tween(t, 0.15, 0.45, ease.outBack));
};

/* ---------- the hand (scenes 1 and 4 share the key) ---------- */

/** Pointing hand, finger along +x, origin at the index knuckle */
const drawPointingHand = (c: Ctx, sleeve: string) => {
  const parts: [Path2D, string][] = [];
  const back = smoothP([
    [10, -36],
    [-60, -54],
    [-170, -60],
    [-250, -52],
    [-250, 76],
    [-150, 92],
    [-40, 98],
    [24, 70],
    [30, 10],
  ]);
  const finger = new Path2D();
  brush(
    [
      [-10, -10],
      [80, -6],
      [150, 4],
      [206, 16],
    ],
    54,
    finger,
    0,
    0.22
  );
  const curl = new Path2D();
  for (const [x, y, r] of [
    [18, 40, 30],
    [-6, 70, 29],
    [-34, 94, 26],
  ] as const)
    circPath(x, y, r, curl);
  const thumb = smoothP([
    [-150, 30],
    [-60, 16],
    [20, 18],
    [50, 30],
    [40, 46],
    [-40, 52],
    [-140, 64],
  ]);
  const cuff = smoothP([
    [-200, -76],
    [-480, -96],
    [-480, 120],
    [-200, 104],
    [-180, 20],
  ]);
  parts.push([curl, POP.skin], [back, POP.skin], [finger, POP.skin], [thumb, POP.skin], [cuff, sleeve]);
  group(c, parts, 4.5);
  // shading along the underside
  W2(c, () => {
    c.translate(REG[0], REG[1]);
    c.fillStyle = dots(c, POP.skinShade, 10, 2.6);
    c.fill(smoothP([[-200, 60], [-60, 70], [30, 64], [40, 110], [-200, 110]]));
    c.fill(smoothP([[40, 10], [150, 20], [205, 30], [150, 34], [40, 26]]));
    c.fillStyle = dots(c, mix(sleeve, POP.navy, 0.4), 10, 2.6);
    c.fill(smoothP([[-200, 40], [-480, 50], [-480, 120], [-200, 104]]));
  });
  const ink = new Path2D();
  // nail
  const nail = smoothP([
    [160, -6],
    [196, 0],
    [206, 10],
    [192, 12],
    [162, 6],
  ]);
  W2(c, () => {
    c.fillStyle = mix(POP.skin, POP.white, 0.5);
    c.fill(nail);
    keyline(c, nail, 2.5);
  });
  // knuckle creases, tendons, thumb nail, cuff folds
  brush([[78, -26], [84, -16], [80, -6]], 4, ink);
  brush([[140, -16], [146, -6], [142, 2]], 3.5, ink);
  brush([[-150, -40], [-60, -32], [0, -26]], 3, ink, 1, 1);
  brush([[-150, -20], [-70, -10], [0, -4]], 2.5, ink, 1, 1);
  brush([[20, 22], [40, 28]], 3, ink);
  brush([[-230, -70], [-260, 0], [-238, 90]], 5, ink);
  brush([[-320, -80], [-300, -10], [-330, 60]], 4, ink);
  brush([[-400, -60], [-380, 20]], 4, ink);
  c.fillStyle = POP.black;
  c.fill(ink);
};

/** Keyboard close-up with the ENTER key; press 0..1. Returns the ENTER key's top y */
const drawKeyboard = (c: Ctx, press: number) => {
  c.fillStyle = POP.navy;
  c.fillRect(-100, -100, 1800, 1100);
  c.fillStyle = dots(c, POP.blue, 16, 4.5);
  c.fillRect(-100, -100, 1800, 1100);
  W2(c, () => {
    c.translate(800, 470);
    c.rotate(-0.07);
    c.translate(-800, -470);
    const keys: [number, number, number, string][] = [
      [120, 230, 170, 'O'],
      [310, 230, 170, 'P'],
      [500, 230, 170, '['],
      [690, 230, 170, ']'],
      [880, 230, 260, '\\'],
      [1160, 230, 260, 'DEL'],
      [-60, 430, 170, 'L'],
      [130, 430, 170, ';'],
      [320, 430, 170, "'"],
      [70, 630, 540, 'SHIFT'],
      [630, 630, 170, '/'],
      [1420, 430, 260, 'HOME'],
      [1420, 630, 260, 'END'],
    ];
    for (const [x, y, w, l] of keys) keycap(c, x, y, w, 160, 34, l, 40);
  });
  let topY = 0;
  W2(c, () => {
    c.translate(800, 470);
    c.rotate(-0.07);
    c.translate(-800, -470);
    topY = keycap(c, 520, 410, 860, 180, 46, '', 0, press, POP.cream);
    letter(c, 'ENTER', 860, topY + 64, 58, 0.5, POP.black, 0.16, 2);
    const ar = new Path2D();
    brush([[1180, topY + 70], [1180, topY + 110], [1080, topY + 110]], 12, ar, 0.1, 0.1);
    polyP([[1060, topY + 110], [1090, topY + 88], [1090, topY + 132]], true, ar);
    c.fillStyle = POP.black;
    c.fill(ar);
  });
  return topY;
};

const drawHandPanel = (c: Ctx, t: number) => {
  const press = tween(t, T_PRESS - 0.1, T_PRESS, ease.inQuint) * (1 - tween(t, T_PRESS + 0.25, T_PRESS + 0.6));
  panel(c, 40, 40, PW, PH, () => {
    drawKeyboard(c, press);
    // focus lines at the press
    const fl = seg(t, T_PRESS, T_PRESS + 0.5);
    if (fl > 0 && fl < 1) {
      c.globalAlpha = 1 - fl;
      focusLines(c, 950, 500, 330 + fl * 120, 1300, 70, Math.floor(t * 14), 0.012, POP.yellow);
      c.globalAlpha = 1;
    }
    // hand hovering, trembling, then pressing
    const tr = Math.sin(t * 47) * 3 + Math.sin(t * 31) * 2;
    const hover = 1 - tween(t, T_PRESS - 0.12, T_PRESS, ease.inCubic);
    const enter = tween(t, T_TILT0, T_TILT1 + 0.3, ease.outCubic);
    W2(c, () => {
      c.translate(678 + tr - (1 - enter) * 160 - hover * 30, 322 + tr * 0.6 - (1 - enter) * 140 - hover * 80);
      c.rotate(0.42);
      c.scale(1.5, 1.5);
      drawPointingHand(c, POP.cyan);
    });
    // tremble marks
    if (hover > 0.5) {
      const tm = new Path2D();
      const b = Math.floor(t * 10) % 2;
      for (const [x, y] of [
        [1010, 300],
        [1060, 350],
      ] as const)
        brush([[x + b * 6, y], [x + 20 + b * 6, y - 18]], 6, tm);
      brush([[860, 330], [880, 300]], 5, tm);
      c.fillStyle = POP.black;
      c.fill(tm);
    }
    // the other status light (commit)
    const st = t >= T_LIGHT[0] ? 2 : 1;
    statusLight(c, LIGHT[0], LIGHT[1], 70, st, st === 2 ? t : 0);
  });
  const ck = tween(t, T_PRESS, T_PRESS + 0.18, ease.outBack) * (1 - tween(t, T_OUT0 + 0.4, T_OUT0 + 0.6));
  if (ck > 0) {
    W2(c, () => {
      const bp = polyP(burstPts(560, 600, 90 * ck, 150 * ck, 12, 4));
      inked(c, bp, POP.yellow, 5);
    });
  }
};

/* ---------- scene 2: the pipeline strip ---------- */

const gearPath = (cx: number, cy: number, r: number, teeth: number, rot: number) => {
  const pts: Pt[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = rot + (i / (teeth * 4)) * TAU;
    const k = i % 4;
    const rr = k === 1 || k === 2 ? r : r * 0.8;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const p = polyP(pts);
  p.moveTo(cx + r * 0.25, cy);
  p.arc(cx, cy, r * 0.25, 0, TAU, true);
  return p;
};



const drawBuild = (c: Ctx, t: number) => {
  panel(c, 40, 40, PW, PH, () => {
    c.fillStyle = POP.cream;
    c.fillRect(40, 40, PW, PH);
    c.fillStyle = dots(c, rgba(POP.red, 0.55), 18, 4);
    c.fillRect(40, 40, PW, PH);
    const a = t * 1.6;
    inked(c, gearPath(620, 500, 250, 12, a), POP.yellow, 7);
    inked(c, gearPath(990, 320, 150, 8, -a * 1.6 + 0.2), POP.cyan, 6);
    inked(c, gearPath(1080, 640, 120, 7, -a * 2 + 0.4), POP.red, 6);
    W2(c, () => {
      c.fillStyle = dots(c, rgba(POP.orange, 0.9), 14, 3.4);
      c.fill(gearPath(620 + 10, 500 + 14, 250, 12, a));
    });
    inked(c, circPath(620, 500, 60), POP.black, 0);
    // motion arcs
    const arcs = new Path2D();
    for (let i = 0; i < 3; i++) {
      const aa = -a * 0.5 + i * 2.1;
      const pts: Pt[] = [];
      for (let j = 0; j <= 8; j++) {
        const q = aa + j * 0.08;
        pts.push([620 + Math.cos(q) * 300, 500 + Math.sin(q) * 300]);
      }
      brush(pts, 10, arcs, 1, 1);
    }
    c.fillStyle = POP.black;
    c.fill(arcs);
    const st = t >= T_LIGHT[1] ? 2 : 1;
    statusLight(c, LIGHT[0], LIGHT[1], 70, st, st === 2 ? t : t * 0.5);
  });
};

const drawTest = (c: Ctx, t: number) => {
  panel(c, 40, 40, PW, PH, () => {
    c.fillStyle = POP.white;
    c.fillRect(40, 40, PW, PH);
    c.fillStyle = dots(c, rgba(POP.cyan, 0.6), 18, 4);
    c.fillRect(40, 40, PW, PH);
    // clipboard
    W2(c, () => {
      c.translate(640, 480);
      c.rotate(-0.06);
      inked(c, rrPath(-230, -330, 460, 640, 26), POP.orange, 6);
      inked(c, rrPath(-190, -280, 380, 560, 8), POP.white, 4);
      inked(c, rrPath(-80, -360, 160, 70, 18), POP.grey, 5);
      for (let i = 0; i < 5; i++) {
        const y = -200 + i * 100;
        inked(c, rectPath(-150, y - 30, 60, 60), POP.white, 4);
        const ln = new Path2D();
        brush([[-60, y], [120, y]], 8, ln, 0.2, 0.6);
        c.fillStyle = POP.black;
        c.fill(ln);
        const k = tween(t, 5.7 + i * 0.13, 5.82 + i * 0.13, ease.outBack);
        if (k > 0) {
          const ck = new Path2D();
          brush(
            [
              [-150, y - 4],
              [-128, y + 22],
              [lerp(-128, -76, k), lerp(y + 22, y - 48, k)],
            ],
            14,
            ck,
            0.2,
            0.4
          );
          c.fillStyle = POP.green;
          c.fill(ck);
        }
      }
    });
    // beaker
    W2(c, () => {
      c.translate(1130, 560);
      const bk = smoothP([
        [-50, -200],
        [50, -200],
        [50, -80],
        [150, 160],
        [-150, 160],
        [-50, -80],
      ]);
      const liq = smoothP([
        [-95, 30 + Math.sin(t * 6) * 5],
        [95, 30 - Math.sin(t * 6) * 5],
        [150, 160],
        [-150, 160],
      ]);
      inked(c, bk, POP.white, 0);
      W2(c, () => {
        c.clip(bk);
        inked(c, liq, POP.green, 0);
        c.fillStyle = dots(c, rgba(POP.navy, 0.35), 12, 3);
        c.fill(liq);
      });
      keyline(c, bk, 6);
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.9 + i * 0.27) % 1;
        inked(c, circPath(-20 + i * 16 + Math.sin(ph * 9 + i) * 10, -200 - ph * 160, 10 + i * 3), POP.white, 3);
      }
    });
    const st = t >= T_LIGHT[2] ? 2 : t > 5.3 ? 1 : 0;
    statusLight(c, LIGHT[0], LIGHT[1], 70, st, st === 2 ? t : t * 0.5);
  });
};

const drawProd = (c: Ctx, t: number, lightK: number) => {
  const red = t >= T_RED;
  panel(c, 40, 40, PW, PH, () => {
    c.fillStyle = red ? POP.yellow : POP.cream;
    c.fillRect(40, 40, PW, PH);
    c.fillStyle = dots(c, rgba(red ? POP.red : POP.orange, 0.7), 18, 4.2);
    c.fillRect(40, 40, PW, PH);
    // server rack
    const sh = red ? shake(t, 4, 3) : ([0, 0] as Pt);
    W2(c, () => {
      c.translate(690 + sh[0], 470 + sh[1]);
      inked(c, rrPath(-210, -340, 420, 700, 20), POP.navy, 7);
      W2(c, () => {
        c.fillStyle = dots(c, POP.blue, 14, 3.6);
        c.fill(rrPath(-210, -340, 420, 700, 20));
      });
      for (let i = 0; i < 6; i++) {
        const y = -300 + i * 105;
        inked(c, rrPath(-170, y, 340, 80, 10), POP.black, 0);
        for (let j = 0; j < 3; j++) {
          const on = hash(i * 7 + j + Math.floor(t * 6)) > 0.35;
          const col = red ? POP.red : on ? POP.green : POP.blue;
          inked(c, circPath(-130 + j * 34, y + 40, 11), col, 0);
        }
        const sl = new Path2D();
        for (let k = 0; k < 5; k++) sl.rect(-10 + k * 30, y + 22, 14, 36);
        c.fillStyle = POP.navy;
        c.fill(sl);
      }
    });
    if (red) {
      // sparks and smoke
      const k = seg(t, T_RED, T_RED + 0.6);
      for (let i = 0; i < 3; i++) {
        const sp = polyP(burstPts(560 + i * 180, 170 - i * 20, 20, 50 + k * 30, 6, i + Math.floor(t * 8)));
        inked(c, sp, POP.yellow, 3);
      }
      for (let i = 0; i < 4; i++) {
        const sk = ease.outCubic(k);
        inked(c, circPath(620 + i * 90, 120 - sk * 60 - i * 10, 40 + sk * 30), POP.grey, 4);
      }
    }
    const st = red ? 3 : t > 6.4 ? 1 : 0;
    const flick = !red && t > 6.75 ? (Math.floor(t * 16) % 2 ? 3 : 1) : st;
    statusLight(c, LIGHT[0], LIGHT[1], 70, flick, red ? t * 2 : 0, undefined, 1 - lightK);
  });
};


/* ---------- the rest of the page around the strip ---------- */

const ROW3 = ROW2 * 2;

const drawClock = (c: Ctx, t: number) => {
  panel(c, 40, 40, PW, PH, () => {
    c.fillStyle = POP.cyan;
    c.fillRect(40, 40, PW, PH);
    c.fillStyle = dots(c, POP.blue, 18, 4.5);
    c.fillRect(40, 40, PW, PH);
    inked(c, circPath(800, 450, 330), POP.white, 12);
    inked(c, circPath(800, 450, 290), POP.cream, 4);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const tk = new Path2D();
      brush([[800 + Math.cos(a) * 250, 450 + Math.sin(a) * 250], [800 + Math.cos(a) * 280, 450 + Math.sin(a) * 280]], 14, tk, 0.1, 0.1);
      c.fillStyle = POP.black;
      c.fill(tk);
    }
    const tick = t > T_PRESS ? 1 : 0;
    const mins = 59 + tick;
    const ma = (mins / 60) * TAU - Math.PI / 2;
    const ha = ((4 + mins / 60) / 12) * TAU - Math.PI / 2;
    const hands = new Path2D();
    brush([[800, 450], [800 + Math.cos(ha) * 160, 450 + Math.sin(ha) * 160]], 30, hands, 0.1, 0.8);
    brush([[800, 450], [800 + Math.cos(ma) * 250, 450 + Math.sin(ma) * 250]], 20, hands, 0.1, 0.8);
    c.fillStyle = POP.black;
    c.fill(hands);
    inked(c, circPath(800, 450, 22), POP.red, 4);
  });
};

const drawCalendar = (c: Ctx) => {
  panel(c, 40, 40, PW, PH, () => {
    c.fillStyle = POP.yellow;
    c.fillRect(40, 40, PW, PH);
    c.fillStyle = dots(c, rgba(POP.orange, 0.9), 18, 5);
    c.fillRect(40, 40, PW, PH);
    inked(c, circPath(800, 620, 230), POP.orange, 8);
    // window blinds slicing the late sun
    const bl = new Path2D();
    for (let y = 80; y < 860; y += 64) bl.rect(40, y, PW, 22);
    c.fillStyle = POP.cream;
    c.fill(bl);
    c.strokeStyle = POP.black;
    c.lineWidth = 4;
    c.stroke(bl);
    inked(c, rectPath(770, 40, 24, PH), POP.black, 0, 0);
  });
};

const drawDoor = (c: Ctx) => {
  panel(c, 40, 40, PW, PH, () => {
    c.fillStyle = POP.cream;
    c.fillRect(40, 40, PW, PH);
    c.fillStyle = dots(c, rgba(POP.cyan, 0.6), 18, 4.5);
    c.fillRect(40, 40, PW, PH);
    inked(c, rectPath(980, 160, 380, 700), POP.blue, 8);
    inked(c, rectPath(1020, 200, 300, 660), POP.orange, 6);
    inked(c, circPath(1280, 540, 16), POP.yellow, 4);
    inked(c, rrPath(1060, 70, 220, 70, 8), POP.green, 5);
  });
};


const drawAlertPanel = (c: Ctx, t: number, seed: number) => {
  panel(c, 40, 40, PW, PH, () => {
    const red = t >= T_RED;
    c.fillStyle = red ? POP.red : POP.cream;
    c.fillRect(40, 40, PW, PH);
    c.fillStyle = dots(c, rgba(red ? POP.yellow : POP.cyan, 0.7), 18, 4.5);
    c.fillRect(40, 40, PW, PH);
  });
};

const LOGS: [number, string, number][] = [
  [T_LIGHT[0], '> GIT PUSH ORIGIN MAIN', 0],
  [T_LIGHT[1], '> BUILD OK IN 42S', 1],
  [T_LIGHT[2], '> 1204 TESTS PASSED', 2],
  [6.6, '> DEPLOYING TO PROD...', 3],
  [T_RED, '> ERROR 500: EVERYTHING', 3],
];

const drawLogs = (c: Ctx, t: number) => {
  panel(c, 40, 40, STEP * 5 - 40, PH, () => {
    c.fillStyle = POP.navy;
    c.fillRect(40, 40, STEP * 5, PH);
    c.fillStyle = dots(c, POP.blue, 18, 4);
    c.fillRect(40, 40, STEP * 5, PH);
    LOGS.forEach(([at, txt, col], i) => {
      if (t < at) return;
      const red = txt.startsWith('> ERROR');
      const y = red ? 300 : 120 + (i % 2) * 70;
      c.fillStyle = red ? POP.red : POP.green;
      for (let j = 0; j < 3; j++) c.fillRect(120 + col * STEP, y + j * 26, (txt.length * 30) * (0.5 + hash(i * 3 + j) * 0.5), 14);
    });
    if (Math.floor(t * 3) % 2) c.fillStyle = POP.green, c.fillRect(120 + 3 * STEP + 1100, 300, 40, 70);
  });
};

/* ---------- scene 3: the glitch monster ---------- */

const MON_W = 1000;
const MON_H = 820;

const monsterBody = (): Path2D => {
  // a hulking blob with spikes along the back and two raised clawed arms
  const pts: Pt[] = [];
  const n = 90;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const top = Math.sin(a) < 0 ? 1 : 0;
    const spike = top * (i % 6 === 0 ? 70 : i % 6 === 3 ? 30 : 0) * Math.pow(-Math.sin(a), 0.6);
    pts.push([500 + Math.cos(a) * (300 + spike * 0.3), 470 + Math.sin(a) * (260 + (top ? 40 : 0)) + -spike]);
  }
  const p = polyP(pts);
  for (const side of [-1, 1]) {
    brush(
      [
        [500 + side * 230, 420],
        [500 + side * 360, 320],
        [500 + side * 420, 170],
        [500 + side * 430, 110],
      ],
      120,
      p,
      0,
      0.4
    );
    // horns
    polyP(
      [
        [500 + side * 90, 220],
        [500 + side * 180, 40],
        [500 + side * 170, 230],
      ],
      true,
      p
    );
  }
  return p;
};

const buildMonster = (r: Riso, dialogs: Dialog[]) => {
  const { canvas, ctx: c } = r.scratch(MON_W, MON_H);
  const body = monsterBody();
  c.lineJoin = 'round';
  c.strokeStyle = POP.yellow;
  c.lineWidth = 26;
  c.stroke(body);
  c.strokeStyle = POP.black;
  c.lineWidth = 12;
  c.stroke(body);
  c.fillStyle = POP.black;
  c.fill(body);
  W2(c, () => {
    c.clip(body);
    // scrolling error text baked as texture
    for (let i = 0; i < 26; i++) {
      const y = 30 + i * 30;
      letter(c, LABELS[i % LABELS.length] + ' ' + LABELS[(i * 5) % LABELS.length], 120 + hash(i) * 400, y, 16, 0, rgba(POP.red, 0.9), 0.16, i);
    }
  });
  // claws
  for (const side of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const bx = 500 + side * (400 + j * 26);
      const cl = polyP([
        [bx - 14, 110 - j * 6],
        [bx + side * 30 + (j - 1) * 30, 10 - j * 4],
        [bx + 16, 104 - j * 6],
      ]);
      c.fillStyle = POP.white;
      c.fill(cl);
      c.strokeStyle = POP.black;
      c.lineWidth = 4;
      c.stroke(cl);
    }
  }
  for (const d of dialogs) {
    W2(c, () => {
      c.translate(d.x, d.y);
      c.rotate(d.rot);
      errorBox(c, d.w, d.h, d.label);
    });
  }
  return canvas;
};

/** A little error dialog window centred on the origin */
const errorBox = (c: Ctx, w: number, h: number, label: string) => {
  const p = rectPath(-w / 2, -h / 2, w, h);
  c.fillStyle = POP.black;
  c.fillRect(-w / 2 + 6, -h / 2 + 8, w, h);
  c.fillStyle = POP.cream;
  c.fill(p);
  c.fillStyle = POP.blue;
  c.fillRect(-w / 2, -h / 2, w, 22);
  c.fillStyle = POP.red;
  c.fillRect(w / 2 - 22, -h / 2 + 3, 18, 16);
  c.strokeStyle = POP.black;
  c.lineWidth = 3;
  c.stroke(p);
  letter(c, 'X', w / 2 - 13, -h / 2 + 6, 10, 0.5, POP.white, 0.2, 1);
  const sz = Math.min(26, (w - 30) / Math.max(3, label.length * 0.95));
  letter(c, label, 4, -h / 2 + 22 + (h - 22) / 2 - sz / 2, sz, 0.5, POP.black, 0.17, label.length);
  // warning sign
  const tri = polyP([
    [-w / 2 + 16, -h / 2 + 22 + (h - 22) / 2 + 9],
    [-w / 2 + 28, -h / 2 + 22 + (h - 22) / 2 - 12],
    [-w / 2 + 40, -h / 2 + 22 + (h - 22) / 2 + 9],
  ]);
  c.fillStyle = POP.yellow;
  c.fill(tri);
  c.lineWidth = 2;
  c.stroke(tri);
};

const drawAlarm = (c: Ctx, t: number, dotIn: number) => {
  c.fillStyle = POP.red;
  c.fillRect(-400, -300, 2400, 1500);
  if (dotIn > 0) {
    c.globalAlpha = dotIn;
    c.fillStyle = dots(c, POP.deepRed, 22, 6.5);
    c.fillRect(-400, -300, 2400, 1500);
    c.globalAlpha = 1;
  }
  // sweeping beacon beams from the light at top centre
  const a = t * 3.2;
  const beams = new Path2D();
  for (const off of [0, Math.PI]) {
    const aa = a + off;
    beams.moveTo(800, 30);
    beams.lineTo(800 + Math.cos(aa - 0.22) * 2200, 30 + Math.abs(Math.sin(aa - 0.22)) * 2200);
    beams.lineTo(800 + Math.cos(aa + 0.22) * 2200, 30 + Math.abs(Math.sin(aa + 0.22)) * 2200);
    beams.closePath();
  }
  c.fillStyle = rgba(POP.yellow, 0.4 * dotIn);
  c.fill(beams);
  c.fillStyle = dots(c, rgba(POP.yellow, 0.9 * dotIn), 22, 7);
  c.fill(beams);
};

const drawBeacon = (c: Ctx, t: number, k: number) => {
  if (k <= 0) return;
  W2(c, () => {
    c.translate(800, 40 - (1 - k) * 160);
    inked(c, rrPath(-120, -10, 240, 50, 10), POP.grey, 5);
    const dome = new Path2D();
    dome.moveTo(-90, -10);
    dome.bezierCurveTo(-90, -150, 90, -150, 90, -10);
    dome.closePath();
    W2(c, () => {
      c.scale(1, -1);
      c.translate(0, -40);
      inked(c, dome, POP.red, 6);
      c.fillStyle = rgba(POP.white, 0.85);
      c.fill(ellPath(-30 + Math.sin(t * 3.2) * 40, -70, 14, 30, 0.3));
    });
  });
};

const drawMonster = (c: Ctx, s: State, t: number) => {
  const asm = seg(t, T_S3, T_S3 + 0.9);
  const lunge = tween(t, T_LUNGE0, T_S4, ease.inCubic);
  const breath = 1 + Math.sin(t * 5) * 0.015;
  const sc = lerp(0.82, 1, ease.outBack(asm)) * breath * logLerp(1, 9, lunge);
  const cx = 800;
  const cy = 520 + lunge * 120;
  W2(c, () => {
    c.translate(cx, cy);
    c.scale(sc, sc);
    c.translate(-MON_W / 2, -470);
    // glitch slices: the baked monster drawn in horizontal bands with jittered offsets
    const beat = Math.floor(t * 12);
    const bands = 9;
    const vis = ease.outCubic(asm);
    c.globalAlpha = clamp(asm * 3);
    for (let i = 0; i < bands; i++) {
      const y0 = (i / bands) * MON_H;
      const y1 = ((i + 1) / bands) * MON_H;
      const g = hash(i * 3.1 + beat) > 0.72 ? (hash(i + beat * 1.7) - 0.5) * 70 : 0;
      const off = g + (1 - vis) * (i % 2 ? 300 : -300);
      c.drawImage(s.monster, 0, (y0 / MON_H) * s.monster.height, s.monster.width, ((y1 - y0) / MON_H) * s.monster.height, off, y0, MON_W, y1 - y0);
    }
    c.globalAlpha = 1;
    // glitch bars
    if (hash(beat * 2.3) > 0.5) {
      c.fillStyle = rgba(POP.cyan, 0.8);
      c.fillRect(200 + hash(beat) * 300, 200 + hash(beat + 1) * 500, 260, 10);
      c.fillStyle = rgba(POP.yellow, 0.8);
      c.fillRect(300 + hash(beat + 2) * 300, 200 + hash(beat + 3) * 500, 180, 7);
    }
    // eyes
    const glow = 0.75 + 0.25 * Math.sin(t * 14);
    for (const side of [-1, 1]) {
      const e = polyP([
        [500 + side * 40, 300],
        [500 + side * 150, 250],
        [500 + side * 140, 320],
        [500 + side * 50, 330],
      ]);
      c.fillStyle = rgba(POP.yellow, glow);
      c.fill(circPath(500 + side * 95, 300, 70));
      inked(c, e, POP.yellow, 5, 0);
      c.fillStyle = POP.black;
      c.fill(ellPath(500 + side * 95, 300, 7, 18));
    }
    // maw: opens wider on the roar and the lunge
    const roar = 0.3 + 0.25 * tween(t, 9.7, 10.0, ease.outBack) * (1 - tween(t, 10.6, 11.0)) + lunge * 1.1;
    const mh = 40 + roar * 260;
    const maw = new Path2D();
    maw.moveTo(280, 430);
    maw.quadraticCurveTo(500, 430 - mh * 0.25, 720, 430);
    maw.quadraticCurveTo(500, 430 + mh * 1.4, 280, 430);
    maw.closePath();
    inked(c, maw, POP.deepRed, 6, 0);
    W2(c, () => {
      c.clip(maw);
      c.fillStyle = POP.black;
      c.fill(ellPath(500, 430 + mh * 0.6, 170, mh * 0.55));
      const teeth = new Path2D();
      for (let i = 0; i < 9; i++) {
        const x = 300 + i * 50;
        teeth.moveTo(x, 410);
        teeth.lineTo(x + 25, 470 + (i % 2) * 14);
        teeth.lineTo(x + 50, 410);
        const yb = 430 + mh * 1.0;
        teeth.moveTo(x + 10, yb + 40);
        teeth.lineTo(x + 35, yb - 20 - (i % 2) * 10);
        teeth.lineTo(x + 60, yb + 40);
      }
      c.fillStyle = POP.white;
      c.fill(teeth);
      c.strokeStyle = POP.black;
      c.lineWidth = 3;
      c.stroke(teeth);
    });
  });
};

const drawOverShoulder = (c: Ctx, t: number, k: number) => {
  if (k <= 0) return;
  const dy = (1 - ease.outCubic(k)) * 400;
  W2(c, () => {
    c.translate(300, 900 + dy);
    const sil = smoothP([
      [-360, 40],
      [-330, -150],
      [-230, -230],
      [-120, -250],
      [-100, -330],
      [-60, -430],
      [40, -460],
      [130, -420],
      [150, -320],
      [120, -250],
      [230, -220],
      [330, -140],
      [360, 40],
    ]);
    inked(c, sil, POP.navy, 6, 0);
    W2(c, () => {
      c.clip(sil);
      c.fillStyle = dots(c, POP.blue, 16, 4.6);
      c.fill(sil);
      // red rim light from the alarm
      const rim = new Path2D();
      brush([[150, -330], [130, -260], [240, -215], [340, -130]], 22, rim, 0.3, 0.8);
      brush([[-60, -430], [40, -455], [125, -415]], 18, rim, 0.6, 0.6);
      c.fillStyle = POP.red;
      c.fill(rim);
    });
    // glasses arm glint
    const g = new Path2D();
    brush([[110, -350], [40, -360]], 10, g, 0.1, 0.4);
    c.fillStyle = POP.yellow;
    c.fill(g);
    drop(c, 150, -400 + Math.sin(t * 4) * 4, 14, 0.4, 3);
  });
};

/* ---------- scene 4: the hotfix ---------- */

const heroPose = (t: number): Pose => {
  const wind = tween(t, T_S4, T_WIND1, ease.outCubic);
  const strike = tween(t, T_WIND1, T_HIT, ease.inQuint);
  const recoil = Math.sin(seg(t, T_HIT, T_HIT + 0.5) * Math.PI) * 0.05;
  const hip: Pt = [lerp(400, 430, strike), 650];
  const wristWind: Pt = [lerp(560, 300, wind), lerp(560, 190, wind)];
  const wristHit: Pt = [845, 585];
  return {
    hip,
    lean: lerp(lerp(0.15, -0.05, wind), 0.42, strike) - recoil,
    head: lerp(lerp(0, -0.25, wind), -0.3, strike),
    ankleN: [lerp(600, 680, strike), 1040],
    ankleF: [250, 1040],
    wristN: [lerp(wristWind[0], wristHit[0], strike), lerp(wristWind[1], wristHit[1], strike)],
    wristF: [lerp(lerp(460, 520, wind), 240, strike), lerp(lerp(560, 600, wind), 600, strike)],
    elbowN: wind > 0.5 && strike < 0.35 ? -1 : 1,
    elbowF: 1,
    handN: strike > 0.6 ? 'point' : 'fist',
    handF: 'fist',
    mouth: strike > 0.5 ? 1 : -1,
    squint: 0,
  };
};

const drawHotfix = (c: Ctx, t: number) => {
  // backdrop: yellow with red dots and focus lines into the key
  c.fillStyle = POP.yellow;
  c.fillRect(-200, -200, 2000, 1300);
  c.fillStyle = dots(c, rgba(POP.red, 0.65), 20, 5);
  c.fillRect(-200, -200, 2000, 1300);
  focusLines(c, 930, 560, 260, 1600, 90, Math.floor(t * 12), 0.011);
  // the key (same ENTER key as the opening)
  const hit = t >= T_HIT;
  const press = hit ? 1 - tween(t, T_HIT + 0.3, T_HIT + 0.8) : 0;
  W2(c, () => {
    c.translate(930, 640);
    c.rotate(-0.08);
    const top = keycap(c, -230, -60, 460, 150, 60, '', 0, press);
    letter(c, 'ENTER', 0, top + 46, 52, 0.5, POP.black, 0.16, 2);
  });
  // speed lines along the strike
  const strike = seg(t, T_WIND1, T_HIT + 0.15);
  if (strike > 0 && strike < 1) speedLines(c, 700, 520, 520, 160, 0.12, 9, Math.floor(t * 20), 9);
  // the hero
  figure(c, heroPose(t), HERO, 1.5, 1);
};

const fragsPath = (t: number) => {
  const k = seg(t, T_HIT, T_HIT + 1.1);
  return k;
};

const drawKapow = (c: Ctx, s: State, t: number) => {
  const k = tween(t, T_HIT, T_HIT + 0.22, ease.outBack);
  if (k <= 0) return;
  const out = tween(t, T_DASH0, T_DASH1, ease.inOutCubic);
  const cx = lerp(1000, 1180, out);
  const cy = lerp(470, 430, out);
  // error dialogs blasted outward
  const fk = fragsPath(t);
  if (fk > 0 && fk < 1) {
    s.dialogs.slice(0, 10).forEach((d, i) => {
      const a = (i / 10) * TAU + 0.3;
      const dist = ease.outCubic(fk) * (500 + hash(i) * 500);
      W2(c, () => {
        c.translate(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist * 0.8);
        c.rotate(d.rot + fk * (hash(i * 3) - 0.5) * 8);
        c.scale(0.8 + fk, 0.8 + fk);
        errorBox(c, d.w * 0.8, d.h * 0.8, d.label);
      });
    });
  }
  const punch = 1 + (1 - tween(t, T_HIT, T_HIT + 0.35, ease.outCubic)) * 0.35;
  W2(c, () => {
    c.translate(cx, cy);
    c.scale(punch * (1 - out), punch * (1 - out));
    c.translate(-cx, -cy);
    const outer = polyP(burstPts(cx, cy, 300 * k, 470 * k, 15, 5));
    inked(c, outer, POP.white, 9);
    W2(c, () => {
      c.clip(outer);
      c.fillStyle = dots(c, POP.cyan, 22, 6);
      c.fill(outer);
    });
    const inner = polyP(burstPts(cx, cy, 200 * k, 330 * k, 12, 9));
    inked(c, inner, POP.yellow, 7);
    boom(c, 'KAPOW!', cx + 10, cy, 120 * k, { rot: -0.14, steps: 9, fill: POP.yellow, side: POP.red });
  });
  // the inner core cools into the dashboard light
  if (out > 0) {
    const m = morph(s.burstA, s.circB, out);
    const pts = m.map(([x, y]) => [lerp(1000, 1180, out) + x, lerp(470, 430, out) + y] as Pt);
    const col = mix(POP.red, POP.green, out);
    if (out > 0.5) inked(c, circPath(1180, 430, 90 * 1.28 * seg(out, 0.5, 1)), POP.black, 0);
    inked(c, polyP(pts), col, 6);
  }
};

const drawDashboard = (c: Ctx, t: number) => {
  c.fillStyle = POP.cyan;
  c.fillRect(-200, -200, 2000, 1300);
  c.fillStyle = dots(c, rgba(POP.blue, 0.55), 20, 5);
  c.fillRect(-200, -200, 2000, 1300);
  // monitor
  inked(c, rrPath(700, 790, 200, 90, 6), POP.grey, 6);
  inked(c, rrPath(140, 70, 1320, 760, 36), POP.black, 0);
  const scr = rrPath(180, 110, 1240, 680, 14);
  inked(c, scr, POP.navy, 0);
  W2(c, () => {
    c.clip(scr);
    c.fillStyle = dots(c, POP.blue, 16, 3.2);
    c.fill(scr);
    // line chart: crashed, then recovering upward in green
    const k = tween(t, T_DASH0 + 0.3, T_DASH1 + 0.5, ease.outCubic);
    const pts: Pt[] = [];
    for (let i = 0; i <= 20; i++) {
      const x = 240 + i * 34;
      const fall = i > 8 && i < 13 ? 1 : 0;
      const y = 520 - i * 6 + fall * 150 * (1 - k) - (i >= 13 ? k * (i - 12) * 22 : 0) + Math.sin(i * 1.7) * 14;
      pts.push([x, y]);
    }
    const ln = new Path2D();
    brush(pts, 14, ln, 0.1, 0.1);
    c.fillStyle = k > 0.4 ? POP.green : POP.red;
    c.fill(ln);
    // bars
    for (let i = 0; i < 6; i++) {
      const h = (60 + hash(i * 4) * 90) * tween(t, T_DASH0 + 0.4 + i * 0.06, T_DASH0 + 0.8 + i * 0.06, ease.outBack);
      inked(c, rectPath(260 + i * 100, 740 - h, 64, h), POP.green, 3, 0);
    }
  });
  // tiny glare on the monitor
  c.fillStyle = rgba(POP.white, 0.14);
  c.fill(polyP([[1150, 110], [1300, 110], [1000, 790], [850, 790]]));
};

/* ---------- scene 5: the sunset ---------- */

const SUN: Pt = [800, 620];
const SUN_R = 270;
const HORIZON = 655;

const buildSky = (r: Riso) => {
  const { canvas, ctx: c } = r.scratch(1900, 1100);
  c.translate(150, 100);
  c.fillStyle = POP.yellow;
  c.fillRect(-150, -100, 1900, 1100);
  c.fillStyle = POP.orange;
  const glow = dotField(-150, -100, 1900, 860, 22, (x, y) => {
    const d = Math.hypot(x - SUN[0], (y - SUN[1]) * 1.3);
    return clamp((d - 300) / 900) * 8.5 + clamp((300 - y) / 400) * 2;
  });
  c.fill(glow);
  c.fillStyle = POP.red;
  const top = dotField(-150, -100, 1900, 420, 22, (x, y) => clamp((260 - y) / 360) * 8);
  c.fill(top);
  // streaky clouds
  const rng = mulberry(31);
  for (let i = 0; i < 6; i++) {
    const y = 140 + i * 70 + rng() * 30;
    const x = -100 + rng() * 1700;
    const w = 260 + rng() * 360;
    const cl = rrPath(x, y, w, 18 + rng() * 12, 14);
    c.fillStyle = POP.cream;
    c.fill(cl);
    c.strokeStyle = POP.black;
    c.lineWidth = 4;
    c.stroke(cl);
  }
  return canvas;
};

const skyline = (): Path2D => {
  const p = new Path2D();
  const rng = mulberry(77);
  p.moveTo(-200, HORIZON + 10);
  let x = -200;
  while (x < 1800) {
    const w = 50 + rng() * 110;
    const near = Math.abs(x + w / 2 - 800) < 360;
    const h = (near ? 40 : 90) + rng() * (near ? 80 : 230);
    p.lineTo(x, HORIZON - h);
    if (rng() < 0.25) {
      p.lineTo(x + w * 0.45, HORIZON - h);
      p.lineTo(x + w * 0.5, HORIZON - h - 60);
      p.lineTo(x + w * 0.55, HORIZON - h);
    }
    p.lineTo(x + w, HORIZON - h);
    x += w;
  }
  p.lineTo(1800, HORIZON + 10);
  p.closePath();
  return p;
};

let SKYLINE: Path2D | null = null;

const walkPose = (t: number): Pose => {
  const ph = t * 1.75 * TAU;
  const x = lerp(560, 860, seg(t, T_SUN0, DUR));
  const gy = 820;
  const stride = 62;
  const sw = Math.sin(ph);
  const lift = (k: number) => Math.max(0, Math.cos(k)) * 26;
  return {
    hip: [x, 560 + Math.abs(Math.cos(ph)) * -8],
    lean: 0.06,
    head: -0.05,
    ankleN: [x + sw * stride, gy - lift(ph)],
    ankleF: [x - sw * stride, gy - lift(ph + Math.PI)],
    footN: -sw * 0.25,
    footF: sw * 0.25,
    wristN: [x - sw * 50 + 6, 680],
    wristF: [x + sw * 44 + 6, 676],
    handN: 'fist',
    handF: 'fist',
    mouth: 0.5,
  };
};

const drawSunset = (c: Ctx, s: State, t: number, sx = SUN[0], sy = SUN[1], sr = SUN_R, col: string = POP.red, stripes = 1, rise = 0) => {
  c.drawImage(s.sky, -150, -100, 1900, 1100);
  // pop-art sun rays turning slowly behind everything
  const rays = new Path2D();
  const n = 18;
  const a0 = t * 0.06;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    rays.moveTo(sx, sy);
    rays.lineTo(sx + Math.cos(a) * 2400, sy + Math.sin(a) * 2400);
    rays.lineTo(sx + Math.cos(a + TAU / n / 2) * 2400, sy + Math.sin(a + TAU / n / 2) * 2400);
    rays.closePath();
  }
  c.fillStyle = rgba(POP.orange, 0.45);
  c.fill(rays);
  c.fillStyle = dots(c, rgba(POP.red, 0.55), 22, 5);
  c.fill(rays);
  // sun with retro stripes cut through its lower half
  const sun = circPath(sx, sy, sr);
  inked(c, sun, col, 8);
  W2(c, () => {
    c.clip(sun);
    c.fillStyle = dots(c, POP.orange, 16, 4.4);
    c.fill(ellPath(sx - sr * 0.22, sy - sr * 0.33, sr * 0.8, sr * 0.63));
    if (stripes > 0) {
      c.fillStyle = POP.yellow;
      for (let i = 0; i < 6; i++) {
        const y = sy - sr * 0.07 + (i * 34 + ((t * 18) % 34)) * (sr / SUN_R);
        c.fillRect(sx - sr, y, sr * 2, (6 + i * 2.5) * stripes);
      }
    }
  });
  c.save();
  c.translate(0, rise);
  SKYLINE ??= skyline();
  inked(c, SKYLINE, POP.black, 0, 0);
  // lit windows
  c.fillStyle = POP.yellow;
  for (let i = 0; i < 40; i++) {
    const x = -100 + hash(i * 3.3) * 1800;
    if (Math.abs(x - 800) < 330) continue;
    const y = HORIZON - 30 - hash(i * 7.1) * 200;
    if (hash(i + Math.floor(t * 1.5)) > 0.85) continue;
    c.fillRect(x, y, 10, 14);
  }
  // street
  c.fillStyle = POP.black;
  c.fillRect(-200, HORIZON, 2000, 600);
  c.fillStyle = POP.deepRed;
  c.fillRect(-200, 820, 2000, 300);
  c.fillStyle = dots(c, POP.black, 16, 5);
  c.fillRect(-200, 820, 2000, 300);
  // long shadow
  const wp = walkPose(t);
  c.fillStyle = rgba(POP.black, 0.55);
  c.fill(ellPath(wp.hip[0] - 150, 836, 230, 16));
  // our hero, in silhouette against the sun, laptop bag on his shoulder
  figure(c, wp, HERO_SIL, 0.78, 1, (b) => {
    const bag = rrPath(b.hip[0] - 90, b.hip[1] - 20, 120, 90, 10);
    const strap = new Path2D();
    strap.moveTo(b.shoulder[0] + 10, b.shoulder[1]);
    strap.lineTo(b.hip[0] - 30, b.hip[1] - 20);
    c.strokeStyle = SIL;
    c.lineWidth = 8;
    c.stroke(strap);
    inked(c, bag, SIL, 3);
  });
  c.restore();
};

/* ---------- film ---------- */

export const popDeployFridayFilm: RisoFilm<State> = {
  id: 'pop-deploy-friday',
  title: 'Deploy Friday',
  caption: 'One line, one Enter key, one very long Friday afternoon.',
  theme: 'Craft',
  motif: 'The status light: green, red alarm, then the sunset',
  duration: DUR,
  series: 'Pop art',
  mode: 'direct',
  paper: POP.paper,
  paperTexture: true,
  grain: 0.14,
  inks: [{ color: POP.red }, { color: POP.yellow }, { color: POP.cyan }, { color: POP.black }],
  scenes: [
    { at: 0, label: '4:59 P.M.' },
    { at: T_OUT0, label: 'The pipeline' },
    { at: T_S3, label: 'Production is down' },
    { at: T_S4, label: 'Hotfix' },
    { at: T_SUN0, label: 'Weekend' },
  ],
  posterTime: 12.85,
  setup(r) {
    const rng = mulberry(5);
    const dialogs: Dialog[] = [];
    const slots: Pt[] = [
      [500, 560],
      [330, 520],
      [680, 520],
      [420, 650],
      [600, 660],
      [250, 640],
      [760, 640],
      [500, 690],
      [360, 400],
      [650, 400],
      [180, 300],
      [820, 300],
      [500, 180],
      [500, 760],
    ];
    slots.forEach(([x, y], i) => {
      const label = LABELS[i % LABELS.length];
      const w = Math.max(130, label.length * 17 + 60);
      dialogs.push({
        x,
        y,
        w,
        h: 74 + rng() * 20,
        rot: (rng() - 0.5) * 0.45,
        label,
        from: [(rng() - 0.5) * 3000, (rng() - 0.5) * 2000],
        delay: rng() * 0.4,
      });
    });
    const [burstA, circB] = morphPair(burstPts(0, 0, 200, 330, 12, 9), circlePts(0, 0, 90, 96), 120);
    SKYLINE = null;
    return { monster: buildMonster(r, dialogs), dialogs, sky: buildSky(r), burstA, circB };
  },
  draw(r, t, s) {
    const c = r.layers[0];
    c.lineJoin = 'round';
    c.lineCap = 'round';

    /* scenes 1-2: a comic page the camera travels across */
    if (t < T_S3) {
      let cx = 800;
      let cy = 450;
      let z = 1;
      let rot = 0;
      if (t < T_TILT0) {
        z = lerp(1.0, 1.07, ease.inOutSine(seg(t, 0, T_TILT0)));
        const sh = shake(t, 3 * seg(t, 0.5, 2.4), 2, 9);
        cx += sh[0];
        cy += sh[1];
      } else if (t < T_OUT0) {
        const k = tween(t, T_TILT0, T_TILT1, ease.inOutCubic);
        cy = lerp(450, ROW2 + 450, k);
        z = lerp(1.07, 1.0, k) - 0.16 * Math.sin(Math.PI * k) + 0.05 * tween(t, T_TILT1, T_OUT0, ease.inOutSine);
        rot = -0.035 * Math.sin(Math.PI * k);
        if (t > T_PRESS) {
          const sh = shake(t, 8 * (1 - seg(t, T_PRESS, T_PRESS + 0.3)), 5);
          cx += sh[0];
          cy += sh[1];
        }
      } else if (t < T_OUT1) {
        const k = tween(t, T_OUT0, T_OUT1, ease.inOutCubic);
        cx = lerp(800, 1580, k);
        cy = ROW2 + 450;
        z = logLerp(1.05, 0.5, k);
        rot = 0.03 * Math.sin(Math.PI * k);
      } else if (t < T_DIVE0) {
        const k = tween(t, T_OUT1, T_PAN1, ease.inOutSine);
        cx = lerp(1580, 4700, k);
        cy = ROW2 + 450;
        z = 0.5 + 0.03 * Math.sin(Math.PI * k);
        if (t > T_RED) {
          const sh = shake(t, 10 * (1 - seg(t, T_RED, T_RED + 0.4)), 7);
          cx += sh[0];
          cy += sh[1];
        }
        cx = t > T_PAN1 ? 4700 : cx;
      } else {
        const k = tween(t, T_DIVE0, T_S3 - 0.12, ease.inCubic);
        const tx = 3 * STEP + LIGHT[0];
        const ty = ROW2 + LIGHT[1];
        const kc = 1 - Math.pow(1 - seg(t, T_DIVE0, T_S3 - 0.2), 3);
        cx = lerp(4700, tx, kc);
        cy = lerp(ROW2 + 450, ty, kc);
        z = logLerp(0.5, 15, k);
      }
      r.camera(cx, cy, z, rot);
      // what is on screen, roughly
      const halfW = 820 / z;
      const vis = (x0: number, y0: number) => x0 + 1600 > cx - halfW && x0 < cx + halfW && y0 + 900 > cy - 500 / z && y0 < cy + 500 / z;
      if (vis(0, 0)) drawFace(c, t);
      const lightK = seg(t, T_DIVE0 + 0.3, T_S3 - 0.1);
      if (vis(0, ROW2)) W2(c, () => (c.translate(0, ROW2), drawHandPanel(c, t)));
      if (vis(STEP, ROW2)) W2(c, () => (c.translate(STEP, ROW2), drawBuild(c, t)));
      if (vis(STEP * 2, ROW2)) W2(c, () => (c.translate(STEP * 2, ROW2), drawTest(c, t)));
      if (vis(STEP * 3, ROW2)) W2(c, () => (c.translate(STEP * 3, ROW2), drawProd(c, t, lightK)));
      if (vis(STEP, 0)) W2(c, () => (c.translate(STEP, 0), drawClock(c, t)));
      if (vis(STEP * 2, 0)) W2(c, () => (c.translate(STEP * 2, 0), drawDoor(c)));
      if (vis(STEP * 3, 0)) W2(c, () => (c.translate(STEP * 3, 0), drawCalendar(c)));
      if (vis(STEP * 4, ROW2)) W2(c, () => (c.translate(STEP * 4, ROW2), drawAlertPanel(c, t, 3)));
      if (vis(STEP * 4, 0)) W2(c, () => (c.translate(STEP * 4, 0), drawAlertPanel(c, t, 5)));
      if (cy + 500 / z > ROW3) W2(c, () => (c.translate(0, ROW3), drawLogs(c, t)));
      return;
    }

    /* scene 3: production is down */
    if (t < T_S4) {
      const k = seg(t, T_S3, T_S4);
      const sh = shake(t, 5 + 10 * tween(t, 9.7, 10.0) * (1 - tween(t, 10.4, 10.9)) + 14 * seg(t, T_LUNGE0, T_S4), 4, 18);
      const z = lerp(0.96, 1.12, ease.inOutSine(k));
      r.camera(800 + sh[0], 460 + sh[1], z, 0.02 * Math.sin(t * 1.3));
      drawAlarm(c, t, seg(t, T_S3, T_S3 + 0.4));
      drawBeacon(c, t, tween(t, T_S3 + 0.2, T_S3 + 0.7, ease.outBack));
      drawMonster(c, s, t);
      drawOverShoulder(c, t, seg(t, 9.3, 9.9) * (1 - seg(t, T_LUNGE0, T_LUNGE0 + 0.4)));
      // the maw swallows the frame
      const bl = seg(t, T_S4 - 0.12, T_S4);
      if (bl > 0) {
        r.camera(800, 450, 1);
        c.fillStyle = rgba(POP.black, bl);
        c.fillRect(0, 0, 1600, 900);
      }
      return;
    }

    /* scene 4: the hotfix, then the dashboard */
    if (t < T_SUN0) {
      const flash = t >= T_HIT && t < T_HIT + 0.09;
      const recoil = tween(t, T_HIT, T_HIT + 0.6, ease.outCubic);
      const sh = shake(t, 22 * (1 - seg(t, T_HIT, T_HIT + 0.7)) * (t > T_HIT ? 1 : 0), 6, 24);
      const push = tween(t, T_S4, T_HIT, ease.inOutSine);
      const dash = tween(t, T_DASH0, T_DASH1, ease.inOutCubic);
      const z = lerp(1.04, 1.13, push) - 0.13 * recoil + 0.06 * Math.sin(dash * Math.PI);
      r.camera(800 + sh[0] + push * 40 - recoil * 40, 450 + sh[1], z, -0.02 * push + 0.02 * recoil);
      if (t < T_DASH1) drawHotfix(c, t);
      // dashboard revealed through an iris from the cooling core
      if (dash > 0) {
        W2(c, () => {
          const ir = circPath(lerp(1000, 1180, dash), lerp(470, 430, dash), lerp(90, 1900, ease.inCubic(dash)));
          c.clip(ir);
          drawDashboard(c, t);
        });
      }
      drawKapow(c, s, t);
      if (t >= T_DASH1) {
        statusLight(c, 1180, 430, 90, 2, t);
      }
      // the diagonal slash that opens the panel out of the black
      const open = tween(t, T_S4, T_S4 + 0.32, ease.outCubic);
      if (open < 1) {
        r.camera(800, 450, 1);
        const o = ease.inCubic(open) * 1500 + 6;
        const band = polyP([
          [1100 - o, -100],
          [1100 + o, -100],
          [500 + o, 1000],
          [500 - o, 1000],
        ]);
        const mask = rectPath(-100, -100, 1800, 1100);
        mask.addPath(band);
        c.fillStyle = POP.black;
        c.fill(mask, 'evenodd');
        const edge = new Path2D();
        edge.moveTo(1100 - o, -100);
        edge.lineTo(500 - o, 1000);
        edge.moveTo(1100 + o, -100);
        edge.lineTo(500 + o, 1000);
        c.strokeStyle = POP.white;
        c.lineWidth = 12;
        c.stroke(edge);
      }
      if (flash) {
        r.camera(800, 450, 1);
        c.globalCompositeOperation = 'difference';
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, 1600, 900);
        c.globalCompositeOperation = 'source-over';
      }
      return;
    }

    /* scene 5: the weekend */
    const tk = tween(t, T_SUN0, T_SUN1, ease.inOutCubic);
    const z = lerp(1.16, 1.0, ease.outCubic(seg(t, T_SUN0, 18.2)));
    r.camera(800 + Math.sin(t * 0.5) * 6, 450 + (1 - tk) * -20, z);
    if (tk < 1) {
      // dashboard behind; the green light travels, grows and warms into the sun, and the
      // sunset opens around it through an iris
      W2(c, () => drawDashboard(c, t));
      const sx = lerp(1180, SUN[0], tk);
      const sy = lerp(430, SUN[1], tk);
      const sr = lerp(90, SUN_R, tk);
      const col = tk < 0.5 ? mix(POP.green, POP.yellow, tk * 2) : mix(POP.yellow, POP.red, tk * 2 - 1);
      W2(c, () => {
        c.clip(circPath(sx, sy, sr + ease.inCubic(tk) * 1500 + 30));
        drawSunset(c, s, t, sx, sy, sr, col, tk, (1 - ease.inOutCubic(tk)) * 480);
      });
    } else drawSunset(c, s, t);
    r.camera(800, 450, 1);
    posterFinish(c, tween(t, 16.6, 17.5, ease.inOutCubic), 'DEPLOY FRIDAY', 62);
  },
};
