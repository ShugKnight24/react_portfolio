import { freeCanvas, glow, glowSprite, layer, mulberry } from './heroes-kit';
import {
  dampPose,
  drawGrain,
  grad,
  grainTile,
  keepAwake,
  limb,
  poly,
  smooth,
  traceBat,
} from './nolan-kit';
import type { AudioBus, SceneEnv } from './runtime';
import { clamp, createCanvasScene, damp, lerp, noise, rand, TAU, tone } from './runtime';
import type { MountScene } from './types';

/**
 * The Dark Knight Rises: the Pit. Bruce climbs the wall of the well without the rope, hand
 * over hand toward the circle of daylight, while the prisoners below chant him on; every
 * chant rolls up the shaft as a pulse of light and dust and grows louder the higher he gets.
 * Tapping (or Space, or Enter) makes him reach for the next hold, faster when the tap lands
 * on the chant. At the last ledge, holding winds him up for the leap while a ring fills and
 * empties; letting go in the gold band carries him across the gap, the bats burst out of the
 * crack beneath the lip and he hauls himself up into the sun. Let go outside it and he falls,
 * snatches the rope and slides back down to climb again. The stone is one baked tile scrolled
 * in world space; the climber is posed live with two bone reach for every limb.
 */

type C = CanvasRenderingContext2D;
type Mode =
  | 'start'
  | 'climb'
  | 'mantle'
  | 'ledge'
  | 'charge'
  | 'leap'
  | 'hang'
  | 'fall'
  | 'rope'
  | 'pull'
  | 'top';

interface Pt {
  x: number;
  y: number;
}

interface Key {
  t: number;
  v: number[];
}

interface Bat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
  size: number;
  z: number;
  on: boolean;
}

interface Wave {
  y: number;
  a: number;
}

interface Mote {
  x: number;
  y: number;
  ph: number;
  z: number;
}

interface State {
  mode: Mode;
  mt: number;
  top: number;
  moveT: number;
  moveDur: number;
  queue: number;
  /** pelvis, left hand, right hand, left foot, right foot (x, y pairs in world units) */
  pose: number[];
  goal: number[];
  from: number[];
  keys: Key[];
  grip: boolean[];
  plant: boolean[];
  lean: number;
  leanT: number;
  tilt: number;
  hipTilt: number;
  look: number;
  lookT: number;
  kneeOut: number;
  elbowOut: number;
  pelvis: Pt;
  vel: Pt;
  leapFrom: Pt;
  leapCtl: Pt;
  leapTo: Pt;
  leapDur: number;
  good: boolean;
  charge: number;
  chargeT: number;
  attempts: number;
  rope: number;
  ropeV: number;
  ropeGrip: number;
  sun: number;
  shake: number;
  fade: number;
  camY: number;
  // the chant
  beatT: number;
  beatI: number;
  lastBeat: number;
  nextIn: number;
  pulse: number;
  waves: Wave[];
  fists: number;
  // ambience
  bats: Bat[];
  motes: Mote[];
  dust: { x: number; y: number; vx: number; vy: number; life: number }[];
  touched: boolean;
  held: boolean;
  idle: number;
  autoT: number;
  // layout
  u: number;
  S: number;
  tile: HTMLCanvasElement | null;
  sky: HTMLCanvasElement | null;
  sunGlow: HTMLCanvasElement;
  warm: HTMLCanvasElement;
  dustSprite: HTMLCanvasElement;
  grain: HTMLCanvasElement;
}

const W0 = 900;
const H0 = 560;
const START_Y = 36;
const N_HOLDS = 22;
/** handholds alternate left and right; each has a foothold 80 below it on the other side */
const HOLDS: Pt[] = [];
const STEPS: Pt[] = [];
{
  const rnd = mulberry(5);
  for (let i = 0; i < N_HOLDS; i++) {
    const y = 136 + i * 22 + (rnd() - 0.5) * 3;
    HOLDS.push({ x: (i % 2 ? -10 : -36) + (rnd() - 0.5) * 4, y });
    STEPS.push({ x: (i % 2 ? -32 : -14) + (rnd() - 0.5) * 3, y: y - 80 });
  }
}
const LEDGE_Y = HOLDS[N_HOLDS - 1].y + 14;
/** height of the rim of the well, in world units above the prison floor */
const TOP = LEDGE_Y + 94;
/** how much the well's wall bows toward the viewer at the edges of the frame */
const CURV = 0.5;
const LEDGE_X0 = -64;
const LEDGE_X1 = -4;
const LIP_X = 46;
const ROPE_X = 22;
const REST = 12;
const TILE_U = 120;
const BEATS = [0, 0.36, 0.98, 1.28, 1.58];
const CYCLE = 2.4;
// the rig: bone lengths, torso and the half widths of shoulders and hips
const UARM = 18;
const FARM = 17;
const THIGH = 23;
const SHIN = 22;
const TORSO = 28;
const SHW = 12;
const HIPW = 7;
const FLOOR_P = START_Y + 43;
/** seconds of push off the ledge before he leaves it */
const PUSH = 0.2;

const SKIN = '#7a5a46';
const SHIRT = '#2b2622';
const PANTS = '#1c1a19';

/* ---------- baked stone ---------- */

function paintTile(s: State, env: SceneEnv) {
  const px = Math.round(TILE_U * s.S);
  const { cv, c } = layer(s.tile, px, px, env.dpr);
  s.tile = cv;
  if (!c) return;
  const rnd = mulberry(11);
  c.fillStyle = '#2c241d';
  c.fillRect(0, 0, px, px);
  // rows that add up to exactly one tile, so it repeats without a seam
  const rows: number[] = [];
  let left = px;
  while (left > 0) {
    const r = Math.min(left, px * (0.12 + rnd() * 0.1));
    rows.push(left - r < px * 0.08 ? left : r);
    left -= rows[rows.length - 1];
  }
  let y = 0;
  for (const rh of rows) {
    let x = -rnd() * px * 0.3;
    while (x < px) {
      const bw = px * (0.18 + rnd() * 0.24);
      const tone = 0.75 + rnd() * 0.35;
      const r = Math.round(118 * tone);
      const g = Math.round(98 * tone);
      const b = Math.round(76 * tone);
      for (const ox of [0, -px, px]) {
        const bx = x + ox + 1;
        if (bx > px || bx + bw < 0) continue;
        const by = y + 1;
        c.fillStyle = `rgb(${r},${g},${b})`;
        c.beginPath();
        c.roundRect(bx, by, bw - 2.5, rh - 2.5, Math.min(6, rh * 0.25));
        c.fill();
        // light falls from the opening far above, so every block's top edge catches it
        c.fillStyle = 'rgba(255,230,190,0.16)';
        c.fillRect(bx + 2, by, bw - 6, Math.max(1, rh * 0.12));
        c.fillStyle = 'rgba(20,12,8,0.28)';
        c.fillRect(bx + 1, by + rh - 2.5 - rh * 0.18, bw - 4, rh * 0.18);
        // chips and pits
        c.fillStyle = 'rgba(30,20,14,0.25)';
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(bx + rnd() * bw, by + rnd() * rh, 1 + rnd() * 2.2, 0, TAU);
          c.fill();
        }
      }
      x += bw;
    }
    y += rh;
  }
  // grime streaks running down from the joints
  for (let i = 0; i < 14; i++) {
    const x = rnd() * px;
    const len = px * (0.2 + rnd() * 0.5);
    const y0 = rnd() * px;
    for (const oy of [0, -px]) {
      c.fillStyle = grad(c, 0, y0 + oy, 0, y0 + oy + len, [
        'rgba(20,14,10,0.22)',
        'rgba(20,14,10,0)',
      ]);
      c.fillRect(x, y0 + oy, 2 + rnd() * 3, len);
    }
  }
}

function paintSky(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.sky, w, h, dpr);
  s.sky = cv;
  if (!c) return;
  c.fillStyle = grad(c, 0, 0, 0, h, ['#6fa2d4', '#a9cbe8', '#e9eef0', '#fff6e2']);
  c.fillRect(0, 0, w, h);
  const rnd = mulberry(9);
  for (let i = 0; i < 12; i++) {
    c.globalAlpha = 0.25 + rnd() * 0.3;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(
      rnd() * w,
      h * (0.15 + rnd() * 0.5),
      (60 + rnd() * 160) * s.u,
      (6 + rnd() * 12) * s.u,
      0,
      0,
      TAU
    );
    c.fill();
  }
  c.globalAlpha = 1;
}

/* ---------- helpers ---------- */

const J = { x: 0, y: 0 };

/** Two bone reach from a root toward a target; the joint lands in J, the clamped end in out */
function reach(
  ax: number,
  ay: number,
  tx: number,
  ty: number,
  l1: number,
  l2: number,
  bend: number,
  out: Pt
) {
  let dx = tx - ax;
  let dy = ty - ay;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = (l1 + l2) * 0.995;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  out.x = ax + dx;
  out.y = ay + dy;
  const a0 = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a = a0 + bend * Math.acos(cosA);
  J.x = ax + Math.cos(a) * l1;
  J.y = ay + Math.sin(a) * l1;
}

