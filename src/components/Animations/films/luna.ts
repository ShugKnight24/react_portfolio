import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import {
  DISPLAY,
  MONO,
  TAU,
  clamp,
  ease,
  hash,
  lerp,
  morph,
  morphPair,
  mulberry,
  polarPts,
  polyPath,
  seg,
  smoothPath,
  spacedText,
  tween,
  type Pt,
} from '../riso/kit';

/**
 * Luna: a moonlit walk with my hiking buddy.
 * Motif: a circle. The full moon Luna sits against drops into her tennis ball; she chases it
 * down the ridge at dawn, leaving paw prints along the trail; at dusk the prints float up and
 * become stars that draw her, curled up asleep; the ball goes back up and becomes the moon.
 */

const BLUE = 0;
const PINK = 1;
const GOLD = 2;

const T_DROP = 3.8;
const T_LAND = 4.6;
const T_RUN = 4.7;
const T_CATCH = 7.4;
const T_TRAIL = 7.8;
const T_RISE = 11.4;
const T_MOON = 15.0;
const DURATION = 18.5;

const SIT_X = 640;
const MOON0: Pt = [790, 470];
const MOON0_R = 235;
const BALL_R = 19;
const LUNA_SCALE = 1.7;
const SKY: Pt = [1800, -420];
/** The constellation: Luna sitting, the moon over her shoulder, like the opening shot */
const STAR_DOG: Pt = [SKY[0] - 250, SKY[1] + 250];
/** Constellation edges between the outline landmarks (chin, nose, brow, ear, neck, back, rump, tail, haunch, paws, chest) */
const EDGES: [number, number][] = [
  [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [6, 8], [8, 9], [9, 10], [10, 11], [11, 0], [0, 1],
];
const STAR_SCALE = 4.4;
const SKY_MOON: Pt = [SKY[0] + 250, SKY[1] - 170];
const SKY_MOON_R = 118;

interface DogPose {
  tilt: number;
  bob: number;
  neck: number;
  head: number;
  tail: number;
  /** [upper, lower] absolute angles from vertical, + is forward */
  ff: [number, number];
  fn: [number, number];
  /** Femur, tibia, metatarsal */
  bn: [number, number, number];
  bf: [number, number, number];
  /** 1 when sitting */
  sit: number;
}

interface Print {
  x: number;
  y: number;
  rot: number;
  /** When Luna stamps it */
  at: number;
}

interface State {
  far: Path2D;
  mid: Path2D;
  ground: Path2D;
  starsNight: Pt[];
  craters: [number, number, number][];
  prints: Print[];
  /** Star targets, relative to the sky moon */
  stars: Pt[];
  padPrint: Pt[];
  padStar: Pt[];
}

/* ---------- world ---------- */

const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

const groundY = (x: number) =>
  640 + 6 * Math.sin(x / 70) + 85 * smoothstep(1000, 1750, x) + 22 * Math.sin(x / 240) * smoothstep(1150, 1800, x);

/** Stacked-tier pine silhouette */
const pine = (p: Path2D, x: number, base: number, h: number, w: number, rng: () => number) => {
  const tiers = 4 + Math.floor(rng() * 3);
  const pts: Pt[] = [[x, base - h]];
  const right: Pt[] = [];
  for (let k = 1; k <= tiers; k++) {
    const y = base - h + (h * 0.92 * k) / tiers;
    const ww = (w * (0.35 + 0.65 * (k / tiers))) / 2;
    right.push([x + ww * (0.9 + rng() * 0.2), y], [x + ww * 0.45, y - h * 0.05]);
  }
  pts.push(...right);
  pts.push([x + w * 0.06, base - h * 0.08], [x + w * 0.06, base + 30], [x - w * 0.06, base + 30], [x - w * 0.06, base - h * 0.08]);
  for (let i = right.length - 1; i >= 0; i--) pts.push([2 * x - right[i][0], right[i][1]]);
  polyPath(pts, true, p);
};

const ridgePath = (y: (x: number) => number, x0: number, x1: number, bottom: number) => {
  const p = new Path2D();
  p.moveTo(x0, bottom);
  for (let x = x0; x <= x1; x += 12) p.lineTo(x, y(x));
  p.lineTo(x1, bottom);
  p.closePath();
  return p;
};

/* ---------- Luna ---------- */

const SIT: DogPose = {
  tilt: -0.78,
  bob: 0,
  neck: -1.38,
  head: -0.3,
  tail: -0.35,
  fn: [0.1, 0.06],
  ff: [0.02, -0.02],
  bn: [1.42, -1.1, 1.57],
  bf: [1.36, -1.2, 1.5],
  sit: 1,
};

const run = (p: number): DogPose => {
  const front = (q: number): [number, number] => {
    const s = Math.sin(q * TAU);
    const c = Math.cos(q * TAU);
    const a = 0.12 + 0.85 * s;
    return [a, a - 1.25 * Math.max(0, c) + 0.1];
  };
  const back = (q: number): [number, number, number] => {
    const s = Math.sin(q * TAU);
    const c = Math.cos(q * TAU);
    const f = 0.5 - 0.8 * s;
    const ti = f - 1.15 - 0.45 * Math.max(0, -c);
    return [f, ti, ti + 0.7];
  };
  return {
    tilt: 0.08 * Math.sin(p * TAU + 0.6),
    bob: -5 * Math.max(0, Math.cos(p * TAU)),
    neck: -0.8 + 0.1 * Math.sin(p * TAU),
    head: 0.15 + 0.07 * Math.cos(p * TAU),
    tail: 0.25 + 0.2 * Math.sin(p * TAU * 2),
    fn: front(p),
    ff: front(p + 0.12),
    bn: back(p + 0.5),
    bf: back(p + 0.62),
    sit: 0,
  };
};

const blendPose = (a: DogPose, b: DogPose, k: number): DogPose => {
  const l = (x: number[], y: number[]) => x.map((v, i) => lerp(v, y[i], k));
  return {
    tilt: lerp(a.tilt, b.tilt, k),
    bob: lerp(a.bob, b.bob, k),
    neck: lerp(a.neck, b.neck, k),
    head: lerp(a.head, b.head, k),
    tail: lerp(a.tail, b.tail, k),
    fn: l(a.fn, b.fn) as [number, number],
    ff: l(a.ff, b.ff) as [number, number],
    bn: l(a.bn, b.bn) as [number, number, number],
    bf: l(a.bf, b.bf) as [number, number, number],
    sit: lerp(a.sit, b.sit, k),
  };
};

const TORSO: Pt[] = [
  [50, -6], [46, -17], [32, -26], [10, -22], [-14, -20], [-34, -22], [-48, -19], [-56, -7],
  [-52, 8], [-38, 14], [-20, 6], [0, 8], [22, 15], [40, 12],
];
const SKULL: Pt[] = [
  [-4, -2], [3, -11], [14, -13], [22, -9], [27, -4], [38, -2], [44, -1], [47, 3], [43, 8], [30, 10], [16, 12], [4, 10], [-3, 5],
];
const EAR: Pt[] = [[5, -8], [3, -17], [1, -27], [10, -20], [15, -10]];

const rotPt = ([x, y]: Pt, a: number, o: Pt): Pt => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = x - o[0];
  const dy = y - o[1];
  return [o[0] + dx * c - dy * s, o[1] + dx * s + dy * c];
};

