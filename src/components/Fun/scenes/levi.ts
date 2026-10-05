import { createCanvasScene, clamp, damp, easeInOutCubic, easeOutCubic, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { emit, freeCanvas, glow, glowSprite, layer, makePool, mulberry, shakeX, shakeY, stepPool } from './heroes-kit';
import type { Pool } from './heroes-kit';

/**
 * Levi: the captain crouches on a branch in the forest of giant trees while a grinning titan
 * reaches for him. A click, tap or Space fires his gear: the cable shoots out to the point on
 * the titan's arm the pointer is steering at, he swings in and corkscrews up the arm with
 * both blades out, every turn leaving a blade arc and a burst of steam from the cut. At the
 * shoulder he vaults over the head and takes the nape: hit-stop, a flash and a column of
 * steam. The titan stiffens, topples and boils away into steam while Levi rides the cable
 * back to his branch, and a new titan lumbers in out of the mist. No blood: titan wounds
 * only steam. The forest is baked once per resize; everything else is posed live.
 */

type C = CanvasRenderingContext2D;

interface Cut {
  a: number;
  life: number;
  tilt: number;
}

interface State {
  phase: number; // 0 perch, 1 fire, 2 swing, 3 spiral, 4 vault, 5 strike, 6 return
  pt: number;
  // Levi
  lx: number;
  ly: number;
  pvx: number;
  pvy: number;
  spin: number;
  spinRate: number;
  depth: number;
  crouch: number;
  cloak: number;
  anchorA: number;
  aimA: number;
  aimOn: boolean;
  theta: number;
  lastHalf: number;
  fromX: number;
  fromY: number;
  cable: number;
  cableX: number;
  cableY: number;
  trail: Float32Array;
  trailN: number;
  touched: boolean;
  idle: number;
  autoT: number;
  // titan
  tState: number; // 0 alive, 1 stiffen, 2 collapse, 3 gone, 4 arrive
  tT: number;
  reach: number;
  cuts: Cut[];
  nape: number;
  // fx
  parts: Pool;
  shake: number;
  stop: number;
  flash: number;
  slash: number;
  leaves: Float32Array;
  // layout
  u: number;
  gy: number;
  tx: number;
  perchX: number;
  perchY: number;
  bg: HTMLCanvasElement | null;
  fade: HTMLCanvasElement | null;
  soft: HTMLCanvasElement;
  shaft: HTMLCanvasElement;
  white: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const MAX_PARTS = 700;
const TRAIL = 44;
const LEAVES = 26;
/** Levi's drawing scale over his joint units */
const LS = 2.1;
const SPIRAL_TURNS = 3;
const ORBIT = 66;

const STEAM = 0;
const GAS = 1;
const GLINT = 2;

const SKIN = ['#8a5446', '#c3876e', '#e6b397', '#f8dbc5'];
const SKIN_FAR = ['#6d4034', '#9c6653', '#bb8a73', '#d3a78f'];
const HAIR_T = ['#2b1a12', '#4a2e1f', '#6c4630'];
const OUTLINE = '#3a1f18';
const EDGE = 'edge';

/* ---------- the titan (local units, feet origin, facing left) ---------- */

// near arm joints: shoulder, elbow, hand, before the idle sway is applied
const ARM = [-52, -352, -172, -366, -286, -398];
const NAPE = [34, -378];
const HEAD = [-14, -428];
/** world copy of the posed arm, refreshed every update */
const ARMW = [0, 0, 0, 0, 0, 0];

function armPoint(a: number, out: number[]) {
  // a runs from the hand (0) to the shoulder (1) along the forearm then the upper arm
  const k = clamp(a, 0, 1);
  if (k < 0.5) {
    const q = k / 0.5;
    out[0] = lerp(ARMW[4], ARMW[2], q);
    out[1] = lerp(ARMW[5], ARMW[3], q);
    out[2] = ARMW[2] - ARMW[4];
    out[3] = ARMW[3] - ARMW[5];
  } else {
    const q = (k - 0.5) / 0.5;
    out[0] = lerp(ARMW[2], ARMW[0], q);
    out[1] = lerp(ARMW[3], ARMW[1], q);
    out[2] = ARMW[0] - ARMW[2];
    out[3] = ARMW[1] - ARMW[3];
  }
  const L = Math.hypot(out[2], out[3]) || 1;
  out[2] /= L;
  out[3] /= L;
}
const AP = [0, 0, 0, 0];

function poseArm(s: State, t: number) {
  // the arm drifts toward Levi's branch, swaying
  const sway = Math.sin(t * 0.7) * 0.05 + s.reach * 0.06;
  const [sx, sy] = [ARM[0], ARM[1]];
  const ca = Math.cos(sway);
  const sa = Math.sin(sway);
  for (let i = 0; i < 3; i++) {
    const x = ARM[i * 2] - sx;
    const y = ARM[i * 2 + 1] - sy;
    ARMW[i * 2] = s.tx + sx + x * ca - y * sa;
    ARMW[i * 2 + 1] = sy + x * sa + y * ca;
  }
}

/** Soft tapered limb: rounded ends, shaded across its width with the light from the upper left */
function limb(c: C, x0: number, y0: number, x1: number, y1: number, wd: number, cols: string[], flat: string | null, w1 = wd * 0.82) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const r0 = wd / 2;
  const r1 = w1 / 2;
  c.beginPath();
  c.moveTo(x0 + nx * r0, y0 + ny * r0);
  c.quadraticCurveTo(lerp(x0, x1, 0.5) + nx * (r0 + r1) * 0.56, lerp(y0, y1, 0.5) + ny * (r0 + r1) * 0.56, x1 + nx * r1, y1 + ny * r1);
  c.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2, true);
  c.quadraticCurveTo(lerp(x0, x1, 0.5) - nx * (r0 + r1) * 0.54, lerp(y0, y1, 0.5) - ny * (r0 + r1) * 0.54, x0 - nx * r0, y0 - ny * r0);
  c.arc(x0, y0, r0, a - Math.PI / 2, a + Math.PI / 2, true);
  c.closePath();
  if (flat === EDGE) {
    c.fillStyle = OUTLINE;
    c.strokeStyle = OUTLINE;
    c.lineWidth = 3.2;
    c.fill();
    c.stroke();
    return;
  }
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    return;
  }
  // light side is whichever normal points more up and left
  const sgn = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
  const mx = lerp(x0, x1, 0.5);
  const my = lerp(y0, y1, 0.5);
  const R = Math.max(r0, r1);
  const g = c.createLinearGradient(mx + nx * R * sgn, my + ny * R * sgn, mx - nx * R * sgn, my - ny * R * sgn);
  g.addColorStop(0, cols[3]);
  g.addColorStop(0.22, cols[2]);
  g.addColorStop(0.7, cols[1]);
  g.addColorStop(1, cols[0]);
  c.fillStyle = g;
  c.fill();
}

/** Two-segment limb drawn as one piece: outline silhouette first so the knee has no seam */
function limb2(c: C, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, w0: number, w1: number, w2: number, cols: string[], flat: string | null) {
  if (!flat) {
    limb(c, x0, y0, x1, y1, w0, cols, EDGE, w1);
    limb(c, x1, y1, x2, y2, w1, cols, EDGE, w2);
  }
  limb(c, x0, y0, x1, y1, w0, cols, flat, w1);
  limb(c, x1, y1, x2, y2, w1 * 0.98, cols, flat, w2);
}