/** Reach with the joint pushed out to one side (knees and elbows splay away from the body) */
function reachOut(
  ax: number,
  ay: number,
  tx: number,
  ty: number,
  l1: number,
  l2: number,
  side: number,
  out: Pt
) {
  reach(ax, ay, tx, ty, l1, l2, 1, out);
  if ((J.x - ax) * side < 0) reach(ax, ay, tx, ty, l1, l2, -1, out);
}

/**
 * Seen from behind, a bent knee or elbow mostly points toward the wall or the viewer and only
 * shows as a shorter limb; splay is how much of the bend turns out sideways instead.
 */
function splay(ax: number, ay: number, ex: number, ey: number, k: number) {
  const dx = ex - ax;
  const dy = ey - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = ((J.x - ax) * dx + (J.y - ay) * dy) / l2;
  const fx = ax + dx * t;
  const fy = ay + dy * t;
  J.x = fx + (J.x - fx) * k;
  J.y = fy + (J.y - fy) * k;
}

const bez = (a: number, b: number, c: number, k: number) =>
  (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;

const mod2 = (i: number) => ((i % 2) + 2) % 2;

/**
 * Keyframed pose curve: cubic Hermite through the keys with monotone tangents, so a limb that
 * holds still between two keys stays put and nothing overshoots its hold.
 */
function keyPose(keys: Key[], time: number, out: number[]) {
  let i = 0;
  while (i < keys.length - 2 && time >= keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const u = clamp((time - a.t) / (b.t - a.t), 0, 1);
  const pa = keys[i - 1] ?? a;
  const pb = keys[i + 2] ?? b;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  for (let j = 0; j < out.length; j++) {
    const p0 = pa.v[j];
    const p1 = a.v[j];
    const p2 = b.v[j];
    const p3 = pb.v[j];
    const d = p2 - p1;
    let m1 = (p1 - p0) * d <= 0 ? 0 : (p2 - p0) / 2;
    let m2 = d * (p3 - p2) <= 0 ? 0 : (p3 - p1) / 2;
    if (Math.abs(m1) > 3 * Math.abs(d)) m1 = 3 * d;
    if (Math.abs(m2) > 3 * Math.abs(d)) m2 = 3 * d;
    out[j] = h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
  }
}

/** Pelvis height when his top hand is on hold m (standing on the floor below the first) */
const stanceY = (m: number) => (m < 0 ? FLOOR_P : Math.max(FLOOR_P, HOLDS[m].y - 54));

const A = { x: 0, y: 0 };

/** Where a hand sits on hold i, or hangs loose at his side when there is no hold yet */
function handSpot(i: number, hand: number, px: number, py: number, out: Pt) {
  if (i >= 0) {
    out.x = HOLDS[i].x;
    out.y = HOLDS[i].y + 1.5;
  } else {
    out.x = px + (hand ? 1 : -1) * 14;
    out.y = py - 4;
  }
}

/** Where a foot stands on foothold i, or on the floor of the pit */
function footSpot(i: number, foot: number, out: Pt) {
  if (i >= 0) {
    out.x = STEPS[i].x;
    out.y = STEPS[i].y + 3;
  } else {
    out.x = -23 + (foot ? 8 : -8);
    out.y = START_Y;
  }
}

/** Hand h holds the newer of the two top holds that alternate onto its side */
const handHold = (m: number, h: number) => (mod2(m) === h ? m : m - 1);
/** Footholds alternate too, each one on the side opposite its matching handhold */
const footHold = (m: number, f: number) => ((mod2(m) ? 0 : 1) === f ? m : m - 1);

/** The settled pose with his highest hand on hold m */
function stancePose(m: number, out: number[]) {
  out[0] = -23;
  out[1] = stanceY(m);
  for (let i = 0; i < 2; i++) {
    handSpot(handHold(m, i), i, out[0], out[1], A);
    out[2 + i * 2] = A.x;
    out[3 + i * 2] = A.y;
    footSpot(footHold(m, i), i, A);
    out[6 + i * 2] = A.x;
    out[7 + i * 2] = A.y;
  }
  return out;
}

/* ---------- the climber, drawn in world units with y up ---------- */

const END = { x: 0, y: 0 };
const ELB = [0, 0, 0, 0];
const RIM = 'rgba(255,236,200,0.95)';

/**
 * Bruce from behind. The pose holds the pelvis, both hands and both feet; shoulders and hips
 * hang off the pelvis along the torso lean and tilt, and every limb is solved with two bone
 * reach, elbows and knees turned out from the wall the way a climber keeps his hips in.
 */
function drawBruce(c: C, s: State, rim: boolean) {
  const p = s.pose;
  const px = p[0];
  const py = p[1];
  const ux = Math.sin(s.lean);
  const uy = Math.cos(s.lean);
  const rx = Math.cos(s.tilt - s.lean);
  const ry = Math.sin(s.tilt - s.lean);
  const hx = Math.cos(s.hipTilt - s.lean);
  const hy = Math.sin(s.hipTilt - s.lean);
  const scx = px + ux * TORSO;
  const scy = py + uy * TORSO;
  const col = (base: string) => (rim ? RIM : base);

  // trousers: the seat, then each leg hip to knee to ankle
  c.fillStyle = col(PANTS);
  c.beginPath();
  c.ellipse(px - ux * 2, py - uy * 2, 10.5, 7.5, -s.lean, 0, TAU);
  c.fill();
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const ax = px + side * hx * HIPW;
    const ay = py + side * hy * HIPW;
    reachOut(ax, ay, p[6 + i * 2], p[7 + i * 2], THIGH, SHIN, side, END);
    splay(ax, ay, END.x, END.y, s.kneeOut);
    c.fillStyle = col(PANTS);
    limb(c, ax, ay, J.x, J.y, 6.8, 5.4);
    limb(c, J.x, J.y, END.x, END.y, 5.4, 3.9);
    if (!rim) {
      // a crease behind the knee where the cloth bunches
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.ellipse(J.x, J.y, 3.4, 1.6, Math.atan2(END.y - J.y, END.x - J.x), 0, TAU);
      c.fill();
    }
    // rag wrapped feet: flat on the hold when planted, toes hanging when not
    c.fillStyle = col('#3a3330');
    c.beginPath();
    if (s.plant[i]) c.ellipse(END.x + side * 0.8, END.y - 1.2, 4.6, 2.7, 0, 0, TAU);
    else {
      const a = Math.atan2(END.y - J.y, END.x - J.x);
      c.ellipse(END.x + Math.cos(a) * 3, END.y + Math.sin(a) * 3, 4.8, 2.8, a, 0, TAU);
    }
    c.fill();
  }

  // arms first, so where a hand comes in front of his chest the back covers it
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const ax = scx + side * rx * SHW;
    const ay = scy + side * ry * SHW;
    const tx = p[2 + i * 2];
    const ty = p[3 + i * 2];
    reachOut(ax, ay, tx, ty, UARM, FARM, side, END);
    splay(ax, ay, END.x, END.y, s.elbowOut);
    ELB[i * 2] = J.x;
    ELB[i * 2 + 1] = J.y;
    c.fillStyle = col(SKIN);
    limb(c, ax, ay, J.x, J.y, 5.4, 4.3);
    limb(c, J.x, J.y, END.x, END.y, 4.6, 3);
    const a = Math.atan2(END.y - J.y, END.x - J.x);
    c.beginPath();
    if (s.grip[i]) {
      // knuckles curled over the top of the hold
      c.ellipse(END.x, END.y + 0.6, 4.2, 3.2, 0, 0, TAU);
      c.fill();
      if (!rim) {
        c.strokeStyle = 'rgba(40,24,16,0.55)';
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(END.x - 3, END.y + 1.8);
        c.quadraticCurveTo(END.x, END.y + 3.2, END.x + 3, END.y + 1.8);
        c.stroke();
      }
    } else {
      // an open hand, fingers spread toward the next hold
      c.ellipse(END.x + Math.cos(a) * 3, END.y + Math.sin(a) * 3, 5.2, 3, a, 0, TAU);
      c.fill();
    }
  }

  // the back: broad lats tapering to the waist, the torn vest over it
  const wlx = px - hx * 10 + ux * 4;
  const wly = py - hy * 10 + uy * 4;
  const wrx = px + hx * 10 + ux * 4;
  const wry = py + hy * 10 + uy * 4;
  const slx = scx - rx * SHW;
  const sly = scy - ry * SHW;
  const srx = scx + rx * SHW;
  const sry = scy + ry * SHW;
  c.fillStyle = col(SKIN);
  c.beginPath();
  c.moveTo(slx - rx * 4 - ux * 2, sly - ry * 4 - uy * 2);
  c.quadraticCurveTo(slx - rx * 3 - ux * 16, sly - ry * 3 - uy * 16, wlx, wly);
  c.lineTo(wrx, wry);
  c.quadraticCurveTo(
    srx + rx * 3 - ux * 16,
    sry + ry * 3 - uy * 16,
    srx + rx * 4 - ux * 2,
    sry + ry * 4 - uy * 2
  );
  c.quadraticCurveTo(scx + ux * 9, scy + uy * 9, slx - rx * 4 - ux * 2, sly - ry * 4 - uy * 2);
  c.fill();
  if (!rim) {
    c.fillStyle = SHIRT;
    c.beginPath();
    c.moveTo(slx + rx * 3, sly + ry * 3);
    c.quadraticCurveTo(slx - rx * 1.5 - ux * 14, sly - ry * 1.5 - uy * 14, wlx, wly - 2);
    c.lineTo(lerp(wlx, wrx, 0.3), lerp(wly, wry, 0.3) - 4);
    c.lineTo(lerp(wlx, wrx, 0.55), lerp(wly, wry, 0.55) - 1);
    c.lineTo(lerp(wlx, wrx, 0.78), lerp(wly, wry, 0.78) - 4.5);
    c.lineTo(wrx, wry - 2);
    c.quadraticCurveTo(
      srx + rx * 1.5 - ux * 14,
      sry + ry * 1.5 - uy * 14,
      srx - rx * 3,
      sry - ry * 3
    );
    c.quadraticCurveTo(scx - ux * 3, scy - uy * 3, slx + rx * 3, sly + ry * 3);
    c.fill();
    // a tear across the back
    c.fillStyle = SKIN;
    poly(c, [
      scx - rx * 4 - ux * 12,
      scy - ry * 4 - uy * 12,
      scx + rx * 6 - ux * 9,
      scy + ry * 6 - uy * 9,
      scx + rx * 2 - ux * 15,
      scy + ry * 2 - uy * 15,
    ]);
    c.fill();
    // the shoulder blades ride up with each raised arm, the spine runs between them
    c.strokeStyle = 'rgba(30,18,12,0.35)';
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(scx - ux * 2, scy - uy * 2);
    c.lineTo(px + ux * 8, py + uy * 8);
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const lift = clamp((p[3 + i * 2] - scy) * 0.08, -2, 3);
      const bx = scx + side * rx * 6 - ux * (7 - lift);
      const by = scy + side * ry * 6 - uy * (7 - lift);
      c.moveTo(bx - side * rx * 1, by - side * ry * 1 + 3);
      c.quadraticCurveTo(
        bx + side * rx * 4,
        by + side * ry * 4 - 1,
        bx + side * rx * 1,
        by + side * ry * 1 - 5
      );
    }
    c.stroke();
    // waistband
    c.fillStyle = '#141211';
    poly(c, [wlx, wly - 1, wrx, wry - 1, wrx - ux * 5, wry - uy * 5, wlx - ux * 5, wly - uy * 5]);
    c.fill();
  }
  // deltoids cap the joint between arm and back
  c.fillStyle = col(SKIN);
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const ax = scx + side * rx * SHW;
    const ay = scy + side * ry * SHW;
    const a = Math.atan2(ELB[i * 2 + 1] - ay, ELB[i * 2] - ax);
    c.beginPath();
    c.ellipse(ax + Math.cos(a) * 2.5, ay + Math.sin(a) * 2.5, 7, 5.4, a, 0, TAU);
    c.fill();
  }

  // neck and head: cropped dark hair, ears, turned toward the next hold
  const hcx = scx + ux * 14 + s.look;
  const hcy = scy + uy * 14 - Math.abs(s.look) * 0.2;
  c.fillStyle = col(SKIN);
  limb(c, scx, scy, scx + ux * 7 + s.look * 0.4, scy + uy * 7, 5.2, 4.8);
  if (!rim) {
    c.beginPath();
    c.ellipse(hcx - rx * 7.1, hcy - ry * 7.1 - 1, 1.6, 2.6, -s.lean, 0, TAU);
    c.ellipse(hcx + rx * 7.1, hcy + ry * 7.1 - 1, 1.6, 2.6, -s.lean, 0, TAU);
    c.fill();
  }
  c.fillStyle = col('#1b1512');
  c.beginPath();
  c.ellipse(hcx, hcy, 7.2, 8.4, -s.lean, 0, TAU);
  c.fill();
  if (!rim) {
    // sweat catching the light on the shoulders
    c.fillStyle = 'rgba(255,226,180,0.32)';
    c.beginPath();
    c.ellipse(slx + ux * 1, sly + uy * 1, 5, 1.6, -0.3 - s.lean, 0, TAU);
    c.ellipse(srx + ux * 1, sry + uy * 1, 5, 1.6, 0.3 - s.lean, 0, TAU);
    c.fill();
  }
}

