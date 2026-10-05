import type { Ctx, RisoFilm } from '../riso/engine';
import { TAU, circlePts, clamp, ease, hash, lerp, morph, morphPair, seg, tween, type Pt } from '../riso/kit';
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
  dots,
  drop,
  ellPath,
  eye,
  figure,
  focusLines,
  inked,
  keyline,
  letter,
  mix,
  polyP,
  rectPath,
  rgba,
  rrPath,
  shake,
  solve,
  speedLines,
  type Bones,
  type Look,
  type Pose,
} from '../styles/popart';

/*
 * Leg Day: the plate is the motif. A romance-comic close-up: one huge eye, a single tear,
 * "It's... leg day." We dive into the iris and it turns into the red bumper plate on the bar;
 * pulling back we find our lifter chalking up at the rack. He unracks, the squat plays out in
 * heroic beats (GRRR at the bottom, the drive up) and at lockout the plate bursts into a star.
 * Re-racked, he wobbles out on jelly legs to face his true nemesis, the stairs; twenty minutes
 * later he stands at the top, arms up, in front of a plate-shaped sun.
 */

const DUR = 18.5;

const T_DIVE0 = 2.85;
const T_S2 = 3.8;
const T_PULL1 = 5.0;
const T_CLAP = 4.75;
const T_WALK1 = 5.9;
const T_UNRACK0 = 6.05;
const T_UNRACK1 = 6.7;
const T_DOWN0 = 7.05;
const T_DOWN1 = 8.3;
const T_UP0 = 9.35;
const T_LOCK = 10.15;
const T_RERACK0 = 11.0;
const T_RERACK1 = 11.45;
const T_WALK0 = 11.6;
const T_STOP = 13.5;
const T_S5 = 14.6;
const T_TOP = 15.9;

const GROUND = 820;
const LEGS = 0.86;
const ANKLE_Y = 796;
const RACK: Pt = [700, 384];
const PLATE_R = 96;
const PLATE_OFF: Pt = [-128, 10];
const SQUASH = 0.8;

/* stairs */
const ST_X = 2500;
const ST_N = 11;
const ST_W = 78;
const ST_H = 82;
const TOP_Y = GROUND - ST_N * ST_H;
const TOP_X = ST_X + ST_N * ST_W;
const HERO_TOP_X = 3560;
const SUNC: Pt = [3560, TOP_Y - 360];

const LIFTER: Look = {
  skin: POP.skin,
  top: POP.red,
  topKind: 'tank',
  bottom: POP.blue,
  bottomKind: 'shorts',
  shoe: POP.white,
  hair: POP.black,
  lw: 3.6,
  build: 1.75,
  ripped: 1,
};

interface State {
  plateA: Pt[];
  starB: Pt[];
}

const W2 = (c: Ctx, fn: () => void) => {
  c.save();
  fn();
  c.restore();
};

const logLerp = (a: number, b: number, k: number) => Math.exp(lerp(Math.log(a), Math.log(b), k));

/* ---------- the plate ---------- */

/** Red bumper plate seen at an angle (sx squashes it horizontally), centred on (x, y) */
const drawPlate = (c: Ctx, x: number, y: number, r: number, sx: number, color: string = POP.red, spin = 0) => {
  W2(c, () => {
    c.translate(x, y);
    c.scale(sx, 1);
    // rim thickness, visible on the side away from us
    inked(c, circPath(r * 0.12, 0, r), mix(color, POP.navy, 0.45), r * 0.05);
    const face = circPath(0, 0, r);
    inked(c, face, color, r * 0.05);
    W2(c, () => {
      c.clip(face);
      c.fillStyle = dots(c, mix(color, POP.navy, 0.35), r * 0.12, r * 0.032);
      c.fill(ellPath(r * 0.35, r * 0.35, r * 0.9, r * 0.85));
      c.fillStyle = rgba(POP.white, 0.5);
      c.fill(ellPath(-r * 0.45, -r * 0.5, r * 0.32, r * 0.14, -0.6));
    });
    // raised inner ring and the lettering around it
    const ring = circPath(0, 0, r * 0.62);
    keyline(c, ring, r * 0.035);
    W2(c, () => {
      c.rotate(spin);
      const sz = r * 0.17;
      letter(c, '20 KG', 0, -r * 0.88 + sz * 0.05, sz, 0.5, POP.white, 0.2, 2);
      W2(c, () => {
        c.rotate(Math.PI);
        letter(c, '20 KG', 0, -r * 0.88 + sz * 0.05, sz, 0.5, POP.white, 0.2, 3);
      });
    });
    // chrome hub
    inked(c, circPath(0, 0, r * 0.28), POP.grey, r * 0.035);
    c.fillStyle = POP.white;
    c.fill(ellPath(-r * 0.08, -r * 0.1, r * 0.1, r * 0.05, -0.6));
    inked(c, circPath(0, 0, r * 0.12), POP.black, 0);
  });
};