function titanBody(c: C, s: State, flat: string | null, t: number) {
  const breathe = Math.sin(t * 1.3) * 2;
  // far leg and far arm hang behind
  limb2(c, 30, -200, 44, -104, 52, -12, 70, 50, 38, SKIN_FAR, flat);
  c.fillStyle = flat ?? SKIN_FAR[1];
  c.beginPath();
  c.ellipse(40, -8, 34, 12, 0, 0, TAU);
  c.fill();
  limb2(c, 66, -350 + breathe, 92, -262, 86, -176, 46, 36, 28, SKIN_FAR, flat);
  c.fillStyle = flat ?? SKIN_FAR[1];
  c.beginPath();
  c.ellipse(84, -162, 20, 26, 0.2, 0, TAU);
  c.fill();

  // torso: soft pear shape, pot belly toward the viewer's left
  c.beginPath();
  c.moveTo(-46, -196);
  c.bezierCurveTo(-82, -228, -84, -290, -66, -330);
  c.quadraticCurveTo(-62, -366 + breathe, -20, -372 + breathe);
  c.lineTo(46, -372 + breathe);
  c.quadraticCurveTo(84, -362 + breathe, 80, -318);
  c.bezierCurveTo(78, -270, 70, -226, 54, -196);
  c.quadraticCurveTo(4, -176, -46, -196);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
  } else {
    const g = c.createLinearGradient(-80, -360, 80, -200);
    g.addColorStop(0, SKIN[3]);
    g.addColorStop(0.3, SKIN[2]);
    g.addColorStop(0.75, SKIN[1]);
    g.addColorStop(1, SKIN[0]);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = OUTLINE;
    c.lineWidth = 2;
    c.stroke();
    // chest and belly folds, navel
    c.strokeStyle = 'rgba(120,64,50,0.55)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-58, -322);
    c.quadraticCurveTo(-30, -304, -4, -320);
    c.moveTo(0, -318);
    c.quadraticCurveTo(26, -304, 50, -318);
    c.moveTo(-70, -262);
    c.quadraticCurveTo(-40, -246, -10, -256);
    c.stroke();
    c.fillStyle = 'rgba(110,58,46,0.7)';
    c.beginPath();
    c.ellipse(-30, -236, 3, 5, 0, 0, TAU);
    c.fill();
  }
  // near leg, in front of the torso's base
  limb2(c, -26, -204, -40, -108, -46, -12, 76, 52, 40, SKIN, flat);
  c.fillStyle = flat ?? SKIN[1];
  c.beginPath();
  c.ellipse(-58, -8, 40, 13, 0, 0, TAU);
  c.fill();
  if (!flat) {
    c.fillStyle = SKIN[3];
    c.beginPath();
    c.ellipse(-50, -110, 12, 8, 0, 0, TAU);
    c.fill();
  }

  // neck and the nape plate of skin where the blades go
  c.fillStyle = flat ?? SKIN[1];
  c.beginPath();
  c.moveTo(-30, -366);
  c.lineTo(-24, -396);
  c.lineTo(36, -398);
  c.quadraticCurveTo(46, -380, 40, -364);
  c.closePath();
  c.fill();
  if (!flat && s.nape > 0) {
    // the nape cut: a gash that only steams
    c.strokeStyle = `rgba(90,40,34,${(0.8 * s.nape).toFixed(3)})`;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(NAPE[0] - 6, NAPE[1] - 16);
    c.quadraticCurveTo(NAPE[0] + 6, NAPE[1], NAPE[0] - 2, NAPE[1] + 16);
    c.stroke();
    c.strokeStyle = `rgba(255,236,226,${(0.8 * s.nape).toFixed(3)})`;
    c.lineWidth = 1.5;
    c.stroke();
  }

  // head: too big, a vacant stare and a wide grin
  const tilt = s.tState === 1 ? -0.12 * Math.min(1, s.tT * 4) : Math.sin(t * 0.6) * 0.04;
  c.save();
  c.translate(HEAD[0] + 8, HEAD[1] + 40);
  c.rotate(tilt);
  c.translate(-(HEAD[0] + 8), -(HEAD[1] + 40));
  const hx = HEAD[0];
  const hy = HEAD[1];
  // hair behind
  c.fillStyle = flat ?? HAIR_T[0];
  c.beginPath();
  c.moveTo(hx - 30, hy - 52);
  c.bezierCurveTo(hx + 30, hy - 78, hx + 78, hy - 30, hx + 64, hy + 36);
  c.lineTo(hx + 54, hy + 44);
  c.lineTo(hx + 44, hy + 30);
  c.lineTo(hx + 30, hy + 42);
  c.bezierCurveTo(hx + 30, hy - 10, hx, hy - 40, hx - 30, hy - 52);
  c.closePath();
  c.fill();
  // face
  c.beginPath();
  c.ellipse(hx, hy, 46, 55, -0.08, 0, TAU);
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    c.restore();
    return;
  }
  const hg = c.createRadialGradient(hx - 20, hy - 20, 6, hx + 6, hy + 6, 70);
  hg.addColorStop(0, SKIN[3]);
  hg.addColorStop(0.45, SKIN[2]);
  hg.addColorStop(0.85, SKIN[1]);
  hg.addColorStop(1, SKIN[0]);
  c.fillStyle = hg;
  c.fill();
  c.strokeStyle = OUTLINE;
  c.lineWidth = 2;
  c.stroke();
  // ear on the far side
  c.fillStyle = SKIN[1];
  c.beginPath();
  c.ellipse(hx + 44, hy + 2, 8, 14, 0.2, 0, TAU);
  c.fill();
  // hair over the top and down the back
  c.fillStyle = HAIR_T[1];
  c.beginPath();
  c.moveTo(hx - 50, hy - 8);
  c.bezierCurveTo(hx - 54, hy - 60, hx + 20, hy - 76, hx + 50, hy - 36);
  c.bezierCurveTo(hx + 62, hy - 10, hx + 58, hy + 20, hx + 60, hy + 34);
  c.lineTo(hx + 44, hy + 12);
  c.bezierCurveTo(hx + 34, hy - 26, hx - 8, hy - 44, hx - 34, hy - 30);
  c.quadraticCurveTo(hx - 44, hy - 22, hx - 50, hy - 8);
  c.closePath();
  c.fill();
  c.strokeStyle = HAIR_T[2];
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(hx - 30, hy - 50);
  c.quadraticCurveTo(hx + 10, hy - 66, hx + 40, hy - 40);
  c.moveTo(hx - 20, hy - 42);
  c.quadraticCurveTo(hx + 16, hy - 52, hx + 44, hy - 20);
  c.stroke();
  // eyes: small pupils in wide whites under a heavy brow, staring at the branch
  for (const [ex, ey, er] of [
    [hx - 32, hy - 6, 7.5],
    [hx - 6, hy - 8, 8.5],
  ]) {
    c.fillStyle = 'rgba(120,64,50,0.45)';
    c.beginPath();
    c.ellipse(ex, ey - 2, er * 1.3, er * 1.1, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#f7efe6';
    c.beginPath();
    c.ellipse(ex, ey, er, er * 0.72, 0, 0, TAU);
    c.fill();
    c.strokeStyle = OUTLINE;
    c.lineWidth = 1.4;
    c.stroke();
    c.fillStyle = '#23130e';
    c.beginPath();
    c.arc(ex - er * 0.35, ey - 0.5, er * 0.26, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(70,34,26,0.9)';
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(ex - er * 1.1, ey - er * 0.9);
    c.quadraticCurveTo(ex, ey - er * 1.3, ex + er * 1.1, ey - er * 0.8);
    c.stroke();
  }
  // cheek shadow under the grin
  c.fillStyle = 'rgba(140,76,60,0.25)';
  c.beginPath();
  c.ellipse(hx + 8, hy + 22, 22, 14, 0, 0, TAU);
  c.fill();
  // nose
  c.strokeStyle = 'rgba(110,58,46,0.8)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(hx - 22, hy - 2);
  c.quadraticCurveTo(hx - 30, hy + 12, hx - 20, hy + 14);
  c.stroke();
  // the grin: a wide crescent of teeth
  c.fillStyle = '#4a1c16';
  c.beginPath();
  c.moveTo(hx - 46, hy + 20);
  c.quadraticCurveTo(hx - 10, hy + 46, hx + 26, hy + 18);
  c.quadraticCurveTo(hx - 8, hy + 34, hx - 46, hy + 20);
  c.fill();
  c.fillStyle = '#fbf4e6';
  c.beginPath();
  c.moveTo(hx - 44, hy + 21);
  c.quadraticCurveTo(hx - 10, hy + 38, hx + 24, hy + 19);
  c.quadraticCurveTo(hx - 8, hy + 30, hx - 44, hy + 21);
  c.fill();
  c.strokeStyle = 'rgba(80,40,30,0.6)';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 1; i < 9; i++) {
    const x = hx - 44 + i * 7.5;
    c.moveTo(x, hy + 20 + Math.sin((i / 9) * Math.PI) * 8);
    c.lineTo(x, hy + 25 + Math.sin((i / 9) * Math.PI) * 10);
  }
  c.stroke();
  c.restore();
}