/* ---------- sound ---------- */

function syllable(bus: AudioBus, accent: boolean, level: number) {
  // a crowd of low voices: detuned saws through a vowel-ish band
  const { ctx, out } = bus;
  const t0 = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.06 * level * (accent ? 1.3 : 1), t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = accent ? 650 : 520;
  f.Q.value = 2.4;
  f.connect(g).connect(out);
  const base = accent ? 110 : 98;
  for (const d of [-7, -2, 3, 8]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = base;
    o.detune.value = d * 3;
    o.connect(f);
    o.start(t0);
    o.stop(t0 + 0.4);
  }
  tone(bus, base / 2, { type: 'sine', attack: 0.01, decay: 0.3, gain: 0.05 * level });
}

/* ---------- the climb ---------- */

function setMode(s: State, m: Mode) {
  s.mode = m;
  s.mt = 0;
}

/** Start a keyframed move from wherever he is now; key times are in seconds */
function playFrom(s: State, m: Mode, keys: [number, number[]][]) {
  setMode(s, m);
  s.keys = [{ t: 0, v: s.pose.slice() }, ...keys.map(([t, v]) => ({ t, v }))];
}

function beginMove(s: State, env: SceneEnv) {
  if (s.mode === 'start') {
    setMode(s, 'climb');
    s.top = -1;
  }
  if (s.top >= N_HOLDS - 1) {
    beginMantle(s);
    return;
  }
  s.top++;
  s.moveT = 0;
  s.from = s.pose.slice();
  // a pull timed with the chant is quicker and kicks dust off the wall
  const onBeat = s.lastBeat < 0.14 || s.nextIn < 0.1;
  s.moveDur = onBeat ? 0.5 : 0.66;
  if (onBeat) {
    const h = HOLDS[s.top];
    for (let i = 0; i < 6; i++)
      s.dust.push({ x: h.x + rand(-4, 4), y: h.y, vx: rand(-20, 20), vy: rand(-10, 20), life: 1 });
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, {
      duration: 0.12,
      gain: onBeat ? 0.09 : 0.06,
      freq: 1600,
      q: 0.8,
      type: 'bandpass',
    });
    tone(bus, onBeat ? 150 : 130, {
      type: 'triangle',
      attack: 0.01,
      decay: 0.12,
      gain: 0.04,
      glideTo: 90,
      delay: s.moveDur * 0.5,
    });
  }
}

/**
 * One move up the wall, hold n for the free hand. He loads onto the high foot, presses and
 * pulls the body up a hold's height while the low foot comes off and steps up to its next
 * foothold, then the free hand reaches over in an arc, grabs, and his weight settles back
 * between his hands.
 */
function climbPose(s: State, out: number[]) {
  const n = s.top;
  if (n < 0) {
    stancePose(-1, out);
    s.grip[0] = s.grip[1] = false;
    s.plant[0] = s.plant[1] = true;
    return;
  }
  const k = clamp(s.moveT / s.moveDur, 0, 1);
  const hm = mod2(n);
  const fm = 1 - hm;
  const side = hm ? 1 : -1;
  const r = smooth((k - 0.06) / 0.5);
  out[0] = -23 + side * 3.5 * Math.sin(Math.PI * clamp((k - 0.02) / 0.9, 0, 1));
  out[1] =
    lerp(stanceY(n - 1), stanceY(n), r) -
    2.5 * Math.sin(Math.PI * clamp(k / 0.16, 0, 1)) -
    1.4 * Math.sin(Math.PI * clamp((k - 0.72) / 0.28, 0, 1));
  // the hand and foot that stay put
  handSpot(n - 1, 1 - hm, out[0], out[1], A);
  out[2 + (1 - hm) * 2] = A.x;
  out[3 + (1 - hm) * 2] = A.y;
  s.grip[1 - hm] = n - 1 >= 0;
  footSpot(n - 1, hm, A);
  out[6 + hm * 2] = A.x;
  out[7 + hm * 2] = A.y;
  s.plant[hm] = true;
  // the low foot steps up, knee swinging out
  const qf = smooth((k - 0.1) / 0.4);
  footSpot(n, fm, A);
  const fs = fm ? 1 : -1;
  out[6 + fm * 2] = lerp(s.from[6 + fm * 2], A.x, qf) + fs * 5 * Math.sin(Math.PI * qf);
  out[7 + fm * 2] = lerp(s.from[7 + fm * 2], A.y, qf) + 5 * Math.sin(Math.PI * qf);
  s.plant[fm] = qf <= 0 || qf >= 1;
  // then the free hand lets go and reaches over to the new hold
  const qh = smooth((k - 0.42) / 0.36);
  const held = n - 2 >= 0;
  let fx = s.from[2 + hm * 2];
  let fy = s.from[3 + hm * 2];
  if (!held) {
    handSpot(-1, hm, out[0], out[1], A);
    fx = A.x;
    fy = A.y;
  }
  handSpot(n, hm, out[0], out[1], A);
  out[2 + hm * 2] = lerp(fx, A.x, qh) + side * 6 * Math.sin(Math.PI * qh);
  out[3 + hm * 2] = lerp(fy, A.y, qh) + 5 * Math.sin(Math.PI * qh);
  s.grip[hm] = (held && qh <= 0) || qh >= 1;
  s.leanT = side * 0.05 * Math.sin(Math.PI * k);
  s.lookT = side * 2.4 * Math.sin(Math.PI * clamp(k * 1.2, 0, 1));
}