type Seg = [Pt, Pt, number];

interface DogShape {
  body: Path2D[];
  segs: Seg[];
  paws: Pt[];
  thighs: [Pt, number][];
  tail: Pt[];
  eye: Pt;
  mouth: Pt;
  /** Lowest point, for standing her on the ground */
  low: number;
  /** Outline landmarks, chin round to chest, used for the constellation */
  keys: Pt[];
}

/** Luna in profile, facing right, origin at her body centre */
const dogShape = (pose: DogPose): DogShape => {
  const hip: Pt = [-38, 2];
  const tp = (p: Pt) => rotPt(p, pose.tilt, hip);
  const body: Path2D[] = [smoothPath(TORSO.map(tp), true, 0.5)];

  const base = tp([38, -14]);
  const dir: Pt = [Math.cos(pose.neck), Math.sin(pose.neck)];
  const back: Pt = [Math.sin(pose.neck), -Math.cos(pose.neck)];
  const end: Pt = [base[0] + dir[0] * 26, base[1] + dir[1] * 26];
  body.push(
    smoothPath(
      [tp([20, -24]), [end[0] + back[0] * 10, end[1] + back[1] * 10], [end[0] - back[0] * 11, end[1] - back[1] * 11], tp([48, -2])],
      true,
      0.35
    )
  );
  const hr = (q: Pt) => rotPt(q, pose.head, [0, 0]);
  const anchor = hr([5, 6]);
  const hp = (q: Pt): Pt => {
    const r = hr(q);
    return [r[0] - anchor[0] + end[0], r[1] - anchor[1] + end[1]];
  };
  body.push(smoothPath(EAR.map(([x, y]) => hp([x - 6, y + 2])), true, 0.35));
  body.push(smoothPath(SKULL.map(hp), true, 0.5));
  body.push(smoothPath(EAR.map(hp), true, 0.35));

  const segs: Seg[] = [];
  const paws: Pt[] = [];
  const thighs: [Pt, number][] = [];
  const step = (from: Pt, a: number, len: number): Pt => [from[0] + Math.sin(a) * len, from[1] + Math.cos(a) * len];
  const sh = tp([30, 2]);
  const hj = tp([-38, 2]);
  // Far legs first so near legs read on top (same ink, but order keeps joints tidy)
  for (const [a, b] of [pose.ff, pose.fn]) {
    const k = step(sh, a, 26);
    const f = step(k, b, 25);
    segs.push([sh, k, 12], [k, f, 8.5]);
    paws.push(f);
  }
  for (const [a, b, c] of [pose.bf, pose.bn]) {
    const st = step(hj, a, 24);
    const hk = step(st, b, 22);
    const f = step(hk, c, 13);
    segs.push([st, hk, 9], [hk, f, 7.5]);
    thighs.push([[(hj[0] + st[0]) / 2, (hj[1] + st[1]) / 2], Math.atan2(st[1] - hj[1], st[0] - hj[0])]);
    paws.push(f);
  }
  const rump = tp([-53, -12]);
  const tail: Pt[] = [
    rump,
    [rump[0] - 16, rump[1] - 4 - 16 * pose.tail],
    [rump[0] - 30, rump[1] + 6 - 26 * pose.tail],
  ];
  let low = -Infinity;
  for (const p of paws) low = Math.max(low, p[1] + 3.5);
  low = Math.max(low, tp([-52, 8])[1]);
  const keys: Pt[] = [
    hp([30, 10]), hp([47, 3]), hp([22, -9]), hp([1, -27]), tp([20, -24]), tp([-14, -20]),
    tp([-56, -7]), tail[2], tp([-52, 8]), paws[3], paws[1], tp([50, -6]),
  ];
  return { body, segs, paws, thighs, tail, eye: hp([19, -5]), mouth: hp([41, 7]), low, keys };
};