function titanArm(c: C, s: State, flat: string | null) {
  const x0 = ARMW[0] - s.tx;
  const y0 = ARMW[1];
  const x1 = ARMW[2] - s.tx;
  const y1 = ARMW[3];
  const x2 = ARMW[4] - s.tx;
  const y2 = ARMW[5];
  c.fillStyle = flat ?? SKIN[2];
  c.beginPath();
  c.arc(x0, y0, 36, 0, TAU);
  c.fill();
  limb2(c, x0, y0, x1, y1, x2, y2, 62, 48, 38, SKIN, flat);
  // hand: palm and splayed fingers reaching for the branch
  const a = Math.atan2(y2 - y1, x2 - x1);
  c.save();
  c.translate(x2, y2);
  c.rotate(a);
  c.fillStyle = flat ?? SKIN[2];
  c.beginPath();
  c.ellipse(14, 0, 30, 24, 0, 0, TAU);
  c.fill();
  if (!flat) {
    c.strokeStyle = OUTLINE;
    c.lineWidth = 2;
    c.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const fa = -0.5 + i * 0.32;
    limb(c, 30, (i - 1.5) * 10, 30 + Math.cos(fa) * 34, (i - 1.5) * 10 + Math.sin(fa) * 34, 11, SKIN, flat);
  }
  limb(c, 10, -20, 30, -44, 12, SKIN, flat);
  c.restore();
  if (flat) return;
  // cuts along the arm, fading as they steam shut
  for (const cut of s.cuts) {
    if (cut.life <= 0) continue;
    armPoint(cut.a, AP);
    const px = AP[0] - s.tx;
    const py = AP[1];
    const nx = -AP[3];
    const ny = AP[2];
    const r = 20;
    c.strokeStyle = `rgba(120,52,42,${(0.75 * cut.life).toFixed(3)})`;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(px - nx * r + AP[2] * cut.tilt * 12, py - ny * r + AP[3] * cut.tilt * 12);
    c.lineTo(px + nx * r - AP[2] * cut.tilt * 12, py + ny * r - AP[3] * cut.tilt * 12);
    c.stroke();
    c.strokeStyle = `rgba(255,214,196,${(0.35 * cut.life).toFixed(3)})`;
    c.lineWidth = 1;
    c.stroke();
  }
}

/* ---------- Levi (local units, pelvis origin, facing right) ---------- */

// chest, head, near elbow, near hand, far elbow, far hand, near knee, near foot, far knee, far foot
const PERCH = [4, -18, 8, -29, 10, -8, 17, -3, -1, -7, 8, -1, 13, 5, 7, 18, 7, 7, -3, 18];
const SPREAD = [2, -20, 3, -31, 12, -24, 24, -27, -11, -23, -23, -23, 5, 13, 3, 27, -4, 12, -9, 26];
const LJ = new Array<number>(20).fill(0);

const COAT = ['#5a3b1f', '#8e6537', '#b88a55', '#d7ad74'];
const CLOAK = ['#1d3a26', '#2e5a3a', '#40784d', '#62a06c'];
const PANTS = ['#9d978a', '#d6d1c4', '#f1eee6'];
const BOOT = ['#23150c', '#46291a', '#6a4229'];

function seg(c: C, x0: number, y0: number, x1: number, y1: number, wd: number, col: string) {
  c.strokeStyle = col;
  c.lineWidth = wd;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

/** Wings of Freedom: a blue wing over a white wing, three feather lobes each */
function wings(c: C, x: number, y: number, sc: number) {
  c.save();
  c.translate(x, y);
  c.scale(sc, sc);
  const wing = (dir: number, col: string, ox: number) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(ox, 4);
    c.quadraticCurveTo(ox + dir * 2, -6, ox + dir * 9, -7);
    c.quadraticCurveTo(ox + dir * 8, -4, ox + dir * 10, -3);
    c.quadraticCurveTo(ox + dir * 7, -1, ox + dir * 9, 1);
    c.quadraticCurveTo(ox + dir * 5, 2, ox + dir * 7, 5);
    c.quadraticCurveTo(ox + dir * 3, 6, ox, 4);
    c.closePath();
    c.fill();
  };
  wing(1, '#f4f4f0', -0.8);
  wing(-1, '#2f5fb4', 0.8);
  c.restore();
}