/** Over the lip of the last hold and up onto the jump ledge: pull, press, knee up, stand */
function beginMantle(s: State) {
  const L = LEDGE_Y;
  // pelvis, left hand, right hand, left foot, right foot
  playFrom(s, 'mantle', [
    [
      0.34,
      [
        -22,
        L - 66,
        HOLDS[N_HOLDS - 2].x,
        HOLDS[N_HOLDS - 2].y + 1.5,
        -12,
        L + 1,
        s.pose[6],
        s.pose[7],
        -15,
        L - 90,
      ],
    ],
    [0.62, [-24, L - 44, -38, L + 1, -12, L + 1, -31, L - 80, -15, L - 70]],
    [0.88, [-24, L - 12, -38, L + 1, -8, L + 1, -30, L - 50, -16, L - 46]],
    [1.1, [-23, L + 4, -38, L + 1, -6, L + 1, -31, L - 34, -20, L + 3]],
    [1.32, [-26, L + 26, -40, L + 18, -9, L + 18, -38, L + 3, -20, L + 3]],
    [1.55, [-30, L + 46, -44, L + 42, -16, L + 42, -39, L + 3, -21, L + 3]],
  ]);
}

function act(s: State, env: SceneEnv, down: boolean) {
  if (down) {
    if (s.mode === 'start' || s.mode === 'climb') {
      if (s.moveT < s.moveDur && s.mode === 'climb') s.queue = Math.min(2, s.queue + 1);
      else beginMove(s, env);
    } else if (s.mode === 'ledge' && s.mt > 0.35) {
      setMode(s, 'charge');
      s.charge = 0;
      const bus = env.audio();
      if (bus) tone(bus, 80, { type: 'sine', attack: 0.2, decay: 0.6, gain: 0.08 });
    } else if (s.mode === 'top' && s.mt > 2.5) reset(s);
  } else if (s.mode === 'charge') {
    // a stray tap carried over from the climb only settles his stance
    if (s.mt < 0.22) setMode(s, 'ledge');
    else leap(s, env);
  }
}

function press(s: State, env: SceneEnv) {
  s.touched = true;
  s.idle = 0;
  s.held = true;
  act(s, env, true);
  env.wake(1600);
}

function release(s: State, env: SceneEnv) {
  if (!s.held) return;
  s.held = false;
  act(s, env, false);
  env.wake(1600);
}

/** Pivot of the swing once he hangs from the lip, between his hands */
const PIV_X = LIP_X + 13;
const PIV_Y = TOP + 1;
const HANG = 60;
const SWING0 = -0.2;

function leap(s: State, env: SceneEnv) {
  const q = s.charge;
  s.attempts++;
  s.good = q >= 0.7 && q <= 0.95;
  const L = LEDGE_Y;
  // the explosive push off the ledge: hips drive up, both arms swing up past his head
  playFrom(s, 'leap', [
    [PUSH * 0.5, [-28, L + 34, -52, L + 52, -4, L + 52, -39, L + 3, -21, L + 3]],
    [PUSH, [-26, L + 47, -40, L + 104, -10, L + 106, -38, L + 4, -20, L + 4]],
  ]);
  s.leapFrom.x = -26;
  s.leapFrom.y = L + 47;
  if (s.good) {
    s.leapTo.x = PIV_X + HANG * Math.sin(SWING0);
    s.leapTo.y = PIV_Y - HANG * Math.cos(SWING0);
    s.leapCtl.x = 4;
    s.leapCtl.y = TOP + 14;
    s.leapDur = 0.62;
  } else if (q > 0.95) {
    // too much: he slams into the lip and it slips through his fingers
    s.leapTo.x = LIP_X - 6;
    s.leapTo.y = TOP - 66;
    s.leapCtl.x = 12;
    s.leapCtl.y = TOP + 2;
    s.leapDur = 0.52;
  } else {
    const k = q / 0.7;
    s.leapTo.x = lerp(-8, 26, k);
    s.leapTo.y = lerp(L + 30, TOP - 76, k);
    s.leapCtl.x = lerp(-16, 6, k);
    s.leapCtl.y = lerp(L + 64, TOP - 26, k);
    s.leapDur = 0.48;
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.4, gain: 0.12, freq: 900, q: 0.6, type: 'bandpass' });
    tone(bus, 160, { type: 'triangle', attack: 0.01, decay: 0.2, gain: 0.06, glideTo: 220 });
  }
}

function releaseBats(s: State, env: SceneEnv) {
  for (const b of s.bats) {
    b.on = true;
    b.x = LIP_X + rand(-6, 30);
    b.y = TOP - rand(14, 30);
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05) * -1;
    const v = rand(60, 220);
    b.vx = Math.cos(a) * v * 0.9 + rand(-40, 40);
    b.vy = Math.sin(a) * v + 40;
    b.ph = rand(0, TAU);
    b.size = rand(4, 9);
    b.z = Math.random() < 0.18 ? rand(1.6, 3.4) : 1;
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 1.6, gain: 0.14, freq: 2200, q: 0.5, type: 'bandpass' });
    noise(bus, { duration: 1.2, gain: 0.08, freq: 600, q: 0.6, type: 'lowpass' });
    for (let i = 0; i < 6; i++)
      tone(bus, rand(4200, 6200), {
        type: 'sine',
        attack: 0.004,
        decay: 0.07,
        gain: 0.012,
        glideTo: 7000,
        delay: i * 0.09,
      });
  }
}

function reset(s: State) {
  setMode(s, 'start');
  s.top = -1;
  s.queue = 0;
  s.attempts = 0;
  s.sun = 0;
  s.fade = 1;
  stancePose(-1, s.pose);
  for (const b of s.bats) b.on = false;
}

/** Swing angle while he hangs from the lip: a damped pendulum seeded by the leap */
function swingAngle(t: number) {
  const w = 4.4;
  return Math.exp(-1.3 * Math.max(0, t)) * (SWING0 * Math.cos(w * t) + (1.3 / w) * Math.sin(w * t));
}

/** Feet trailing below the hips, rotated with the body and a little bent at the knee */
function dangle(out: number[], ang: number, bend: number) {
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const ox = side * 5;
    const oy = -38 + bend;
    out[6 + i * 2] = out[0] + ox * Math.cos(ang) - oy * Math.sin(ang);
    out[7 + i * 2] = out[1] + ox * Math.sin(ang) + oy * Math.cos(ang);
  }
}

function lipHands(out: number[]) {
  out[2] = LIP_X + 6;
  out[3] = TOP + 1;
  out[4] = LIP_X + 20;
  out[5] = TOP + 1;
}