/** The bar: a chrome stub from the near plate's hub toward the body, plus the far plate */
const drawFarPlate = (c: Ctx, bar: Pt, k = 1) => {
  drawPlate(c, bar[0] + 70, bar[1] - 8, PLATE_R * 0.9, SQUASH, mix(POP.red, POP.navy, 0.35));
  void k;
};
const drawNearPlate = (c: Ctx, bar: Pt, sx = SQUASH, r = PLATE_R) => {
  const px = bar[0] + PLATE_OFF[0];
  const py = bar[1] + PLATE_OFF[1];
  // sleeve and collar between plate and shoulders
  W2(c, () => {
    c.lineCap = 'round';
    c.strokeStyle = POP.black;
    c.lineWidth = 24;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(bar[0] + 40, bar[1] - 4);
    c.stroke();
    c.strokeStyle = POP.grey;
    c.lineWidth = 15;
    c.stroke();
    c.strokeStyle = POP.white;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(px, py - 4);
    c.lineTo(bar[0] + 36, bar[1] - 8);
    c.stroke();
  });
  drawPlate(c, px, py, r, sx);
};

/* ---------- the gym ---------- */

const drawGym = (c: Ctx, t: number) => {
  // wall
  c.fillStyle = POP.cyan;
  c.fillRect(-1400, -1600, ST_X - 200 + 1400, GROUND + 1600);
  c.fillStyle = dots(c, rgba(POP.blue, 0.7), 22, 5.5);
  c.fillRect(-1400, -1600, ST_X - 200 + 1400, GROUND + 1600);
  // red stripe along the wall
  inked(c, rectPath(-1400, 560, ST_X - 200 + 1400, 70), POP.red, 0, 0);
  c.fillStyle = POP.yellow;
  c.fillRect(-1400, 640, ST_X - 200 + 1400, 14);
  // wall clock and a motivational poster
  inked(c, circPath(140, 230, 70), POP.white, 6);
  const hands = new Path2D();
  brush([[140, 230], [140, 182]], 9, hands, 0.1, 0.6);
  brush([[140, 230], [176, 236]], 9, hands, 0.1, 0.6);
  c.fillStyle = POP.black;
  c.fill(hands);
  // plates hung on the wall pegs: the motif waiting in the background
  for (const [x, y, rr, col] of [
    [1380, 300, 92, POP.red],
    [1560, 320, 72, POP.blue],
    [1700, 336, 56, POP.yellow],
    [1960, 300, 92, POP.red],
    [2120, 330, 64, POP.blue],
  ] as const) {
    drawPlate(c, x, y, rr, 1, col, 0.3);
  }
  // dumbbell rack along the back
  inked(c, rectPath(1150, 700, 900, 26), POP.black, 0, 0);
  for (let i = 0; i < 7; i++) {
    const x = 1200 + i * 125;
    inked(c, rrPath(x - 22, 650, 44, 52, 10), POP.navy, 4);
    inked(c, rrPath(x + 42, 650, 44, 52, 10), POP.navy, 4);
    c.fillStyle = POP.grey;
    c.fillRect(x + 22, 668, 20, 14);
  }
  // the outside beyond the doorway
  c.fillStyle = POP.yellow;
  c.fillRect(ST_X - 200, -2000, 3000, GROUND + 2000);
  c.fillStyle = dots(c, rgba(POP.orange, 0.9), 22, 5.5);
  c.fillRect(ST_X - 200, -2000, 3000, GROUND + 2000);
  inked(c, rectPath(ST_X - 260, -2000, 60, GROUND + 2000), POP.black, 0, 0);
  // floor
  c.fillStyle = POP.navy;
  c.fillRect(-1400, GROUND, 6000, 800);
  c.fillStyle = dots(c, POP.black, 16, 4.5);
  c.fillRect(-1400, GROUND, 6000, 800);
  inked(c, rectPath(-1400, GROUND - 4, 6000, 10), POP.black, 0, 0);
  void t;
};

const drawRack = (c: Ctx, front: boolean) => {
  // a post behind the lifter with a J-hook at shoulder height; the safety pin in front
  if (!front) {
    inked(c, rectPath(RACK[0] + 30, 120, 44, GROUND - 120), POP.black, 0, 0);
    c.fillStyle = POP.grey;
    for (let y = 160; y < GROUND - 40; y += 46) c.fillRect(RACK[0] + 46, y, 12, 12);
    inked(c, rectPath(RACK[0] - 40, GROUND - 20, 180, 24), POP.black, 0, 0);
  } else {
    const hook = polyP([
      [RACK[0] + 24, RACK[1] + 18],
      [RACK[0] + 80, RACK[1] + 18],
      [RACK[0] + 80, RACK[1] - 30],
      [RACK[0] + 64, RACK[1] - 30],
      [RACK[0] + 64, RACK[1] + 2],
      [RACK[0] + 24, RACK[1] + 2],
    ]);
    inked(c, hook, POP.grey, 3);
  }
};