function leviFigure(c: C, s: State, flat: string | null, vx: number, vy: number, t: number) {
  const P = LJ;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // cloak: pinned at the shoulders, trailing away from the motion
  const sp = Math.hypot(vx, vy);
  let dx = -vx / (sp || 1);
  let dy = -vy / (sp || 1);
  const trail = clamp(sp / 300, 0, 1);
  dx = lerp(-0.35, dx, trail);
  dy = lerp(1, dy, trail);
  const L = Math.hypot(dx, dy) || 1;
  dx /= L;
  dy /= L;
  const flutter = Math.sin(t * 17 + s.cloak) * (2 + trail * 4);
  const cl = 22 + trail * 6;
  const sx = P[0] - 2;
  const sy = P[1] + 2;
  const ex = sx + dx * cl;
  const ey = sy + dy * cl;
  const nx = -dy;
  const ny = dx;
  c.beginPath();
  c.moveTo(sx - nx * 5, sy - ny * 5);
  c.quadraticCurveTo(lerp(sx, ex, 0.5) - nx * 10 + flutter, lerp(sy, ey, 0.5) - ny * 10, ex - nx * 10, ey - ny * 10);
  c.lineTo(ex - nx * 3 + flutter * 0.5, ey - ny * 3 + 3);
  c.lineTo(ex + nx * 3, ey + ny * 3);
  c.lineTo(ex + nx * 9 - flutter * 0.4, ey + ny * 9 + 2);
  c.quadraticCurveTo(lerp(sx, ex, 0.5) + nx * 9 - flutter, lerp(sy, ey, 0.5) + ny * 9, sx + nx * 5, sy + ny * 5);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
  } else {
    const g = c.createLinearGradient(sx - nx * 12, sy - ny * 12, sx + nx * 12, sy + ny * 12);
    g.addColorStop(0, CLOAK[3]);
    g.addColorStop(0.35, CLOAK[2]);
    g.addColorStop(1, CLOAK[0]);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = '#0f1f14';
    c.lineWidth = 0.8;
    c.stroke();
    wings(c, lerp(sx, ex, 0.62), lerp(sy, ey, 0.62), 0.8);
  }

  // far leg and far arm
  const pantsFar = flat ?? PANTS[0];
  seg(c, -1, 1, P[16], P[17], 6, pantsFar);
  seg(c, P[16], P[17], P[18], P[19], 5, flat ?? BOOT[0]);
  seg(c, -2, -17, P[8], P[9], 4.6, flat ?? COAT[0]);
  seg(c, P[8], P[9], P[10], P[11], 4, flat ?? COAT[0]);
  blade(c, P[10], P[11], Math.atan2(P[11] - P[9], P[10] - P[8]), flat, true);

  // torso: short jacket over a white shirt, harness straps
  c.beginPath();
  c.moveTo(-5, 2);
  c.lineTo(P[0] - 6, P[1] - 1);
  c.lineTo(P[0] + 6, P[1] + 1);
  c.lineTo(6, 2);
  c.closePath();
  c.fillStyle = flat ?? '#ede9df';
  c.fill();
  if (!flat) {
    c.fillStyle = COAT[1];
    c.beginPath();
    c.moveTo(-5.5, -6);
    c.lineTo(P[0] - 6.5, P[1] - 1);
    c.lineTo(P[0] - 1, P[1] - 1);
    c.lineTo(-1, -6);
    c.closePath();
    c.fill();
    c.fillStyle = COAT[2];
    c.beginPath();
    c.moveTo(1, -6);
    c.lineTo(P[0] + 2, P[1] - 0.5);
    c.lineTo(P[0] + 6.5, P[1] + 1.5);
    c.lineTo(6, -6);
    c.closePath();
    c.fill();
    // harness: belt and two straps
    c.strokeStyle = '#3a2416';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(-5, 0);
    c.lineTo(6, 0);
    c.moveTo(-4, -2);
    c.lineTo(P[0] + 3, P[1] + 3);
    c.moveTo(5, -2);
    c.lineTo(P[0] - 3, P[1] + 3);
    c.stroke();
    // gas canister at the hip
    c.fillStyle = '#7e8791';
    c.beginPath();
    c.ellipse(-6, 2, 7, 2.6, -0.2, 0, TAU);
    c.fill();
    c.fillStyle = '#c5ccd4';
    c.fillRect(-12, 0.4, 10, 1);
  }

  // near leg: white trousers, strap, boot
  seg(c, 1, 1, P[12], P[13], 6.5, flat ?? PANTS[1]);
  seg(c, P[12], P[13], P[14], P[15], 5.5, flat ?? BOOT[1]);
  if (!flat) {
    seg(c, 0.4, 0.2, P[12] - 0.6, P[13] - 1, 2, PANTS[2]);
    seg(c, P[12], P[13], lerp(P[12], P[14], 0.5), lerp(P[13], P[15], 0.5), 1.4, BOOT[2]);
    // blade box on the thigh
    c.fillStyle = '#5e666f';
    c.save();
    c.translate(lerp(0, P[12], 0.5), lerp(0, P[13], 0.5));
    c.rotate(Math.atan2(P[13], P[12]));
    c.fillRect(-5, 2, 11, 4);
    c.fillStyle = '#9aa3ad';
    c.fillRect(-5, 2, 11, 1);
    c.restore();
  }

  // head: pale face, black undercut, the cravat at his throat
  const hx = P[2];
  const hy = P[3];
  if (!flat) {
    c.fillStyle = '#f6f4ee';
    c.beginPath();
    c.moveTo(P[0] - 1, P[1] - 1);
    c.lineTo(P[0] + 4, P[1] - 1);
    c.lineTo(P[0] + 2.5, P[1] + 5);
    c.closePath();
    c.fill();
  }
  c.fillStyle = flat ?? '#f0d7c4';
  c.beginPath();
  c.ellipse(hx, hy, 5.4, 6.4, 0, 0, TAU);
  c.fill();
  if (!flat) {
    // shaved underside at the back
    c.fillStyle = 'rgba(70,64,66,0.55)';
    c.beginPath();
    c.ellipse(hx - 3.6, hy + 1.6, 1.8, 2.6, 0.2, 0, TAU);
    c.fill();
    // black hair: heavy top with the fringe falling to the brow
    c.fillStyle = '#121218';
    c.beginPath();
    c.moveTo(hx - 6, hy - 0.5);
    c.quadraticCurveTo(hx - 7, hy - 8, hx, hy - 7.6);
    c.quadraticCurveTo(hx + 6.5, hy - 7.4, hx + 6.3, hy - 1);
    c.lineTo(hx + 4.5, hy - 2.6);
    c.lineTo(hx + 3.8, hy + 0.6);
    c.lineTo(hx + 2, hy - 2.6);
    c.lineTo(hx + 0.6, hy - 0.4);
    c.lineTo(hx - 1, hy - 3);
    c.lineTo(hx - 3, hy - 1);
    c.closePath();
    c.fill();
    c.fillStyle = '#3a3a48';
    c.fillRect(hx - 3, hy - 7, 5, 0.9);
    // narrow eye
    c.fillStyle = '#1a1a22';
    c.fillRect(hx + 2.4, hy - 0.4, 2.4, 0.9);
  }

  // near arm and blade
  seg(c, P[0] + 1, P[1] + 1, P[4], P[5], 5, flat ?? COAT[2]);
  seg(c, P[4], P[5], P[6], P[7], 4.4, flat ?? COAT[1]);
  if (!flat) seg(c, P[0] + 0.5, P[1] + 0.2, P[4] - 0.4, P[5] - 0.8, 1.4, COAT[3]);
  blade(c, P[6], P[7], Math.atan2(P[7] - P[5], P[6] - P[4]), flat, false);
}

function blade(c: C, x: number, y: number, a: number, flat: string | null, far: boolean) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  // grip and trigger box
  c.fillStyle = flat ?? '#3b4148';
  c.fillRect(-3, -2.2, 6, 4.4);
  // long thin blade with a lit edge
  c.fillStyle = flat ?? (far ? '#9aa4ae' : '#d9e1ea');
  c.beginPath();
  c.moveTo(2, -1.3);
  c.lineTo(34, -1.1);
  c.lineTo(37, 0.4);
  c.lineTo(2, 1.3);
  c.closePath();
  c.fill();
  if (!flat) {
    c.fillStyle = '#ffffff';
    c.fillRect(3, -1.3, 30, 0.6);
    c.strokeStyle = 'rgba(40,50,60,0.5)';
    c.lineWidth = 0.4;
    c.beginPath();
    for (let i = 1; i < 5; i++) {
      c.moveTo(3 + i * 6.5, -1.2);
      c.lineTo(4 + i * 6.5, 1.2);
    }
    c.stroke();
  }
  c.restore();
}

/** blade tip positions in local units for the trail */
function bladeTips(out: number[]) {
  const P = LJ;
  const a0 = Math.atan2(P[7] - P[5], P[6] - P[4]);
  const a1 = Math.atan2(P[11] - P[9], P[10] - P[8]);
  out[0] = P[6] + Math.cos(a0) * 36;
  out[1] = P[7] + Math.sin(a0) * 36;
  out[2] = P[10] + Math.cos(a1) * 36;
  out[3] = P[11] + Math.sin(a1) * 36;
}
const TIPS = [0, 0, 0, 0];

/* ---------- forest ---------- */