function stepClimber(s: State, env: SceneEnv, dt: number, t: number) {
  const G = s.goal;
  s.mt += dt;
  let rate = 26;
  s.leanT = 0;
  s.lookT = 0;
  // on the wall the knees and elbows turn out; standing or flying they mostly fold forward
  const onWall = s.mode === 'climb' && s.top >= 0;
  let knee = onWall ? 0.9 : 0.3;
  let elbow = onWall ? 1 : 0.45;
  switch (s.mode) {
    case 'start': {
      stancePose(-1, G);
      G[1] += Math.sin(t * 1.6) * 0.6;
      s.grip[0] = s.grip[1] = false;
      s.plant[0] = s.plant[1] = true;
      s.lookT = Math.sin(t * 0.5) * 1.2;
      break;
    }
    case 'climb': {
      if (s.top >= 0) s.moveT += dt;
      climbPose(s, G);
      if (s.moveT >= s.moveDur) {
        // hanging on, breathing between moves
        G[1] += Math.sin(t * 2.2) * 0.5;
        if (s.queue > 0) {
          s.queue--;
          beginMove(s, env);
        }
      }
      break;
    }
    case 'mantle': {
      keyPose(s.keys, s.mt, G);
      s.grip[0] = s.mt < 1.2;
      s.grip[1] = s.mt > 0.3 && s.mt < 1.2;
      s.plant[0] = s.mt < 0.5 || s.mt > 1.3;
      s.plant[1] = s.mt < 0.12 || s.mt > 1.08;
      s.lookT = s.mt < 0.9 ? -1 : 1.5;
      if (s.mt > 1.62) setMode(s, 'ledge');
      break;
    }
    case 'ledge':
    case 'charge': {
      const ch = s.mode === 'charge';
      if (ch) {
        s.charge = 1 - Math.abs(((s.mt * 0.85) % 2) - 1);
        s.chargeT = damp(s.chargeT, 0.6 + s.charge * 0.4, 6, dt);
      } else {
        s.chargeT = damp(s.chargeT, 0, 4, dt);
        s.charge = 0;
      }
      const c = s.chargeT;
      const L = LEDGE_Y;
      // crouch loads the legs, arms swing down and back, eyes on the lip
      G[0] = -30 - c * 3;
      G[1] = L + 46 - c * 17 + Math.sin(t * 1.8) * 0.5;
      G[2] = G[0] - 14 - c * 6;
      G[3] = G[1] - 4 - c * 2;
      G[4] = G[0] + 14 + c * 4;
      G[5] = G[1] - 4 - c * 2;
      G[6] = -39;
      G[7] = L + 3;
      G[8] = -21;
      G[9] = L + 3;
      s.grip[0] = s.grip[1] = false;
      s.plant[0] = s.plant[1] = true;
      s.leanT = c * 0.12;
      s.lookT = 2;
      break;
    }
    case 'leap': {
      if (s.mt < PUSH) {
        keyPose(s.keys, s.mt, G);
        s.plant[0] = s.plant[1] = s.mt < PUSH * 0.9;
        s.leanT = 0.1;
      } else {
        const k = Math.min(1, (s.mt - PUSH) / s.leapDur);
        const px = G[0];
        const py = G[1];
        G[0] = bez(s.leapFrom.x, s.leapCtl.x, s.leapTo.x, k);
        G[1] = bez(s.leapFrom.y, s.leapCtl.y, s.leapTo.y, k);
        s.vel.x = (G[0] - px) / Math.max(dt, 0.001);
        s.vel.y = (G[1] - py) / Math.max(dt, 0.001);
        // arms stay stretched overhead and close on the lip as he drops onto it
        const reachK = smooth((k - 0.55) / 0.45);
        for (let i = 0; i < 2; i++) {
          const side = i ? 1 : -1;
          const ox = G[0] + side * 10 + 6;
          const oy = G[1] + 61;
          const tx = s.good || s.charge > 0.95 ? LIP_X + 6 + i * 14 : s.leapTo.x + side * 7 + 14;
          const ty = s.good || s.charge > 0.95 ? TOP + 1 : s.leapTo.y + 60;
          G[2 + i * 2] = lerp(ox, tx, reachK);
          G[3 + i * 2] = lerp(oy, ty, reachK);
        }
        dangle(G, lerp(-0.1, -SWING0 * 0.6, k), 6 * Math.sin(Math.PI * k));
        s.plant[0] = s.plant[1] = false;
        s.leanT = lerp(0.1, -SWING0, k);
        rate = 60;
        if (k >= 1) {
          if (s.good) {
            setMode(s, 'hang');
            s.shake = 0.5;
            releaseBats(s, env);
            const bus = env.audio();
            if (bus)
              tone(bus, 90, { type: 'sine', attack: 0.004, decay: 0.3, gain: 0.18, glideTo: 50 });
          } else {
            setMode(s, 'fall');
            s.shake = s.charge > 0.95 ? 0.4 : 0;
            const bus = env.audio();
            if (bus) noise(bus, { duration: 0.8, gain: 0.1, freq: 500, q: 0.7, type: 'bandpass' });
          }
        }
      }
      s.grip[0] = s.grip[1] = false;
      s.lookT = 2;
      break;
    }
    case 'hang': {
      // the catch: his weight swings on under the lip and dies away as the bats pour past
      const th = swingAngle(s.mt);
      G[0] = PIV_X + HANG * Math.sin(th);
      G[1] = PIV_Y - HANG * Math.cos(th);
      lipHands(G);
      dangle(G, swingAngle(s.mt - 0.12) * 1.3, 3);
      s.grip[0] = s.grip[1] = true;
      s.plant[0] = s.plant[1] = false;
      s.leanT = -th;
      s.lookT = -th * 6;
      rate = 40;
      if (s.mt > 1.0) beginPull(s);
      break;
    }
    case 'pull': {
      keyPose(s.keys, s.mt, G);
      s.grip[0] = s.mt < 1.3;
      s.grip[1] = s.mt < 1.15;
      s.plant[0] = s.mt > 1.42;
      s.plant[1] = s.mt > 0.98;
      s.lookT = 1.5;
      if (s.mt > 1.75) {
        setMode(s, 'top');
        const bus = env.audio();
        if (bus)
          for (const [f, d] of [
            [196, 0],
            [247, 0.08],
            [294, 0.16],
            [392, 0.3],
          ] as const)
            tone(bus, f, { type: 'triangle', attack: 0.3, decay: 2.6, gain: 0.05, delay: d });
      }
      break;
    }
    case 'top': {
      // he stands in the light and lets his arms fall loose
      G[0] = PIV_X + 9;
      G[1] = TOP + 46 + Math.sin(t * 1.4) * 0.4;
      G[2] = G[0] - 14;
      G[3] = G[1] - 4;
      G[4] = G[0] + 14;
      G[5] = G[1] - 4;
      G[6] = PIV_X;
      G[7] = TOP + 3;
      G[8] = PIV_X + 17;
      G[9] = TOP + 3;
      s.grip[0] = s.grip[1] = false;
      s.plant[0] = s.plant[1] = true;
      s.lookT = Math.sin(t * 0.4) * 1.5;
      rate = 6;
      break;
    }
    case 'fall': {
      s.vel.y -= 520 * dt;
      s.vel.x *= Math.exp(-dt * 2);
      G[0] += s.vel.x * dt;
      G[1] += s.vel.y * dt;
      // arms thrown up grabbing at air, legs bicycling
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        G[2 + i * 2] = G[0] + side * 20 + Math.sin(t * 17 + i * 2) * 4;
        G[3 + i * 2] = G[1] + 52 + Math.cos(t * 15 + i) * 4;
        G[6 + i * 2] = G[0] + side * 11;
        G[7 + i * 2] = G[1] - 32 + Math.sin(t * 14 + i * 3) * 6;
      }
      s.grip[0] = s.grip[1] = false;
      s.plant[0] = s.plant[1] = false;
      s.leanT = Math.sin(s.mt * 7) * 0.12;
      rate = 30;
      // the rope swings in and he snatches it
      s.ropeV += (G[0] - ROPE_X - s.rope) * 6 * dt;
      if (s.mt > 0.42) {
        setMode(s, 'rope');
        s.keys = [];
        s.ropeGrip = G[1] + 60;
        s.shake = 0.35;
        const bus = env.audio();
        if (bus)
          tone(bus, 110, { type: 'sine', attack: 0.004, decay: 0.25, gain: 0.12, glideTo: 60 });
      }
      break;
    }
    case 'rope': {
      // slide down the rope hand under hand, then swing back onto the wall
      const rx = ROPE_X + s.rope;
      if (s.mt < 1.4) {
        s.ropeGrip = damp(s.ropeGrip, stanceY(REST) + 62, 2.2, dt);
        G[0] = damp(G[0], rx - 1, 8, dt);
        G[1] = s.ropeGrip - 60;
        G[2] = rx - 0.5;
        G[3] = s.ropeGrip;
        G[4] = rx + 0.5;
        G[5] = s.ropeGrip - 11;
        // one foot locked round the rope, the other knee out for balance
        G[6] = rx - 1;
        G[7] = G[1] - 34;
        G[8] = rx + 12;
        G[9] = G[1] - 26;
        s.grip[0] = s.grip[1] = true;
        s.plant[0] = true;
        s.plant[1] = false;
        s.leanT = 0;
        s.lookT = 1;
      } else if (s.keys.length === 0) {
        // swing across from the rope to the holds by the rest ledge
        const to = stancePose(REST, new Array<number>(10));
        const mid = s.pose.map((v, i) => lerp(v, to[i], 0.5));
        mid[3] += 10;
        mid[5] += 10;
        s.keys = [
          { t: 1.4, v: s.pose.slice() },
          { t: 1.8, v: mid },
          { t: 2.2, v: to },
        ];
        keyPose(s.keys, s.mt, G);
      } else {
        keyPose(s.keys, s.mt, G);
        const k = s.mt - 1.4;
        s.grip[0] = s.grip[1] = k > 0.75;
        s.plant[0] = s.plant[1] = k > 0.7;
        s.lookT = -2;
        if (k >= 0.85) {
          setMode(s, 'climb');
          s.top = REST;
          s.moveT = 1;
          s.moveDur = 0.6;
          s.queue = 0;
          s.keys = [];
        }
      }
      break;
    }
  }
  // ease the body toward the pose, then keep every hand and foot that bears weight in reach
  dampPose(s.pose, G, rate, dt);
  const p = s.pose;
  for (let it = 0; it < 2; it++)
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      if (s.grip[i]) pin(p, p[0] + side * SHW, p[1] + TORSO, 2 + i * 2, (UARM + FARM) * 0.985);
      if (s.plant[i]) pin(p, p[0] + side * HIPW, p[1], 6 + i * 2, (THIGH + SHIN) * 0.985);
    }
  if (s.mode === 'mantle') {
    knee = s.mt < 1.2 ? 0.8 : 0.4;
    elbow = 1;
  } else if (s.mode === 'charge') knee = 0.3 + s.chargeT * 0.3;
  else if (s.mode === 'hang' || s.mode === 'pull') elbow = 1;
  else if (s.mode === 'rope') knee = 0.7;
  s.kneeOut = damp(s.kneeOut, knee, 5, dt);
  s.elbowOut = damp(s.elbowOut, elbow, 5, dt);
  s.lean = damp(s.lean, s.leanT, 10, dt);
  s.look = damp(s.look, s.lookT, 6, dt);
  s.tilt = damp(s.tilt, clamp((p[5] - p[3]) * 0.004, -0.14, 0.14), 8, dt);
  s.hipTilt = damp(s.hipTilt, clamp((p[9] - p[7]) * 0.004, -0.12, 0.12), 8, dt);
  s.pelvis.x = p[0];
  s.pelvis.y = p[1];
}