const drawStairs = (c: Ctx) => {
  const p = new Path2D();
  p.moveTo(ST_X, GROUND);
  for (let i = 0; i < ST_N; i++) {
    p.lineTo(ST_X + i * ST_W, GROUND - (i + 1) * ST_H);
    p.lineTo(ST_X + (i + 1) * ST_W, GROUND - (i + 1) * ST_H);
  }
  p.lineTo(TOP_X + 2000, TOP_Y);
  p.lineTo(TOP_X + 2000, GROUND + 800);
  p.lineTo(ST_X, GROUND + 800);
  p.closePath();
  inked(c, p, POP.grey, 6);
  W2(c, () => {
    c.clip(p);
    c.fillStyle = dots(c, rgba(POP.navy, 0.55), 16, 4);
    c.fill(p);
    // step noses
    for (let i = 0; i < ST_N; i++) {
      c.fillStyle = POP.white;
      c.fillRect(ST_X + i * ST_W, GROUND - (i + 1) * ST_H, ST_W, 8);
    }
  });
  // railing
  const rail = new Path2D();
  rail.moveTo(ST_X + 20, GROUND - 170);
  rail.lineTo(TOP_X, TOP_Y - 170);
  rail.lineTo(TOP_X + 1500, TOP_Y - 170);
  for (let i = 0; i <= ST_N; i += 2) {
    rail.moveTo(ST_X + 20 + i * ST_W, GROUND - 170 - i * ST_H * (TOP_Y - GROUND + 0) / (TOP_Y - GROUND));
    rail.lineTo(ST_X + 20 + i * ST_W, GROUND - i * ST_H - ST_H * 0.2);
  }
  keyline(c, rail, 10);
};


/** Lifting belt cinched at the waist */
const belt = (c: Ctx) => (b: Bones) => {
  const p = polyP([b.toW(-54, 44), b.toW(42, 44), b.toW(42, 78), b.toW(-56, 78)]);
  inked(c, p, POP.black, 3);
  inked(c, rectPath(...b.toW(18, 70), 22, 26), POP.grey, 3, 0);
  const st = new Path2D();
  brush([b.toW(-50, 50), b.toW(36, 50)], 3, st, 0.1, 0.1);
  brush([b.toW(-50, 72), b.toW(36, 72)], 3, st, 0.1, 0.1);
  c.fillStyle = POP.grey;
  c.fill(st);
};

/* ---------- poses ---------- */

/** Standing / squatting with the bar on the back. depth 0 standing .. 1 below parallel */
const squatPose = (depth: number, x: number, strain: number): Pose => {
  const d = clamp(depth);
  const hip: Pt = [lerp(x, x - 84, d), lerp(540, 712, d)];
  return {
    legs: LEGS,
    hip,
    lean: lerp(0.08, 0.78, d),
    head: lerp(-0.08, -0.55, d),
    ankleN: [x + 8, ANKLE_Y],
    ankleF: [x - 6, ANKLE_Y],
    wristN: [0, 0],
    wristF: [0, 0],
    elbowN: 1,
    elbowF: 1,
    handN: 'grip',
    handF: 'grip',
    mouth: strain > 0.3 ? -1 : 0,
    squint: strain > 0.6 ? 1 : 0,
  };
};

/** Bar on the traps for a pose, and hands gripping it */
const withBar = (p: Pose, s: number): { pose: Pose; bar: Pt } => {
  const b = solve(p, s, 1);
  const bar = b.toW(-16, 150);
  return {
    pose: { ...p, wristN: [bar[0] + 14, bar[1] + 18], wristF: [bar[0] + 4, bar[1] + 16] },
    bar,
  };
};

const lerpPt = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

const walkCycle = (t: number, x: number, wob: number, stride = 60): Pose => {
  const ph = t * 1.6 * TAU;
  const sw = Math.sin(ph);
  const lift = (k: number) => Math.max(0, Math.cos(k)) * 24;
  const knock = Math.sin(t * 38) * 9 * wob;
  return {
    legs: LEGS,
    hip: [x, 566 + Math.abs(Math.cos(ph)) * -8 + wob * 22],
    lean: 0.14 + wob * 0.06,
    head: 0.1 * wob,
    ankleN: [x + sw * stride + knock, ANKLE_Y - lift(ph)],
    ankleF: [x - sw * stride - knock, ANKLE_Y - lift(ph + Math.PI)],
    footN: -sw * 0.2,
    footF: sw * 0.2,
    wristN: [x - sw * 40 + 14 + knock * 0.5, 700 + wob * 20],
    wristF: [x + sw * 36 + 14, 696 + wob * 20],
    handN: 'open',
    handF: 'open',
    mouth: wob > 0.5 ? -1 : 0,
    squint: 0,
  };
};

