import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import { TAU, clamp, lerp, seg, tween, ease, hash, noise1, mulberry, smoothPath, type Pt } from '../riso/kit';
import {
  NOIR,
  NOIR_SERIF,
  LB_TOP,
  LB_BOT,
  rgba,
  grey,
  poly,
  circle,
  rect,
  linGrad,
  radGrad,
  glow,
  shaft,
  blindShafts,
  rain,
  ripples,
  fogBand,
  noirCam,
  finish,
  title,
  rule,
  createNoirFX,
  bake,
  drawFigure,
  standPose,
  walkPose,
  WALK_CYCLE,
  RIG,
  toLocal,
  toWorld,
  solve,
  type NoirFX,
  type Pose,
  type Look,
  type Bones,
} from '../styles/noir';

/*
 * Long Take: one unbroken camera move through a rain-soaked Detroit night. We open on a neon
 * sign shivering in a puddle and crane up to a man under a streetlamp; he strikes a match (the
 * only colour in the film) and lights a cigarette. The camera follows him into the diner,
 * dollies through the plate glass past a jazz trio in the smoke, slips out of the side door
 * into the alley, rises with him up three flights of fire escape and pulls back off the roof:
 * a silhouette, a water tower and the skyline as the rain stops. The ember stays lit throughout.
 */

const DUR = 20;

/* world layout (ground line y = 0 is the foot of the facades) */
const FEET = 50; // where people stand on the sidewalk
const LAMP_X = 470;
const LAMP_TOP = -430;
const MAN_X0 = 578;
const DINER_X0 = 700;
const DINER_X1 = 1840;
const DOOR_X0 = 820;
const DOOR_X1 = 915;
const WIN_X0 = 950;
const WIN_X1 = 1760;
const WIN_Y0 = -440;
const WIN_Y1 = -20;
const BAND_Y = -520;
const DINER_ROOF = -1150;
const ALLEY_X0 = DINER_X1;
const ALLEY_X1 = 2060;
const BLD_X1 = 3400;
const ROOF_Y = -1240;
const INSIDE_FEET = -10;
const INSIDE_S = 0.92;

/* fire escape */
const FE_X0 = 2140;
const FE_X1 = 2520;
const FE_RISE = 430;
const FE_STEPS = 11;
const LAND = [FEET, FEET - FE_RISE, FEET - FE_RISE * 2, FEET - FE_RISE * 3];

/* interior parallax */
const IN_P = 0.9;
const IN_AX = 1355;
const IN_AY = -230;

/* sky parallax (anchored on the final framing) */
const SKY_P = 0.28;
const SKY_AX = 2640;
const SKY_AY = -1432;

/* man timeline */
const T_RAISE = 3.3;
const T_STRIKE = 4.32;
const T_FLARE = 4.52;
const T_SHAKE = 5.55;
const T_OUT = 5.75;
const T_WALK = 5.9;
const T_DOOR = 7.0;
const T_IN = 7.45;
const T_EXIT0 = 10.55;
const T_EXIT1 = 11.05;
const T_CLIMB = 12.0;
const FLIGHT = 1.18;
const TURN = 0.24;
const T_ROOF = T_CLIMB + FLIGHT * 3 + TURN * 2;
const T_STOP = T_ROOF + 0.95;
const T_TITLE = 17.9;

/* camera keys: t, x, y, zoom */
const KEYS: [number, number, number, number][] = [
  [0, 618, 150, 3.0],
  [2.0, 612, 128, 2.8],
  [3.45, 615, -236, 1.18],
  [4.25, 630, -232, 2.1],
  [4.9, 640, -258, 4.5],
  [5.6, 644, -262, 4.9],
  [7.2, 905, -236, 1.32],
  [8.35, 1185, -240, 1.66],
  [10.35, 1640, -238, 1.66],
  [11.35, 1975, -168, 1.3],
  [12.25, 2235, -160, 1.24],
];

interface State {
  fx: NoirFX;
  brick: CanvasPattern | null;
  brickAlley: CanvasPattern | null;
  street: HTMLCanvasElement;
  skyline: HTMLCanvasElement;
  clouds: HTMLCanvasElement;
  refl: { canvas: HTMLCanvasElement; ctx: Ctx };
  drops: Path2D;
  dropHi: Path2D;
  streaks: Pt[][];
  puddle: Path2D;
  winLit: Path2D;
  winDark: Path2D;
  alleyWin: Path2D;
  roofJunk: Path2D;
  tiles: Path2D;
  titleArt: HTMLCanvasElement;
}

/* ---------- small helpers ---------- */

const hermite = (t: number, keys: [number, number, number, number][]): [number, number, number] => {
  const n = keys.length;
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2], keys[0][3]];
  if (t >= keys[n - 1][0]) return [keys[n - 1][1], keys[n - 1][2], keys[n - 1][3]];
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const dt = k1[0] - k0[0];
  const u = (t - k0[0]) / dt;
  const tan = (j: number, d: number) => {
    if (j <= 0 || j >= n - 1) return 0;
    const a = keys[j - 1];
    const b = keys[j + 1];
    const va = d === 3 ? Math.log(a[3]) : a[d];
    const vb = d === 3 ? Math.log(b[3]) : b[d];
    return (vb - va) / (b[0] - a[0]);
  };
  const h00 = 2 * u * u * u - 3 * u * u + 1;
  const h10 = u * u * u - 2 * u * u + u;
  const h01 = -2 * u * u * u + 3 * u * u;
  const h11 = u * u * u - u * u;
  const out: number[] = [];
  for (const d of [1, 2, 3]) {
    const p0 = d === 3 ? Math.log(k0[3]) : k0[d];
    const p1 = d === 3 ? Math.log(k1[3]) : k1[d];
    const v = h00 * p0 + h10 * dt * tan(i, d) + h01 * p1 + h11 * dt * tan(i + 1, d);
    out.push(d === 3 ? Math.exp(v) : v);
  }
  return [out[0], out[1], out[2]];
};

const lerpPt = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

const lerpPose = (a: Pose, b: Pose, k: number): Pose => ({
  ...(k < 0.5 ? a : b),
  lean: lerp(a.lean, b.lean, k),
  head: lerp(a.head ?? 0, b.head ?? 0, k),
  ankleN: lerpPt(a.ankleN, b.ankleN, k),
  ankleF: lerpPt(a.ankleF, b.ankleF, k),
  footN: lerp(a.footN ?? 0, b.footN ?? 0, k),
  footF: lerp(a.footF ?? 0, b.footF ?? 0, k),
  wristN: lerpPt(a.wristN, b.wristN, k),
  wristF: lerpPt(a.wristF, b.wristF, k),
  rotN: lerp(a.rotN ?? 0, b.rotN ?? 0, k),
  rotF: lerp(a.rotF ?? 0, b.rotF ?? 0, k),
  flare: lerp(a.flare ?? 0, b.flare ?? 0, k),
});

/** Camera on a parallax plane: p = 1 is the main plane, smaller is further away */
const planeCam = (r: Riso, t: number, cam: [number, number, number], p: number, ax: number, ay: number) => {
  const [cx, cy, z] = cam;
  noirCam(r, t, ax + (cx - ax) * p, ay + (cy - ay) * p, Math.pow(z, p));
};

/* ---------- the man ---------- */

interface ManState {
  x: number;
  hipY: number;
  s: number;
  dir: number;
  pose: Pose;
  inside: boolean;
  /** match flame strength 0..1 and its position (world) */
  flame: number;
  ember: number;
  onStairs: number;
  /** 0: match in the fingers, 1: cupped in both hands */
  cup: number;
}

const LIGHT_BASE: Pose = {
  lean: 0.05,
  head: 0.16,
  ankleN: [7, 160],
  ankleF: [-6, 160.5],
  wristN: [40, -96],
  wristF: [32, -96],
  elbowN: 1,
  elbowF: 1,
  handN: 'pocket',
  handF: 'pocket',
};

/** Where the flame sits in the cupped hands: just under the cigarette tip (local units) */
const F_L: Pt = (() => {
  const b = solve(LIGHT_BASE);
  const a = b.headAng + 0.18;
  return [b.mouth[0] + Math.cos(a) * 11 + 1.5, b.mouth[1] + Math.sin(a) * 11 + 11];
})();

const LIGHT_POSE: Pose = {
  ...LIGHT_BASE,
  wristN: [F_L[0] + 5, F_L[1] + 20],
  wristF: [F_L[0] - 4, F_L[1] + 19],
};

const STRIKE_POSE: Pose = {
  ...LIGHT_BASE,
  head: 0.26,
  wristN: [36, -70],
  wristF: [30, -76],
  rotN: 0.5,
  rotF: -0.2,
  handN: 'pinch',
  handF: 'fist',
};

const stairPt = (flight: number, k: number): Pt => {
  // flight 0 and 2 climb to the right, flight 1 to the left
  const y = LAND[flight] - (FE_RISE * k) / FE_STEPS;
  const run = ((FE_X1 - FE_X0) * k) / FE_STEPS;
  return flight % 2 === 0 ? [FE_X0 + run, y] : [FE_X1 - run, y];
};

/** Stair climbing: alternate feet planting on treads, near hand sliding on the rail */
const climbPose = (flight: number, u: number, dir: number, x: number, hipY: number): Pose => {
  const N = FE_STEPS;
  const tread = (k: number): Pt => {
    const q = stairPt(flight, clamp(k, 0, N));
    return [q[0] + dir * 6, q[1] - 10];
  };
  const footAt = (odd: boolean): [Pt, number] => {
    // odd foot plants on odd steps, swinging while u in [2m, 2m + 1]
    const off = odd ? 0 : 1;
    const v = u + off;
    const m = Math.floor(v / 2);
    const ph = v - m * 2;
    const from = m * 2 - 1 - off + 0;
    if (ph < 1) {
      const k = ease.inOutSine(ph);
      const a = tread(from);
      const b = tread(from + 2);
      const p = lerpPt(a, b, k);
      return [[p[0], p[1] - Math.sin(Math.PI * k) * 22], lerp(0.35, -0.1, k)];
    }
    return [tread(from + 2), 0];
  };
  const [aN, fN] = footAt(true);
  const [aF, fF] = footAt(false);
  const rail = stairPt(flight, clamp(u + 1.6, 0, N));
  const railY = rail[1] - 92;
  const sw = Math.sin(u * Math.PI);
  return {
    lean: 0.22,
    head: -0.05,
    ankleN: toLocal(aN, x, hipY, 1, dir),
    ankleF: toLocal(aF, x, hipY, 1, dir),
    footN: fN,
    footF: fF,
    wristN: toLocal([rail[0], railY], x, hipY, 1, dir),
    wristF: [-14 + sw * 18, -6],
    elbowN: 1,
    elbowF: 1,
    handN: 'fist',
    handF: 'relaxed',
    flare: 0.3 + sw * 0.2,
  };
};