/** Move the pelvis just enough that the limb rooted at (ax, ay) reaches its point */
function pin(p: number[], ax: number, ay: number, j: number, max: number) {
  const dx = p[j] - ax;
  const dy = p[j + 1] - ay;
  const d = Math.hypot(dx, dy);
  if (d <= max) return;
  const k = (d - max) / d;
  p[0] += dx * k;
  p[1] += dy * k;
}

function beginPull(s: State) {
  const X = PIV_X;
  const T = TOP;
  const h = [LIP_X + 6, T + 1, LIP_X + 20, T + 1];
  // pull to the chest, roll the wrists over into a press, knee up onto the lip, stand
  playFrom(s, 'pull', [
    [0.5, [X, T - 30, ...h, X - 6, T - 68, X + 5, T - 66]],
    [0.78, [X + 1, T - 4, ...h, X - 6, T - 42, X + 6, T - 40]],
    [1.0, [X + 2, T + 6, ...h, X - 8, T - 32, X + 14, T + 3]],
    [1.22, [X + 8, T + 24, h[0], h[1], X + 24, T + 18, X - 4, T - 6, X + 14, T + 3]],
    [1.42, [X + 9, T + 38, X - 4, T + 30, X + 24, T + 36, X, T + 3, X + 16, T + 3]],
    [1.7, [X + 9, T + 46, X - 5, T + 42, X + 23, T + 42, X, T + 3, X + 17, T + 3]],
  ]);
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    touchAction: 'none',
    posterTime: 4.5,
    init: () => {
      const s: State = {
        mode: 'start',
        mt: 0,
        top: -1,
        moveT: 1,
        moveDur: 0.6,
        queue: 0,
        pose: stancePose(-1, new Array<number>(10)),
        goal: stancePose(-1, new Array<number>(10)),
        from: stancePose(-1, new Array<number>(10)),
        keys: [],
        grip: [false, false],
        plant: [true, true],
        lean: 0,
        leanT: 0,
        tilt: 0,
        hipTilt: 0,
        look: 0,
        lookT: 0,
        kneeOut: 0.3,
        elbowOut: 0.4,
        pelvis: { x: -23, y: FLOOR_P },
        vel: { x: 0, y: 0 },
        leapFrom: { x: 0, y: 0 },
        leapCtl: { x: 0, y: 0 },
        leapTo: { x: 0, y: 0 },
        leapDur: 0.6,
        good: false,
        charge: 0,
        chargeT: 0,
        attempts: 0,
        rope: 0,
        ropeV: 0,
        ropeGrip: 0,
        sun: 0,
        shake: 0,
        fade: 0,
        camY: 120,
        beatT: 0,
        beatI: 0,
        lastBeat: 9,
        nextIn: 1,
        pulse: 0,
        waves: [],
        fists: 0,
        bats: Array.from({ length: 170 }, () => ({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          ph: 0,
          size: 6,
          z: 1,
          on: false,
        })),
        motes: Array.from({ length: 90 }, () => ({
          x: rand(-160, 160),
          y: rand(0, TOP + 80),
          ph: rand(0, TAU),
          z: rand(0.5, 1.5),
        })),
        dust: [],
        touched: false,
        held: false,
        idle: 0,
        autoT: 0.8,
        u: 1,
        S: 2,
        tile: null,
        sky: null,
        sunGlow: glowSprite(128, [
          [0, 'rgba(255,252,236,1)'],
          [0.2, 'rgba(255,240,200,0.7)'],
          [0.6, 'rgba(255,214,150,0.18)'],
          [1, 'rgba(255,200,120,0)'],
        ]),
        warm: glowSprite(64, [
          [0, 'rgba(255,220,170,0.9)'],
          [0.4, 'rgba(255,190,120,0.35)'],
          [1, 'rgba(255,170,90,0)'],
        ]),
        dustSprite: glowSprite(32, [
          [0, 'rgba(200,170,130,0.9)'],
          [1, 'rgba(200,170,130,0)'],
        ]),
        grain: grainTile(128, 61),
      };
      return s;
    },
    resize: (s, env) => {
      const { w, h } = env;
      s.u = Math.min(w / W0, h / H0);
      s.S = Math.min(h / 290, w / 300);
      paintTile(s, env);
      paintSky(s, env);
    },
    update: (s, env, dt, t) => {
      s.idle += dt;
      const auto = !env.interactive || !s.touched || s.idle > 9;

      // the chant: five syllables to a bar, quickening as he climbs
      const prog = clamp((s.pelvis.y - START_Y) / (TOP - START_Y), 0, 1);
      const tempo = 1 + prog * 0.35 + (s.mode === 'charge' ? 0.25 : 0);
      const cyc = CYCLE / tempo;
      const done = s.mode === 'top' || s.mode === 'pull' || s.mode === 'hang';
      s.beatT += dt;
      s.lastBeat += dt;
      if (s.beatT >= cyc) {
        s.beatT -= cyc;
        s.beatI = 0;
      }
      const at = (i: number) => (BEATS[i] / CYCLE) * cyc;
      s.nextIn = s.beatI < BEATS.length ? at(s.beatI) - s.beatT : cyc - s.beatT;
      if (!done && s.beatI < BEATS.length && s.beatT >= at(s.beatI)) {
        const accent = s.beatI === 0 || s.beatI === 2;
        s.pulse = accent ? 1 : 0.7;
        s.lastBeat = 0;
        s.fists = 1;
        s.waves.push({ y: Math.max(0, s.camY - 150), a: 0.5 + prog * 0.5 });
        if (s.touched) {
          const bus = env.audio();
          if (bus) syllable(bus, accent, 0.5 + prog * 0.9);
        }
        s.beatI++;
        // the autopilot climbs on the chant
        if (
          auto &&
          (s.mode === 'climb' || (s.mode === 'start' && s.mt > 1.2)) &&
          Math.random() < 0.9
        )
          act(s, env, true);
      }
      s.pulse = Math.max(0, s.pulse - dt * 3);
      s.fists = Math.max(0, s.fists - dt * 2.2);
      for (const wv of s.waves) {
        wv.y += dt * 280;
        wv.a -= dt * 0.35;
      }
      s.waves = s.waves.filter((wv) => wv.a > 0 && wv.y < TOP + 60);

      // autopilot at the gap: the first leap falls short, the next one makes it
      if (auto) {
        if (s.mode === 'ledge' && s.mt > 0.9) act(s, env, true);
        if (s.mode === 'charge') {
          const want = s.attempts === 0 ? 0.45 : 0.82;
          if (s.charge >= want && (s.mt * 0.85) % 2 < 1) act(s, env, false);
        }
        if (s.mode === 'top' && s.mt > 6) reset(s);
      }
      if (s.touched && !auto && s.mode !== 'start' && s.mode !== 'climb' && s.mode !== 'top')
        keepAwake(env);
      if (s.mode === 'top' && s.mt > 9) reset(s);

      stepClimber(s, env, dt, t);

      // rope sway
      s.ropeV += (-s.rope * 3 - s.ropeV * 0.6) * dt;
      s.ropeV += Math.sin(t * 0.7) * 2 * dt;
      s.rope += s.ropeV * dt;

      // camera rides a little above him and tilts up into the sun at the end
      const want =
        s.mode === 'top'
          ? TOP + 30
          : s.mode === 'pull' || s.mode === 'hang'
            ? TOP - 10
            : s.pelvis.y + 22;
      s.camY = damp(
        s.camY,
        clamp(want, 70, TOP + 30),
        s.mode === 'fall' || s.mode === 'rope' ? 5 : 2.6,
        dt
      );
      s.sun = damp(s.sun, s.mode === 'top' ? 1 : s.mode === 'pull' ? 0.5 : 0, 1.2, dt);
      s.shake = Math.max(0, s.shake - dt * 1.6);
      s.fade = Math.max(0, s.fade - dt * 1.2);

      for (const b of s.bats) {
        if (!b.on) continue;
        b.ph += dt * 22;
        b.vy += 60 * dt;
        b.vx += Math.sin(b.ph * 0.13) * 40 * dt;
        b.x += b.vx * dt * (b.z > 1 ? 1.4 : 1);
        b.y += b.vy * dt;
        if (b.z > 1) b.z += dt * 1.2;
        if (b.y > TOP + 300 || Math.abs(b.x) > 400 || b.z > 7) b.on = false;
      }
      for (const m of s.motes) {
        m.y += dt * 3 * m.z;
        m.x += Math.sin(t * 0.4 + m.ph) * dt * 2;
        if (m.y > TOP + 80) m.y = 0;
      }
      for (const d of s.dust) {
        d.vy -= 60 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.life -= dt * 0.8;
      }
      s.dust = s.dust.filter((d) => d.life > 0);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const S = s.S;
      const u = s.u;
      const cx = w / 2 + 20 * S;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      if (s.shake > 0.01)
        ctx.translate(Math.sin(t * 60) * s.shake * 4 * u, Math.cos(t * 47) * s.shake * 3 * u);

      // The wall is the inside of a cylinder: columns toward the edges of the frame are nearer,
      // so their heights are stretched about the eye line and the rim sags into a bowl.
      const eye = h * 0.6;
      const g = (x: number) => 1 + CURV * ((x - w / 2) / (w / 2)) ** 2;
      const Y = (wy: number, x: number) => eye - (wy - s.camY) * S * g(x);
      const sunX = w * 0.6;
      const sunY = Math.min(Y(TOP, sunX) - 70 * S, h * 0.18);

      if (s.sky) ctx.drawImage(s.sky, 0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.sunGlow, sunX, sunY, (150 + s.sun * 240) * S * 0.6, 0.85);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      if (s.tile) {
        const tp = TILE_U * S;
        const cols = 6;
        const sw = tp / cols;
        const srcW = s.tile.width / cols;
        const srcH = s.tile.height;
        const j0 = Math.floor(-cx / sw) - 1;
        for (let j = j0; cx + j * sw < w; j++) {
          const x = cx + j * sw;
          const gg = g(x + sw / 2);
          const sy = S * gg;
          const lo = Math.max(0, s.camY - (h - eye) / sy);
          const hi = Math.min(TOP, s.camY + eye / sy);
          if (hi <= lo) continue;
          const sx = (((j % cols) + cols) % cols) * srcW;
          for (let k = Math.floor(lo / TILE_U); k * TILE_U < hi; k++) {
            const top = Math.min((k + 1) * TILE_U, TOP);
            const frac = (top - k * TILE_U) / TILE_U;
            const yTop = eye - (top - s.camY) * sy;
            ctx.drawImage(
              s.tile,
              sx,
              (1 - frac) * srcH,
              srcW,
              frac * srcH,
              x,
              yTop,
              sw + 0.6,
              frac * TILE_U * sy + 0.6
            );
          }
        }
      }
      // the rim: a broken stone edge against the sky
      ctx.fillStyle = '#2c231c';
      ctx.beginPath();
      const rnd = mulberry(4);
      for (let x = -10; x < w + 24 * S; x += 12 * S) ctx.lineTo(x, Y(TOP, x) - rnd() * 6 * S);
      for (let x = w + 24 * S; x > -24 * S; x -= 12 * S) ctx.lineTo(x, Y(TOP, x) + 6 * S);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,236,200,0.55)';
      ctx.lineWidth = 1.2 * S;
      ctx.beginPath();
      for (let x = -10; x < w + 20; x += 12 * S) ctx.lineTo(x, Y(TOP, x) - 3 * S);
      ctx.stroke();

      // light: dark at the bottom of the pit, bright toward the opening (along the centre line)
      const lg = ctx.createLinearGradient(0, Y(0, w / 2), 0, Y(TOP, w / 2));
      lg.addColorStop(0, 'rgba(6,4,3,0.92)');
      lg.addColorStop(0.45, 'rgba(8,5,4,0.66)');
      lg.addColorStop(0.85, 'rgba(12,7,4,0.2)');
      lg.addColorStop(1, 'rgba(12,7,4,0.05)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(-10, h + 10);
      for (let x = -10; x < w + 20; x += 12 * S) ctx.lineTo(x, Math.max(-10, Y(TOP, x)));
      ctx.lineTo(w + 10, h + 10);
      ctx.closePath();
      ctx.fill();
      // the shaft wraps round toward us on both sides
      const cg = ctx.createLinearGradient(0, 0, w, 0);
      cg.addColorStop(0, 'rgba(4,3,2,0.9)');
      cg.addColorStop(0.25, 'rgba(4,3,2,0.2)');
      cg.addColorStop(0.6, 'rgba(4,3,2,0)');
      cg.addColorStop(1, 'rgba(4,3,2,0.85)');
      ctx.fillStyle = cg;
      ctx.fill();

      // a shaft of sun slanting down the wall from the opening
      ctx.globalCompositeOperation = 'lighter';
      const bx = cx + 70 * S + Math.sin(t * 0.2) * 6 * S;
      const by = Y(TOP, bx);
      const beam = ctx.createLinearGradient(0, by, 0, by + 380 * S);
      beam.addColorStop(0, `rgba(255,222,160,${(0.26 + s.sun * 0.3).toFixed(3)})`);
      beam.addColorStop(1, 'rgba(255,200,130,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(bx - 30 * S, by);
      ctx.lineTo(bx + 60 * S, by);
      ctx.lineTo(bx - 50 * S, by + 380 * S);
      ctx.lineTo(bx - 190 * S, by + 380 * S);
      ctx.closePath();
      ctx.fill();
      // the chant rolling up the shaft as rings of light
      ctx.lineCap = 'round';
      for (const wv of s.waves) {
        if (wv.y > TOP) continue;
        const yc = Y(wv.y, w / 2);
        if (yc < -80 || yc > h + 80) continue;
        ctx.beginPath();
        for (let x = -10; x < w + 20; x += 16 * S) ctx.lineTo(x, Y(wv.y, x));
        ctx.strokeStyle = `rgba(255,180,110,${(wv.a * 0.08).toFixed(3)})`;
        ctx.lineWidth = 26 * S;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,220,170,${(wv.a * 0.32).toFixed(3)})`;
        ctx.lineWidth = 1.4 * S;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      // world transform: x right, y up, in world units, bowed to match the wall behind him
      const gB = g(cx + s.pelvis.x * S);
      const base = eye + s.camY * S * gB;
      const sy = (y: number) => base - y * S * gB;
      ctx.save();
      ctx.translate(cx, base);
      ctx.scale(S, -S * gB);

      // footing: the stair ledge, the rest ledge, the jump ledge and the lip
      const slab = (x0: number, x1: number, y: number, d: number) => {
        ctx.fillStyle = '#54453a';
        ctx.fillRect(x0, y - d, x1 - x0, d);
        ctx.fillStyle = '#8a7360';
        ctx.fillRect(x0, y - 2, x1 - x0, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x0 + 2, y - d - 6, x1 - x0 - 4, 6);
      };
      slab(-160, 10, START_Y, 10);
      slab(LEDGE_X0, LEDGE_X1, LEDGE_Y, 12);
      slab(LIP_X, LIP_X + 120, TOP, 10);
      // the timber gallows the rope hangs from, out over the opening
      ctx.fillStyle = '#1e1712';
      ctx.fillRect(-170, TOP + 116, 340, 7);
      ctx.fillRect(-150, TOP, 7, 123);
      ctx.fillRect(143, TOP, 7, 123);
      poly(ctx, [-150, TOP + 96, -150, TOP + 102, -124, TOP + 123, -118, TOP + 123]);
      ctx.fill();
      poly(ctx, [150, TOP + 96, 150, TOP + 102, 124, TOP + 123, 118, TOP + 123]);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ROPE_X, TOP + 114, 6, 0, TAU);
      ctx.fill();
      // the crack the bats live in, under the lip
      ctx.fillStyle = '#080504';
      poly(ctx, [
        LIP_X + 2,
        TOP - 13,
        LIP_X + 12,
        TOP - 15,
        LIP_X + 19,
        TOP - 13.5,
        LIP_X + 30,
        TOP - 16,
        LIP_X + 40,
        TOP - 15,
        LIP_X + 30,
        TOP - 18,
        LIP_X + 19,
        TOP - 16.5,
        LIP_X + 11,
        TOP - 18,
      ]);
      ctx.fill();
      // footholds: small chipped steps in the stone
      for (const st of STEPS) {
        ctx.fillStyle = 'rgba(10,6,4,0.5)';
        poly(ctx, [st.x - 5, st.y, st.x + 5, st.y, st.x + 3.5, st.y - 6, st.x - 3, st.y - 5.5]);
        ctx.fill();
        ctx.fillStyle = '#4a3c31';
        poly(ctx, [
          st.x - 5,
          st.y + 0.5,
          st.x - 3.5,
          st.y - 2.5,
          st.x + 4,
          st.y - 2.2,
          st.x + 5.2,
          st.y + 0.6,
        ]);
        ctx.fill();
        ctx.fillStyle = '#8f7864';
        poly(ctx, [
          st.x - 4.4,
          st.y + 0.8,
          st.x + 4.6,
          st.y + 0.9,
          st.x + 3.2,
          st.y + 2.4,
          st.x - 3,
          st.y + 2.2,
        ]);
        ctx.fill();
      }
      // holds, glinting as the chant passes them
      for (let i = 0; i < N_HOLDS; i++) {
        const hd = HOLDS[i];
        let lit = 0;
        for (const wv of s.waves) lit = Math.max(lit, (1 - Math.abs(wv.y - hd.y) / 24) * wv.a);
        // a knuckle of stone jutting from the wall: shadow, face, lit top
        ctx.fillStyle = 'rgba(10,6,4,0.55)';
        poly(ctx, [hd.x - 7, hd.y - 1, hd.x + 7, hd.y - 1, hd.x + 5, hd.y - 9, hd.x - 4, hd.y - 8]);
        ctx.fill();
        ctx.fillStyle = '#4a3c31';
        poly(ctx, [
          hd.x - 7,
          hd.y,
          hd.x - 5,
          hd.y - 4.5,
          hd.x + 6,
          hd.y - 4,
          hd.x + 7.5,
          hd.y + 0.5,
          hd.x + 3,
          hd.y + 2.4,
          hd.x - 4,
          hd.y + 2.2,
        ]);
        ctx.fill();
        ctx.fillStyle = `rgb(${Math.round(150 + lit * 90)},${Math.round(124 + lit * 70)},${Math.round(96 + lit * 50)})`;
        poly(ctx, [
          hd.x - 6,
          hd.y + 1,
          hd.x - 3.6,
          hd.y + 2.6,
          hd.x + 3,
          hd.y + 2.8,
          hd.x + 6.6,
          hd.y + 1,
        ]);
        ctx.fill();
      }

      // the rope, hanging from the windlass above
      const rx = ROPE_X + s.rope;
      ctx.strokeStyle = '#3a2d22';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ROPE_X, TOP + 114);
      ctx.quadraticCurveTo(rx + s.rope * 0.6, (TOP + 114) / 2, rx, -10);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220,190,140,0.35)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2.2, 2.6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // the charge ring
      // the charge ring, shown faintly while he waits on the ledge so the hold reads as the move
      const ringA =
        s.mode === 'charge'
          ? 1
          : s.mode === 'leap' && s.mt < 0.25
            ? 1 - s.mt * 4
            : s.mode === 'ledge'
              ? Math.min(1, s.mt * 2) * (0.35 + 0.15 * Math.sin(t * 4))
              : 0;
      if (ringA > 0.01) {
        const ccx = s.pelvis.x;
        const ccy = s.pelvis.y + 16;
        const R = 44;
        const a0 = Math.PI / 2;
        ctx.globalAlpha = ringA;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,240,220,0.22)';
        ctx.beginPath();
        ctx.arc(ccx, ccy, R, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,200,90,${(0.75 + s.pulse * 0.25).toFixed(3)})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(ccx, ccy, R, a0 - 0.7 * TAU, a0 - 0.95 * TAU, true);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(ccx, ccy, R, a0, a0 - s.charge * TAU, true);
        ctx.stroke();
        const ea = a0 - s.charge * TAU;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ccx + Math.cos(ea) * R, ccy + Math.sin(ea) * R, 3.2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Bruce: warm rim from the opening above, then the body
      ctx.save();
      ctx.translate(0.6, 0.9);
      drawBruce(ctx, s, true);
      ctx.restore();
      drawBruce(ctx, s, false);

      // dust shaken off the stone
      for (const d of s.dust) {
        ctx.globalAlpha = d.life * 0.7;
        ctx.drawImage(s.dustSprite, d.x - 3, d.y - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // the prisoners at the foot of the wall, fists going up with every syllable
      const show = clamp(1 - (s.camY - 90) / 200, 0, 1);
      if (show > 0.01) {
        const rnd2 = mulberry(21);
        const drop = (1 - show) * 110 * S;
        for (let row = 0; row < 2; row++) {
          const n = row ? 11 : 9;
          for (let i = 0; i < n; i++) {
            const x = ((i + 0.5) / n) * (w + 60 * u) - 30 * u + (rnd2() - 0.5) * 50 * u;
            const sc = S * (row ? 1.25 : 1.9) * (0.9 + rnd2() * 0.25);
            const y = h + (row ? -6 : 34) * S + rnd2() * 16 * S + drop;
            const up = s.fists * (0.6 + rnd2() * 0.4);
            const both = rnd2() < 0.35;
            const arm = rnd2() < 0.5 ? 1 : -1;
            const lean = (rnd2() - 0.5) * 0.15;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(lean);
            ctx.scale(sc, sc);
            for (const [col, oy] of [
              [row ? 'rgba(255,196,130,0.3)' : 'rgba(255,196,130,0.45)', -1.2],
              [row ? '#1a1310' : '#0b0807', 0],
            ] as const) {
              ctx.fillStyle = col;
              ctx.strokeStyle = col;
              ctx.save();
              ctx.translate(0, oy);
              ctx.beginPath();
              ctx.ellipse(0, -47, 6.4, 7.6, 0, 0, TAU);
              ctx.fill();
              ctx.beginPath();
              ctx.moveTo(-4, -40);
              ctx.lineTo(4, -40);
              ctx.lineTo(17, -34);
              ctx.quadraticCurveTo(19, -28, 15, -10);
              ctx.lineTo(14, 40);
              ctx.lineTo(-14, 40);
              ctx.lineTo(-15, -10);
              ctx.quadraticCurveTo(-19, -28, -17, -34);
              ctx.closePath();
              ctx.fill();
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              for (const d of both ? [-1, 1] : [arm]) {
                const lift = up * (both ? 0.85 : 1);
                const ex = d * (19 + lift * 2);
                const ey = -30 - (6 + lift * 14);
                const hx = d * (17 + lift * 3);
                const hy = -44 - (4 + lift * 26);
                ctx.lineWidth = 6.5;
                ctx.beginPath();
                ctx.moveTo(d * 14, -32);
                ctx.lineTo(ex, ey);
                ctx.lineTo(hx, hy);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(hx, hy - 1.5, 4.4, 0, TAU);
                ctx.fill();
              }
              ctx.restore();
            }
            ctx.restore();
          }
        }
      }

      // bats and motes in the sunlight
      ctx.fillStyle = '#0d0907';
      ctx.beginPath();
      for (const b of s.bats) {
        if (!b.on) continue;
        const x = cx + b.x * S;
        const y = sy(b.y);
        const r = b.size * S * b.z;
        traceBat(ctx, x, y, r, Math.sin(b.ph), b.vx >= 0 ? 1 : -1);
      }
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (const m of s.motes) {
        const y = sy(m.y);
        if (y < -4 || y > h + 4) continue;
        const lit = clamp(m.y / TOP, 0.1, 1);
        ctx.globalAlpha = lit * (0.25 + 0.25 * Math.sin(t * 2 + m.ph) ** 2);
        ctx.drawImage(s.warm, cx + m.x * S - 2 * m.z, y - 2 * m.z, 4 * m.z, 4 * m.z);
      }
      ctx.globalAlpha = 1;
      // the sun breaking over the rim
      if (s.sun > 0.01) {
        glow(ctx, s.sunGlow, sunX, sunY, Math.max(w, h) * (0.4 + s.sun * 0.5), s.sun * 0.7);
        ctx.globalAlpha = 1;
        // rays
        ctx.fillStyle = `rgba(255,236,190,${(0.08 * s.sun).toFixed(3)})`;
        for (let i = 0; i < 9; i++) {
          const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7 + Math.sin(t * 0.2 + i) * 0.02;
          ctx.beginPath();
          ctx.moveTo(sunX, sunY);
          ctx.lineTo(sunX + Math.cos(a - 0.03) * w * 1.5, sunY + Math.sin(a - 0.03) * w * 1.5);
          ctx.lineTo(sunX + Math.cos(a + 0.03) * w * 1.5, sunY + Math.sin(a + 0.03) * w * 1.5);
          ctx.closePath();
          ctx.fill();
        }
      }
      // the chant swelling in the dark at the bottom of the frame
      if (s.pulse > 0.01) {
        const pg = ctx.createLinearGradient(0, h, 0, h * 0.6);
        pg.addColorStop(0, `rgba(255,170,90,${(0.12 * s.pulse).toFixed(3)})`);
        pg.addColorStop(1, 'rgba(255,170,90,0)');
        ctx.fillStyle = pg;
        ctx.fillRect(0, h * 0.6, w, h * 0.4);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      // vignette that breathes with the chant
      const v = ctx.createRadialGradient(
        w / 2,
        h * 0.45,
        Math.min(w, h) * (0.3 + s.pulse * 0.03),
        w / 2,
        h * 0.5,
        Math.max(w, h) * 0.75
      );
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(4,2,1,${(0.75 - s.sun * 0.4).toFixed(3)})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
      if (s.fade > 0.01) {
        ctx.fillStyle = `rgba(0,0,0,${s.fade.toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
      drawGrain(ctx, s.grain, w, h, 0.06);
    },
    onPointerDown: (s, env) => press(s, env),
    onPointerUp: (s, env) => release(s, env),
    onPointerLeave: (s, env) => {
      if (s.held && !env.pointer.down) release(s, env);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down) {
        if (!e.repeat) press(s, env);
      } else release(s, env);
      return true;
    },
    dispose: (s) => {
      freeCanvas(s.tile, s.sky, s.sunGlow, s.warm, s.dustSprite, s.grain);
      s.tile = s.sky = null;
    },
  });