/** Stand her on her lowest paw; the gait's bob adds a little float between strides */
const dogLift = (pose: DogPose) => dogShape(pose).low;

const drawDog = (
  ctx: Ctx,
  pose: DogPose,
  x: number,
  groundAt: number,
  s: number,
  opts: { eye?: boolean; style?: (ctx: Ctx) => string | CanvasPattern } = {}
) => {
  const d = dogShape(pose);
  ctx.save();
  ctx.translate(x, groundAt - (dogLift(pose) - pose.bob) * s);
  ctx.scale(s, s);
  const style = opts.style?.(ctx) ?? '#000';
  ctx.fillStyle = style;
  ctx.strokeStyle = style;
  for (const b of d.body) ctx.fill(b);
  for (const [c, a] of d.thighs) {
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], 17, 12, a, 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [a, b, w] of d.segs) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  for (const f of d.paws) {
    ctx.beginPath();
    ctx.ellipse(f[0] + 3, f[1], 7, 4, 0, 0, TAU);
    ctx.fill();
  }
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(d.tail[0][0], d.tail[0][1]);
  ctx.quadraticCurveTo(d.tail[1][0], d.tail[1][1], d.tail[2][0], d.tail[2][1]);
  ctx.stroke();
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(d.tail[1][0], d.tail[1][1]);
  ctx.quadraticCurveTo(d.tail[2][0] + 2, d.tail[2][1] - 4, d.tail[2][0] - 4, d.tail[2][1] + 3);
  ctx.stroke();
  if (opts.eye) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(d.eye[0], d.eye[1], 2.3, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
};

/** Where her mouth is, in world space */
const mouthAt = (pose: DogPose, x: number, groundAt: number, s: number): Pt => {
  const m = dogShape(pose).mouth;
  return [x + m[0] * s, groundAt - (dogLift(pose) - pose.bob) * s + m[1] * s];
};