const manAt = (t: number): ManState => {
  const base = { flame: 0, ember: 0, onStairs: 0, cup: 0 };
  // standing under the lamp, lighting up
  if (t < T_WALK) {
    const breathe = Math.sin(t * 1.7) * 1.5;
    const stand: Pose = { ...standPose({ head: 0.12, breathe }), wristN: [5, -1 + breathe], wristF: [-6, -2 + breathe] };
    let pose = stand;
    let cup = 0;
    if (t >= T_RAISE && t < T_STRIKE) pose = lerpPose(stand, STRIKE_POSE, tween(t, T_RAISE, T_STRIKE - 0.08, ease.inOutCubic));
    else if (t >= T_STRIKE && t < T_FLARE + 0.3) {
      // the strike: the near hand rasps down the box and swings up to the cigarette
      const swipe = ease.outCubic(seg(t, T_STRIKE, T_FLARE));
      const sp: Pose = { ...STRIKE_POSE, wristN: [lerp(34, 50, swipe), lerp(-72, -58, swipe)] };
      cup = ease.inOutCubic(seg(t, T_FLARE + 0.04, T_FLARE + 0.3));
      pose = lerpPose(sp, LIGHT_POSE, cup);
      if (cup < 0.5) pose = { ...pose, handN: 'pinch', handF: 'fist' };
    } else if (t >= T_FLARE + 0.3 && t < T_SHAKE) {
      const d = Math.sin(t * 3) * 0.8;
      pose = { ...LIGHT_POSE, head: LIGHT_POSE.head };
      pose.wristN = [LIGHT_POSE.wristN[0] + d, LIGHT_POSE.wristN[1]];
      cup = 1;
    } else if (t >= T_SHAKE) {
      const k = seg(t, T_SHAKE, T_WALK);
      const shake = Math.sin(t * 60) * 6 * (1 - k);
      const down: Pose = { ...stand, wristN: [18, -44 + shake], handN: 'pinch', head: 0.05 };
      cup = 1 - ease.inOutSine(seg(k, 0, 0.5));
      pose = lerpPose(LIGHT_POSE, down, ease.inOutSine(k));
      if (cup < 0.5) pose = { ...pose, handN: 'pinch', handF: 'relaxed' };
    }
    let flame = 0;
    if (t >= T_FLARE) flame = t < T_SHAKE ? 1 : 1 - seg(t, T_SHAKE, T_SHAKE + 0.16);
    const ember = t < T_FLARE + 0.5 ? 0 : clamp((t - T_FLARE - 0.5) * 2);
    return { ...base, x: MAN_X0, hipY: FEET - RIG.ground, s: 1, dir: 1, pose, inside: false, flame, ember, cup };
  }
  // walk to the door and inside, along the counter, out the side door
  if (t < T_CLIMB) {
    const speedOut = (DOOR_X0 + 40 - MAN_X0) / (T_DOOR - T_WALK + 0.3);
    let x: number;
    let feet = FEET;
    let s = 1;
    let inside = false;
    const accel = (tt: number) => {
      // ease into the walk over the first 0.4 s
      const a = tt - T_WALK;
      return a < 0.4 ? (a * a) / 0.8 : a - 0.2;
    };
    if (t < T_DOOR) x = MAN_X0 + accel(t) * speedOut;
    else if (t < T_IN) {
      const x0 = MAN_X0 + accel(T_DOOR) * speedOut;
      x = x0 + (t - T_DOOR) * speedOut * 0.85;
      const k = ease.inOutSine(seg(t, T_DOOR, T_IN));
      feet = lerp(FEET, INSIDE_FEET, k);
      s = lerp(1, INSIDE_S, k);
      inside = k > 0.45;
    } else if (t < T_EXIT0) {
      const xIn = MAN_X0 + accel(T_DOOR) * speedOut + (T_IN - T_DOOR) * speedOut * 0.85;
      const xEnd = 1905;
      x = lerp(xIn, xEnd, (t - T_IN) / (T_EXIT0 - T_IN));
      feet = INSIDE_FEET;
      s = INSIDE_S;
      inside = true;
    } else if (t < T_EXIT1) {
      x = lerp(1905, 1955, seg(t, T_EXIT0, T_EXIT1));
      const k = ease.inOutSine(seg(t, T_EXIT0, T_EXIT1));
      feet = lerp(INSIDE_FEET, FEET, k);
      s = lerp(INSIDE_S, 1, k);
      inside = k < 0.5;
    } else {
      x = lerp(1955, FE_X0 - 34, seg(t, T_EXIT1, T_CLIMB));
    }
    const u = x / (WALK_CYCLE * s);
    const w = walkPose(u, { lean: 0.08, arms: 0.9 });
    const pose = { ...w.pose, wristN: [w.pose.wristN[0] + 4, w.pose.wristN[1]] as Pt };
    return { ...base, x, hipY: feet - RIG.ground * s + w.bob * s, s, dir: 1, pose, inside, ember: 0.55 + 0.25 * Math.sin(t * 3) };
  }
  // three flights of fire escape
  if (t < T_ROOF) {
    const lt = t - T_CLIMB;
    const slot = FLIGHT + TURN;
    const flight = Math.min(2, Math.floor(lt / slot));
    const inF = lt - flight * slot;
    const dirF = flight % 2 === 0 ? 1 : -1;
    if (inF > FLIGHT && flight < 2) {
      // turning on the landing
      const k = seg(inF, FLIGHT, slot);
      const top = stairPt(flight, FE_STEPS);
      const dir = Math.cos(Math.PI * ease.inOutSine(k)) * dirF;
      const d = Math.abs(dir) < 0.22 ? 0.22 * Math.sign(dir || 1) : dir;
      const p = standPose({ lean: 0.05 });
      return { ...base, x: top[0] + dirF * 12, hipY: top[1] - 10 - RIG.ground + 10, s: 1, dir: d, pose: p, inside: false, ember: 0.6, onStairs: 1 };
    }
    const u = clamp(inF / FLIGHT) * FE_STEPS;
    const q = stairPt(flight, u + 0.35);
    const x = q[0] - dirF * 4;
    const hipY = q[1] - 128;
    const pose = climbPose(flight, u, dirF, x, hipY);
    return { ...base, x, hipY, s: 1, dir: dirF, pose, inside: false, ember: 0.6, onStairs: 1 };
  }
  // onto the roof and to the edge
  const top = stairPt(2, FE_STEPS);
  if (t < T_STOP) {
    const k = seg(t, T_ROOF, T_STOP);
    const x = lerp(top[0] + 12, 2580, ease.outSine(k));
    const feet = lerp(top[1] - 10, ROOF_Y, ease.outCubic(seg(t, T_ROOF, T_ROOF + 0.3)));
    const w = walkPose(x / WALK_CYCLE, { lean: 0.06 });
    const settle = ease.inOutSine(seg(t, T_STOP - 0.35, T_STOP));
    const pose = lerpPose(w.pose, standPose({ pockets: true, head: -0.02 }), settle);
    return { ...base, x, hipY: feet - RIG.ground + w.bob * (1 - settle), s: 1, dir: 1, pose, inside: false, ember: 0.6, onStairs: 0 };
  }
  const breathe = Math.sin(t * 1.6) * 1.2;
  const pose = standPose({ pockets: true, head: -0.04 + Math.sin(t * 0.7) * 0.02, breathe });
  pose.flare = 0.35 + noise1(t * 1.3, 4) * 0.35;
  // a slow drag on the cigarette near the end
  const drag = Math.exp(-(((t - 18.7) / 0.35) ** 2));
  return { ...base, x: 2580, hipY: ROOF_Y - RIG.ground, s: 1, dir: 1, pose, inside: false, ember: 0.5 + drag * 0.5, onStairs: 0 };
};

/* ---------- setup ---------- */

const brickTile = (r: Riso, dark: number, seed: number) => {
  const W = 120;
  const H = 64;
  const s = r.scratch(W, H);
  const g = s.ctx;
  const rng = mulberry(seed);
  g.fillStyle = grey(dark + 0.02);
  g.fillRect(0, 0, W, H);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 15 : 0;
    for (let i = -1; i < 5; i++) {
      const x = i * 30 + off;
      const v = dark + (rng() - 0.5) * 0.03;
      g.fillStyle = grey(v);
      g.fillRect(x + 1.2, row * 16 + 1.2, 27.6, 13.6);
      if (rng() < 0.35) {
        g.fillStyle = grey(v + 0.025);
        g.fillRect(x + 2, row * 16 + 2, 25, 3);
      }
    }
  }
  const p = r.layers[0].createPattern(s.canvas, 'repeat');
  p?.setTransform(new DOMMatrix().scale(1 / r.scale, 1 / r.scale));
  return p;
};

const drawLampHead = (c: Ctx, x: number, y: number, a: number) => {
  // a goose-neck arm and a deep enamel shade
  c.save();
  c.strokeStyle = NOIR.black;
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, y + 60);
  c.quadraticCurveTo(x, y - 6, x + 46, y - 6);
  c.stroke();
  c.fillStyle = NOIR.black;
  c.fill(
    poly([
      [x + 26, y - 4],
      [x + 66, y - 4],
      [x + 84, y + 18],
      [x + 8, y + 18],
    ])
  );
  c.restore();
  // the bulb under the shade
  c.fillStyle = grey(0.98, a);
  c.beginPath();
  c.ellipse(x + 46, y + 20, 22, 6, 0, 0, TAU);
  c.fill();
};

