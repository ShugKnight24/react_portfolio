import { createCanvasScene, clamp, damp, easeInOutCubic, easeOutBack, lerp, rand, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  J,
  burst,
  clang,
  drawFigure,
  emit,
  freeCanvas,
  glow,
  glowSprite,
  hit,
  ik,
  layer,
  makePool,
  newPose,
  setJ,
  shakeX,
  shakeY,
  stepPool,
} from './theater-kit';
import type { FigureStyle, Pool, Pose } from './theater-kit';

/**
 * Iron Discipline: a lifter alone on a platform under one warm spotlight, side on, so the
 * plates face the camera as circles. Three lifts share one rig (squat, deadlift, overhead
 * press); each pose is solved from the hips, the spine angle and the bar path with two bone
 * IK, so every rep moves like a real one. A tap queues a rep. Five clean reps finish a set:
 * he chalks up, a clap of chalk hangs in the light, and another plate goes on each side.
 * Every rep is scored as a tally on the chalkboard behind him. Left alone he keeps training.
 */

type Phase = 'rest' | 'rep' | 'chalk' | 'switch';

interface State {
  lift: number;
  nextLift: number;
  phase: Phase;
  pt: number;
  p: number;
  queued: number;
  setReps: number;
  total: number;
  plates: number;
  plateIn: number;
  touched: boolean;
  idle: number;
  autoRest: number;
  autoSets: number;
  topped: boolean;
  clapped: boolean;
  dropped: boolean;
  // render pose and bar (figure units)
  pose: Pose;
  from: Pose;
  tmp: Pose;
  bx: number;
  by: number;
  fbx: number;
  fby: number;
  tbx: number;
  tby: number;
  // fx
  parts: Pool;
  motes: { x: number; y: number; r: number; ph: number; sp: number }[];
  shake: number;
  punch: number;
  strain: number;
  light: number;
  wipe: number;
  // layout
  k: number;
  ox: number;
  floor: number;
  bg: HTMLCanvasElement | null;
  warm: HTMLCanvasElement;
  chalk: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const SQUAT = 0;
const DEAD = 1;
const PRESS = 2;
const SET = 5;
const MAX_PLATES = 4;
const TORSO = 56;
const UPPER = 32;
const FORE = 29;
const THIGH = 47;
const SHIN = 48;
const PLATE_R = [23, 23, 20, 16.5];
const PLATE_COL = [
  ['#7d121a', '#b3202a', '#e0464c'],
  ['#12306e', '#1f4fa8', '#4d7fd6'],
  ['#8a6410', '#d6a21e', '#f3cd5a'],
  ['#14501f', '#2f8a3e', '#5cbc68'],
];

const LIFTER: FigureStyle = {
  skin: '#c98a5e',
  skinDark: '#8f5634',
  hair: '#17100b',
  shirt: '#30333b',
  shirtDark: '#15161a',
  pants: '#2c2f37',
  pantsDark: '#17181d',
  shoes: '#1c1c20',
  rim: 'rgba(255,214,150,0.75)',
  bulk: 1.16,
  sleeve: 'tee',
  belt: '#5a3818',
  hairCut: 'buzz',
  shorts: true,
};

/** Timeline of one rep per lift: [first move, hold, second move, settle] in seconds */
function repTimes(lift: number, plates: number) {
  const heavy = 1 + plates * 0.14;
  if (lift === SQUAT) return [1.0, 0.14, 0.78 * heavy, 0.25];
  if (lift === DEAD) return [0.8 * heavy, 0.38, 0.62, 0.3];
  return [0.72 * heavy, 0.34, 0.68, 0.22];
}

/** Squat travels down first (eccentric); the deadlift and press go up first */
const downFirst = (lift: number) => lift === SQUAT;

/* ---------- pose solving (figure units, feet at the origin, facing +x) ---------- */

function torso(out: Pose, hx: number, hy: number, a: number, headLag: number) {
  setJ(out, J.HIP, hx, hy);
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const sx = hx + ux * TORSO;
  const sy = hy + uy * TORSO;
  setJ(out, J.SHO, sx, sy);
  setJ(out, J.NECK, sx + ux * 7 + 3, sy + uy * 7);
  const ha = a * headLag;
  setJ(out, J.HEAD, sx + ux * 7 + 3 + Math.sin(ha) * 14 + 2, sy + uy * 7 - Math.cos(ha) * 14);
  // legs from fixed feet
  setJ(out, J.FOOT_N, 3, 0);
  setJ(out, J.FOOT_F, -4, 0);
  ik(out, J.FOOT_N, J.KNEE_N, J.HIP, hx, hy, SHIN, THIGH, 1);
  ik(out, J.FOOT_F, J.KNEE_F, J.HIP, hx, hy, SHIN, THIGH, 1);
  setJ(out, J.HIP, hx, hy);
}

function arms(out: Pose, hx: number, hy: number, bend: number) {
  const sx = out[J.SHO * 2];
  const sy = out[J.SHO * 2 + 1];
  const tmpHip0 = out[J.HIP * 2];
  const tmpHip1 = out[J.HIP * 2 + 1];
  // ik writes into root and end, so solve from the shoulder joint
  ik(out, J.SHO, J.ELB_N, J.HAND_N, hx, hy, UPPER, FORE, bend);
  setJ(out, J.SHO, sx, sy);
  ik(out, J.SHO, J.ELB_F, J.HAND_F, hx - 3, hy - 1.5, UPPER, FORE, bend);
  setJ(out, J.SHO, sx, sy);
  setJ(out, J.HIP, tmpHip0, tmpHip1);
}

/** Writes the pose for lift at progress p (0 start, 1 far end) and returns the bar in bar[] */
function solve(out: Pose, lift: number, p: number, bar: number[]) {
  if (lift === SQUAT) {
    const hx = lerp(-4, -42, p);
    const hy = lerp(-93, -50, Math.pow(p, 0.9));
    const a = lerp(0.1, 0.82, p);
    torso(out, hx, hy, a, 0.35);
    const sx = out[J.SHO * 2];
    const sy = out[J.SHO * 2 + 1];
    // high bar sits on the traps, just behind the shoulder joint
    const bx = sx - Math.cos(a) * 8 + Math.sin(a) * 1;
    const by = sy - Math.sin(a) * 8 - Math.cos(a) * 1;
    bar[0] = bx;
    bar[1] = by;
    arms(out, bx + 3, by + 3, -1);
  } else if (lift === DEAD) {
    const e = p;
    const hx = lerp(-40, -4, Math.pow(e, 1.25));
    const hy = lerp(-54, -93, easeInOutCubic(Math.min(1, e * 1.15)));
    const a = lerp(1.04, -0.07, Math.pow(e, 1.5));
    torso(out, hx, hy, a, 0.25);
    const sx = out[J.SHO * 2];
    const sy = out[J.SHO * 2 + 1];
    // straight arms hang to a bar that tracks over mid foot
    const tx = lerp(7, -3, e);
    const ang = Math.atan2(200, tx - sx);
    const reach = UPPER + FORE - 0.5;
    const bx = sx + Math.cos(ang) * reach;
    const by = sy + Math.sin(ang) * reach;
    bar[0] = bx;
    bar[1] = by;
    arms(out, bx, by, -1);
  } else {
    torso(out, -3, -93, lerp(-0.07, -0.03, p), 0.2);
    // head slides back as the bar passes the face, then through the window
    const pass = Math.sin(clamp(p * 1.4, 0, 1) * Math.PI);
    out[J.HEAD * 2] -= pass * 6;
    const sx = out[J.SHO * 2];
    const sy = out[J.SHO * 2 + 1];
    const e = easeInOutCubic(p);
    const bx = lerp(sx + 13, sx - 1, e) - Math.sin(e * Math.PI) * 2;
    const by = lerp(sy - 4, sy - UPPER - FORE - 4, e);
    bar[0] = bx;
    bar[1] = by;
    arms(out, bx, by + 2, -1);
  }
}

const BAR = [0, 0];
const HOOK_X = 46;
const hookY = (lift: number) => (lift === SQUAT ? -150 : -142);

function enterChalk(s: State) {
  s.phase = 'chalk';
  s.pt = 0;
  s.clapped = false;
  s.fbx = s.bx;
  s.fby = s.by;
}

function chalkPose(out: Pose, k: number) {
  // standing, hands meet in front of the chest for the clap
  torso(out, -3, -93, 0.04, 0.3);
  const clapK = Math.sin(clamp(k, 0, 1) * Math.PI);
  const hx = lerp(4, 22, clapK);
  const hy = lerp(-90, -126, clapK);
  arms(out, hx, hy, -1);
  out[J.HAND_F * 2] = hx + 2;
  out[J.HAND_F * 2 + 1] = hy - 1;
}

/* ---------- backdrop ---------- */

function paintBackdrop(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.bg, w, h, dpr);
  s.bg = cv;
  const fy = s.floor;
  const back = fy - h * 0.07;
  // wall
  const wall = c.createLinearGradient(0, 0, 0, back);
  wall.addColorStop(0, '#0b0907');
  wall.addColorStop(0.6, '#1a1410');
  wall.addColorStop(1, '#241a13');
  c.fillStyle = wall;
  c.fillRect(0, 0, w, back);
  // brick courses
  const bh = Math.max(9, h * 0.034);
  const bw = bh * 2.6;
  c.strokeStyle = 'rgba(0,0,0,0.38)';
  c.lineWidth = 1;
  for (let row = 0, y = back; y > 0; row++, y -= bh) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -off; x < w; x += bw) {
      c.moveTo(x, y);
      c.lineTo(x, y - bh);
    }
    c.stroke();
  }
  c.fillStyle = 'rgba(255,190,130,0.025)';
  for (let row = 0, y = back; y > 0; row++, y -= bh) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -off; x < w; x += bw) if ((row * 7 + Math.round(x)) % 5 === 0) c.fillRect(x + 1, y - bh + 1, bw - 2, bh - 2);
  }
  // chalkboard, top left
  const k = s.k;
  const cbx = Math.max(w * 0.05, s.ox - 330 * k);
  const cby = h * 0.12;
  const cbw = Math.min(190 * k, w * 0.26);
  const cbh = cbw * 0.62;
  c.fillStyle = '#3b2716';
  c.fillRect(cbx - 5, cby - 5, cbw + 10, cbh + 10);
  c.fillStyle = '#1a2320';
  c.fillRect(cbx, cby, cbw, cbh);
  c.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 6; i++) c.fillRect(cbx + rand(0, cbw * 0.7), cby + rand(0, cbh * 0.8), rand(10, cbw * 0.3), rand(2, 6));
  c.fillStyle = '#3b2716';
  c.fillRect(cbx - 5, cby + cbh + 3, cbw + 10, 4);

  // power rack behind the lifter: front and back uprights
  const rx0 = s.ox - 64 * k;
  const rx1 = s.ox + 52 * k;
  const top = fy - 214 * k;
  const post = (x: number, shade: number) => {
    const pw = 7.5 * k;
    const g = c.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
    g.addColorStop(0, `rgb(${18 + shade},${19 + shade},${23 + shade})`);
    g.addColorStop(0.5, `rgb(${46 + shade},${48 + shade},${56 + shade})`);
    g.addColorStop(1, `rgb(${14 + shade},${15 + shade},${18 + shade})`);
    c.fillStyle = g;
    c.fillRect(x - pw / 2, top, pw, fy - top - 4 * k);
    c.fillStyle = 'rgba(0,0,0,0.7)';
    for (let y = top + 10 * k; y < fy - 20 * k; y += 7 * k) {
      c.beginPath();
      c.arc(x, y, 1.1 * k, 0, TAU);
      c.fill();
    }
  };
  post(rx0, 0);
  post(rx1, 0);
  c.fillStyle = '#26282f';
  c.fillRect(rx0 - 6 * k, top - 5 * k, rx1 - rx0 + 12 * k, 6 * k);
  // safety arms
  c.fillStyle = '#30333b';
  c.fillRect(rx0 - 4 * k, fy - 62 * k, rx1 - rx0 + 8 * k, 4 * k);

  // dumbbell rack, left: hex heads end on
  const dx0 = s.ox - 230 * k;
  if (dx0 > -60 * k) {
    c.fillStyle = '#141519';
    c.fillRect(dx0 - 40 * k, fy - 70 * k, 84 * k, 6 * k);
    c.fillRect(dx0 - 40 * k, fy - 38 * k, 84 * k, 6 * k);
    c.fillRect(dx0 - 36 * k, fy - 70 * k, 5 * k, 70 * k);
    c.fillRect(dx0 + 36 * k, fy - 70 * k, 5 * k, 70 * k);
    const hex = (x: number, y: number, r: number) => {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      c.closePath();
      c.fillStyle = '#202227';
      c.fill();
      c.strokeStyle = 'rgba(255,210,150,0.16)';
      c.lineWidth = 1;
      c.stroke();
      c.fillStyle = '#5b5e66';
      c.beginPath();
      c.arc(x, y, r * 0.22, 0, TAU);
      c.fill();
    };
    for (let i = 0; i < 4; i++) hex(dx0 - 24 * k + i * 18 * k, fy - 79 * k + i * 0.6 * k, (7 + i * 0.8) * k);
    for (let i = 0; i < 3; i++) hex(dx0 - 20 * k + i * 24 * k, fy - 48 * k, (10 + i) * k);
  }

  // plate tree, right
  const tx = s.ox + 205 * k;
  if (tx < w + 40 * k) {
    c.fillStyle = '#16171b';
    c.fillRect(tx - 3 * k, fy - 120 * k, 6 * k, 120 * k);
    c.fillRect(tx - 30 * k, fy - 4 * k, 60 * k, 4 * k);
    const stack = (y: number, r: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const ox = tx + (i + 1) * 3 * k;
        c.fillStyle = '#0e0f12';
        c.beginPath();
        c.arc(ox, y, r * k, 0, TAU);
        c.fill();
        c.strokeStyle = 'rgba(255,200,140,0.14)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(ox, y, r * k - 1, Math.PI * 1.1, Math.PI * 1.7);
        c.stroke();
      }
      c.fillStyle = '#4a4d55';
      c.beginPath();
      c.arc(tx + (n + 1) * 3 * k, y, 3 * k, 0, TAU);
      c.fill();
    };
    stack(fy - 96 * k, 21, 3);
    stack(fy - 48 * k, 23, 4);
  }

  // floor: rubber with a wood platform under the lifter
  const fl = c.createLinearGradient(0, back, 0, h);
  fl.addColorStop(0, '#0c0b0a');
  fl.addColorStop(1, '#050505');
  c.fillStyle = fl;
  c.fillRect(0, back, w, h - back);
  c.strokeStyle = 'rgba(255,255,255,0.04)';
  c.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const y = back + (h - back) * Math.pow(i / 5, 1.6);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  const pw0 = 110 * k;
  const pw1 = 150 * k;
  const py0 = back + 4;
  const py1 = Math.min(h, fy + 26 * k);
  c.beginPath();
  c.moveTo(s.ox - pw0, py0);
  c.lineTo(s.ox + pw0, py0);
  c.lineTo(s.ox + pw1, py1);
  c.lineTo(s.ox - pw1, py1);
  c.closePath();
  const wood = c.createLinearGradient(0, py0, 0, py1);
  wood.addColorStop(0, '#3a2312');
  wood.addColorStop(1, '#5a3519');
  c.fillStyle = wood;
  c.fill();
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(20,10,4,0.55)';
  for (let i = -6; i <= 6; i++) {
    c.beginPath();
    c.moveTo(s.ox + i * (pw0 / 6), py0);
    c.lineTo(s.ox + i * (pw1 / 6), py1);
    c.stroke();
  }
  c.strokeStyle = 'rgba(255,220,170,0.05)';
  for (let i = 0; i < 18; i++) {
    const y = rand(py0, py1);
    c.beginPath();
    c.moveTo(s.ox - pw1, y);
    c.bezierCurveTo(s.ox - pw0 * 0.3, y + rand(-2, 2), s.ox + pw0 * 0.3, y + rand(-2, 2), s.ox + pw1, y);
    c.stroke();
  }
  // chalk smudges on the platform
  c.fillStyle = 'rgba(240,240,235,0.05)';
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.ellipse(s.ox + rand(-pw0, pw0), rand(fy - 4 * k, py1), rand(6, 16) * k, rand(2, 4) * k, 0, 0, TAU);
    c.fill();
  }
  c.restore();
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.fillRect(s.ox - pw1, py1, pw1 * 2, 3);

  // chalk bowl on a stand, far left of the platform
  const bx = s.ox - 150 * k;
  c.fillStyle = '#1a1b20';
  c.fillRect(bx - 2 * k, fy - 72 * k, 4 * k, 72 * k);
  c.fillRect(bx - 14 * k, fy - 3 * k, 28 * k, 3 * k);
  c.beginPath();
  c.ellipse(bx, fy - 74 * k, 18 * k, 5 * k, 0, 0, TAU);
  c.fillStyle = '#2a2c33';
  c.fill();
  c.beginPath();
  c.ellipse(bx, fy - 76 * k, 14 * k, 3.4 * k, 0, 0, TAU);
  c.fillStyle = '#e9e7e0';
  c.fill();
}