/* ---------- timeline helpers ---------- */

const lunaX = (t: number) => {
  if (t < T_RUN) return SIT_X;
  const dt = t - T_RUN;
  const k = 0.6;
  const v = 470;
  if (t < T_CATCH) return SIT_X + v * (dt - k * (1 - Math.exp(-dt / k)));
  const dc = T_CATCH - T_RUN;
  const atCatch = SIT_X + v * (dc - k * (1 - Math.exp(-dc / k)));
  return atCatch + 300 * (t - T_CATCH);
};

const lunaPose = (t: number): DogPose => {
  if (t < T_RUN) {
    // A small head tilt up at the moon, then a look as it falls
    const look = tween(t, T_DROP, T_LAND, ease.inOutSine);
    return { ...SIT, head: SIT.head + 0.08 * Math.sin(t * 1.3) + look * 0.55, tail: SIT.tail + 0.2 * Math.sin(t * 5) * seg(t, 3, 4.6) };
  }
  // Gallop phase advances faster while sprinting, slower once she trots with the ball
  const sprint = (t - T_RUN) * 2.9;
  const phase = t < T_CATCH ? sprint : (T_CATCH - T_RUN) * 2.9 + (t - T_CATCH) * 2.1;
  const k = tween(t, T_RUN, T_RUN + 0.45, ease.outCubic);
  return blendPose(SIT, run(phase), k);
};

const ballState = (t: number): { x: number; y: number; r: number; seams: number } => {
  if (t < T_DROP) return { x: MOON0[0], y: MOON0[1] - moonRise(t), r: MOON0_R, seams: 0 };
  if (t < T_LAND) {
    const k = seg(t, T_DROP, T_LAND);
    const fall = ease.inCubic(k);
    const startY = MOON0[1] - moonRise(T_DROP);
    const endX = 900;
    return {
      x: lerp(MOON0[0], endX, ease.inOutSine(k)),
      y: lerp(startY, groundY(endX) - BALL_R, fall),
      r: lerp(MOON0_R, BALL_R, ease.inOutCubic(k)),
      seams: ease.inOutCubic(seg(k, 0.35, 1)),
    };
  }
  const dt = t - T_LAND;
  const tau = 2.4;
  const x = 900 + 520 * tau * (1 - Math.exp(-dt / tau));
  const h = 150 * Math.exp(-dt / 1.25) * Math.abs(Math.sin((Math.PI * dt) / 0.62));
  return { x, y: groundY(x) - BALL_R - h, r: BALL_R, seams: 1 };
};

const moonRise = (t: number) => 150 * ease.outCubic(seg(t, 0, 3.2));

/* ---------- motif pieces ---------- */

const drawMoonBall = (r: Riso, x: number, y: number, rad: number, seams: number, craters: [number, number, number][]) => {
  const [blue, pink, gold] = r.layers;
  const disk = new Path2D();
  disk.arc(x, y, rad, 0, TAU);
  for (const l of r.layers) {
    l.globalCompositeOperation = 'destination-out';
    l.fillStyle = '#000';
    l.fill(disk);
    l.globalCompositeOperation = 'source-over';
  }
  gold.fillStyle = '#000';
  gold.fill(disk);
  r.gradient(pink, disk, { kind: 'radial', cx: x - rad * 0.3, cy: y - rad * 0.35, r0: 0, r1: rad * 1.45, from: 0.02, to: 0.55 }, 9);
  // Craters fade out as the seams of the ball come in
  const ck = 1 - ease.inOutSine(clamp(seams * 1.6));
  if (ck > 0.02) {
    for (const [cx, cy, cr] of craters) {
      const p = new Path2D();
      p.arc(x + cx * rad, y + cy * rad, cr * rad * ck, 0, TAU);
      blue.fillStyle = r.tone(blue, 0.2);
      blue.fill(p);
    }
  }
  if (seams > 0.01) {
    const w = Math.max(1.2, rad * 0.12);
    const draw = (l: Ctx) => {
      l.save();
      l.clip(disk);
      l.globalCompositeOperation = 'destination-out';
      l.lineWidth = w * seams;
      l.lineCap = 'round';
      l.beginPath();
      l.arc(x - rad * 1.25, y, rad * 0.95, -0.9, 0.9);
      l.stroke();
      l.beginPath();
      l.arc(x + rad * 1.25, y, rad * 0.95, Math.PI - 0.9, Math.PI + 0.9);
      l.stroke();
      l.restore();
    };
    draw(gold);
    draw(pink);
  }
};