const setup = (r: Riso): State => {
  const fx = createNoirFX(r);
  const rng = mulberry(41);

  // street: wet asphalt with long reflections of every practical light
  const SX0 = -900;
  const SW = 4400;
  const SH = 640;
  const k = 1.4;
  const st = r.scratch(SW * k, SH * k);
  const g = st.ctx;
  g.scale(k, k);
  g.translate(-SX0, 0);
  g.fillStyle = linGrad(g, 0, 0, 0, SH, [
    [0, NOIR.deep],
    [0.2, NOIR.night],
    [1, NOIR.black],
  ]);
  g.fillRect(SX0, 0, SW, SH);
  // sidewalk slabs and curb
  g.fillStyle = 'rgba(70,70,72,0.35)';
  g.fillRect(SX0, 0, SW, 112);
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 2;
  for (let x = SX0; x < SX0 + SW; x += 150) {
    g.beginPath();
    g.moveTo(x, 4);
    g.lineTo(x - 30, 112);
    g.stroke();
  }
  g.fillStyle = 'rgba(150,150,150,0.25)';
  g.fillRect(SX0, 112, SW, 6);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(SX0, 118, SW, 10);
  // reflections: broken vertical streaks under each light
  const streak = (x: number, w: number, y0: number, len: number, a: number) => {
    for (let i = 0; i < 46; i++) {
      const xx = x + (rng() - 0.5) * (rng() - 0.5) * w * 2;
      const ww = 0.8 + rng() * 2.4;
      const yy = y0 + rng() * len * 0.2;
      const ll = len * (0.2 + rng() * 0.8);
      g.fillStyle = linGrad(g, 0, yy, 0, yy + ll, [
        [0, `rgba(255,255,255,${a * (0.2 + rng() * 0.5)})`],
        [1, 'rgba(255,255,255,0)'],
      ]);
      g.fillRect(xx, yy, ww, ll);
    }
    g.fillStyle = radGrad(g, x, y0 + 20, 0, w * 0.9, [
      [0, `rgba(255,255,255,${a * 0.35})`],
      [1, 'rgba(255,255,255,0)'],
    ]);
    g.fillRect(x - w, y0 - w, w * 2, w * 2 + 40);
  };
  streak(LAMP_X + 46, 70, 6, 560, 0.25);
  streak(745, 60, 10, 520, 0.3);
  for (let x = WIN_X0 + 60; x < WIN_X1; x += 120) streak(x, 120, 6, 420, 0.12);
  streak(1355, 260, 30, 560, 0.12);
  streak(1900, 40, 8, 380, 0.22);
  // window light pool on the sidewalk, with the blind stripes
  g.save();
  g.globalCompositeOperation = 'lighter';
  const pool = poly([
    [WIN_X0, 0],
    [WIN_X1, 0],
    [WIN_X1 + 120, 112],
    [WIN_X0 - 60, 112],
  ]);
  g.fillStyle = linGrad(g, 0, 0, 0, 112, [
    [0, 'rgba(255,255,255,0.16)'],
    [1, 'rgba(255,255,255,0.03)'],
  ]);
  g.fill(pool);
  g.restore();
  // fine wet texture
  for (let i = 0; i < 2400; i++) {
    const x = SX0 + rng() * SW;
    const y = rng() * SH;
    g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.3)';
    g.fillRect(x, y, 1 + rng() * 3, 1);
  }

  // skyline (far plane), drawn in sky coordinates
  const KW = 2600;
  const KH = 700;
  const sk = r.scratch(KW, KH);
  const h = sk.ctx;
  const towers: [number, number, number, number][] = []; // x, w, h, style
  let x = 0;
  while (x < KW) {
    const w = 50 + rng() * 120;
    const tall = rng() < 0.18;
    towers.push([x, w, tall ? 380 + rng() * 260 : 120 + rng() * 220, Math.floor(rng() * 3)]);
    x += w + rng() * 14;
  }
  // a few landmark-ish stepped towers (generic) and a cylinder cluster
  towers.push([1180, 120, 560, 3], [1320, 90, 470, 3], [600, 70, 610, 4], [1900, 80, 520, 5], [1990, 70, 450, 5], [2080, 80, 500, 5]);
  for (const [tx, tw, th, style] of towers) {
    const top = KH - th;
    h.fillStyle = grey(0.1 + hash(tx) * 0.05);
    const p = new Path2D();
    if (style === 3) {
      // stepped setback crown with a spire
      p.rect(tx, top + 60, tw, th - 60);
      p.rect(tx + tw * 0.12, top + 25, tw * 0.76, 40);
      p.rect(tx + tw * 0.3, top - 5, tw * 0.4, 35);
      p.rect(tx + tw * 0.47, top - 70, tw * 0.06, 70);
    } else if (style === 4) {
      p.rect(tx, top + 40, tw, th - 40);
      p.moveTo(tx, top + 40);
      p.lineTo(tx + tw / 2, top - 30);
      p.lineTo(tx + tw, top + 40);
    } else if (style === 5) {
      p.ellipse(tx + tw / 2, top + 10, tw / 2, 10, 0, 0, TAU);
      p.rect(tx, top + 10, tw, th - 10);
    } else {
      p.rect(tx, top, tw, th);
      if (style === 1) p.rect(tx + tw * 0.2, top - 18, tw * 0.6, 18);
    }
    h.fill(p);
    // lit windows
    for (let wy = top + 30; wy < KH - 10; wy += 14) {
      for (let wx = tx + 6; wx < tx + tw - 8; wx += 11) {
        if (rng() < 0.12) {
          h.fillStyle = grey(0.55 + rng() * 0.35, 0.7);
          h.fillRect(wx, wy, 4, 6);
        }
      }
    }
  }
  // haze over the base
  h.fillStyle = linGrad(h, 0, KH - 260, 0, KH, [
    [0, 'rgba(150,150,150,0)'],
    [1, 'rgba(150,150,150,0.6)'],
  ]);
  h.fillRect(0, KH - 260, KW, 260);

  // clouds
  const cl = r.scratch(2400, 600);
  const q = cl.ctx;
  for (let i = 0; i < 160; i++) {
    const cx = rng() * 2400;
    const cy = 80 + rng() * 440;
    const rr = 50 + rng() * 160;
    const v = 0.45 + rng() * 0.35;
    q.fillStyle = radGrad(q, cx, cy, 0, rr, [
      [0, grey(v, 0.35)],
      [1, grey(v, 0)],
    ]);
    q.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  }

  // rain drops beading on the diner glass
  const drops = new Path2D();
  const dropHi = new Path2D();
  for (let i = 0; i < 260; i++) {
    const dx = WIN_X0 + rng() * (WIN_X1 - WIN_X0);
    const dy = WIN_Y0 + rng() * (WIN_Y1 - WIN_Y0);
    const rr = 1 + rng() * rng() * 4;
    drops.moveTo(dx + rr, dy);
    drops.ellipse(dx, dy, rr, rr * 1.15, 0, 0, TAU);
    dropHi.moveTo(dx - rr * 0.3 + 0.6, dy - rr * 0.4);
    dropHi.arc(dx - rr * 0.3, dy - rr * 0.4, Math.max(0.3, rr * 0.3), 0, TAU);
  }
  const streaks: Pt[][] = [];
  for (let i = 0; i < 14; i++) {
    const sx = WIN_X0 + 20 + rng() * (WIN_X1 - WIN_X0 - 40);
    const pts: Pt[] = [];
    let yy = WIN_Y0 + rng() * 60;
    let xx = sx;
    while (yy < WIN_Y1) {
      pts.push([xx, yy]);
      yy += 8 + rng() * 10;
      xx += (rng() - 0.5) * 4;
    }
    streaks.push(pts);
  }

  const puddle = new Path2D();
  {
    const pts: Pt[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      const rr = 1 + noise1(i * 0.5, 3) * 0.12 + noise1(i * 0.17, 8) * 0.1;
      pts.push([608 + Math.cos(a) * 285 * rr, 158 + Math.sin(a) * 58 * rr]);
    }
    smoothPath(pts, true, 0.5, puddle);
  }

  // upper-floor windows of the diner block and the alley block
  const winLit = new Path2D();
  const winDark = new Path2D();
  for (let fl = 0; fl < 2; fl++) {
    for (let i = 0; i < 6; i++) {
      const wx = 760 + i * 180;
      const wy = -1020 + fl * 250;
      (hash(i * 3 + fl * 7) < 0.25 ? winLit : winDark).rect(wx, wy, 80, 150);
    }
  }
  for (let i = 0; i < 6; i++) {
    const wx = -820 + i * 230;
    for (let fl = 0; fl < 4; fl++) (hash(i * 5 + fl * 11 + 3) < 0.12 ? winLit : winDark).rect(wx, -1180 + fl * 270, 70, 130);
  }
  const alleyWin = new Path2D();
  for (let fl = 0; fl < 3; fl++) {
    for (let i = 0; i < 5; i++) {
      const wx = 2620 + i * 160;
      const wy = -1120 + fl * 400;
      alleyWin.rect(wx, wy, 80, 170);
    }
    alleyWin.rect(2290, -1120 + fl * 400 + 30, 90, 170);
  }

  // rooftop clutter: vent stacks, a chimney, an antenna
  const roofJunk = new Path2D();
  roofJunk.rect(2140, ROOF_Y - 70, 40, 70);
  roofJunk.rect(2130, ROOF_Y - 82, 60, 14);
  roofJunk.rect(3180, ROOF_Y - 120, 70, 120);
  roofJunk.rect(3300, ROOF_Y - 40, 24, 40);
  roofJunk.rect(1020, DINER_ROOF - 90, 50, 90);
  roofJunk.rect(1530, DINER_ROOF - 60, 26, 60);

  // checker floor tiles inside
  const tiles = new Path2D();
  for (let i = 0; i < 40; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2) continue;
      const x0 = 880 + i * 24 + j * 8;
      const y0 = -16 + j * 18;
      tiles.moveTo(x0, y0);
      tiles.lineTo(x0 + 24, y0);
      tiles.lineTo(x0 + 32, y0 + 18);
      tiles.lineTo(x0 + 8, y0 + 18);
      tiles.closePath();
    }
  }

  return {
    fx,
    brick: brickTile(r, 0.075, 5),
    brickAlley: brickTile(r, 0.065, 9),
    street: st.canvas,
    skyline: sk.canvas,
    clouds: cl.canvas,
    refl: r.scratch(700, 160),
    drops,
    dropHi,
    streaks,
    puddle,
    winLit,
    winDark,
    alleyWin,
    roofJunk,
    tiles,
    titleArt: bake(r, 800, 200, (g) => {
      title(g, 'LONG TAKE', 400, 80, { size: 64, spacing: 20, col: NOIR.white, bloom: 0.5 });
      rule(g, 400, 110, 300, 0.8);
      title(g, 'DETROIT', 400, 146, { size: 20, spacing: 14, col: NOIR.silver, a: 0.9 });
    }),
  };
};

/* ---------- scene pieces ---------- */

const rainAmt = (t: number) => 1 - tween(t, 15.4, 17.6, ease.inOutSine);