/* ---------- plates and bar ---------- */

function drawPlate(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string[], near: boolean) {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, col[2]);
  g.addColorStop(0.55, col[1]);
  g.addColorStop(1, col[0]);
  c.fillStyle = near ? g : col[0];
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  if (!near) return;
  // raised rim and inner ring
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = r * 0.07;
  c.beginPath();
  c.arc(x, y, r * 0.86, 0, TAU);
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.14)';
  c.lineWidth = r * 0.04;
  c.beginPath();
  c.arc(x, y, r * 0.93, Math.PI * 1.05, Math.PI * 1.75);
  c.stroke();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath();
  c.arc(x, y, r * 0.42, 0, TAU);
  c.fill();
  // steel hub
  const hub = c.createRadialGradient(x - r * 0.08, y - r * 0.1, 0, x, y, r * 0.3);
  hub.addColorStop(0, '#f2f4f8');
  hub.addColorStop(0.6, '#9aa0aa');
  hub.addColorStop(1, '#4a4f58');
  c.fillStyle = hub;
  c.beginPath();
  c.arc(x, y, r * 0.3, 0, TAU);
  c.fill();
}

function drawBarEnd(s: State, c: CanvasRenderingContext2D, x: number, y: number, near: boolean) {
  // plates stack toward the camera, each one a little closer and lower
  const n = Math.max(1, s.plates);
  if (!near) {
    for (let i = n - 1; i >= 0; i--) {
      const r = PLATE_R[i];
      drawPlate(c, x - 5 - i * 1.6, y - 3 - i * 0.8, r * 0.96, PLATE_COL[i], false);
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    let r = PLATE_R[i];
    if (i === n - 1 && s.plateIn < 1) r *= easeOutBack(clamp(s.plateIn, 0, 1));
    if (r <= 0.5) continue;
    const ox = x + i * 2.2;
    const oy = y + i * 1.2;
    // edge thickness
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.beginPath();
    c.arc(ox + 1.4, oy + 1.2, r, 0, TAU);
    c.fill();
    drawPlate(c, ox, oy, r, PLATE_COL[i], true);
  }
  // collar and sleeve end
  const cx = x + n * 2.2 + 1;
  const cy = y + n * 1.2 + 0.6;
  c.fillStyle = '#2b2e35';
  c.beginPath();
  c.arc(cx, cy, 6.5, 0, TAU);
  c.fill();
  const sl = c.createRadialGradient(cx - 1.2, cy - 1.5, 0, cx, cy, 4.6);
  sl.addColorStop(0, '#ffffff');
  sl.addColorStop(0.5, '#c9ced6');
  sl.addColorStop(1, '#6d737d');
  c.fillStyle = sl;
  c.beginPath();
  c.arc(cx, cy, 4.6, 0, TAU);
  c.fill();
}

/* ---------- rep logic ---------- */

function requestRep(s: State, env: SceneEnv) {
  s.touched = true;
  s.idle = 0;
  if (s.phase === 'rest') startRep(s, env);
  else s.queued = 1;
  const [a, b, c2, d] = repTimes(s.lift, s.plates);
  env.wake((a + b + c2 + d) * 1000 + 400);
}

function startRep(s: State, env: SceneEnv) {
  s.phase = 'rep';
  s.pt = 0;
  s.topped = false;
  s.dropped = false;
  s.queued = 0;
  const bus = env.audio();
  if (bus) hit(bus, { freq: 900, q: 0.7, gain: 0.07, decay: 0.35, type: 'bandpass' });
}

function switchLift(s: State, env: SceneEnv, lift: number) {
  if (lift === s.lift && s.phase !== 'switch') return;
  s.from.set(s.pose);
  s.fbx = s.bx;
  s.fby = s.by;
  s.nextLift = lift;
  s.phase = 'switch';
  s.pt = 0;
  s.queued = 0;
  s.setReps = 0;
  s.plates = 2;
  s.plateIn = 1;
  const bus = env.audio();
  if (bus) clang(bus, 240, 0.08);
  env.wake(1400);
}

function lockout(s: State, env: SceneEnv) {
  s.total++;
  s.setReps++;
  const hx = s.pose[J.HAND_N * 2];
  const hy = s.pose[J.HAND_N * 2 + 1];
  burst(s.parts, 6, hx, hy, -Math.PI / 2, 1.4, 22, 1.6, 6, 0, 1.6, -6);
  if (s.plates >= 3) s.punch = 1;
  const bus = env.audio();
  if (bus) {
    clang(bus, rand(150, 190), 0.09);
    clang(bus, rand(200, 240), 0.05, 0.03);
  }
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 1.55,
    init: () => {
      const pose = newPose();
      solve(pose, SQUAT, 0, BAR);
      return {
        lift: SQUAT,
        nextLift: SQUAT,
        phase: 'rest',
        pt: 0.55,
        p: 0,
        queued: 0,
        setReps: 0,
        total: 0,
        plates: 2,
        plateIn: 1,
        touched: false,
        idle: 0,
        autoRest: 0.6,
        autoSets: 0,
        topped: false,
        clapped: false,
        dropped: false,
        pose,
        from: newPose(),
        tmp: newPose(),
        bx: BAR[0],
        by: BAR[1],
        fbx: 0,
        fby: 0,
        tbx: 0,
        tby: 0,
        parts: makePool(220),
        motes: Array.from({ length: 46 }, () => ({
          x: Math.random(),
          y: Math.random(),
          r: rand(0.6, 1.8),
          ph: rand(0, TAU),
          sp: rand(0.006, 0.02),
        })),
        shake: 0,
        punch: 0,
        strain: 0,
        light: 0,
        wipe: 0,
        k: 1,
        ox: 0,
        floor: 0,
        bg: null,
        warm: glowSprite(128, [
          [0, 'rgba(255,214,150,0.55)'],
          [0.4, 'rgba(255,170,90,0.18)'],
          [1, 'rgba(255,140,60,0)'],
        ]),
        chalk: glowSprite(64, [
          [0, 'rgba(255,255,252,0.9)'],
          [0.45, 'rgba(245,245,240,0.35)'],
          [1, 'rgba(240,240,235,0)'],
        ]),
        vignette: null,
      };
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.k = Math.min((h * 0.68) / 200, (w * 0.8) / 230);
      s.floor = h * 0.84;
      s.ox = w * 0.5 - 6 * s.k;
      paintBackdrop(s, env);
      const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.7)');
      s.vignette = v;
    },
    update: (s, env, dt) => {
      stepPool(s.parts, dt);
      s.shake = Math.max(0, s.shake - dt * 3);
      s.punch = Math.max(0, s.punch - dt * 2.2);
      s.plateIn = Math.min(1, s.plateIn + dt * 2.4);
      s.wipe = Math.max(0, s.wipe - dt * 1.2);
      s.idle += dt;
      const auto = !env.interactive || !s.touched || s.idle > 7;
      const tgt = env.interactive && env.pointer.inside ? clamp(env.pointer.x / env.w - 0.5, -0.5, 0.5) : Math.sin(s.idle * 0.3) * 0.08;
      s.light = damp(s.light, tgt, 2.5, dt);

      s.pt += dt;
      if (s.phase === 'rest') {
        // ease back to the start position
        solve(s.tmp, s.lift, 0, BAR);
        for (let i = 0; i < s.pose.length; i++) s.pose[i] = damp(s.pose[i], s.tmp[i], 10, dt);
        s.bx = damp(s.bx, BAR[0], 10, dt);
        s.by = damp(s.by, BAR[1], 10, dt);
        s.strain = damp(s.strain, 0, 4, dt);
        if (s.queued) startRep(s, env);
        else if (auto && s.pt > s.autoRest) {
          if (s.setReps >= SET) enterChalk(s);
          else startRep(s, env);
        } else if (!auto && s.setReps >= SET && s.pt > 0.5) enterChalk(s);
        return;
      }

      if (s.phase === 'switch') {
        const k = easeInOutCubic(clamp(s.pt / 0.7, 0, 1));
        solve(s.tmp, s.nextLift, 0, BAR);
        for (let i = 0; i < s.pose.length; i++) s.pose[i] = lerp(s.from[i], s.tmp[i], k);
        s.bx = lerp(s.fbx, BAR[0], k);
        s.by = lerp(s.fby, BAR[1], k) - Math.sin(k * Math.PI) * 18;
        if (s.pt >= 0.7) {
          s.lift = s.nextLift;
          s.phase = 'rest';
          s.pt = 0;
          s.autoRest = 0.5;
        }
        return;
      }

      if (s.phase === 'chalk') {
        // set the bar down, clap chalk, load another plate
        const k = clamp(s.pt / 1.3, 0, 1);
        chalkPose(s.tmp, (k - 0.15) / 0.7);
        const blend = Math.min(1, s.pt * 5);
        for (let i = 0; i < s.pose.length; i++) s.pose[i] = lerp(s.pose[i], s.tmp[i], blend);
        solve(s.from, s.lift, 0, BAR);
        s.bx = BAR[0];
        s.by = BAR[1];
        if (s.lift !== DEAD) {
          // the bar goes back onto the J hooks on the front uprights
          const e = easeInOutCubic(clamp(s.pt / 0.4, 0, 1));
          s.bx = lerp(s.fbx, HOOK_X, e);
          s.by = lerp(s.fby, hookY(s.lift), e) - Math.sin(e * Math.PI) * 8;
        }
        if (!s.clapped && k > 0.5) {
          s.clapped = true;
          const hx = s.pose[J.HAND_N * 2];
          const hy = s.pose[J.HAND_N * 2 + 1];
          burst(s.parts, 46, hx, hy, -Math.PI / 2, Math.PI, 80, 3.4, 6, 0, 2.4, -8);
          for (let i = 0; i < 10; i++) emit(s.parts, hx + rand(-6, 6), hy + rand(-4, 4), rand(-14, 14), rand(-10, 4), rand(2.5, 4.2), rand(8, 13), 0, 1.4, -4);
          const bus = env.audio();
          if (bus) {
            hit(bus, { freq: 2200, q: 0.6, gain: 0.32, decay: 0.07, type: 'highpass' });
            hit(bus, { freq: 1400, q: 0.6, gain: 0.12, decay: 0.3, type: 'bandpass', delay: 0.02 });
          }
        }
        if (s.pt >= 1.3) {
          s.setReps = 0;
          s.autoSets++;
          if (s.plates < MAX_PLATES) {
            s.plates++;
            s.plateIn = 0;
            const bus = env.audio();
            if (bus) clang(bus, 260, 0.14, 0.05);
          } else {
            s.wipe = 1;
            s.plates = 2;
            s.plateIn = 0;
          }
          s.from.set(s.pose);
          s.fbx = s.bx;
          s.fby = s.by;
          // in autopilot, move on to the next lift every other set
          if (auto && s.autoSets % 2 === 0) {
            s.nextLift = (s.lift + 1) % 3;
          } else s.nextLift = s.lift;
          s.phase = 'switch';
          s.pt = 0;
        }
        return;
      }

      // rep
      const [a, b, c2, d] = repTimes(s.lift, s.plates);
      const t = s.pt;
      let p: number;
      let concentric = false;
      if (t < a) {
        const k = t / a;
        p = downFirst(s.lift) ? easeInOutCubic(k) : 1 - Math.pow(1 - k, 2.2) * (1 - k * 0.2);
        concentric = !downFirst(s.lift);
      } else if (t < a + b) {
        p = 1;
        if (!s.topped && !downFirst(s.lift)) {
          s.topped = true;
          lockout(s, env);
        }
      } else if (t < a + b + c2) {
        const k = (t - a - b) / c2;
        p = 1 - (downFirst(s.lift) ? 1 - Math.pow(1 - k, 1.8) : easeInOutCubic(k));
        concentric = downFirst(s.lift);
      } else {
        p = 0;
        if (!s.topped && downFirst(s.lift)) {
          s.topped = true;
          lockout(s, env);
        }
        if (s.lift === DEAD && !s.dropped) {
          s.dropped = true;
          s.shake = 0.5 + s.plates * 0.12;
          const fy = 4;
          burst(s.parts, 18, s.bx + 8, fy, -Math.PI / 2, 1.3, 60, 1.2, 7, 1, 2.4, 30);
          burst(s.parts, 10, s.bx - 20, fy, -Math.PI / 2, 1.3, 50, 1.2, 7, 1, 2.4, 30);
          const bus = env.audio();
          if (bus) {
            hit(bus, { freq: 140, q: 0.7, gain: 0.55, decay: 0.32 });
            clang(bus, 120, 0.1, 0.01);
          }
        }
        if (t >= a + b + c2 + d) {
          s.phase = 'rest';
          s.pt = 0;
          s.autoRest = rand(0.5, 0.9);
        }
      }
      s.p = p;
      s.strain = damp(s.strain, concentric ? clamp((s.plates - 1) / 3, 0, 1) : 0, 6, dt);
      solve(s.pose, s.lift, p, BAR);
      // heavy reps tremble a little through the sticking point
      const tr = s.strain * Math.sin(s.pt * 70) * 0.7 * Math.sin(p * Math.PI);
      s.bx = BAR[0] + tr * 0.4;
      s.by = BAR[1] + tr;
      for (const j of [J.HAND_N, J.HAND_F]) s.pose[j * 2 + 1] += tr;
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const k = s.k;
      const sx = shakeX(s.shake * 6, t);
      const sy = shakeY(s.shake * 4, t);
      ctx.save();
      ctx.translate(sx, sy);
      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);

      // spotlight cone, leaning toward the pointer
      const lx = s.ox + s.light * w * 0.18;
      ctx.globalCompositeOperation = 'lighter';
      const coneTop = -h * 0.05;
      const cone = ctx.createLinearGradient(0, coneTop, 0, s.floor);
      cone.addColorStop(0, 'rgba(255,210,150,0.2)');
      cone.addColorStop(1, 'rgba(255,190,120,0.05)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(lx - 22 * k, coneTop);
      ctx.lineTo(lx + 22 * k, coneTop);
      ctx.lineTo(s.ox + 150 * k, s.floor + 8 * k);
      ctx.lineTo(s.ox - 150 * k, s.floor + 8 * k);
      ctx.closePath();
      ctx.fill();
      glow(ctx, s.warm, s.ox, s.floor, 190 * k, 0.65);
      glow(ctx, s.warm, lx, coneTop + 10, 90 * k, 0.8);
      // drifting dust in the beam
      ctx.fillStyle = '#ffe2b8';
      for (const m of s.motes) {
        const yy = ((m.y - t * m.sp + 10) % 1) * (s.floor - coneTop) + coneTop;
        const f = (yy - coneTop) / (s.floor - coneTop);
        const half = lerp(22 * k, 150 * k, f);
        const cx = lerp(lx, s.ox, f);
        const xx = cx + (m.x - 0.5) * 2 * half * 0.85 + Math.sin(t * 0.4 + m.ph) * 6;
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.3 + m.ph);
        ctx.fillRect(xx, yy, m.r, m.r);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // tally marks on the chalkboard: every rep, struck through in fives
      const cbx = Math.max(w * 0.05, s.ox - 330 * k);
      const cby = h * 0.12;
      const cbw = Math.min(190 * k, w * 0.26);
      const cbh = cbw * 0.62;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cbx, cby, cbw, cbh);
      ctx.clip();
      ctx.strokeStyle = 'rgba(236,236,228,0.85)';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.4, cbw * 0.014);
      const groupW = cbw * 0.2;
      const markH = cbh * 0.26;
      const shown = s.total % 30;
      for (let i = 0; i < shown; i++) {
        const g = Math.floor(i / 5);
        const j = i % 5;
        const gx = cbx + cbw * 0.08 + (g % 4) * groupW;
        const gy = cby + cbh * 0.14 + Math.floor(g / 4) * (markH + cbh * 0.14);
        const wob = Math.sin(i * 12.9) * 1.2;
        ctx.beginPath();
        if (j < 4) {
          ctx.moveTo(gx + j * groupW * 0.17 + wob, gy);
          ctx.lineTo(gx + j * groupW * 0.17 - wob, gy + markH);
        } else {
          ctx.moveTo(gx - groupW * 0.06, gy + markH * 0.85);
          ctx.lineTo(gx + groupW * 0.6, gy + markH * 0.15);
        }
        ctx.stroke();
      }
      if (s.wipe > 0) {
        ctx.fillStyle = `rgba(200,205,200,${(0.25 * s.wipe).toFixed(3)})`;
        ctx.fillRect(cbx, cby, cbw * (1 - s.wipe), cbh);
      }
      ctx.restore();

      // J hooks hold the bar between sets of squats and presses
      const ox = s.ox;
      const fy = s.floor;
      if (s.lift !== DEAD || s.nextLift !== DEAD) {
        const hy = hookY(s.phase === 'switch' ? s.nextLift : s.lift);
        ctx.fillStyle = '#3a3d46';
        ctx.fillRect(ox + (HOOK_X - 4) * k, fy + (hy + 4.5) * k, 12 * k, 4 * k);
        ctx.fillRect(ox + (HOOK_X - 5) * k, fy + (hy - 3) * k, 3 * k, 9 * k);
        ctx.fillStyle = '#5a5e68';
        ctx.fillRect(ox + (HOOK_X - 4) * k, fy + (hy + 4.5) * k, 12 * k, 1 * k);
      }

      // camera punch on heavy lockouts
      const zoom = 1 + easeOutBack(s.punch) * 0.012;
      ctx.save();
      ctx.translate(ox, fy);
      ctx.scale(k * zoom, k * zoom);
      // contact shadow
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.ellipse(-4, 5, 46, 6, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(s.bx + 4, 5, 26, 4, 0, 0, TAU);
      ctx.fill();

      // far plates sit behind the lifter, the near stack in front of everything
      drawBarEnd(s, ctx, s.bx, s.by, false);
      drawFigure(ctx, s.pose, LIFTER, 1, (c, stage) => {
        if (stage === 'top') drawBarEnd(s, c, s.bx, s.by, true);
      });

      // chalk and floor dust
      for (const pt of s.parts.items) {
        if (pt.life <= 0) continue;
        const f = pt.life / pt.max;
        const grow = pt.size * (1 + (1 - f) * 1.6);
        glow(ctx, s.chalk, pt.x, pt.y, grow, (pt.kind === 1 ? 0.3 : 0.26) * Math.min(1, f * 1.4));
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      ctx.restore();
      ctx.fillStyle = s.vignette ?? 'transparent';
      ctx.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env) => requestRep(s, env),
    onKey: (s, env, e, down) => {
      if (e.key === ' ' || e.key === 'Enter') {
        if (down && !e.repeat) requestRep(s, env);
        return true;
      }
      const n = ['1', '2', '3'].indexOf(e.key);
      if (n >= 0) {
        if (down && !e.repeat) {
          s.touched = true;
          s.idle = 0;
          switchLift(s, env, n);
        }
        return true;
      }
      return false;
    },
    dispose: (s) => {
      freeCanvas(s.bg, s.warm, s.chalk);
    },
  });