const PAD_PRINT: Pt[] = polarPts(0, 3, (a) => 7.5 + 1.6 * Math.cos(3 * (a + Math.PI / 2)) * 0.5 + 1.2 * Math.sin(a), 72);
const PAD_STAR: Pt[] = polarPts(0, 0, (a) => {
  const k = Math.abs(Math.cos(2 * (a + Math.PI / 2)));
  return 3 + 13 * Math.pow(k, 5);
}, 72);
const TOES: Pt[] = [[-9.5, -6], [-3.5, -11], [3.5, -11], [9.5, -6]];

const drawPrint = (ctx: Ctx, s: State, x: number, y: number, rot: number, scale: number, k: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot * (1 - k));
  ctx.scale(scale, scale);
  const pad = morph(s.padPrint, s.padStar, ease.inOutCubic(clamp(k * 1.25 - 0.1)));
  ctx.fill(smoothPath(pad, true, 0.5));
  const toe = 1 - ease.inCubic(clamp(k * 1.7));
  if (toe > 0.01) {
    for (const [tx, ty] of TOES) {
      ctx.beginPath();
      ctx.ellipse(tx * (0.4 + 0.6 * toe), ty * (0.4 + 0.6 * toe) - 1, 3.1 * toe, 3.9 * toe, tx * 0.04, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
};

/* ---------- film ---------- */

export const lunaFilm: RisoFilm<State> = {
  id: 'luna',
  title: 'Luna',
  caption: 'Moonrise, a dropped ball, a trail of paw prints, and a new constellation.',
  theme: 'Luna',
  motif: 'A circle: moon, tennis ball, moon again',
  duration: DURATION,
  paper: '#f4ecdb',
  inks: [
    { color: '#3d5588', angle: 15, offset: [0, 0], opacity: 0.92 },
    { color: '#ff48b0', angle: 75, offset: [1.6, -1.1], opacity: 0.85 },
    { color: '#ffb511', angle: 45, offset: [-1.2, 1.3], opacity: 0.9 },
  ],
  scenes: [
    { at: 0, label: 'Moonrise' },
    { at: T_DROP, label: 'Fetch' },
    { at: T_TRAIL, label: 'The trail' },
    { at: T_RISE, label: 'Constellation' },
    { at: T_MOON, label: 'Goodnight' },
  ],
  posterTime: 2.9,

  setup() {
    const rng = mulberry(42);
    const farY = (x: number) => 560 - 120 * Math.abs(Math.sin(x / 420 + 1.3)) - 50 * Math.sin(x / 170) * Math.sin(x / 97);
    const far = ridgePath(farY, -2200, 5200, 2400);
    const midY = (x: number) => 610 - 60 * Math.sin(x / 300 + 0.4) - 25 * Math.sin(x / 113);
    const mid = ridgePath(midY, -1800, 5000, 2400);
    for (let x = -1800; x < 5000; x += 34 + rng() * 40) {
      if (rng() < 0.3) continue;
      pine(mid, x, midY(x) + 6, 40 + rng() * 50, 22 + rng() * 14, rng);
    }
    const ground = ridgePath(groundY, -1400, 5200, 3000);
    for (let x = -1400; x < 5200; x += 28 + rng() * 46) {
      // Keep the ridge clear around Luna and the trail she runs on
      if (x > 420 && x < 3400 && rng() < 0.82) continue;
      pine(ground, x, groundY(x) + 10, 60 + rng() * 110, 30 + rng() * 26, rng);
    }

    const starsNight: Pt[] = [];
    for (let i = 0; i < 70; i++) starsNight.push([rng() * 1600, rng() * 520]);

    const craters: [number, number, number][] = [
      [-0.32, -0.28, 0.18], [0.28, -0.42, 0.11], [0.36, 0.12, 0.2], [-0.12, 0.38, 0.13], [-0.5, 0.15, 0.08], [0.05, -0.05, 0.07],
    ];

    // Prints stamped where her paws land along the trail
    const prints: Print[] = [];
    const xs = [790, 950, 1110, 1270, 1440, 1610, 1780, 1950, 2120, 2290, 2460, 2630];
    xs.forEach((x, i) => {
      // Solve when her front paw passes x (lunaX is monotonic)
      let lo = T_RUN;
      let hi = DURATION;
      for (let j = 0; j < 30; j++) {
        const m = (lo + hi) / 2;
        if (lunaX(m) + 30 * LUNA_SCALE < x) lo = m;
        else hi = m;
      }
      prints.push({ x, y: groundY(x) + 22 + (i % 2 ? 9 : -2), rot: 0.25 + (i % 2 ? 0.12 : -0.1), at: hi });
    });

    // Her sitting outline, scaled up into the sky
    const sit = dogShape(SIT);
    const stars = sit.keys.map(([x, y]) => [STAR_DOG[0] + x * STAR_SCALE, STAR_DOG[1] + (y - sit.low) * STAR_SCALE] as Pt);

    const [padPrint, padStar] = morphPair(PAD_PRINT, PAD_STAR, 72);
    return { far, mid, ground, starsNight, craters, prints, stars, padPrint, padStar };
  },

  draw(r, t, s) {
    const [blue, pink, gold] = r.layers;

    /* ----- camera ----- */
    const ball = ballState(t);
    const lx = lunaX(t);
    const follow = (lx + 40 * LUNA_SCALE + Math.min(ball.x, lx + 700)) / 2 + 120;
    let cx = 800;
    let cy = 450;
    let zoom = 1 + 0.06 * tween(t, 0, T_DROP, ease.inOutSine);
    const kFollow = tween(t, T_DROP + 0.4, T_LAND + 0.9, ease.inOutSine);
    cx = lerp(cx, follow, kFollow);
    cy = lerp(cy, 480, kFollow);
    zoom = lerp(zoom, 1.0, kFollow);
    const kWide = tween(t, T_TRAIL - 0.3, T_RISE, ease.inOutCubic);
    cx = lerp(cx, 1860, kWide);
    cy = lerp(cy, 400, kWide);
    zoom = lerp(zoom, 0.56, kWide);
    const kUp = tween(t, T_RISE - 0.2, T_MOON + 0.3, ease.inOutCubic);
    cx = lerp(cx, SKY[0] - 60, kUp);
    cy = lerp(cy, SKY[1] + 40, kUp);
    zoom = lerp(zoom, 0.82, kUp);
    zoom *= 1 + 0.05 * tween(t, T_MOON, DURATION, ease.outSine);
    const cam = (par: number) => r.camera(800 + (cx - 800) * par, 450 + (cy - 450) * par, 1 + (zoom - 1) * par);

    /* ----- sky (screen space) ----- */
    const dawn = tween(t, T_DROP + 0.2, 6.6, ease.inOutSine);
    const dusk = tween(t, 10.6, 13.6, ease.inOutSine);
    const night = 1 - dawn + dusk;
    r.camera(800, 450, 1);
    r.gradient(blue, null, {
      kind: 'linear', x0: 0, y0: 0, x1: 0, y1: 900,
      from: lerp(0.3, 0.95, night), to: lerp(0.0, 0.45, night),
    }, 14);
    const glow = Math.sin(clamp(dawn) * Math.PI * 0.5) * (1 - dusk) + 0.5 * Math.sin(seg(t, 9.5, 13.4) * Math.PI);
    if (glow > 0.02) {
      r.gradient(pink, null, { kind: 'linear', x0: 0, y0: 820, x1: 0, y1: 80, from: 0.7 * glow, to: 0 }, 12);
      r.gradient(gold, null, { kind: 'linear', x0: 0, y0: 760, x1: 0, y1: 260, from: 0.95 * glow, to: 0 }, 12);
    }
    // Night stars knocked out of the sky (paper), twinkling in place
    const starK = Math.max(1 - dawn, dusk);
    if (starK > 0.05) {
      cam(0.08);
      blue.globalCompositeOperation = 'destination-out';
      blue.fillStyle = '#000';
      for (let i = 0; i < s.starsNight.length; i++) {
        const [sx, sy] = s.starsNight[i];
        const tw = 0.6 + 0.4 * Math.sin(t * (1.5 + hash(i) * 2) + i);
        const rr = (0.8 + hash(i + 3) * 1.6) * tw * starK;
        blue.beginPath();
        blue.arc(sx * 1.6 - 400, sy * 1.4 - 500 + 400, rr, 0, TAU);
        blue.fill();
      }
      blue.globalCompositeOperation = 'source-over';
    }

    /* ----- the big moon, before it drops, lives behind the hills ----- */
    const paint = (p: Path2D, fills: [number, number][]) => {
      for (const l of r.layers) {
        l.globalCompositeOperation = 'destination-out';
        l.fillStyle = '#000';
        l.fill(p);
        l.globalCompositeOperation = 'source-over';
      }
      for (const [ink, d] of fills) {
        const l = r.layers[ink];
        l.fillStyle = r.tone(l, d);
        l.fill(p);
      }
    };

    const behind = t < T_DROP + 0.35;
    if (behind) {
      cam(1);
      drawMoonBall(r, ball.x, ball.y, ball.r, ball.seams, s.craters);
    }

    /* ----- hills ----- */
    const dark = night;
    cam(0.3);
    paint(s.far, [[BLUE, lerp(0.22, 0.42, dark)], [PINK, lerp(0.55, 0.4, dark)]]);
    cam(0.6);
    paint(s.mid, [[BLUE, lerp(0.62, 0.8, dark)], [PINK, lerp(0.3, 0.15, dark)]]);
    cam(1);
    paint(s.ground, [[BLUE, 1]]);

    /* ----- paw prints ----- */
    const riseK = (i: number) => tween(t, T_RISE + i * 0.17, T_RISE + i * 0.17 + 2.3, ease.inOutCubic);
    for (let i = 0; i < s.prints.length; i++) {
      const p = s.prints[i];
      if (t < p.at) continue;
      const pop = ease.outBack(seg(t, p.at, p.at + 0.25));
      const k = riseK(i);
      if (k > 0) continue; // drawn in the sky pass
      cam(1);
      pink.globalCompositeOperation = 'source-over';
      blue.globalCompositeOperation = 'destination-out';
      blue.fillStyle = '#000';
      drawPrint(blue, s, p.x, p.y, p.rot, 1.15 * pop, 0);
      blue.globalCompositeOperation = 'source-over';
      pink.fillStyle = '#000';
      drawPrint(pink, s, p.x, p.y, p.rot, 1.15 * pop, 0);
    }

    /* ----- Luna ----- */
    const pose = lunaPose(t);
    const ly = groundY(lx + 10) + 3;
    cam(1);
    for (const l of [pink, gold]) {
      l.globalCompositeOperation = 'destination-out';
      drawDog(l, pose, lx, ly, LUNA_SCALE);
      l.globalCompositeOperation = 'source-over';
    }
    drawDog(blue, pose, lx, ly, LUNA_SCALE, { eye: true });
    // Moon rim light along her back while she sits against it
    const rim = 1 - seg(t, T_DROP, T_RUN + 0.3);
    if (rim > 0.02) {
      gold.save();
      gold.translate(-2.4 * rim, -2.6 * rim);
      drawDog(gold, pose, lx, ly, LUNA_SCALE);
      gold.restore();
      gold.globalCompositeOperation = 'destination-out';
      drawDog(gold, pose, lx, ly, LUNA_SCALE);
      gold.globalCompositeOperation = 'source-over';
    }

    /* ----- the ball ----- */
    if (!behind && t < T_MOON) {
      cam(1);
      let bx = ball.x;
      let by = ball.y;
      if (t >= T_CATCH) [bx, by] = mouthAt(pose, lx, ly, LUNA_SCALE);
      else if (t > T_CATCH - 0.25) {
        const m = mouthAt(pose, lx, ly, LUNA_SCALE);
        const k = ease.inOutSine(seg(t, T_CATCH - 0.25, T_CATCH));
        bx = lerp(bx, m[0], k);
        by = lerp(by, m[1], k);
      }
      drawMoonBall(r, bx, by, ball.r, ball.seams, s.craters);
    }

    /* ----- prints rise and become stars ----- */
    const skyMoon = s.stars;
    const lineK = tween(t, 13.4, 16.6, ease.inOutSine);
    if (t > T_RISE) {
      cam(1);
      // Constellation lines, drawn star to star
      const pts = skyMoon;
      if (lineK > 0) {
        const upto = lineK * EDGES.length;
        pink.save();
        pink.lineWidth = 4;
        pink.lineCap = 'round';
        pink.lineJoin = 'round';
        pink.fillStyle = '#000';
        pink.strokeStyle = '#000';
        pink.beginPath();
        EDGES.forEach(([i, j], e) => {
          const f = clamp(upto - e);
          if (f <= 0) return;
          pink.moveTo(pts[i][0], pts[i][1]);
          pink.lineTo(lerp(pts[i][0], pts[j][0], f), lerp(pts[i][1], pts[j][1], f));
        });
        pink.stroke();
        pink.restore();
      }
      // Once the outline closes, she fills in faintly between the stars
      const ghost = tween(t, 15.6, 17.4, ease.inOutSine);
      if (ghost > 0) {
        const sit = SIT;
        drawDog(pink, sit, STAR_DOG[0], STAR_DOG[1], STAR_SCALE, { style: (c) => r.tone(c, 0.34 * ghost) });
      }
      for (let i = 0; i < s.prints.length; i++) {
        const k = riseK(i);
        if (k <= 0) continue;
        const p = s.prints[i];
        const tgt = pts[i];
        // Lift with a little sideways drift, like a lantern
        const x = lerp(p.x, tgt[0], ease.inOutSine(k)) + Math.sin(k * Math.PI) * (hash(i) - 0.5) * 220;
        const y = lerp(p.y, tgt[1], k);
        const tw = 1 + 0.12 * Math.sin(t * 3 + i * 1.7) * seg(k, 0.9, 1);
        const sc = lerp(1.15, 1.9, k) * tw;
        blue.globalCompositeOperation = 'destination-out';
        blue.fillStyle = '#000';
        drawPrint(blue, s, x, y, p.rot, sc * 1.05, k);
        blue.globalCompositeOperation = 'source-over';
        gold.fillStyle = '#000';
        drawPrint(gold, s, x, y, p.rot, sc, k);
        pink.fillStyle = '#000';
        drawPrint(pink, s, x, y, p.rot, sc * (1 - ease.inOutSine(k)), k);
        // Soft halo once it settles
        const halo = seg(k, 0.75, 1);
        if (halo > 0) {
          const hp = new Path2D();
          hp.arc(x, y, 34 * halo, 0, TAU);
          gold.fillStyle = r.tone(gold, 0.22 * halo);
          gold.fill(hp);
        }
      }
    }

    /* ----- the ball goes back up and becomes the moon ----- */
    if (t >= T_MOON) {
      cam(1);
      const k = tween(t, T_MOON, T_MOON + 1.7, ease.outCubic);
      const startY = SKY[1] + 760;
      const x = lerp(SKY[0] + 120, SKY_MOON[0], ease.inOutSine(k)) + Math.sin(k * Math.PI) * 60;
      const y = lerp(startY, SKY_MOON[1], k);
      const rad = lerp(BALL_R * 1.6, SKY_MOON_R, ease.inOutCubic(seg(k, 0.2, 1)));
      const seams = 1 - ease.inOutSine(seg(k, 0.35, 0.9));
      drawMoonBall(r, x, y, rad, seams, s.craters);
    }

    /* ----- title ----- */
    const title = tween(t, 16.3, 17.3, ease.outCubic);
    if (title > 0) {
      r.camera(800, 450, 1);
      const y = 812 + (1 - title) * 18;
      for (const l of [blue, pink]) {
        l.save();
        l.globalCompositeOperation = 'destination-out';
        l.fillStyle = '#000';
        l.font = `400 64px ${DISPLAY}`;
        l.globalAlpha = title;
        spacedText(l, 'LUNA', 800, y, 26 * title + 8);
        l.restore();
      }
      gold.save();
      gold.globalAlpha = 1;
      gold.font = `400 64px ${DISPLAY}`;
      if (title > 0.6) spacedText(gold, 'LUNA', 800, y, 26 * title + 8);
      gold.restore();
      const sub = tween(t, 16.9, 17.8, ease.outCubic);
      if (sub > 0.5) {
        for (const l of r.layers) {
          l.save();
          l.globalCompositeOperation = 'destination-out';
          l.fillStyle = '#000';
          l.font = `600 18px ${MONO}`;
          spacedText(l, 'MY HIKING BUDDY', 800, 854, 7);
          l.restore();
        }
      }
    }
  },
};