const neonEAT = (c: Ctx, t: number, x: number, y: number, a: number) => {
  // vertical blade sign: dark enamel panel with tube letters; the A stutters
  c.save();
  c.fillStyle = NOIR.night;
  c.fillRect(x - 46, y, 92, 300);
  c.strokeStyle = grey(0.4, a);
  c.lineWidth = 2;
  c.strokeRect(x - 40, y + 6, 80, 288);
  c.font = `700 84px ${NOIR_SERIF}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const letters = ['E', 'A', 'T'];
  letters.forEach((L, i) => {
    let on = 1;
    if (L === 'A') {
      const f = Math.floor(t * 24);
      on = hash(f * 0.37) < 0.18 || (t > 9 && t < 9.3) ? 0.25 : 1;
    }
    c.lineWidth = 4.5;
    c.strokeStyle = grey(0.97, a * on);
    c.strokeText(L, x, y + 56 + i * 94);
  });
  c.restore();
  glow(c, x, y + 150, 220, 0.2 * a);
};

const neonDINER = (c: Ctx, x: number, y: number, a: number) => {
  c.save();
  c.font = `700 70px ${NOIR_SERIF}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 4;
  c.strokeStyle = grey(0.97, a);
  c.strokeText('D I N E R', x, y);
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(x - 250, y + 46);
  c.lineTo(x + 250, y + 46);
  c.stroke();
  c.restore();
  glow(c, x, y, 360, 0.16 * a);
};

const drawSky = (c: Ctx, t: number, s: State, vx0: number, vx1: number) => {
  const clear = tween(t, 15.6, 19.4, ease.inOutSine);
  // sky in sky-plane coordinates around the anchor
  const x0 = SKY_AX - 2400;
  const x1 = SKY_AX + 2400;
  const y0 = SKY_AY - 1400;
  const y1 = SKY_AY + 900;
  c.fillStyle = linGrad(c, 0, SKY_AY - 700, 0, SKY_AY + 250, [
    [0, grey(0.06 + clear * 0.02)],
    [0.6, grey(0.2 + clear * 0.04)],
    [1, grey(0.42)],
  ]);
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  // the moon, out from behind the clouds as the rain stops
  const mx = 2786;
  const my = -1716;
  glow(c, mx, my, 520, 0.34 * (0.3 + clear * 0.7));
  glow(c, mx, my, 150, 0.4 * (0.3 + clear * 0.7));
  c.fillStyle = grey(0.92);
  c.beginPath();
  c.arc(mx, my, 66, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.07)';
  c.beginPath();
  c.arc(mx - 18, my - 12, 17, 0, TAU);
  c.arc(mx + 22, my + 15, 11, 0, TAU);
  c.arc(mx + 8, my - 28, 7, 0, TAU);
  c.fill();
  // clouds sliding off the moon
  c.save();
  const drift = t * 18 + clear * 520;
  c.globalAlpha = 0.85 - clear * 0.55;
  for (const [ox, oy, sc] of [
    [-drift, -900, 1.2],
    [-drift * 0.6 + 900, -760, 0.9],
  ] as [number, number, number][]) {
    const w = 2400 * sc;
    const xx = x0 + ((((ox % w) + w) % w) - w);
    for (let k = 0; k < 4; k++) {
      const tx0 = xx + k * w;
      if (tx0 > vx1 || tx0 + w < vx0) continue;
      c.drawImage(s.clouds, tx0, SKY_AY + oy, w, 600 * sc);
    }
  }
  c.restore();
  // god rays from the moon once it clears
  if (clear > 0.02) {
    for (let i = 0; i < 4; i++) {
      const ang = 1.8 + i * 0.16 + noise1(t * 0.3 + i, i) * 0.03;
      shaft(c, mx, my, mx + Math.cos(ang) * 1400, my + Math.sin(ang) * 1400, 30, 220, 0.05 * clear * (0.6 + hash(i) * 0.6));
    }
  }
  c.drawImage(s.skyline, SKY_AX - 1300, SKY_AY - 470, 2600, 700);
  fogBand(c, s.fx, x0, x1, SKY_AY + 400, 300, t * 14, 0.5, 1, 1800);
};

const drawInterior = (c: Ctx, t: number, s: State) => {
  // room box
  c.fillStyle = grey(0.36);
  c.fillRect(860, -560, 960, 600);
  // back wall: wainscot, a long mirror, menu board
  c.fillStyle = linGrad(c, 0, -560, 0, 40, [
    [0, grey(0.22)],
    [0.45, grey(0.44)],
    [0.7, grey(0.5)],
    [1, grey(0.3)],
  ]);
  c.fillRect(860, -560, 960, 600);
  c.fillStyle = grey(0.58);
  c.fillRect(900, -380, 520, 120);
  c.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 6; i++) c.fillRect(920 + i * 90, -380, 20, 120);
  c.fillStyle = grey(0.16);
  c.fillRect(1440, -400, 60, 40);
  // the floor
  c.fillStyle = grey(0.34);
  c.fillRect(860, -16, 960, 60);
  c.fillStyle = grey(0.18);
  c.fill(s.tiles);
  // stage with curtain and a back window with blinds
  c.fillStyle = grey(0.12);
  c.fillRect(1470, -470, 330, 470);
  c.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 12; i++) c.fillRect(1476 + i * 27, -470, 9, 470);
  c.fillStyle = grey(0.85);
  c.fillRect(1580, -440, 150, 150);
  c.fillStyle = grey(0.2);
  for (let i = 0; i < 12; i++) c.fillRect(1580, -440 + i * 12.5, 150, 6.5);
  c.fillStyle = grey(0.2);
  c.fillRect(1470, -60, 330, 50);
  c.fillStyle = grey(0.32);
  c.fillRect(1470, -64, 330, 6);
  // the trio, back lit
  drawTrio(c, t);
  // shafts through the blinds into the smoke
  blindShafts(c, { x: 1580, y: -440, w: 150, h: 150, slats: 12, open: 0.48, vx: -260, vy: 420, spread: 1.25, a: 0.11 });
  // counter, stools and the coffee urn
  c.fillStyle = grey(0.62);
  c.fillRect(930, -168, 480, 10);
  c.fillStyle = linGrad(c, 0, -158, 0, -20, [
    [0, grey(0.3)],
    [1, grey(0.12)],
  ]);
  c.fillRect(940, -158, 460, 140);
  c.fillStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 12; i++) c.fillRect(950 + i * 38, -150, 3, 125);
  // urn
  c.fillStyle = linGrad(c, 1300, 0, 1350, 0, [
    [0, grey(0.3)],
    [0.4, grey(0.95)],
    [1, grey(0.25)],
  ]);
  c.fillRect(1300, -250, 50, 82);
  c.fillRect(1308, -262, 34, 12);
  // cake dome
  c.fillStyle = 'rgba(230,230,230,0.25)';
  c.beginPath();
  c.ellipse(1060, -168, 40, 36, 0, Math.PI, TAU);
  c.fill();
  // a customer at the counter, hunched over a cup
  const sip = Math.max(0, Math.sin(t * 0.9));
  drawFigure(
    c,
    {
      lean: 0.32,
      head: 0.25,
      ankleN: [36, 96],
      ankleF: [28, 98],
      wristN: [48, -48 - sip * 30],
      wristF: [44, -42],
      elbowN: 1,
      elbowF: 1,
      handN: 'fist',
      handF: 'relaxed',
      seated: true,
    },
    { body: NOIR.shadow, far: NOIR.night, rim: grey(0.75), rimDx: 0, rimDy: -2 },
    1120,
    -112,
    0.82,
    1
  );
  // stools
  for (let i = 0; i < 6; i++) {
    const sx = 980 + i * 75;
    c.fillStyle = NOIR.night;
    c.fillRect(sx - 3, -112, 6, 100);
    c.fillRect(sx - 18, -14, 36, 5);
    c.fillStyle = grey(0.5);
    c.beginPath();
    c.ellipse(sx, -114, 22, 7, 0, 0, TAU);
    c.fill();
  }
  // pendant lamps and their cones
  for (const lx of [1020, 1200, 1380]) {
    c.strokeStyle = NOIR.black;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(lx, -560);
    c.lineTo(lx, -440);
    c.stroke();
    c.fillStyle = NOIR.night;
    c.beginPath();
    c.moveTo(lx - 30, -410);
    c.quadraticCurveTo(lx, -455, lx + 30, -410);
    c.closePath();
    c.fill();
    shaft(c, lx, -410, lx, -40, 56, 230, 0.12);
    glow(c, lx, -408, 70, 0.6);
  }
  // smoke haze
  fogBand(c, s.fx, 860, 1820, -300, 260, t * 22, 0.35, 0, 900);
  fogBand(c, s.fx, 860, 1820, -150, 200, -t * 15 + 300, 0.25, 1, 800);
};