function paintForest(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.bg, w, h, dpr);
  s.bg = cv;
  if (!c) return;
  const u = s.u;
  const gy = s.gy;
  const rnd = mulberry(23);
  // high canopy light, green gold, dimming toward the floor
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#cfe0b0');
  sky.addColorStop(0.35, '#89a877');
  sky.addColorStop(0.75, '#4c6a4f');
  sky.addColorStop(1, '#27392c');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  // three depths of giant trunks, each nearer one darker and wider
  const trunk = (x: number, wd: number, cols: string[], lean: number) => {
    const g = c.createLinearGradient(x - wd / 2, 0, x + wd / 2, 0);
    g.addColorStop(0, cols[2]);
    g.addColorStop(0.3, cols[1]);
    g.addColorStop(1, cols[0]);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - wd * 0.5 + lean, -10);
    c.lineTo(x + wd * 0.5 + lean, -10);
    c.lineTo(x + wd * 0.56, gy - 30 * u);
    c.quadraticCurveTo(x + wd * 0.7, gy, x + wd * 0.95, gy + 10 * u);
    c.lineTo(x - wd * 0.95, gy + 10 * u);
    c.quadraticCurveTo(x - wd * 0.7, gy, x - wd * 0.56, gy - 30 * u);
    c.closePath();
    c.fill();
    // bark grooves
    c.strokeStyle = cols[0];
    c.lineWidth = Math.max(1, wd * 0.03);
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const k = (i + 0.5) / 6;
      const bx = x - wd * 0.45 + k * wd * 0.9;
      c.moveTo(bx + lean * (1 - 0.1), -10);
      c.bezierCurveTo(bx + rnd() * 10 * u, h * 0.3, bx - rnd() * 10 * u, h * 0.6, bx + (k - 0.5) * wd * 0.2, gy);
    }
    c.stroke();
  };
  const far = ['#6d8a74', '#83a088', '#9cb89e'];
  const mid = ['#3b4a35', '#55664a', '#72835e'];
  for (let i = 0; i < 6; i++) trunk(w * (0.08 + i * 0.19) + rnd() * 30 * u, (50 + rnd() * 30) * u, far, rnd() * 20 * u - 10 * u);
  // mist band
  const mist = c.createLinearGradient(0, gy - 260 * u, 0, gy);
  mist.addColorStop(0, 'rgba(210,228,200,0)');
  mist.addColorStop(0.7, 'rgba(210,228,200,0.35)');
  mist.addColorStop(1, 'rgba(210,228,200,0.15)');
  c.fillStyle = mist;
  c.fillRect(0, gy - 260 * u, w, 260 * u);
  for (let i = 0; i < 3; i++) trunk(w * (0.32 + i * 0.3) + rnd() * 40 * u, (90 + rnd() * 30) * u, mid, rnd() * 16 * u);
  // forest floor, roots and moss
  const gnd = c.createLinearGradient(0, gy - 20 * u, 0, h);
  gnd.addColorStop(0, '#46583a');
  gnd.addColorStop(1, '#1d2819');
  c.fillStyle = gnd;
  c.fillRect(0, gy - 6 * u, w, h - gy + 6 * u);
  c.fillStyle = 'rgba(120,150,90,0.25)';
  for (let i = 0; i < 30; i++) {
    c.beginPath();
    c.ellipse(rnd() * w, gy + rnd() * (h - gy), (20 + rnd() * 50) * u, (3 + rnd() * 4) * u, 0, 0, TAU);
    c.fill();
  }
  // Levi's tree: a huge trunk on the left with a branch reaching into the clearing
  const near = ['#1c2116', '#2e3522', '#4a5234', '#6d7447'];
  const tx = w * 0.02;
  const tw = 150 * u;
  const tg = c.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0);
  tg.addColorStop(0, near[1]);
  tg.addColorStop(0.55, near[2]);
  tg.addColorStop(0.8, near[3]);
  tg.addColorStop(1, near[1]);
  c.fillStyle = tg;
  c.fillRect(tx - tw / 2, -10, tw, gy + 20 * u);
  c.strokeStyle = near[0];
  c.lineWidth = 3 * u;
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const bx = tx - tw * 0.4 + i * tw * 0.2;
    c.moveTo(bx, -10);
    c.bezierCurveTo(bx + 8 * u, h * 0.3, bx - 8 * u, h * 0.6, bx + 4 * u, gy);
  }
  c.stroke();
  // branch
  const bx0 = tx + tw * 0.4;
  const by0 = s.perchY + 12 * u;
  const bx1 = s.perchX + 70 * u;
  c.fillStyle = near[2];
  c.beginPath();
  c.moveTo(bx0, by0 - 26 * u);
  c.quadraticCurveTo((bx0 + bx1) / 2, by0 - 10 * u, bx1, by0 - 4 * u);
  c.quadraticCurveTo(bx1 + 10 * u, by0 + 2 * u, bx1, by0 + 6 * u);
  c.quadraticCurveTo((bx0 + bx1) / 2, by0 + 16 * u, bx0, by0 + 34 * u);
  c.closePath();
  c.fill();
  c.fillStyle = near[3];
  c.beginPath();
  c.moveTo(bx0, by0 - 26 * u);
  c.quadraticCurveTo((bx0 + bx1) / 2, by0 - 10 * u, bx1, by0 - 4 * u);
  c.lineTo(bx1, by0 - 1 * u);
  c.quadraticCurveTo((bx0 + bx1) / 2, by0 - 5 * u, bx0, by0 - 18 * u);
  c.closePath();
  c.fill();
  c.strokeStyle = near[0];
  c.lineWidth = 1.2 * u;
  c.stroke();
  // leaf sprays hanging off the branch
  for (let i = 0; i < 8; i++) {
    const k = rnd();
    const lx = lerp(bx0, bx1, k);
    const ly = lerp(by0 - 8 * u, by0, k) + rnd() * 10 * u;
    c.fillStyle = i % 2 ? '#3f6a33' : '#5a8a45';
    c.beginPath();
    c.ellipse(lx, ly + 10 * u, 14 * u, 7 * u, rnd() - 0.5, 0, TAU);
    c.fill();
  }
  // right foreground trunk edge
  c.fillStyle = near[1];
  c.fillRect(w - 40 * u, -10, 60 * u, gy + 20 * u);
  c.fillStyle = near[2];
  c.fillRect(w - 40 * u, -10, 6 * u, gy + 20 * u);
}

/* ---------- actions ---------- */

function attack(s: State, env: SceneEnv, sound: boolean) {
  if (s.phase !== 0 || s.tState !== 0) return;
  s.phase = 1;
  s.pt = 0;
  s.anchorA = s.aimA;
  s.cable = 0;
  s.fromX = s.lx;
  s.fromY = s.ly;
  s.trailN = 0;
  const bus = sound ? env.audio() : null;
  if (bus) {
    noise(bus, { duration: 0.08, gain: 0.2, freq: 3800, q: 1.4 });
    tone(bus, 1400, { type: 'square', attack: 0.002, decay: 0.08, gain: 0.04, glideTo: 700 });
    noise(bus, { duration: 0.5, gain: 0.08, freq: 2600, q: 0.8 });
  }
}

function cutArm(s: State, env: SceneEnv, a: number) {
  let slot = s.cuts[0];
  for (const c of s.cuts) if (c.life < slot.life) slot = c;
  slot.a = a;
  slot.life = 1;
  slot.tilt = rand(-1, 1);
  armPoint(a, AP);
  for (let i = 0; i < 8; i++) {
    emit(s.parts, AP[0] + rand(-10, 10), AP[1] + rand(-10, 10), rand(-60, 60), rand(-140, -40), rand(0.7, 1.3), rand(10, 18), STEAM, 1.4, -40);
  }
  for (let i = 0; i < 6; i++) {
    const ang = rand(0, TAU);
    emit(s.parts, AP[0], AP[1], Math.cos(ang) * 320, Math.sin(ang) * 320, 0.18, rand(2, 3), GLINT, 3, 0);
  }
  if (!env.reducedMotion) s.shake = Math.min(1, s.shake + 0.18);
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.14, gain: 0.14, freq: 5200, q: 2 });
    tone(bus, 2400, { type: 'triangle', attack: 0.002, decay: 0.12, gain: 0.03, glideTo: 1300 });
    noise(bus, { duration: 0.4, gain: 0.05, freq: 1800, q: 0.6, type: 'highpass' });
  }
}

function strikeNape(s: State, env: SceneEnv) {
  s.nape = 1;
  s.slash = 1;
  s.flash = 1;
  s.tState = 1;
  s.tT = 0;
  if (!env.reducedMotion) {
    s.stop = 0.14;
    s.shake = 1;
  }
  const nx = s.tx + NAPE[0];
  const ny = NAPE[1];
  for (let i = 0; i < 34; i++) {
    const a = rand(-Math.PI * 0.9, -0.2);
    const v = rand(80, 380);
    emit(s.parts, nx + rand(-12, 12), ny + rand(-16, 16), Math.cos(a) * v, Math.sin(a) * v - 60, rand(0.9, 1.8), rand(12, 24), STEAM, 1.8, -60);
  }
  for (let i = 0; i < 20; i++) {
    const a = rand(0, TAU);
    emit(s.parts, nx, ny, Math.cos(a) * 520, Math.sin(a) * 520, 0.25, rand(2, 4), GLINT, 3, 0);
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.18, gain: 0.3, freq: 5000, q: 1.2 });
    noise(bus, { duration: 1.6, gain: 0.22, freq: 2400, q: 0.4, type: 'highpass' });
    tone(bus, 90, { type: 'sine', attack: 0.004, decay: 0.6, gain: 0.3, glideTo: 40 });
    tone(bus, 1900, { type: 'triangle', attack: 0.002, decay: 0.3, gain: 0.05, glideTo: 900 });
  }
}

function setPose(s: State, spread: number) {
  for (let i = 0; i < 20; i++) LJ[i] = lerp(PERCH[i], SPREAD[i], spread);
  if (s.phase === 0) {
    // breathing on the branch
    LJ[1] += Math.sin(s.cloak * 0.7) * 0.4;
    LJ[3] += Math.sin(s.cloak * 0.7) * 0.5;
  }
}