/* ---------- scene 1: the eye ---------- */

const EYE: Pt = [800, 470];
const EYE_U = 300;
const IRIS: Pt = [EYE[0], EYE[1] - 0.06 * EYE_U];
const IRIS_R = 0.44 * EYE_U;

const drawEyeScene = (c: Ctx, t: number) => {
  c.fillStyle = '#fde4cb';
  c.fillRect(-400, -400, 2400, 1700);
  c.fillStyle = dots(c, '#ec8a76', 14, 2.8);
  c.fillRect(-400, -400, 2400, 1700);
  // under-brow shadow in blue dots: the romance-comic tone
  c.fillStyle = dots(c, rgba(POP.blue, 0.8), 14, 3.2);
  c.fill(ellPath(EYE[0] + 40, EYE[1] - 230, 560, 120, 0.04));
  // hair falling over the brow
  const hair = new Path2D();
  hair.moveTo(-400, -400);
  hair.lineTo(2000, -400);
  hair.lineTo(2000, 40);
  hair.bezierCurveTo(1500, 110, 1200, 40, 1000, 90);
  hair.bezierCurveTo(800, 140, 500, 40, 200, 120);
  hair.lineTo(-400, 140);
  hair.closePath();
  inked(c, hair, POP.black, 0, 0);
  const hl = new Path2D();
  for (let i = 0; i < 8; i++) {
    const x = 60 + i * 200;
    brush([[x, -10], [x + 50, 40], [x + 70, 90]], 18, hl, 0.6, 1);
  }
  c.fillStyle = POP.blue;
  c.fill(hl);
  // the eye: determined glare, brow knitted down
  const blink = Math.max(0, 1 - Math.abs(t - 0.45) / 0.08);
  W2(c, () => {
    c.translate(EYE[0], EYE[1]);
    c.scale(EYE_U, EYE_U);
    eye(c, { look: [0, 0], lid: blink, glare: 0.25, brow: 0.05, browTilt: -0.35, iris: POP.cyan });
  });
  // reflection of the loaded bar in the iris
  W2(c, () => {
    c.translate(IRIS[0] + 30, IRIS[1] + 40);
    c.fillStyle = rgba(POP.white, 0.85);
    c.fillRect(-60, -3, 120, 6);
    c.fillRect(-56, -16, 12, 32);
    c.fillRect(44, -16, 12, 32);
    c.fillRect(-66, -11, 8, 22);
    c.fillRect(58, -11, 8, 22);
  });
  // a single tear
  const grow = tween(t, 0.8, 1.3, ease.outBack);
  const roll = tween(t, 1.5, 3.1, ease.inOutSine);
  if (grow > 0) {
    const x0 = EYE[0] + 0.93 * EYE_U;
    const y0 = EYE[1] + 0.12 * EYE_U;
    const x = x0 + roll * 30;
    const y = y0 + 30 + roll * 330;
    if (roll > 0) {
      const tr = new Path2D();
      brush([[x0, y0 + 10], [x0 + roll * 14, y0 + roll * 170], [x, y - 30]], 12, tr, 0.5, 0.3);
      c.fillStyle = rgba(POP.white, 0.85);
      c.fill(tr);
    }
    drop(c, x, y, 30 * grow, 0.1, 4);
  }
  // nose ridge
  const nose = new Path2D();
  brush([[EYE[0] - 420, EYE[1] - 40], [EYE[0] - 470, EYE[1] + 200], [EYE[0] - 440, EYE[1] + 380]], 14, nose);
  c.fillStyle = POP.black;
  c.fill(nose);
};

/* ---------- scene 3 extras ---------- */

const insetPanel = (c: Ctx, t: number, k: number) => {
  if (k <= 0) return;
  // extreme close-up of the clenched eye and a vein, in a tilted panel
  const x = lerp(1700, 980, ease.outBack(k));
  W2(c, () => {
    c.translate(x, 40);
    c.rotate(0.05);
    const p = rectPath(0, 0, 560, 330);
    W2(c, () => {
      c.clip(p);
      c.fillStyle = '#fde4cb';
      c.fill(p);
      c.fillStyle = dots(c, POP.red, 12, 3.4);
      c.fill(p);
      const sh = shake(t, 4, 2, 30);
      W2(c, () => {
        c.translate(270 + sh[0], 190 + sh[1]);
        c.scale(150, 150);
        eye(c, { lid: 0.92, glare: 1, brow: 0.45, browTilt: -0.6 });
      });
      // throbbing vein on the temple
      const v = new Path2D();
      const th = 1 + Math.sin(t * 22) * 0.2;
      brush([[470, 40], [450, 110], [480, 170], [455, 240]], 14 * th, v, 0.3, 0.3);
      brush([[450, 110], [510, 130]], 10 * th, v, 0.3, 0.6);
      c.fillStyle = POP.blue;
      c.fill(v);
      drop(c, 90, 260 + ((t * 120) % 40), 16, 0.2, 3);
    });
    c.strokeStyle = POP.black;
    c.lineWidth = 10;
    c.stroke(p);
  });
};