const drawTrio = (c: Ctx, t: number) => {
  const beat = t * 2.1;
  const rimL: Look = { body: NOIR.black, far: NOIR.black, rim: grey(0.9), rimDx: 2.4, rimDy: -2.4, hat: 'none' };
  // bassist: standing behind the upright bass
  const bx = 1530;
  const bob = Math.sin(beat * Math.PI) * 1.5;
  const pluck = Math.sin(beat * TAU) * 5;
  drawFigure(
    c,
    {
      lean: -0.02,
      head: 0.15 + bob * 0.02,
      ankleN: [8, 160],
      ankleF: [-8, 160],
      wristN: [34 + pluck, -22],
      wristF: [30, -118],
      elbowN: 1,
      elbowF: 1,
      handN: 'relaxed',
      handF: 'fist',
    },
    { ...rimL, hat: 'fedora' },
    bx,
    -64 - 158 * 0.86 + bob,
    0.86,
    1
  );
  // the bass itself in front
  const bassX = bx + 40;
  const bassY = -120;
  const body = new Path2D();
  body.moveTo(bassX, bassY - 120);
  body.bezierCurveTo(bassX + 40, bassY - 118, bassX + 30, bassY - 70, bassX + 26, bassY - 52);
  body.bezierCurveTo(bassX + 56, bassY - 30, bassX + 56, bassY + 50, bassX, bassY + 58);
  body.bezierCurveTo(bassX - 56, bassY + 50, bassX - 56, bassY - 30, bassX - 26, bassY - 52);
  body.bezierCurveTo(bassX - 30, bassY - 70, bassX - 40, bassY - 118, bassX, bassY - 120);
  c.fillStyle = grey(0.85);
  c.save();
  c.translate(1.8, -1.8);
  c.fill(body);
  c.restore();
  c.fillStyle = NOIR.black;
  c.fill(body);
  c.fillStyle = grey(0.7);
  c.fillRect(bassX - 2, bassY - 280, 4, 170);
  c.fillStyle = NOIR.black;
  c.fillRect(bassX - 4, bassY - 290, 8, 30);
  c.fillRect(bassX - 1, bassY + 58, 2, 10);
  // saxophonist leaning back on a long note
  const sx = 1635;
  const sway = Math.sin(beat * Math.PI * 0.5) * 0.06;
  const sb = drawFigure(
    c,
    {
      lean: -0.12 + sway,
      head: -0.25 + sway,
      ankleN: [14, 160],
      ankleF: [-12, 160],
      wristN: [30, -78],
      wristF: [28, -48],
      elbowN: 1,
      elbowF: 1,
      handN: 'fist',
      handF: 'fist',
    },
    { ...rimL, hat: 'none' },
    sx,
    -64 - 160 * 0.9,
    0.9,
    1
  );
  // the horn: neck from the mouth, body down to a flared bell
  const S = 0.9;
  const m = toWorld(sb.mouth, sx, -64 - 160 * 0.9, S, 1);
  const w1 = toWorld([32, -70], sx, -64 - 160 * 0.9, S, 1);
  const w2 = toWorld([30, -30], sx, -64 - 160 * 0.9, S, 1);
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = grey(0.9);
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(m[0] + 2, m[1]);
  c.quadraticCurveTo(w1[0] + 12, w1[1] - 30, w1[0] + 6, w1[1]);
  c.lineTo(w2[0] + 2, w2[1] + 6);
  c.quadraticCurveTo(w2[0] + 6, w2[1] + 34, w2[0] + 26, w2[1] + 14);
  c.stroke();
  c.strokeStyle = NOIR.black;
  c.lineWidth = 6;
  c.stroke();
  c.fillStyle = NOIR.black;
  c.beginPath();
  c.ellipse(w2[0] + 28, w2[1] + 8, 12, 7, -0.6, 0, TAU);
  c.fill();
  c.restore();
  // drummer seated behind his kit
  const dx = 1735;
  const hit = Math.abs(Math.sin(beat * Math.PI));
  drawFigure(
    c,
    {
      lean: 0.08,
      head: 0.1 + hit * 0.04,
      ankleN: [44, 66],
      ankleF: [36, 68],
      wristN: [44, -50 - hit * 22],
      wristF: [40, -40 - (1 - hit) * 18],
      elbowN: 1,
      elbowF: 1,
      handN: 'fist',
      handF: 'fist',
      seated: true,
    },
    { ...rimL, hat: 'fedora' },
    dx,
    -150,
    0.84,
    1
  );
  // kit: bass drum, snare, cymbal
  c.fillStyle = NOIR.black;
  c.beginPath();
  c.arc(dx + 52, -100, 40, 0, TAU);
  c.fill();
  c.strokeStyle = grey(0.7);
  c.lineWidth = 2;
  c.stroke();
  c.fillRect(dx + 30, -160, 46, 22);
  c.fillRect(dx + 52, -160, 3, 100);
  c.save();
  c.translate(dx + 92, -196);
  c.rotate(-0.15 + hit * 0.05);
  c.fillStyle = grey(0.75);
  c.fillRect(-34, -2, 68, 4);
  c.restore();
  c.fillRect(dx + 91, -196, 2, 136);
};