function bez(a: number, b: number, c: number, k: number) {
  const m = 1 - k;
  return m * m * a + 2 * m * k * b + k * k * c;
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 0.86,
    init: () => {
      const leaves = new Float32Array(LEAVES * 4);
      for (let i = 0; i < LEAVES; i++) {
        leaves[i * 4] = Math.random();
        leaves[i * 4 + 1] = Math.random();
        leaves[i * 4 + 2] = rand(0.3, 1);
        leaves[i * 4 + 3] = rand(0, TAU);
      }
      return {
        phase: 0,
        pt: 0,
        lx: 0,
        ly: 0,
        pvx: 0,
        pvy: 0,
        spin: 0,
        spinRate: 0,
        depth: 1,
        crouch: 0,
        cloak: 0,
        anchorA: 0.2,
        aimA: 0.2,
        aimOn: false,
        theta: 0,
        lastHalf: 0,
        fromX: 0,
        fromY: 0,
        cable: 0,
        cableX: 0,
        cableY: 0,
        trail: new Float32Array(TRAIL * 6),
        trailN: 0,
        touched: false,
        idle: 0,
        autoT: 0.2,
        tState: 0,
        tT: 0,
        reach: 0,
        cuts: Array.from({ length: 10 }, () => ({ a: 0, life: 0, tilt: 0 })),
        nape: 0,
        parts: makePool(MAX_PARTS),
        shake: 0,
        stop: 0,
        flash: 0,
        slash: 0,
        leaves,
        u: 1,
        gy: 0,
        tx: 0,
        perchX: 0,
        perchY: 0,
        bg: null,
        fade: null,
        soft: glowSprite(64, [
          [0, 'rgba(255,255,255,0.95)'],
          [0.5, 'rgba(246,248,244,0.5)'],
          [1, 'rgba(236,240,236,0)'],
        ]),
        shaft: glowSprite(96, [
          [0, 'rgba(255,250,210,0.9)'],
          [0.4, 'rgba(240,240,180,0.35)'],
          [1, 'rgba(220,230,160,0)'],
        ]),
        white: glowSprite(64, [
          [0, 'rgba(255,255,255,1)'],
          [0.35, 'rgba(230,245,255,0.55)'],
          [1, 'rgba(200,230,255,0)'],
        ]),
        vignette: null,
      };
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      const first = s.gy === 0;
      s.u = Math.min(w / 900, h / 560);
      s.gy = h * 0.95;
      s.tx = (w * 0.7) / s.u;
      s.perchX = w * 0.13;
      s.perchY = s.gy - 290 * s.u;
      if (first || s.phase === 0) {
        s.lx = s.perchX / s.u;
        s.ly = (s.perchY - s.gy) / s.u - 18 * LS;
      }
      poseArm(s, 0);
      paintForest(s, env);
      s.fade = layer(s.fade, env.w, env.h, env.dpr).cv;
      const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(8,14,10,0.6)');
      s.vignette = v;
    },
    update: (s, env, dt, t) => {
      const rm = env.reducedMotion;
      stepPool(s.parts, dt);
      s.flash = Math.max(0, s.flash - dt * 3);
      s.shake = Math.max(0, s.shake - dt * 2.6);
      s.slash = Math.max(0, s.slash - dt * 2.2);
      for (const c of s.cuts) {
        if (c.life <= 0) continue;
        c.life = Math.max(0, c.life - dt * 0.4);
        if (Math.random() < c.life * 0.5) {
          armPoint(c.a, AP);
          emit(s.parts, AP[0] + rand(-14, 14), AP[1] + rand(-10, 10), rand(-20, 20), rand(-80, -40), rand(0.8, 1.4), rand(8, 14), STEAM, 1, -30);
        }
      }
      // leaves drifting down through the shafts
      for (let i = 0; i < LEAVES; i++) {
        s.leaves[i * 4 + 1] += dt * 0.03 * s.leaves[i * 4 + 2];
        s.leaves[i * 4] += dt * 0.01 * Math.sin(t + i);
        s.leaves[i * 4 + 3] += dt * 2;
        if (s.leaves[i * 4 + 1] > 1) {
          s.leaves[i * 4 + 1] = 0;
          s.leaves[i * 4] = Math.random();
        }
      }
      if (s.stop > 0) {
        s.stop -= dt;
        return;
      }
      s.pt += dt;
      s.cloak += dt;
      const perchX = s.perchX / s.u;
      const perchY = (s.perchY - s.gy) / s.u - 18 * LS;

      // the titan
      s.tT += dt;
      s.reach = damp(s.reach, s.tState === 0 ? 1 : 0, 1.5, dt);
      s.nape = Math.max(0, s.nape - dt * (s.tState >= 2 ? 1 : 0.1));
      poseArm(s, t);
      if (s.tState === 1 && s.tT > 0.6) {
        s.tState = 2;
        s.tT = 0;
        const bus = env.audio();
        if (bus) noise(bus, { duration: 2.2, gain: 0.12, freq: 1600, q: 0.4, type: 'highpass' });
      } else if (s.tState === 2) {
        // boiling away: steam off the whole body
        const n = rm ? 1 : 3;
        for (let i = 0; i < n; i++) {
          const k = Math.random();
          emit(s.parts, s.tx - s.tT * 90 + rand(-90, 90), -rand(0, 440) * (1 - s.tT * 0.4), rand(-40, 40), rand(-160, -60), rand(1, 2), rand(18, 36), STEAM, 1, -40);
          if (k < 0.3) {
            armPoint(Math.random(), AP);
            emit(s.parts, AP[0], AP[1], rand(-40, 40), rand(-120, -40), rand(1, 2), rand(20, 36), STEAM, 1, -40);
          }
        }
        if (s.tT > 0.9 && s.tT - dt <= 0.9) {
          if (!rm) s.shake = Math.min(1, s.shake + 0.6);
          const bus = env.audio();
          if (bus) tone(bus, 55, { type: 'sine', attack: 0.004, decay: 0.8, gain: 0.3, glideTo: 30 });
        }
        if (s.tT > 1.5) {
          s.tState = 3;
          s.tT = 0;
          for (const c of s.cuts) c.life = 0;
        }
      } else if (s.tState === 3 && s.tT > 0.5) {
        s.tState = 4;
        s.tT = 0;
      } else if (s.tState === 4 && s.tT > 1.6) {
        s.tState = 0;
        s.tT = 0;
        s.nape = 0;
      }

      // autopilot for the tile and idle viewers
      s.idle += dt;
      const auto = !env.interactive || !s.touched || s.idle > 7;
      if (auto && s.phase === 0 && s.tState === 0) {
        if (!s.aimOn) s.aimA = damp(s.aimA, 0.18 + Math.sin(t * 0.5) * 0.08, 3, dt);
        s.autoT -= dt;
        if (s.autoT <= 0) {
          attack(s, env, false);
          s.autoT = rand(1.2, 2.2);
        }
      }

      // Levi's flight
      const px = s.lx;
      const py = s.ly;
      let spread = 0;
      armPoint(s.anchorA, AP);
      const ax = AP[0];
      const ay = AP[1];
      if (s.phase === 0) {
        s.lx = damp(s.lx, perchX, 12, dt);
        s.ly = damp(s.ly, perchY, 12, dt);
        s.spinRate = 0;
        s.depth = 1;
        s.cable = Math.max(0, s.cable - dt * 4);
        spread = 0;
      } else if (s.phase === 1) {
        // the hook flies out
        const k = Math.min(1, s.pt / 0.14);
        s.cable = k;
        s.cableX = ax;
        s.cableY = ay;
        spread = k * 0.4;
        if (k >= 1) {
          s.phase = 2;
          s.pt = 0;
          s.fromX = s.lx;
          s.fromY = s.ly;
        }
      } else if (s.phase === 2) {
        // swing in under the cable
        const k = Math.min(1, s.pt / 0.38);
        const e = easeInOutCubic(k);
        const cx = (s.fromX + ax) / 2;
        const cy = Math.max(s.fromY, ay) + 120;
        s.lx = bez(s.fromX, cx, ax, e);
        s.ly = bez(s.fromY, cy, ay, e);
        s.cable = 1;
        s.cableX = ax;
        s.cableY = ay;
        s.spinRate = lerp(4, 22, k);
        spread = 0.4 + k * 0.6;
        s.depth = 1;
        if (k >= 1) {
          s.phase = 3;
          s.pt = 0;
          s.theta = Math.PI / 2;
          s.lastHalf = 0;
        }
      } else if (s.phase === 3) {
        // corkscrew up the arm
        const k = Math.min(1, s.pt / 0.9);
        const q = lerp(s.anchorA, 1, easeInOutCubic(k));
        armPoint(q, AP);
        s.theta = Math.PI / 2 + k * SPIRAL_TURNS * TAU;
        const nx = -AP[3];
        const ny = AP[2];
        const r = ORBIT * (1 - Math.max(0, k - 0.85) * 3);
        s.lx = AP[0] + nx * r * Math.cos(s.theta);
        s.ly = AP[1] + ny * r * Math.cos(s.theta);
        s.depth = Math.sin(s.theta);
        armPoint(Math.min(1, q + 0.3), AP);
        s.cableX = AP[0];
        s.cableY = AP[1];
        s.cable = 1;
        s.spinRate = 26;
        spread = 1;
        const half = Math.floor((s.theta - Math.PI / 2) / Math.PI);
        if (half > s.lastHalf) {
          s.lastHalf = half;
          cutArm(s, env, q);
        }
        if (k >= 1) {
          s.phase = 4;
          s.pt = 0;
          s.fromX = s.lx;
          s.fromY = s.ly;
        }
      } else if (s.phase === 4) {
        // vault over the head to the nape
        const k = Math.min(1, s.pt / 0.34);
        const e = easeInOutCubic(k);
        const nx = s.tx + NAPE[0] + 22;
        const ny = NAPE[1] - 30;
        s.lx = bez(s.fromX, s.tx + HEAD[0] + 30, nx, e);
        s.ly = bez(s.fromY, HEAD[1] - 170, ny, e);
        s.cableX = s.tx + HEAD[0] + 10;
        s.cableY = HEAD[1] - 50;
        s.cable = 1;
        s.depth = 1;
        s.spinRate = 18;
        spread = 1;
        if (k >= 1) {
          s.phase = 5;
          s.pt = 0;
          s.fromX = s.lx;
          s.fromY = s.ly;
          strikeNape(s, env);
        }
      } else if (s.phase === 5) {
        // carry through the cut
        const k = Math.min(1, s.pt / 0.28);
        s.lx = s.fromX + easeOutCubic(k) * 46;
        s.ly = s.fromY + easeOutCubic(k) * 60;
        s.cable = Math.max(0, s.cable - dt * 6);
        s.spinRate = lerp(30, 10, k);
        spread = 1;
        if (k >= 1) {
          s.phase = 6;
          s.pt = 0;
          s.fromX = s.lx;
          s.fromY = s.ly;
          const bus = env.audio();
          if (bus) noise(bus, { duration: 0.6, gain: 0.07, freq: 2600, q: 0.8 });
        }
      } else if (s.phase === 6) {
        // cable back to the branch
        const k = Math.min(1, s.pt / 1.1);
        const e = easeInOutCubic(k);
        s.lx = bez(s.fromX, (s.fromX + perchX) / 2, perchX, e);
        s.ly = bez(s.fromY, Math.min(s.fromY, perchY) - 200, perchY, e);
        s.cable = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) * 4);
        s.cableX = perchX - 40;
        s.cableY = perchY - 200;
        s.spinRate = lerp(10, 0, k);
        spread = 1 - easeInOutCubic(clamp((k - 0.5) * 2, 0, 1));
        s.depth = 1;
        if (k >= 1) {
          s.phase = 0;
          s.pt = 0;
        }
      }
      const spin0 = s.spin;
      s.spin += s.spinRate * dt;
      if (s.phase === 0 || (s.phase === 6 && s.pt > 0.7)) {
        // land upright: ease the spin to the nearest whole turn
        const target = Math.round(s.spin / TAU) * TAU;
        s.spin = damp(s.spin, target, 8, dt) - target;
      }
      s.crouch = spread;
      setPose(s, spread);
      s.pvx = (s.lx - px) / Math.max(dt, 1e-3);
      s.pvy = (s.ly - py) / Math.max(dt, 1e-3);

      // gas from the gear while flying
      if (s.phase >= 2 && s.phase <= 6 && Math.random() < 0.8) {
        emit(s.parts, s.lx + rand(-4, 4), s.ly + rand(-4, 4), -s.pvx * 0.1 + rand(-20, 20), -s.pvy * 0.1 + rand(-20, 20), rand(0.3, 0.6), rand(4, 8), GAS, 3, -20);
      }

      // blade trail samples in world units
      if (s.phase >= 2 && s.phase <= 5) {
        // sub-steps keep the arcs round even when the spin covers a big angle per frame
        bladeTips(TIPS);
        const n = clamp(Math.ceil(Math.abs(s.spin - spin0) / 0.12), 1, 10);
        for (let i = 1; i <= n; i++) {
          const f = i / n;
          const sp = lerp(spin0, s.spin, f);
          const ox = lerp(px, s.lx, f);
          const oy = lerp(py, s.ly, f);
          const ca = Math.cos(sp);
          const sa = Math.sin(sp);
          s.trail.copyWithin(6, 0, (TRAIL - 1) * 6);
          for (let b = 0; b < 2; b++) {
            const x = TIPS[b * 2] * LS;
            const y = TIPS[b * 2 + 1] * LS;
            s.trail[b * 2] = ox + x * ca - y * sa;
            s.trail[b * 2 + 1] = oy + x * sa + y * ca;
          }
          s.trail[4] = ox;
          s.trail[5] = oy;
          s.trailN = Math.min(TRAIL, s.trailN + 1);
        }
      } else if (s.trailN > 0) {
        s.trailN = Math.max(0, s.trailN - 4);
      }
      // under reduced motion only a viewer's own action keeps the loop awake
      if (rm && s.touched && (s.phase !== 0 || s.tState !== 0)) env.wake(400);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.u;
      const gy = s.gy;
      // shared joint buffers are refreshed here too, in case two scenes are live at once
      poseArm(s, t);
      setPose(s, s.crouch);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const amp = env.reducedMotion ? 0 : s.shake * s.shake * 12 * u;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(1.03, 1.03);
      ctx.translate(-w / 2 + shakeX(amp, t), -h / 2 + shakeY(amp, t));
      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);

      // god rays through the canopy
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const sx = w * (0.2 + i * 0.22) + Math.sin(t * 0.2 + i) * 10 * u;
        ctx.save();
        ctx.translate(sx, 0);
        ctx.rotate(0.35);
        ctx.scale(0.22, 3.2);
        glow(ctx, s.shaft, 0, h * 0.12, h * 0.34, 0.16 + Math.sin(t * 0.5 + i * 2) * 0.04);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // titan: stiffen, topple forward while boiling away, then a new one walks out of the mist
      let talpha = 1;
      let trot = 0;
      let tsink = 0;
      let tdx = 0;
      if (s.tState === 1) {
        trot = Math.sin(s.tT * 60) * 0.004;
      } else if (s.tState === 2) {
        const k = easeInOutCubic(Math.min(1, s.tT / 1.4));
        trot = -k * 0.42;
        tsink = k * 60;
        talpha = 1 - clamp((s.tT - 0.4) / 1.1, 0, 1);
      } else if (s.tState === 3) {
        talpha = 0;
      } else if (s.tState === 4) {
        const k = easeOutCubic(Math.min(1, s.tT / 1.6));
        talpha = k;
        tdx = (1 - k) * 160;
      }
      const behind = s.depth < 0 && s.phase === 3;
      const place = (c: C) => {
        c.translate((s.tx + tdx) * u, gy + tsink * u);
        c.rotate(trot);
        c.scale(u, u);
      };
      const body = (c: C) => {
        c.save();
        place(c);
        // warm rim from the canopy light then the body
        c.save();
        c.translate(-3, -2);
        titanBody(c, s, 'rgba(255,246,200,0.55)', t);
        c.restore();
        titanBody(c, s, null, t);
        c.restore();
      };
      const arm = (c: C) => {
        c.save();
        place(c);
        c.save();
        c.translate(-2.5, -2);
        titanArm(c, s, 'rgba(255,246,200,0.5)');
        c.restore();
        titanArm(c, s, null);
        c.restore();
      };
      if (talpha > 0.995) {
        body(ctx);
        if (behind) drawLevi(ctx, s, t);
        arm(ctx);
      } else if (talpha > 0.01 && s.fade) {
        // fading: flatten the titan first so overlapping parts do not show through each other
        const fc = s.fade.getContext('2d');
        if (fc) {
          fc.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
          fc.clearRect(0, 0, w, h);
          body(fc);
          arm(fc);
          ctx.globalAlpha = talpha;
          ctx.drawImage(s.fade, 0, 0, w, h);
          ctx.globalAlpha = 1;
        }
      }

      // ODM cables: two lines from his hips
      if (s.cable > 0.01) {
        const lx = s.lx * u;
        const ly = gy + s.ly * u;
        const cx = lerp(s.lx, s.cableX, s.phase === 1 ? s.cable : 1) * u;
        const cy = gy + lerp(s.ly, s.cableY, s.phase === 1 ? s.cable : 1) * u;
        ctx.strokeStyle = `rgba(40,40,44,${(0.9 * s.cable).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, 1.3 * u);
        ctx.beginPath();
        ctx.moveTo(lx - 3 * u, ly);
        ctx.lineTo(cx - 2 * u, cy);
        ctx.moveTo(lx + 3 * u, ly);
        ctx.lineTo(cx + 2 * u, cy);
        ctx.stroke();
        ctx.strokeStyle = `rgba(220,226,230,${(0.5 * s.cable).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.5, 0.5 * u);
        ctx.stroke();
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(cx - 3 * u, cy - 3 * u, 6 * u, 6 * u);
      }

      if (!behind) drawLevi(ctx, s, t);

      // steam and gas
      for (const p of s.parts.items) {
        if (p.life <= 0 || (p.kind !== STEAM && p.kind !== GAS)) continue;
        const k = p.life / p.max;
        const r = p.size * (1 + (1 - k) * (p.kind === STEAM ? 1.8 : 1.2)) * u;
        ctx.globalAlpha = Math.min(1, k * 1.3) * (p.kind === STEAM ? 0.4 : 0.35);
        ctx.drawImage(s.soft, p.x * u - r, gy + p.y * u - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;

      // blade arcs and glints
      ctx.globalCompositeOperation = 'lighter';
      if (s.trailN > 1) {
        // ribbons between the blade tips and a point partway down the blade, fading with age
        const T = s.trail;
        for (let b = 0; b < 2; b++) {
          for (let i = 1; i < s.trailN; i++) {
            const k = 1 - i / s.trailN;
            const j0 = (i - 1) * 6;
            const j1 = i * 6;
            const inner0 = 0.72 + (1 - k) * 0.2;
            const inner1 = 0.72 + (1 - k) * 0.2;
            const ax0 = T[j0 + b * 2];
            const ay0 = T[j0 + b * 2 + 1];
            const ax1 = T[j1 + b * 2];
            const ay1 = T[j1 + b * 2 + 1];
            ctx.fillStyle = `rgba(200,236,255,${(k * k * 0.7).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(ax0 * u, gy + ay0 * u);
            ctx.lineTo(ax1 * u, gy + ay1 * u);
            ctx.lineTo(lerp(T[j1 + 4], ax1, inner1) * u, gy + lerp(T[j1 + 5], ay1, inner1) * u);
            ctx.lineTo(lerp(T[j0 + 4], ax0, inner0) * u, gy + lerp(T[j0 + 5], ay0, inner0) * u);
            ctx.closePath();
            ctx.fill();
          }
          // bright leading edge
          ctx.strokeStyle = 'rgba(245,252,255,0.9)';
          ctx.lineWidth = Math.max(1, 1.6 * u);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(T[b * 2] * u, gy + T[b * 2 + 1] * u);
          for (let i = 1; i < Math.min(s.trailN, 12); i++) ctx.lineTo(T[i * 6 + b * 2] * u, gy + T[i * 6 + b * 2 + 1] * u);
          ctx.stroke();
        }
      }
      ctx.lineCap = 'round';
      for (const p of s.parts.items) {
        if (p.life <= 0 || p.kind !== GLINT) continue;
        const k = p.life / p.max;
        ctx.globalAlpha = k;
        ctx.strokeStyle = '#f2fbff';
        ctx.lineWidth = p.size * u;
        ctx.beginPath();
        ctx.moveTo(p.x * u, gy + p.y * u);
        ctx.lineTo((p.x - p.vx * 0.03) * u, gy + (p.y - p.vy * 0.03) * u);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // the nape slash: a white crescent
      if (s.slash > 0) {
        const k = s.slash;
        const nx = (s.tx + NAPE[0]) * u;
        const ny = gy + NAPE[1] * u;
        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(0.9);
        const r = 110 * u * (1.2 - k * 0.2);
        ctx.fillStyle = `rgba(240,250,255,${(k * 0.85).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.22, 0, 0, TAU);
        ctx.ellipse(0, r * 0.07, r * 0.96, r * 0.13, 0, TAU, 0, true);
        ctx.fill();
        glow(ctx, s.white, 0, 0, 120 * u * k, k);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // falling leaves in front
      for (let i = 0; i < LEAVES; i++) {
        const x = s.leaves[i * 4] * w;
        const y = s.leaves[i * 4 + 1] * h;
        const r = s.leaves[i * 4 + 2] * 4 * u;
        ctx.fillStyle = i % 3 ? '#6d9a4a' : '#a9b85a';
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * Math.abs(Math.sin(s.leaves[i * 4 + 3])) * 0.5 + 0.3, s.leaves[i * 4 + 3], 0, TAU);
        ctx.fill();
      }

      // aim marker on the arm while he waits
      if (env.interactive && s.phase === 0 && s.tState === 0 && s.aimOn) {
        armPoint(s.aimA, AP);
        const ax = AP[0] * u;
        const ay = gy + AP[1] * u;
        const pulse = 1 + Math.sin(t * 6) * 0.1;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = Math.max(1, 1.5 * u);
        ctx.beginPath();
        ctx.arc(ax, ay, 14 * u * pulse, 0, TAU);
        ctx.moveTo(ax - 22 * u, ay);
        ctx.lineTo(ax - 8 * u, ay);
        ctx.moveTo(ax + 8 * u, ay);
        ctx.lineTo(ax + 22 * u, ay);
        ctx.stroke();
        ctx.setLineDash([4 * u, 5 * u]);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(s.lx * u, gy + s.ly * u);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      if (s.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(230,245,255,${(s.flash * 0.28).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      s.idle = 0;
      aim(s, env, x, y);
      attack(s, env, true);
      env.wake(4800);
    },
    onPointerMove: (s, env, x, y) => {
      if (s.phase === 0) aim(s, env, x, y);
    },
    onPointerLeave: (s) => {
      s.aimOn = false;
    },
    onKey: (s, env, e, down) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 's') {
        // slide the grapple point along the arm: W toward the shoulder, S toward the hand
        if (down && s.phase === 0) {
          s.touched = true;
          s.idle = 0;
          s.aimA = clamp(s.aimA + (k === 'w' ? 0.08 : -0.08), 0, 0.8);
          s.aimOn = true;
        }
        return true;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) {
        s.touched = true;
        s.idle = 0;
        attack(s, env, true);
        env.wake(4800);
      }
      return true;
    },
    dispose: (s) => {
      freeCanvas(s.bg, s.fade, s.soft, s.shaft, s.white);
      s.bg = s.fade = null;
    },
  });

/** Steer the grapple: nearest point on the titan's arm to the pointer */
function aim(s: State, env: SceneEnv, x: number, y: number) {
  const u = s.u;
  const wx = x / u;
  const wy = (y - s.gy) / u;
  let best = 0.2;
  let bd = Infinity;
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * 0.8;
    armPoint(a, AP);
    const d = (AP[0] - wx) ** 2 + (AP[1] - wy) ** 2;
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  s.aimA = best;
  s.aimOn = true;
  if (env.reducedMotion) env.wake(200);
}

function drawLevi(c: C, s: State, t: number) {
  const u = s.u;
  c.save();
  c.translate(s.lx * u, s.gy + s.ly * u);
  c.rotate(s.spin);
  c.scale(u * LS, u * LS);
  // local velocity for the cloak, unrotated
  const ca = Math.cos(-s.spin);
  const sa = Math.sin(-s.spin);
  const vx = s.pvx * ca - s.pvy * sa;
  const vy = s.pvx * sa + s.pvy * ca;
  // a pale rim first so he separates from the dark trunks
  c.save();
  c.translate(-0.7, -0.7);
  leviFigure(c, s, 'rgba(250,255,220,0.8)', vx, vy, t);
  c.restore();
  leviFigure(c, s, null, vx, vy, t);
  c.restore();
}