/* ---------- film ---------- */

export const popGymHeroFilm: RisoFilm<State> = {
  id: 'pop-gym-hero',
  title: 'Leg Day',
  caption: 'A tear, a bar, a squat, and the stairs that came after.',
  theme: 'Fitness',
  motif: 'The plate: iris, weight, star burst, sun',
  duration: DUR,
  series: 'Pop art',
  mode: 'direct',
  paper: POP.paper,
  paperTexture: true,
  grain: 0.14,
  inks: [{ color: POP.red }, { color: POP.cyan }, { color: POP.yellow }, { color: POP.black }],
  scenes: [
    { at: 0, label: "It's leg day" },
    { at: T_S2, label: 'The bar' },
    { at: T_DOWN0, label: 'The squat' },
    { at: T_WALK0, label: 'The walk out' },
    { at: T_S5, label: 'The stairs' },
  ],
  posterTime: 10.45,
  setup() {
    const [plateA, starB] = morphPair(circlePts(0, 0, PLATE_R, 120), burstPts(0, 0, 330, 560, 16, 4), 128);
    return { plateA, starB };
  },
  draw(r, t, s) {
    const c = r.layers[0];
    c.lineJoin = 'round';
    c.lineCap = 'round';

    /* scene 1: the eye, then the dive into the iris */
    if (t < T_S2) {
      const dive = tween(t, T_DIVE0, T_S2, ease.inCubic);
      const z = lerp(1.0, 1.06, seg(t, 0, T_DIVE0)) * logLerp(1, 7.6, dive);
      const cx = lerp(EYE[0], IRIS[0], dive);
      const cy = lerp(EYE[1] - 20, IRIS[1], seg(t, T_DIVE0 - 0.4, T_S2));
      r.camera(cx, cy, z, 0.02 * Math.sin(t * 0.8));
      drawEyeScene(c, t);
      // the iris becomes the plate
      const k = tween(t, T_DIVE0 + 0.35, T_S2 - 0.1);
      if (k > 0) {
        c.save();
        c.globalAlpha = k;
        drawPlate(c, IRIS[0], IRIS[1], IRIS_R, 1, POP.red, 0);
        c.restore();
      }
      r.camera(800, 450, 1);
      const b1 = tween(t, 0.5, 0.75, ease.outBack) * (1 - tween(t, T_DIVE0, T_DIVE0 + 0.3));
      const lines = t < 1.7 ? ["IT'S..."] : ["IT'S... LEG DAY."];
      balloon(c, 390, 760, t < 1.7 ? 160 : 300, 82, [700, 980], lines, 46, b1);
      return;
    }

    /* the lifter's state along the whole film */
    const S = 1;
    let bar: Pt = RACK;
    let pose: Pose;
    let strain = 0;
    if (t < T_UNRACK0) {
      // chalk up, then step in under the bar
      const walk = tween(t, T_PULL1 + 0.15, T_WALK1, ease.inOutSine);
      const x = lerp(330, 712, walk);
      const clap = Math.max(0, 1 - Math.abs(t - T_CLAP) / 0.25);
      const chest: Pt = [x + 70, 380 + clap * 6];
      const stand: Pose = {
        legs: LEGS,
        hip: [x, 542 + Math.sin(walk * Math.PI * 2) * 6 + walk * 10],
        lean: 0.08 + walk * 0.12,
        head: -0.05,
        ankleN: [x + 14 + Math.sin(walk * Math.PI) * 40, ANKLE_Y - Math.sin(walk * Math.PI) * 20],
        ankleF: [x - 10, ANKLE_Y],
        wristN: chest,
        wristF: [chest[0] - 6, chest[1] + 4],
        elbowN: 1,
        elbowF: 1,
        handN: 'open',
        handF: 'open',
        mouth: 0,
      };
      if (walk > 0) {
        const g = withBar(stand, S);
        const gk = seg(walk, 0.5, 1);
        stand.wristN = lerpPt(chest, [RACK[0] + 14, RACK[1] + 18], gk);
        stand.wristF = lerpPt(chest, [RACK[0] + 4, RACK[1] + 16], gk);
        stand.handN = gk > 0.6 ? 'grip' : 'open';
        stand.handF = stand.handN;
        void g;
      }
      pose = stand;
    } else if (t < T_RERACK1) {
      // unrack, descend, grind, drive, lock out, re-rack
      let depth = 0;
      if (t < T_DOWN0) depth = 0.12 * (1 - tween(t, T_UNRACK0, T_UNRACK1, ease.inOutCubic));
      else if (t < T_DOWN1) depth = tween(t, T_DOWN0, T_DOWN1, ease.inOutSine);
      else if (t < T_UP0) depth = 1 - 0.06 * seg(t, T_DOWN1 + 0.4, T_UP0) + Math.sin(t * 40) * 0.008;
      else if (t < T_LOCK) depth = 0.94 * (1 - tween(t, T_UP0, T_LOCK, ease.inOutCubic));
      else depth = 0;
      strain = t > T_DOWN1 - 0.2 && t < T_LOCK ? 1 : t > T_DOWN0 ? 0.4 : 0;
      const p = squatPose(depth, 712, strain);
      if (t >= T_LOCK) {
        p.mouth = t < T_RERACK0 ? 1 : 0;
        p.head = -0.2;
        p.puff = 1 - seg(t, T_RERACK0, T_RERACK1);
      }
      const g = withBar(p, S);
      pose = g.pose;
      bar = g.bar;
      if (t < T_UNRACK1) {
        const k = tween(t, T_UNRACK0, T_UNRACK1, ease.inOutCubic);
        bar = lerpPt(RACK, g.bar, k);
      }
      if (t > T_RERACK0) {
        const k = tween(t, T_RERACK0, T_RERACK1, ease.inOutCubic);
        bar = lerpPt(g.bar, [RACK[0], RACK[1] - 10 * Math.sin(k * Math.PI)], k);
        pose.wristN = [bar[0] + 14, bar[1] + 18];
        pose.wristF = [bar[0] + 4, bar[1] + 16];
      }
    } else {
      // jelly legs out of the gym
      const wk = seg(t, T_WALK0, T_STOP);
      const x = lerp(740, 2380, ease.inOutSine(wk));
      const ramp = ease.inOutSine(seg(t, T_WALK0, T_WALK0 + 0.5));
      const wob = (t < T_STOP ? 1 : 1 - seg(t, T_STOP, T_STOP + 0.5) * 0.6) * ramp;
      const tt = t < T_STOP ? t : T_STOP + (t - T_STOP) * 0.15;
      pose = walkCycle(tt, x, wob, (t < T_STOP ? 58 : 58 * (1 - seg(t, T_STOP, T_STOP + 0.4))) * ramp);
      pose.hip[1] = lerp(540, pose.hip[1], ramp);
      if (t > T_STOP) pose.mouth = -1;
      const let0 = seg(t, T_WALK0, T_WALK0 + 0.35);
      pose.wristN = lerpPt([RACK[0] + 14, RACK[1] + 18], pose.wristN, let0);
      pose.wristF = lerpPt([RACK[0] + 4, RACK[1] + 16], pose.wristF, let0);
    }

    /* scene 5: twenty minutes later, at the top of the stairs */
    if (t >= T_S5) {
      const tilt = tween(t, T_S5, T_TOP, ease.inOutCubic);
      const settle = ease.outCubic(seg(t, T_TOP, 17.2));
      const cx = lerp(2300, SUNC[0] - 60, tilt);
      const cy = lerp(450, TOP_Y - 300, tilt);
      const z = lerp(1.05, 0.88, tilt) + 0.08 * (1 - settle) * tilt - 0.03 * seg(t, 17.2, DUR);
      r.camera(cx, cy, z, -0.03 * Math.sin(tilt * Math.PI));
      drawGym(c, t);
      // the plate-sun: a giant gold plate whose rim bursts into rays
      const sunK = tween(t, T_S5 + 0.5, T_TOP, ease.outCubic);
      W2(c, () => {
        const rays = new Path2D();
        const n = 20;
        for (let i = 0; i < n; i++) {
          const a = t * 0.08 + (i / n) * TAU;
          rays.moveTo(SUNC[0], SUNC[1]);
          rays.lineTo(SUNC[0] + Math.cos(a) * 2600, SUNC[1] + Math.sin(a) * 2600);
          rays.lineTo(SUNC[0] + Math.cos(a + TAU / n / 2) * 2600, SUNC[1] + Math.sin(a + TAU / n / 2) * 2600);
          rays.closePath();
        }
        c.globalAlpha = sunK;
        c.fillStyle = rgba(POP.red, 0.55);
        c.fill(rays);
        c.fillStyle = dots(c, rgba(POP.deepRed, 0.6), 22, 6);
        c.fill(rays);
        c.globalAlpha = 1;
        const star = polyP(morph(s.plateA, s.starB, 1).map(([x, y]) => [SUNC[0] + x * sunK, SUNC[1] + y * sunK] as Pt));
        inked(c, star, POP.yellow, 9);
        drawPlate(c, SUNC[0], SUNC[1], 300 * sunK + 1, 1, POP.orange, t * 0.1);
      });
      drawStairs(c);
      // the hero at the top: arms up, chest out
      const breathe = Math.sin(t * 3) * 6;
      const hx = HERO_TOP_X;
      const hy = TOP_Y - 24;
      const up = tween(t, T_TOP - 0.5, T_TOP + 0.1, ease.outBack);
      const top: Pose = {
        legs: LEGS,
        hip: [hx, hy - 262],
        lean: -0.06,
        head: -0.32,
        puff: 1,
        ankleN: [hx + 52, hy],
        ankleF: [hx - 56, hy],
        wristN: [hx + lerp(60, 150, up), hy - lerp(300, 610, up) + breathe],
        wristF: [hx - lerp(40, 120, up), hy - lerp(300, 600, up) + breathe],
        elbowN: -1,
        elbowF: 1,
        handN: 'fist',
        handF: 'fist',
        mouth: 1,
        squint: 0,
      };
      c.fillStyle = rgba(POP.black, 0.35);
      c.fill(ellPath(hx, hy + 8, 130, 14));
      figure(c, top, LIFTER, S, 1, belt(c));
      // little victory sparks around the fists
      if (up > 0.5) {
        for (const [fx, fy, sd] of [
          [top.wristN[0] + 30, top.wristN[1] - 40, 1],
          [top.wristF[0] - 30, top.wristF[1] - 40, 2],
        ] as const) {
          const sp = polyP(burstPts(fx, fy, 14, 36 + Math.sin(t * 9 + sd) * 6, 6, sd));
          inked(c, sp, POP.white, 4);
        }
      }
      r.camera(800, 450, 1);
      posterFinish(c, tween(t, 16.4, 17.2, ease.inOutCubic), 'LEG DAY', 70);
      return;
    }

    /* scenes 2-4: one continuous gym, the camera follows */
    let cx = 650;
    let cy = 440;
    let z = 1;
    let rot = 0;
    if (t < T_PULL1) {
      const k = tween(t, T_S2, T_PULL1, ease.outCubic);
      const pc: Pt = [RACK[0] + PLATE_OFF[0], RACK[1] + PLATE_OFF[1]];
      z = logLerp(IRIS_R * 7.6 / PLATE_R, 1.0, k);
      cx = lerp(pc[0], 650, k);
      cy = lerp(pc[1], 440, k);
      rot = 0.05 * (1 - k);
    } else if (t < T_DOWN0) {
      const k = tween(t, T_PULL1, T_DOWN0, ease.inOutSine);
      z = lerp(1.0, 1.3, k);
      cx = lerp(650, 700, k);
      cy = lerp(440, 400, k);
      rot = -0.03 * k;
      if (t > T_UNRACK0 && t < T_UNRACK1 + 0.2) {
        const sh = shake(t, 5, 3);
        cx += sh[0];
        cy += sh[1];
      }
    } else if (t < T_DOWN1) {
      // descend: low angle pull out
      const k = tween(t, T_DOWN0, T_DOWN1, ease.inOutSine);
      z = lerp(1.3, 1.05, k);
      cx = lerp(700, 660, k);
      cy = lerp(400, 500, k);
      rot = lerp(-0.03, 0.04, k);
    } else if (t < T_UP0) {
      // the grind: push in on the face, shaking
      const k = tween(t, T_DOWN1, T_DOWN1 + 0.5, ease.outCubic);
      z = lerp(1.05, 1.45, k);
      cx = lerp(660, 690, k);
      cy = lerp(500, 540, k);
      rot = 0.04;
      const sh = shake(t, 7, 4, 30);
      cx += sh[0];
      cy += sh[1];
    } else if (t < T_WALK0) {
      // drive up, lockout punch, re-rack
      const k = tween(t, T_UP0, T_LOCK, ease.inCubic);
      const out = tween(t, T_LOCK, T_LOCK + 0.5, ease.outCubic);
      z = lerp(1.45, 1.15, k) - 0.2 * out + 0.12 * tween(t, T_RERACK0, T_WALK0 + 0.2);
      cx = lerp(690, 700, k);
      cy = lerp(540, 380, k) + out * 40;
      rot = lerp(0.04, -0.02, k);
      const sh = shake(t, 16 * (1 - seg(t, T_LOCK, T_LOCK + 0.6)) * (t > T_LOCK ? 1 : 0) + 3 * (t < T_LOCK ? 1 : 0), 5, 24);
      cx += sh[0];
      cy += sh[1];
    } else {
      // track the walk out to the stairs
      const k = tween(t, T_WALK0, T_STOP + 0.3, ease.inOutSine);
      z = lerp(1.07, 1.12, k) + 0.15 * tween(t, T_STOP, T_S5, ease.inOutSine);
      cx = lerp(700, 2350, k) + 60 * tween(t, T_STOP, T_S5);
      cy = lerp(380, 450, k) - 60 * tween(t, T_STOP, T_S5);
      rot = 0.015 * Math.sin(t * 2);
    }
    r.camera(cx, cy, z, rot);
    drawGym(c, t);
    drawStairs(c);
    drawRack(c, false);
    drawFarPlate(c, bar);

    // the plate turns into a star burst at lockout (behind the lifter)
    const lockK = tween(t, T_LOCK, T_LOCK + 0.25, ease.outBack) * (1 - tween(t, T_RERACK0 - 0.2, T_RERACK1));
    if (lockK > 0) {
      const pc: Pt = [bar[0] + PLATE_OFF[0] + 40, bar[1] + PLATE_OFF[1]];
      const st = polyP(morph(s.plateA, s.starB, clamp(lockK)).map(([x, y]) => [pc[0] + x * lockK, pc[1] + y * lockK] as Pt));
      inked(c, st, POP.yellow, 9);
      W2(c, () => {
        c.clip(st);
        c.fillStyle = dots(c, POP.orange, 24, 7);
        c.fill(st);
      });
      const inner = polyP(burstPts(pc[0], pc[1], 200 * lockK, 340 * lockK, 12, 9));
      inked(c, inner, POP.red, 7);
    }
    // drive: speed lines rising behind him
    if (t > T_UP0 && t < T_LOCK + 0.1) speedLines(c, 640, 300, 420, 360, -Math.PI / 2, 12, Math.floor(t * 18), 9);
    if (t > T_DOWN1 && t < T_UP0) focusLines(c, 700, 450, 360, 1600, 70, Math.floor(t * 12), 0.01, rgba(POP.black, 0.9));

    // shadow on the floor
    c.fillStyle = rgba(POP.black, 0.4);
    c.fill(ellPath(pose.hip[0] + 10, GROUND - 2, 140, 14));
    figure(c, pose, LIFTER, S, 1, belt(c));
    drawNearPlate(c, bar, t < T_PULL1 ? lerp(1, SQUASH, tween(t, T_S2, T_PULL1)) : SQUASH);
    drawRack(c, true);

    // chalk puff
    const ck = seg(t, T_CLAP, T_CLAP + 0.9);
    if (ck > 0 && ck < 1) {
      const puff = new Path2D();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const d = 30 + ease.outCubic(ck) * 90;
        circPath(330 + 70 + Math.cos(a) * d, 380 + Math.sin(a) * d * 0.7 - ck * 40, (26 + hash(i) * 20) * (1 - ck * 0.4), puff);
      }
      c.globalAlpha = 1 - ck;
      inked(c, puff, POP.white, 4);
      c.globalAlpha = 1;
    }
    // wobble lines around the knees on the walk out
    if (t > T_WALK0 + 0.3 && t < T_S5) {
      const b = solve(pose, S, 1);
      const wl = new Path2D();
      for (const kn of [b.kneeN, b.kneeF]) {
        for (const sd of [-1, 1]) {
          const ph = Math.floor(t * 12) % 2;
          brush(
            [
              [kn[0] + sd * (44 + ph * 6), kn[1] - 22],
              [kn[0] + sd * (54 + ph * 6), kn[1]],
              [kn[0] + sd * (44 + ph * 6), kn[1] + 22],
            ],
            6,
            wl
          );
        }
      }
      c.fillStyle = POP.black;
      c.fill(wl);
      drop(c, b.toH(-20, -70)[0] - 20, b.toH(-20, -70)[1], 13, -0.3, 3);
    }

    // lettering in the world

    // screen-space overlays
    r.camera(800, 450, 1);
    insetPanel(c, t, seg(t, T_DOWN1 + 0.15, T_DOWN1 + 0.45) * (1 - seg(t, T_UP0 - 0.1, T_UP0 + 0.2)));
    const gr = tween(t, T_DOWN1 + 0.25, T_DOWN1 + 0.45, ease.outBack) * (1 - tween(t, T_UP0, T_UP0 + 0.15));
    if (gr > 0) {
      const sh = shake(t, 6, 8, 34);
      boom(c, 'GRRRR!', 520 + sh[0], 640 + sh[1], 150 * gr, { fill: POP.red, side: POP.black, rot: -0.12, steps: 8, seed: 5 });
    }
    if (t >= T_LOCK && t < T_LOCK + 0.08) {
      c.globalCompositeOperation = 'difference';
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 1600, 900);
      c.globalCompositeOperation = 'source-over';
    }
    void REG;
  },
};