const drawFacade = (c: Ctx, t: number, s: State, insideK: number, cam: [number, number, number]) => {
  const fa = 1 - insideK;
  // left building: brick, a recessed doorway with a lit transom, a drainpipe
  c.fillStyle = s.brick ?? NOIR.shadow;
  c.fillRect(-1000, -1400, 1700, 1400);
  c.fillStyle = NOIR.night;
  c.fill(s.winDark);
  c.fillStyle = grey(0.3);
  c.fill(s.winLit);
  c.save();
  c.clip(s.winLit);
  c.fillStyle = 'rgba(0,0,0,0.6)';
  for (let y = -1200; y < -200; y += 11) c.fillRect(-1000, y, 3000, 5);
  c.restore();
  c.fillStyle = NOIR.black;
  c.fillRect(120, -330, 150, 330);
  c.fillStyle = grey(0.62);
  c.fillRect(132, -322, 126, 34);
  c.fillStyle = NOIR.black;
  for (let i = 0; i < 6; i++) c.fillRect(132 + i * 21, -322, 3, 34);
  c.fillStyle = NOIR.night;
  c.fillRect(140, -280, 110, 280);
  glow(c, 195, -305, 120, 0.25);
  c.fillStyle = NOIR.black;
  c.fillRect(30, -1400, 12, 1400);
  c.fillRect(22, -60, 28, 60);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(38, -1400, 2, 1340);
  // a hydrant at the kerb
  c.fillStyle = NOIR.black;
  c.beginPath();
  c.moveTo(300, 92);
  c.lineTo(302, 40);
  c.quadraticCurveTo(315, 22, 328, 40);
  c.lineTo(330, 92);
  c.closePath();
  c.fill();
  c.fillRect(292, 52, 46, 9);
  c.fillRect(296, 88, 38, 8);
  c.fillStyle = 'rgba(255,255,255,0.2)';
  c.fillRect(323, 44, 2, 44);

  // the diner block (fades while we are inside)
  c.save();
  c.globalAlpha = fa;
  const facade = new Path2D();
  facade.rect(DINER_X0, DINER_ROOF, DINER_X1 - DINER_X0, -DINER_ROOF);
  facade.rect(WIN_X0, WIN_Y0, WIN_X1 - WIN_X0, WIN_Y1 - WIN_Y0);
  facade.rect(DOOR_X0, -310, DOOR_X1 - DOOR_X0, 310);
  c.fillStyle = s.brick ?? NOIR.shadow;
  c.fill(facade, 'evenodd');
  // storefront: dark enamel band and pilasters
  c.fillStyle = NOIR.night;
  const band = new Path2D();
  band.rect(DINER_X0, -560, DINER_X1 - DINER_X0, 100);
  band.rect(DINER_X0, -460, 36, 460);
  band.rect(WIN_X1, -460, DINER_X1 - WIN_X1, 460);
  band.rect(DOOR_X1, -460, WIN_X0 - DOOR_X1, 460);
  band.rect(DINER_X0, WIN_Y1, DINER_X1 - DINER_X0, -WIN_Y1);
  c.fill(band);
  c.save();
  c.beginPath();
  c.rect(DINER_X0, -1400, DINER_X1 - DINER_X0, 840);
  c.clip();
  c.fillStyle = NOIR.night;
  c.fill(s.winDark);
  c.fillStyle = grey(0.32);
  c.fill(s.winLit);
  c.fillStyle = 'rgba(0,0,0,0.6)';
  for (let y = -1200; y < -560; y += 11) c.fillRect(DINER_X0, y, 1200, 5);
  c.restore();
  // window frame
  c.strokeStyle = NOIR.black;
  c.lineWidth = 10;
  c.strokeRect(WIN_X0, WIN_Y0, WIN_X1 - WIN_X0, WIN_Y1 - WIN_Y0);
  c.strokeRect(DOOR_X0, -310, DOOR_X1 - DOOR_X0, 310);
  // half-drawn blinds across the top of the plate glass
  c.fillStyle = 'rgba(20,20,20,0.82)';
  for (let i = 0; i < 9; i++) c.fillRect(WIN_X0 + 5, WIN_Y0 + 6 + i * 14, WIN_X1 - WIN_X0 - 10, 7);
  // glass: sheen, beads, running drops, lettering
  c.save();
  c.beginPath();
  c.rect(WIN_X0, WIN_Y0, WIN_X1 - WIN_X0, WIN_Y1 - WIN_Y0);
  c.rect(DOOR_X0 + 10, -300, DOOR_X1 - DOOR_X0 - 20, 150);
  c.clip();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x0 = WIN_X0 - 200 + i * 230 + (cam[0] - 1000) * 0.25;
    c.fillStyle = 'rgba(255,255,255,0.045)';
    c.beginPath();
    c.moveTo(x0, WIN_Y0);
    c.lineTo(x0 + 70, WIN_Y0);
    c.lineTo(x0 - 80, WIN_Y1);
    c.lineTo(x0 - 150, WIN_Y1);
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fill(s.drops);
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.fill(s.dropHi);
  c.strokeStyle = 'rgba(255,255,255,0.18)';
  c.lineWidth = 1.6;
  for (let i = 0; i < s.streaks.length; i++) {
    const pts = s.streaks[i];
    const sp = 0.25 + hash(i) * 0.3;
    const k = (t * sp + hash(i * 3)) % 1;
    const n = Math.floor(k * pts.length);
    c.beginPath();
    for (let j = Math.max(0, n - 6); j <= n && j < pts.length; j++) {
      if (j === Math.max(0, n - 6)) c.moveTo(pts[j][0], pts[j][1]);
      else c.lineTo(pts[j][0], pts[j][1]);
    }
    c.stroke();
  }
  c.restore();
  title(c, 'OPEN ALL NIGHT', (WIN_X0 + WIN_X1) / 2, -240, { size: 26, spacing: 9, col: NOIR.pale, a: 0.7 * fa });
  neonDINER(c, (WIN_X0 + WIN_X1) / 2, -505, fa);
  c.restore();

  // corner pilaster at the alley (always solid: it wipes us in and out of the diner)
  c.fillStyle = NOIR.black;
  c.fillRect(WIN_X1 + 4, DINER_ROOF, 80, -DINER_ROOF);
  c.fillStyle = s.brick ?? NOIR.shadow;
  c.fillRect(WIN_X1 + 18, DINER_ROOF, 40, -DINER_ROOF);
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillRect(WIN_X1 + 46, DINER_ROOF, 12, -DINER_ROOF);

  // blade sign over the corner
  c.fillStyle = NOIR.black;
  c.fillRect(DINER_X0 - 10, -592, 90, 6);
  c.fillRect(DINER_X0 - 10, -330, 90, 5);
  neonEAT(c, t, 745, -600, 1);

  // the alley: deep back wall, side door with a bare bulb, bins
  c.fillStyle = NOIR.black;
  c.fillRect(ALLEY_X0 + 84, -1020, ALLEY_X1 - ALLEY_X0 - 84, 1020);
  c.fillStyle = s.brickAlley ?? NOIR.night;
  c.globalAlpha = 0.7;
  c.fillRect(ALLEY_X0 + 84, -700, ALLEY_X1 - ALLEY_X0 - 84, 700);
  c.globalAlpha = 1;
  c.fillStyle = grey(0.42);
  c.fillRect(1872, -300, 72, 290);
  c.fillStyle = NOIR.black;
  c.fillRect(1878, -294, 60, 284);
  c.fillStyle = grey(0.3);
  c.fillRect(1882, -290, 52, 276);
  glow(c, 1908, -330, 180, 0.55);
  c.fillStyle = grey(1);
  c.beginPath();
  c.arc(1908, -330, 6, 0, TAU);
  c.fill();
  shaft(c, 1908, -326, 1908, 60, 20, 260, 0.1);

  // alley block with the fire escape
  c.fillStyle = s.brickAlley ?? NOIR.night;
  c.fillRect(ALLEY_X1, ROOF_Y, BLD_X1 - ALLEY_X1, -ROOF_Y);
  c.fillStyle = NOIR.night;
  c.fill(s.alleyWin);
  // the lit window with its blinds, second floor
  const lwx = 2290;
  const lwy = -690;
  c.fillStyle = grey(0.78);
  c.fillRect(lwx, lwy, 90, 170);
  c.fillStyle = grey(0.18);
  for (let i = 0; i < 13; i++) c.fillRect(lwx, lwy + i * 13, 90, 6.5);
  // garage shutters at street level
  c.fillStyle = NOIR.deep;
  c.fillRect(2600, -330, 620, 330);
  c.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = -320; y < 0; y += 16) c.fillRect(2600, y, 620, 3);
  // cornice and parapet
  c.fillStyle = NOIR.black;
  c.fillRect(ALLEY_X1 - 10, ROOF_Y - 30, BLD_X1 - ALLEY_X1 + 20, 34);
  c.fillRect(DINER_X0 - 10, DINER_ROOF - 26, DINER_X1 - DINER_X0 + 94, 30);
  c.fillRect(-1010, -1430, 1720, 34);
  // diner roof edge sits against the sky
  c.fillStyle = s.brick ?? NOIR.shadow;
  c.fillRect(DINER_X0, DINER_ROOF, DINER_X1 + 84 - DINER_X0, 0.0001);
  // blind light spilling into the rain from the lit windows
  blindShafts(c, { x: lwx, y: lwy, w: 90, h: 170, slats: 13, open: 0.5, vx: -160, vy: 360, spread: 1.6, a: 0.07 });
  glow(c, lwx + 45, lwy + 85, 160, 0.18);
  const uwy = -1090;
  c.fillStyle = grey(0.7);
  c.fillRect(lwx, uwy, 90, 170);
  c.fillStyle = grey(0.16);
  for (let i = 0; i < 13; i++) c.fillRect(lwx, uwy + i * 13, 90, 6.5);
  blindShafts(c, { x: lwx, y: uwy, w: 90, h: 170, slats: 13, open: 0.5, vx: 180, vy: 320, spread: 1.5, a: 0.06 });
  glow(c, lwx + 45, uwy + 85, 140, 0.14);
  // the bulb washes the alley wall from below
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = radGrad(c, 1950, -260, 0, 900, [
    [0, 'rgba(255,255,255,0.16)'],
    [0.5, 'rgba(255,255,255,0.05)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  c.fillRect(ALLEY_X0, -1200, 1100, 1250);
  c.fillStyle = radGrad(c, 2700, -760, 0, 760, [
    [0, 'rgba(255,255,255,0.2)'],
    [0.55, 'rgba(255,255,255,0.07)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  c.fillRect(1940, -1520, 1520, 1520);
  c.restore();
  // a vertical hotel sign on the alley block: tubes of light, one more source for the climb
  hotelSign(c, t, 2790, -1110);
};

const hotelSign = (c: Ctx, t: number, x: number, y: number) => {
  c.fillStyle = NOIR.black;
  c.fillRect(x - 70, y + 20, 70, 6);
  c.fillRect(x - 70, y + 520, 70, 6);
  c.fillStyle = NOIR.night;
  c.fillRect(x - 40, y, 80, 560);
  c.save();
  c.font = `700 74px ${NOIR_SERIF}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 4;
  const f = Math.floor(t * 24);
  ['H', 'O', 'T', 'E', 'L'].forEach((L, i) => {
    const dead = L === 'E' && hash(f * 0.61 + 3) < 0.3;
    c.strokeStyle = grey(0.96, dead ? 0.25 : 1);
    c.strokeText(L, x, y + 62 + i * 106);
  });
  c.lineWidth = 2;
  c.strokeStyle = grey(0.9);
  c.strokeRect(x - 33, y + 8, 66, 544);
  c.restore();
  glow(c, x, y + 280, 420, 0.22);
};

const drawRoof = (c: Ctx, t: number, s: State) => {
  const clear = tween(t, 15.6, 19.4, ease.inOutSine);
  c.fillStyle = NOIR.black;
  c.fill(s.roofJunk);
  // water tower: steel legs, cross bracing, a staved barrel with hoops, a conical cap
  const tx = 2900;
  const legsTop = ROOF_Y - 200;
  const tankTop = legsTop - 260;
  c.save();
  c.strokeStyle = NOIR.black;
  c.lineWidth = 10;
  c.lineCap = 'butt';
  c.beginPath();
  for (const lx of [-130, -45, 45, 130]) {
    c.moveTo(tx + lx * 1.12, ROOF_Y);
    c.lineTo(tx + lx, legsTop);
  }
  c.stroke();
  c.lineWidth = 3.5;
  c.beginPath();
  for (const [a, b] of [
    [-130, -45],
    [-45, 45],
    [45, 130],
  ]) {
    c.moveTo(tx + a * 1.12, ROOF_Y);
    c.lineTo(tx + b, legsTop + 120);
    c.moveTo(tx + b * 1.12, ROOF_Y);
    c.lineTo(tx + a, legsTop + 120);
    c.moveTo(tx + a, legsTop + 120);
    c.lineTo(tx + b, legsTop);
    c.moveTo(tx + b, legsTop + 120);
    c.lineTo(tx + a, legsTop);
  }
  c.moveTo(tx - 140, legsTop + 120);
  c.lineTo(tx + 140, legsTop + 120);
  c.stroke();
  c.restore();
  const tank = new Path2D();
  tank.moveTo(tx - 150, legsTop);
  tank.lineTo(tx - 160, tankTop);
  tank.lineTo(tx + 160, tankTop);
  tank.lineTo(tx + 150, legsTop);
  tank.closePath();
  const cap = poly([
    [tx - 172, tankTop + 4],
    [tx - 4, tankTop - 120],
    [tx + 4, tankTop - 120],
    [tx + 172, tankTop + 4],
  ]);
  rect(tx - 3, tankTop - 150, 6, 34, cap);
  // moon rim on the right edges
  c.fillStyle = grey(0.6 + clear * 0.3);
  c.save();
  c.translate(3, -2);
  c.fill(tank);
  c.fill(cap);
  c.restore();
  c.fillStyle = NOIR.black;
  c.fill(tank);
  c.fill(cap);
  c.strokeStyle = 'rgba(255,255,255,0.06)';
  c.lineWidth = 1.5;
  c.beginPath();
  for (let i = -7; i <= 7; i++) {
    c.moveTo(tx + i * 21, legsTop);
    c.lineTo(tx + i * 22.4, tankTop);
  }
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.14)';
  c.lineWidth = 3;
  c.beginPath();
  for (const k of [0.15, 0.42, 0.7, 0.92]) {
    const y = lerp(legsTop, tankTop, k);
    const hw = lerp(150, 160, k);
    c.moveTo(tx - hw, y);
    c.lineTo(tx + hw, y);
  }
  c.stroke();
  // ladder up the side
  c.strokeStyle = NOIR.black;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(tx - 182, ROOF_Y);
  c.lineTo(tx - 176, tankTop);
  c.moveTo(tx - 200, ROOF_Y);
  c.lineTo(tx - 194, tankTop);
  for (let y = ROOF_Y - 20; y > tankTop; y -= 22) {
    c.moveTo(tx - 200, y);
    c.lineTo(tx - 180, y);
  }
  c.stroke();
  // drips off the tank as the rain stops
  const dr = clear * (1 - seg(t, 19, 20));
  if (dr > 0.02) {
    c.fillStyle = grey(0.8, dr);
    for (let i = 0; i < 6; i++) {
      const dx = tx - 150 + hash(i * 3.3) * 300;
      const per = 0.7 + hash(i) * 0.6;
      const k = ((t / per + hash(i * 7)) % 1) ** 2;
      c.fillRect(dx, legsTop + k * 240, 1.5, 5);
    }
  }
  // the antenna
  c.strokeStyle = NOIR.black;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(3215, ROOF_Y - 120);
  c.lineTo(3215, ROOF_Y - 330);
  for (let i = 0; i < 4; i++) {
    c.moveTo(3215 - 40 + i * 6, ROOF_Y - 300 + i * 40);
    c.lineTo(3215 + 40 - i * 6, ROOF_Y - 300 + i * 40);
  }
  c.stroke();
};

/** Fire escape: back stringers and landings, then (front = true) the near rails over the man */
const drawFireEscape = (c: Ctx, front: boolean) => {
  c.save();
  c.strokeStyle = NOIR.black;
  c.lineCap = 'square';
  if (!front) {
    // shadows of the ironwork cast on the brick by the bulb below
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = 6;
    c.beginPath();
    for (let f = 0; f < 3; f++) {
      const a = stairPt(f, 0);
      const b = stairPt(f, FE_STEPS);
      c.moveTo(a[0] + 30, a[1] - 60);
      c.lineTo(b[0] + 30, b[1] - 60);
    }
    c.stroke();
    c.strokeStyle = NOIR.black;
    // landings
    c.lineWidth = 8;
    c.beginPath();
    for (let f = 1; f <= 3; f++) {
      c.moveTo(FE_X0 - 70, LAND[f]);
      c.lineTo(FE_X1 + 70, LAND[f]);
    }
    c.stroke();
    // treads and stringers
    for (let f = 0; f < 3; f++) {
      c.lineWidth = 5;
      c.beginPath();
      const a = stairPt(f, 0);
      const b = stairPt(f, FE_STEPS);
      c.moveTo(a[0], a[1] + 8);
      c.lineTo(b[0], b[1] + 8);
      c.stroke();
      c.lineWidth = 4;
      c.beginPath();
      for (let k = 1; k <= FE_STEPS; k++) {
        const q = stairPt(f, k);
        const dir = f % 2 === 0 ? 1 : -1;
        c.moveTo(q[0] - dir * 30, q[1]);
        c.lineTo(q[0] + dir * 4, q[1]);
      }
      c.stroke();
    }
    // brackets into the wall
    c.lineWidth = 4;
    c.beginPath();
    for (let f = 1; f <= 3; f++) {
      c.moveTo(FE_X0 - 70, LAND[f]);
      c.lineTo(FE_X0 - 30, LAND[f] + 60);
      c.moveTo(FE_X1 + 70, LAND[f]);
      c.lineTo(FE_X1 + 30, LAND[f] + 60);
    }
    c.stroke();
  } else {
    // rails and balusters of the landings, hand rails of the flights
    c.lineWidth = 4;
    c.beginPath();
    for (let f = 1; f <= 3; f++) {
      c.moveTo(FE_X0 - 70, LAND[f] - 96);
      c.lineTo(FE_X1 + 70, LAND[f] - 96);
      for (let x = FE_X0 - 70; x <= FE_X1 + 70; x += 30) {
        c.moveTo(x, LAND[f] - 96);
        c.lineTo(x, LAND[f]);
      }
    }
    for (let f = 0; f < 3; f++) {
      const a = stairPt(f, 0);
      const b = stairPt(f, FE_STEPS);
      c.moveTo(a[0], a[1] - 92);
      c.lineTo(b[0], b[1] - 92);
      for (let k = 0; k <= FE_STEPS; k += 3) {
        const q = stairPt(f, k);
        c.moveTo(q[0], q[1] - 92);
        c.lineTo(q[0], q[1]);
      }
    }
    c.stroke();
    // wet highlights along the top rails
    c.strokeStyle = 'rgba(255,255,255,0.22)';
    c.lineWidth = 1.2;
    c.beginPath();
    for (let f = 1; f <= 3; f++) {
      c.moveTo(FE_X0 - 70, LAND[f] - 98);
      c.lineTo(FE_X1 + 70, LAND[f] - 98);
    }
    c.stroke();
  }
  c.restore();
};

const drawStreet = (c: Ctx, t: number, s: State, cam: [number, number, number]) => {
  c.drawImage(s.street, -900, 0, 4400, 640);
  // the puddle: a dark mirror holding the blade sign upside down
  const pv = 1 - seg(cam[2], 3.0, 1.2) * 0;
  c.save();
  c.clip(s.puddle);
  c.fillStyle = NOIR.black;
  c.fillRect(300, 80, 620, 160);
  if (t < 9) {
    const rf = s.refl;
    const g = rf.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, rf.canvas.width, rf.canvas.height);
    const sc = rf.canvas.width / 700;
    g.setTransform(sc, 0, 0, sc, 0, 0);
    // reflection space: x as the world (offset by 300), y mirrored and squashed
    g.save();
    g.translate(-300, -74);
    g.scale(1, -0.32);
    neonEAT(g, t, 745, -600, 0.9);
    g.restore();
    g.save();
    g.translate(-300, 0);
    glow(g, LAMP_X + 46, 34, 70, 0.7);
    g.fillStyle = grey(0.95, 0.9);
    g.beginPath();
    g.ellipse(LAMP_X + 46, 32, 16, 4, 0, 0, TAU);
    g.fill();
    // the man's legs reflected, dark against the glow
    g.fillStyle = NOIR.black;
    g.fillRect(MAN_X0 - 12, 0, 10, 46);
    g.fillRect(MAN_X0 + 4, 0, 10, 46);
    g.fillRect(MAN_X0 - 26, 40, 54, 30);
    g.restore();
    // ripple: copy in thin strips with a travelling sine offset
    const strips = 32;
    const sh = rf.canvas.height / strips;
    for (let i = 0; i < strips; i++) {
      const off = Math.sin(i * 0.9 + t * 5.5) * 2.4 + Math.sin(i * 2.3 - t * 3.1) * 1.4;
      c.drawImage(rf.canvas, 0, i * sh, rf.canvas.width, sh + 0.5, 300 + off, 100 + (i * 160) / strips, 700, 160 / strips + 0.3);
    }
  }
  c.restore();
  ripples(c, t, 608, 158, 270, 52, 26 * rainAmt(t) + 2, 3, 0.45, 28);
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.lineWidth = 1.5;
  c.stroke(s.puddle);
  // drops splashing all along the street
  ripples(c, t, 700, 300, 1400, 200, 50 * rainAmt(t), 9, 0.22 * pv, 18);
};

const drawLamp = (c: Ctx, t: number) => {
  c.fillStyle = NOIR.black;
  c.fillRect(LAMP_X - 6, LAMP_TOP + 50, 12, 70 - LAMP_TOP);
  c.fillRect(LAMP_X - 13, 40, 26, 30);
  c.fillRect(LAMP_X - 9, -40, 18, 80);
  drawLampHead(c, LAMP_X, LAMP_TOP, 1);
  // the cone of light, rain glinting inside it
  const lx = LAMP_X + 46;
  const ly = LAMP_TOP + 22;
  shaft(c, lx, ly, lx + 10, 80, 40, 360, 0.11, NOIR.white, 0.02);
  c.save();
  const cone = poly([
    [lx - 20, ly],
    [lx + 20, ly],
    [lx + 190, 80],
    [lx - 170, 80],
  ]);
  c.clip(cone);
  rain(c, t, { seed: 4, n: 70 * rainAmt(t), x0: lx - 220, y0: ly, x1: lx + 220, y1: 90, speed: 900, slant: 0.12, len: 26, width: 1.3, a: 0.5 });
  c.restore();
  glow(c, lx, ly, 160, 0.55);
  glow(c, lx, ly, 40, 0.9);
  void t;
};

/** Flame position (local units): at the match head while striking, in the cupped hands after */
const flameLocal = (m: ManState, b: Bones): Pt => {
  const pinch: Pt = [b.tipN[0] + 2, b.tipN[1] - 9];
  return m.cup > 0 ? lerpPt(pinch, F_L, clamp(m.cup * 1.6 - 0.3)) : pinch;
};

/** Two hands cupped around the flame, lit from inside (local units, flame base at F) */
const drawCup = (c: Ctx, t: number, F: Pt, k: number) => {
  const P = (x: number, y: number): Pt => [F[0] + x, F[1] + y];
  const outer: Pt[] = [
    P(-8, -5),
    P(-11.5, 0),
    P(-11, 8),
    P(-6.5, 14.5),
    P(-1, 18.5),
    P(6, 19),
    P(12.5, 15),
    P(15.5, 8),
    P(15.5, 0.5),
    P(13.5, -5.5),
    P(10.4, -9.4),
    P(7.6, -8.6),
    P(7.4, -4),
    P(6.4, 1),
    P(3, 4.6),
    P(-1.4, 5),
    P(-4.8, 2.4),
    P(-5.4, -3),
  ];
  const p = smoothPathPts(outer);
  c.fillStyle = NOIR.night;
  c.fill(p);
  const fl = 0.85 + noise1(t * 14, 2) * 0.15;
  c.save();
  c.clip(p);
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = radGrad(c, F[0] + 1, F[1] - 2, 0, 16, [
    [0, rgba(NOIR.flame, 0.95 * k * fl)],
    [0.45, rgba(NOIR.flame, 0.35 * k * fl)],
    [1, rgba(NOIR.flame, 0)],
  ]);
  c.fillRect(F[0] - 20, F[1] - 20, 40, 40);
  c.restore();
  // knuckles and the gaps between the fingers of the near hand
  c.save();
  c.strokeStyle = rgba(NOIR.flame, 0.35 * k);
  c.lineWidth = 0.7;
  c.lineCap = 'round';
  c.beginPath();
  for (const [x0, y0, x1, y1] of [
    [9.5, -3.5, 14.5, -1],
    [8.5, 2.5, 15, 5],
    [6.5, 7.5, 13.5, 11],
  ]) {
    const a0 = P(x0, y0);
    const a1 = P(x1, y1);
    c.moveTo(a0[0], a0[1]);
    c.quadraticCurveTo((a0[0] + a1[0]) / 2 + 1, (a0[1] + a1[1]) / 2 - 1.5, a1[0], a1[1]);
  }
  c.stroke();
  c.restore();
};

const smoothPathPts = (pts: Pt[]) => {
  const p = new Path2D();
  const n = pts.length;
  p.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  for (let i = 1; i <= n; i++) {
    const q = pts[i % n];
    const nx = pts[(i + 1) % n];
    p.quadraticCurveTo(q[0], q[1], (q[0] + nx[0]) / 2, (q[1] + nx[1]) / 2);
  }
  p.closePath();
  return p;
};

const drawMan = (c: Ctx, t: number, m: ManState, zoom: number) => {
  const flameOn = m.flame;
  const px = 1 / zoom;
  // a top light from the lamp, a rim from the window side; a warm face when the match burns
  const underLamp = clamp(1 - Math.abs(m.x - (LAMP_X + 60)) / 380);
  const onRoof = m.hipY < ROOF_Y - 100;
  const look: Look = {
    body: NOIR.shadow,
    far: NOIR.night,
    rim: m.inside ? grey(0.8) : onRoof ? grey(0.75) : grey(0.62 + underLamp * 0.25),
    rimDx: (onRoof ? 2.6 : m.onStairs ? 2.4 * m.dir : 2.6) * px,
    rimDy: -2 * px,
    detail: 'rgba(120,120,120,0.4)',
    top: `rgba(170,170,170,${0.1 + underLamp * 0.22})`,
    smoke: t < T_FLARE + 0.4 ? 0 : m.ember,
  };
  const b0 = solve(m.pose);
  const F = flameLocal(m, b0);
  if (flameOn > 0.01) {
    const flick = 0.85 + noise1(t * 14, 2) * 0.15;
    const flare = Math.exp(-(((t - T_FLARE) / 0.12) ** 2));
    look.light = { x: F[0] - 3, y: F[1] - 8, r: 30 + flare * 20, col: NOIR.flame, a: flameOn * flick * (0.9 + flare * 0.6) };
  }
  const b = drawFigure(c, m.pose, look, m.x, m.hipY, m.s, m.dir);
  const fp = toWorld(F, m.x, m.hipY, m.s, m.dir);
  // the matchbox in the far hand while striking
  if (t > T_RAISE + 0.3 && m.cup < 0.5 && t < T_SHAKE) {
    const wf = toWorld(b.tipF, m.x, m.hipY, m.s, m.dir);
    c.fillStyle = grey(0.55);
    c.fillRect(wf[0] - 3, wf[1] - 9, 14, 8);
    c.fillStyle = NOIR.black;
    c.fillRect(wf[0] - 3, wf[1] - 3, 14, 2);
  }
  // the match: a stick from the fingers to the head
  if (t > T_RAISE + 0.6 && t < T_WALK + 0.2 && m.cup < 0.5) {
    const tip = toWorld(b.tipN, m.x, m.hipY, m.s, m.dir);
    c.save();
    c.strokeStyle = flameOn > 0.01 ? grey(0.8) : grey(0.45);
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(tip[0], tip[1]);
    c.lineTo(fp[0], fp[1] + 3);
    c.stroke();
    c.restore();
  }
  if (m.cup >= 0.5) {
    c.save();
    c.translate(m.x, m.hipY);
    c.scale(m.s * m.dir, m.s);
    drawCup(c, t, F, flameOn);
    c.restore();
  }
  if (flameOn > 0.01) drawFlame(c, t, fp[0], fp[1], flameOn);
  else if (t > T_SHAKE + 0.1 && t < T_WALK + 0.6) {
    // a thread of smoke off the dead match
    const tip = toWorld(b.tipN, m.x, m.hipY, m.s, m.dir);
    c.save();
    c.strokeStyle = 'rgba(200,200,200,0.25)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(tip[0], tip[1] - 8);
    for (let i = 1; i < 10; i++) c.lineTo(tip[0] + Math.sin(i * 0.8 + t * 3) * i * 0.8, tip[1] - 8 - i * 5);
    c.stroke();
    c.restore();
  }
  // cigarette smoke drifting up and away
  if (t > T_FLARE + 0.6) {
    const mo = toWorld(b.mouth, m.x, m.hipY, m.s, m.dir);
    c.save();
    c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      c.strokeStyle = `rgba(210,210,210,${0.12 - k * 0.03})`;
      c.lineWidth = (1.6 + k * 2.2) * Math.min(1, 2 * px + 0.3);
      c.beginPath();
      const x0 = mo[0] + 12 * m.dir;
      const y0 = mo[1] - 2;
      c.moveTo(x0, y0);
      for (let i = 1; i < 14; i++) {
        const yy = y0 - i * 7;
        const xx = x0 + noise1(i * 0.4 - t * 1.2, k + 2) * i * 2.2 - i * 1.2 * m.dir;
        c.lineTo(xx, yy);
      }
      c.stroke();
    }
    c.restore();
  }
};

const drawFlame = (c: Ctx, t: number, x: number, y: number, k: number) => {
  const flare = Math.exp(-(((t - T_FLARE) / 0.1) ** 2));
  const fl = noise1(t * 18, 1);
  const h = (16 + flare * 22) * k * (0.9 + fl * 0.12);
  const w = (5 + flare * 5) * k;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const gr = 46 + flare * 90;
  c.fillStyle = radGrad(c, x, y - h * 0.35, 0, gr, [
    [0, rgba(NOIR.flame, 0.55 * k)],
    [0.25, rgba(NOIR.flame, 0.18 * k)],
    [1, rgba(NOIR.flame, 0)],
  ]);
  c.fillRect(x - gr, y - h * 0.35 - gr, gr * 2, gr * 2);
  const p = new Path2D();
  p.moveTo(x, y + 2);
  p.bezierCurveTo(x + w, y, x + w * 0.8, y - h * 0.5, x + fl * 1.5, y - h);
  p.bezierCurveTo(x - w * 0.8, y - h * 0.5, x - w, y, x, y + 2);
  c.fillStyle = rgba(NOIR.flame, 0.9);
  c.fill(p);
  c.fillStyle = 'rgba(255,240,210,0.95)';
  c.beginPath();
  c.ellipse(x, y - h * 0.25, w * 0.45, h * 0.28, 0, 0, TAU);
  c.fill();
  c.restore();
  // sparks at the strike
  if (t > T_FLARE - 0.04 && t < T_FLARE + 0.3) {
    const rng = mulberry(77);
    const u = (t - T_FLARE + 0.04) / 0.34;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = rgba(NOIR.flame, 1 - u);
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (rng() - 0.5) * 2.6;
      const sp = 30 + rng() * 60;
      c.fillRect(x + Math.cos(a) * sp * u, y + Math.sin(a) * sp * u + u * u * 40, 1.8, 1.8);
    }
    c.restore();
  }
};

/* ---------- the film ---------- */

const camAt = (t: number): [number, number, number] => {
  const last = KEYS[KEYS.length - 1];
  if (t <= last[0]) return hermite(t, KEYS);
  // the climb: follow the man, then the pull back off the roof
  const m = manAt(Math.min(t, T_ROOF + 0.3));
  const fy = m.hipY - 30;
  const fx = clamp(m.x, FE_X0 + 80, FE_X1 - 60) + 10;
  const follow: [number, number, number] = [fx, fy, 1.22];
  const k0 = ease.inOutSine(seg(t, last[0], last[0] + 0.8));
  const base: [number, number, number] = [lerp(last[1], follow[0], k0), lerp(last[2], follow[1], k0), lerp(last[3], follow[2], k0)];
  const k = ease.inOutCubic(seg(t, 15.7, 18.6));
  const drift = seg(t, 18.6, DUR);
  const end: [number, number, number] = [2640 + drift * 14, -1432 - drift * 6, 0.8 - drift * 0.02];
  // smooth the follow so the stride bob never reaches the camera
  return [lerp(base[0], end[0], k), lerp(base[1], end[1], k), Math.exp(lerp(Math.log(base[2]), Math.log(end[2]), k))];
};

const smoothCam = (t: number): [number, number, number] => {
  // average a few samples: a heavy crane, not a handheld
  const last = KEYS[KEYS.length - 1][0];
  if (t <= last) return camAt(t);
  let x = 0;
  let y = 0;
  let z = 0;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const c = camAt(t + (i - (n - 1) / 2) * 0.09);
    x += c[0];
    y += c[1];
    z += Math.log(c[2]);
  }
  return [x / n, y / n, Math.exp(z / n)];
};

export const noirLongTakeFilm: RisoFilm<State> = {
  id: 'noir-long-take',
  title: 'Long Take',
  caption: 'One unbroken move through a wet Detroit night: puddle, match, diner, fire escape, roof.',
  theme: 'Detroit',
  category: 'Cinematic',
  motif: 'A single small flame: the match, then the ember',
  duration: DUR,
  series: 'Noir',
  mode: 'direct',
  paper: NOIR.black,
  grain: 0,
  inks: [{ color: NOIR.black }, { color: NOIR.mid }, { color: NOIR.pale }, { color: NOIR.flame }],
  scenes: [
    { at: 0, label: 'The puddle' },
    { at: 3.3, label: 'A match' },
    { at: T_WALK, label: 'The diner' },
    { at: T_EXIT0, label: 'Fire escape' },
    { at: 15.8, label: 'The roof' },
  ],
  posterTime: 19.2,
  setup,
  draw(r: Riso, t: number, s: State) {
    const c = r.layers[0];
    const cam = smoothCam(t);
    const man = manAt(t);
    const insideK = tween(t, 7.85, 8.4, ease.inOutSine) * (1 - tween(t, 10.45, 10.9, ease.inOutSine));

    // far plane: sky, moon, skyline
    planeCam(r, t, cam, SKY_P, SKY_AX, SKY_AY);
    {
      const zc = Math.pow(cam[2], SKY_P);
      const cxs = SKY_AX + (cam[0] - SKY_AX) * SKY_P;
      drawSky(c, t, s, cxs - 820 / zc, cxs + 820 / zc);
    }

    // interior plane (seen through the glass)
    if (t < 11.6) {
      planeCam(r, t, cam, IN_P, IN_AX, IN_AY);
      drawInterior(c, t, s);
    }

    noirCam(r, t, cam[0], cam[1], cam[2]);
    if (man.inside) drawMan(c, t, man, cam[2]);
    drawFacade(c, t, s, insideK, cam);
    drawRoof(c, t, s);
    if (insideK < 0.98) drawStreet(c, t, s, cam);
    drawLamp(c, t);
    drawFireEscape(c, false);
    if (!man.inside) drawMan(c, t, man, cam[2]);
    drawFireEscape(c, true);

    // atmosphere on the main plane
    fogBand(c, s.fx, -900, 3400, 40, 220, t * 30, 0.32 * (1 - insideK), 0, 1300);
    fogBand(c, s.fx, 1800, 3400, -700, 500, t * 20 + 400, 0.18 * rainAmt(t), 1, 1500);
    fogBand(c, s.fx, 1400, 3800, ROOF_Y - 40, 260, t * 26, 0.3, 0, 1600);

    // rain in screen space, three depths with parallax
    r.camera(800, 450, 1);
    const ra = rainAmt(t) * (1 - insideK * 0.92);
    const [cx, cy, z] = cam;
    rain(c, t, { seed: 1, n: 260 * ra, x0: 0, y0: 0, x1: 1600, y1: 900, speed: 1500, slant: 0.1, len: 30, width: 1, a: 0.22, ox: -cx * z * 0.6, oy: -cy * z * 0.6 });
    rain(c, t, { seed: 2, n: 120 * ra, x0: 0, y0: 0, x1: 1600, y1: 900, speed: 2200, slant: 0.12, len: 54, width: 1.6, a: 0.28, ox: -cx * z, oy: -cy * z });
    rain(c, t, { seed: 3, n: 30 * ra, x0: 0, y0: 0, x1: 1600, y1: 900, speed: 3200, slant: 0.14, len: 110, width: 2.6, a: 0.16, ox: -cx * z * 1.6, oy: -cy * z * 1.6 });

    // title over the roof
    const ta = tween(t, T_TITLE, T_TITLE + 1.1, ease.inOutSine);
    if (ta > 0.01) {
      c.globalAlpha = ta;
      c.drawImage(s.titleArt, 390 - 400, 286 - 80 + (1 - ta) * 8, 800, 200);
      c.globalAlpha = 1;
    }

    finish(c, s.fx, t, {
      halation: 1,
      threshold: 0.8,
      grain: 0.5,
      damage: 1,
      black: 1 - seg(t, 0, 0.5),
      white: 0.16 * Math.exp(-(((t - T_FLARE) / 0.05) ** 2)),
    });
    void LB_TOP;
    void LB_BOT;
    void circle;
    void radGrad;
  },
};
