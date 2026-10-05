import { clamp, damp, lerp, TAU } from './runtime';
import type { Pool } from './heroes-kit';

/**
 * Chainsaw Man figure shared by the Chainsaw Man and Reze scenes: Denji in his devil form,
 * posed from a joint set. Orange shark-like chainsaw head with the bar jutting from the
 * forehead, a mouth packed with jagged teeth and small dark eyes; chainsaws bursting out of
 * both forearms; the starter cord hanging from his chest; white shirt with rolled sleeves,
 * black tie, black trousers and shoes. Drawn facing right with the feet at the origin, in
 * scene units (he stands about 250 units tall). A flat colour paints a single tone
 * silhouette for rim light and afterimages.
 */

type C = CanvasRenderingContext2D;

/* joints relative to the feet, x, y pairs:
   0 pelvis, 2 chest, 4 head, 6 near elbow, 8 near hand, 10 far elbow, 12 far hand,
   14 near knee, 16 near foot, 18 far knee, 20 far foot */
export type Pose = readonly number[];

/** Loose ready stance, saws held forward */
export const STANCE: Pose = [0, -112, 10, -186, 24, -222, 40, -150, 80, -164, -8, -152, 30, -182, 26, -58, 42, 0, -14, -60, -34, 0];
/** Crouched rev, both saws thrown up in a V */
export const REV: Pose = [0, -98, 16, -170, 32, -204, 48, -148, 74, -196, -18, -156, -26, -204, 36, -52, 56, 0, -24, -50, -48, 0];
/** Airborne, both saws raised high over the head */
export const OVERHEAD: Pose = [0, -116, 2, -192, 16, -226, 2, -250, -24, -290, -18, -240, -46, -280, 32, -84, 12, -46, -8, -72, -32, -42];
/** Both saws carved down through the target, body folded forward */
export const CUT: Pose = [0, -104, 28, -170, 48, -196, 54, -134, 84, -102, 32, -132, 66, -96, 30, -60, 44, -10, -20, -58, -34, -16];
/** Low dash, near saw leading */
export const LUNGE: Pose = [0, -100, 36, -164, 58, -190, 68, -142, 108, -142, 26, -152, 62, -170, 42, -60, 66, -8, -30, -64, -80, -30];
/** Follow through after a horizontal cut: one saw swung low, the other high */
export const SLASH: Pose = [0, -100, 34, -166, 56, -194, 58, -134, 92, -96, 58, -192, 98, -208, 50, -54, 80, 0, -30, -46, -74, 0];
/** Landing crouch */
export const LAND: Pose = [0, -78, 24, -146, 44, -174, 56, -110, 92, -88, 16, -112, 54, -78, 46, -44, 44, 0, -26, -24, -62, 0];

export function blendPose(out: number[], a: Pose, b: Pose, k: number) {
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * k;
}

/** Live bits of Denji that animate on their own: chains, cord, tie and jaw */
export interface DenjiLook {
  chain: number;
  rev: number;
  cordX: number;
  cordY: number;
  cvx: number;
  cvy: number;
  tie: number;
  jaw: number;
}

export function makeLook(): DenjiLook {
  return { chain: 0, rev: 0, cordX: 0, cordY: 34, cvx: 0, cvy: 0, tie: 0.2, jaw: 0 };
}

/** Spring the cord, flutter the tie and open the jaw; drag pushes the cord (units/s^2) */
export function stepLook(l: DenjiLook, dt: number, dragX: number, dragY: number, tieTarget: number, jawTarget: number) {
  const ax = -l.cordX * 60 - l.cvx * 6 + dragX;
  const ay = (34 - l.cordY) * 60 - l.cvy * 6 + dragY;
  l.cvx += ax * dt;
  l.cvy += ay * dt;
  l.cordX += l.cvx * dt;
  l.cordY += l.cvy * dt;
  const len = Math.hypot(l.cordX, l.cordY);
  if (len > 38) {
    l.cordX *= 38 / len;
    l.cordY *= 38 / len;
  }
  l.tie = damp(l.tie, tieTarget, 10, dt);
  l.jaw = damp(l.jaw, jawTarget, 14, dt);
}

/* ---------- palette ---------- */

const INK = '#120a0c';
const SKIN = ['#8c5a48', '#e1b49a', '#f6d9c4'];
const SKIN_FAR = ['#5e3a2e', '#a77d68', '#c39a84'];
const SHIRT = ['#9d9ca6', '#ecebe6', '#ffffff'];
const SHIRT_FAR = ['#6e6d78', '#b4b3b2', '#d4d3d0'];
const PANTS = ['#060609', '#15151c', '#33333f'];
const PANTS_FAR = ['#040406', '#0d0d12', '#22222b'];
const HEAD = ['#4a1006', '#a7300f', '#e2541c', '#ff9a52'];
const BLOOD = '#b3091a';
/** Angle of the forehead bar in head space */
const HEAD_BAR = -1.18;
const BLOOD_DARK = '#5c0410';

/* ---------- primitives ---------- */

/** Capsule from (x0,y0) radius r0 to (x1,y1) radius r1 */
export function capsule(c: C, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  c.beginPath();
  c.moveTo(x0 + nx * r0, y0 + ny * r0);
  c.lineTo(x1 + nx * r1, y1 + ny * r1);
  c.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2, true);
  c.lineTo(x0 - nx * r0, y0 - ny * r0);
  c.arc(x0, y0, r0, a - Math.PI / 2, a + Math.PI / 2, true);
  c.closePath();
}

/** Shaded limb segment: outline, base, a light stripe along the upper edge and a shadow below */
export function seg(c: C, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, pal: string[], flat: string | null) {
  capsule(c, x0, y0, x1, y1, r0, r1);
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    return;
  }
  c.fillStyle = pal[1];
  c.fill();
  c.lineWidth = 2.2;
  c.strokeStyle = INK;
  c.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  let nx = -Math.sin(a);
  let ny = Math.cos(a);
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  // shadow on the underside
  c.save();
  capsule(c, x0, y0, x1, y1, r0 - 1.1, r1 - 1.1);
  c.clip();
  c.strokeStyle = pal[0];
  c.lineWidth = Math.max(r0, r1) * 0.9;
  c.beginPath();
  c.moveTo(x0 - nx * r0 * 0.95, y0 - ny * r0 * 0.95);
  c.lineTo(x1 - nx * r1 * 0.95, y1 - ny * r1 * 0.95);
  c.stroke();
  c.strokeStyle = pal[2];
  c.lineWidth = Math.max(1.4, Math.min(r0, r1) * 0.42);
  c.beginPath();
  c.moveTo(x0 + nx * r0 * 0.5, y0 + ny * r0 * 0.5);
  c.lineTo(x1 + nx * r1 * 0.5, y1 + ny * r1 * 0.5);
  c.stroke();
  c.restore();
}

/** Irregular blood splotch */
export function splotch(c: C, x: number, y: number, r: number, seed: number) {
  c.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const k = 0.65 + 0.35 * Math.abs(Math.sin(seed * 7.3 + i * 2.1));
    const px = x + Math.cos(a) * r * k;
    const py = y + Math.sin(a) * r * k * 0.8;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
}

/* ---------- the chainsaw bar ---------- */

/**
 * Chainsaw bar from (x,y) along angle a: steel bar with a rounded nose, the chain racing
 * around it at phase ph; past half rev the teeth smear into a hot blur.
 */
export function chainsaw(c: C, x: number, y: number, a: number, len: number, r: number, ph: number, rev: number, flat: string | null) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  const outer = r + 2.6;
  c.beginPath();
  c.moveTo(0, -outer);
  c.lineTo(len, -outer);
  c.arc(len, 0, outer, -Math.PI / 2, Math.PI / 2);
  c.lineTo(0, outer);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = flat;
    c.stroke();
    c.restore();
    return;
  }
  // chain band
  c.fillStyle = '#23242b';
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = INK;
  c.stroke();
  // steel bar
  c.beginPath();
  c.moveTo(0, -r);
  c.lineTo(len, -r);
  c.arc(len, 0, r, -Math.PI / 2, Math.PI / 2);
  c.lineTo(0, r);
  c.closePath();
  const g = c.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#f4f7fb');
  g.addColorStop(0.3, '#c3c9d4');
  g.addColorStop(0.65, '#8a909c');
  g.addColorStop(1, '#4b505b');
  c.fillStyle = g;
  c.fill();
  // groove and rivets
  c.strokeStyle = 'rgba(40,44,54,0.55)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(6, r * 0.35);
  c.lineTo(len - 4, r * 0.35);
  c.stroke();
  c.fillStyle = '#3a3e48';
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(10 + i * 12, -r * 0.2, 1.5, 0, TAU);
    c.fill();
  }
  // teeth: hooked cutters all the way round
  const per = 2 * len + Math.PI * outer;
  const gap = 8;
  const blur = clamp((rev - 0.55) * 2.2, 0, 1);
  const p0 = ((ph % gap) + gap) % gap;
  c.fillStyle = blur > 0.5 ? 'rgba(225,230,238,0.55)' : '#e4e8ef';
  c.strokeStyle = INK;
  c.lineWidth = 0.9;
  c.beginPath();
  for (let d = p0; d < per; d += gap) {
    let px: number;
    let py: number;
    let nx: number;
    let ny: number;
    if (d < len) {
      px = d;
      py = -outer;
      nx = 0;
      ny = -1;
    } else if (d < len + Math.PI * outer) {
      const th = -Math.PI / 2 + (d - len) / outer;
      nx = Math.cos(th);
      ny = Math.sin(th);
      px = len + nx * outer;
      py = ny * outer;
    } else {
      px = len - (d - len - Math.PI * outer);
      py = outer;
      nx = 0;
      ny = 1;
    }
    const tx = -ny;
    const ty = nx;
    const hgt = 5.2;
    c.moveTo(px - tx * 2.8, py - ty * 2.8);
    c.lineTo(px + nx * hgt + tx * 2.2, py + ny * hgt + ty * 2.2);
    c.lineTo(px + nx * 1.4 + tx * 2.8, py + ny * 1.4 + ty * 2.8);
    c.closePath();
  }
  c.fill();
  if (blur < 0.5) c.stroke();
  if (blur > 0) {
    c.strokeStyle = `rgba(255,196,120,${(blur * 0.75).toFixed(3)})`;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -outer - 3);
    c.lineTo(len, -outer - 3);
    c.arc(len, 0, outer + 3, -Math.PI / 2, Math.PI / 2);
    c.lineTo(0, outer + 3);
    c.stroke();
    c.strokeStyle = `rgba(255,250,235,${(blur * 0.6).toFixed(3)})`;
    c.lineWidth = 1.2;
    c.stroke();
  }
  c.restore();
}

/* ---------- head ---------- */

function head(c: C, l: DenjiLook, x: number, y: number, a: number, flat: string | null) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  // the bar out of the forehead, under the skull so the skull covers its root
  chainsaw(c, 4, -26, HEAD_BAR, 88, 7.5, l.chain * 1.15, l.rev, flat);
  const jaw = l.jaw * 10;
  // skull: a long, flat topped engine housing with a shark snout and a heavy jaw
  c.beginPath();
  c.moveTo(-24, 6);
  c.bezierCurveTo(-29, -8, -24, -28, -8, -31);
  c.lineTo(20, -30);
  c.quadraticCurveTo(36, -28, 42, -14);
  c.lineTo(51, -4);
  c.quadraticCurveTo(53, 2, 47, 6);
  c.lineTo(46, 12 + jaw * 0.5);
  c.quadraticCurveTo(43, 24 + jaw, 24, 26 + jaw);
  c.lineTo(-2, 25 + jaw * 0.6);
  c.quadraticCurveTo(-20, 21, -24, 6);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
    c.restore();
    return;
  }
  const g = c.createLinearGradient(26, -32, -10, 24);
  g.addColorStop(0, HEAD[3]);
  g.addColorStop(0.3, HEAD[2]);
  g.addColorStop(0.75, HEAD[1]);
  g.addColorStop(1, HEAD[0]);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 2.4;
  c.strokeStyle = INK;
  c.stroke();
  c.save();
  c.clip();
  // engine seams: a ridge along the crown and cooling slits on the side
  c.strokeStyle = 'rgba(70,14,4,0.75)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-22, -16);
  c.quadraticCurveTo(4, -24, 34, -22);
  for (let i = 0; i < 3; i++) {
    c.moveTo(-18 + i * 2, -6 + i * 5);
    c.lineTo(-4 + i * 1, -8 + i * 5);
  }
  c.stroke();
  c.strokeStyle = 'rgba(255,200,140,0.5)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(-22, -18);
  c.quadraticCurveTo(4, -26, 34, -24);
  c.stroke();
  // shadow under the cheek
  c.fillStyle = 'rgba(60,10,4,0.35)';
  c.beginPath();
  c.ellipse(-14, 12, 16, 12, 0.3, 0, TAU);
  c.fill();
  c.restore();
  // collar where the bar meets the head
  c.fillStyle = '#2b2d34';
  c.beginPath();
  c.ellipse(3, -30, 7.5, 4, HEAD_BAR + Math.PI / 2, 0, TAU);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1.2;
  c.stroke();

  // mouth: a long shark slit from the snout back past the cheek
  const x0 = -12;
  const x1 = 47;
  const top = (k: number) => lerp(1, -3, k);
  const bot = (k: number) => lerp(12, 13, k) + jaw * (0.3 + 0.7 * k);
  c.fillStyle = '#2a0306';
  c.beginPath();
  c.moveTo(x0, 6);
  for (let i = 0; i <= 8; i++) c.lineTo(lerp(x0, x1, i / 8), top(i / 8));
  for (let i = 8; i >= 0; i--) c.lineTo(lerp(x0, x1, i / 8), bot(i / 8));
  c.closePath();
  c.fill();
  if (jaw > 1) {
    c.fillStyle = '#7a0e14';
    c.beginPath();
    c.ellipse(20, (top(0.6) + bot(0.6)) / 2 + 1, 14, jaw * 0.32, 0, 0, TAU);
    c.fill();
  }
  // two rows of jagged teeth that interlock when the jaw is shut
  c.fillStyle = '#fff8ec';
  c.strokeStyle = INK;
  c.lineWidth = 0.8;
  c.beginPath();
  const n = 12;
  for (let i = 0; i < n; i++) {
    const k0 = i / n;
    const k1 = (i + 1) / n;
    const km = (k0 + k1) / 2;
    const len = 6.2 + (i % 3) * 1.6 + km * 2;
    c.moveTo(lerp(x0, x1, k0), top(k0) - 0.6);
    c.lineTo(lerp(x0, x1, km) + 0.6, top(km) + len);
    c.lineTo(lerp(x0, x1, k1), top(k1) - 0.6);
    const lk = Math.min(1, km + 0.5 / n);
    c.moveTo(lerp(x0, x1, lk - 0.5 / n), bot(lk) + 0.6);
    c.lineTo(lerp(x0, x1, lk) + 0.4, bot(lk) - len * 0.9);
    c.lineTo(lerp(x0, x1, Math.min(1, lk + 0.5 / n)), bot(lk) + 0.6);
  }
  c.fill();
  c.stroke();
  // corner of the mouth
  c.strokeStyle = INK;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(x0 - 1, 6);
  c.quadraticCurveTo(x0 - 4, 4, x0 - 3, 1);
  c.stroke();
  // eyes: small, round and dark with a pin of light, set high on the snout
  c.fillStyle = '#5c1608';
  c.beginPath();
  c.ellipse(21, -12, 6.6, 5.6, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#0a0304';
  c.beginPath();
  c.arc(22, -12, 4.1, 0, TAU);
  c.arc(39, -12.5, 2.4, 0, TAU);
  c.fill();
  c.fillStyle = '#fff2dc';
  c.beginPath();
  c.arc(23.2, -13.4, 1.25, 0, TAU);
  c.arc(39.5, -13.4, 0.7, 0, TAU);
  c.fill();
  // brow ridge
  c.strokeStyle = INK;
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(13, -18);
  c.quadraticCurveTo(22, -21, 31, -17);
  c.stroke();
  c.restore();
}

/* ---------- arms ---------- */

function arm(
  c: C,
  l: DenjiLook,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  hx: number,
  hy: number,
  far: boolean,
  flat: string | null
) {
  const shirt = far ? SHIRT_FAR : SHIRT;
  const skin = far ? SKIN_FAR : SKIN;
  const fa = Math.atan2(hy - ey, hx - ex);
  const fx = Math.cos(fa);
  const fy = Math.sin(fa);
  // upper arm in the sleeve, then the rolled cuff
  seg(c, sx, sy, ex, ey, 9.5, 8, shirt, flat);
  seg(c, ex, ey, hx, hy, 7, 5.8, skin, flat);
  // fist
  c.beginPath();
  c.arc(hx + fx * 3, hy + fy * 3, 6.4, 0, TAU);
  if (flat) {
    c.fillStyle = flat;
    c.fill();
  } else {
    c.fillStyle = skin[1];
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
  }
  // the saw bursts out of the back of the forearm and runs past the fist
  let nx = -fy;
  let ny = fx;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const rx = ex + fx * 20 + nx * 7;
  const ry = ey + fy * 20 + ny * 7;
  chainsaw(c, rx, ry, fa, 114, 8.5, l.chain, l.rev, flat);
  if (flat) {
    seg(c, ex - fx * 4, ey - fy * 4, ex + fx * 8, ey + fy * 8, 10.5, 10, shirt, flat);
    return;
  }
  // torn skin and blood where it comes out
  c.fillStyle = BLOOD_DARK;
  c.beginPath();
  c.ellipse(rx + fx * 2, ry + fy * 2, 7, 10.5, fa, 0, TAU);
  c.fill();
  c.fillStyle = skin[1];
  c.strokeStyle = INK;
  c.lineWidth = 1.4;
  c.beginPath();
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    const off = (k - 0.5) * 22;
    const jag = i % 2 ? 6 : 1.5;
    const px = rx - fx * 2 + nx * off + fx * jag;
    const py = ry - fy * 2 + ny * off + fy * jag;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.lineTo(rx - fx * 8 - nx * 11, ry - fy * 8 - ny * 11);
  c.lineTo(rx - fx * 8 + nx * 11, ry - fy * 8 + ny * 11);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = BLOOD;
  splotch(c, rx + fx * 4 - nx * 5, ry + fy * 4 - ny * 5, 3.5, ex);
  // a drip running down the forearm
  c.strokeStyle = BLOOD;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(rx - nx * 6, ry - ny * 6);
  c.quadraticCurveTo(rx - nx * 8 - fx * 6, ry - ny * 8 - fy * 6, rx - nx * 9 - fx * 2, ry - ny * 9 + 10);
  c.stroke();
  // rolled cuff over the elbow
  seg(c, ex - fx * 3, ey - fy * 3, ex + fx * 4, ey + fy * 4, 9.4, 9, shirt, null);
  c.strokeStyle = shirt[0];
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(ex + nx * 9, ey + ny * 9);
  c.lineTo(ex - nx * 9, ey - ny * 9);
  c.stroke();
}

/* ---------- the whole figure ---------- */

/**
 * Denji at the current pose J (see Pose), drawn with the feet at the origin facing right.
 * Returns nothing; use bladeTip to find where a saw ends for sparks.
 */
export function drawDenji(c: C, J: readonly number[], l: DenjiLook, flat: string | null) {
  const px = J[0];
  const py = J[1];
  const cx = J[2];
  const cy = J[3];
  const tl = Math.hypot(cx - px, cy - py) || 1;
  // torso axis (up) and its front normal
  const dx = (cx - px) / tl;
  const dy = (cy - py) / tl;
  const nx = -dy;
  const ny = dx;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // far leg
  const fhx = px - nx * 6;
  const fhy = py - ny * 6;
  seg(c, fhx, fhy, J[18], J[19], 11, 8.5, PANTS_FAR, flat);
  seg(c, J[18], J[19], J[20], J[21] - 6, 8.5, 6.6, PANTS_FAR, flat);
  shoe(c, J[20], J[21], flat);

  // far arm and its saw
  const fsx = cx - nx * 7 + dx * 2;
  const fsy = cy - ny * 7 + dy * 2;
  arm(c, l, fsx, fsy, J[10], J[11], J[12], J[13], true, flat);

  // near leg
  const nhx = px + nx * 5;
  const nhy = py + ny * 5;
  seg(c, nhx, nhy, J[14], J[15], 11.5, 9, PANTS, flat);
  seg(c, J[14], J[15], J[16], J[17] - 6, 9, 7, PANTS, flat);
  shoe(c, J[16], J[17], flat);

  // hips
  seg(c, px - nx * 9, py - ny * 9 + 2, px + nx * 9, py + ny * 9 + 2, 13, 13, PANTS, flat);

  // torso: the white shirt
  const sh = 21;
  const wa = 15;
  c.beginPath();
  c.moveTo(cx + dx * 10 - nx * 14, cy + dy * 10 - ny * 14);
  c.quadraticCurveTo(cx + dx * 12 + nx * 6, cy + dy * 12 + ny * 6, cx + nx * sh, cy + ny * sh);
  c.quadraticCurveTo(lerp(cx, px, 0.5) + nx * (sh + 2), lerp(cy, py, 0.5) + ny * (sh + 2), px + nx * wa, py + ny * wa);
  c.lineTo(px - nx * wa, py - ny * wa);
  c.quadraticCurveTo(lerp(cx, px, 0.5) - nx * (sh - 2), lerp(cy, py, 0.5) - ny * (sh - 2), cx - nx * sh, cy - ny * sh);
  c.closePath();
  if (flat) {
    c.fillStyle = flat;
    c.fill();
  } else {
    const g = c.createLinearGradient(cx + nx * sh, cy + ny * sh, cx - nx * sh, cy - ny * sh);
    g.addColorStop(0, SHIRT[2]);
    g.addColorStop(0.45, SHIRT[1]);
    g.addColorStop(1, SHIRT[0]);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2.4;
    c.stroke();
    c.save();
    c.clip();
    // folds pulling toward the belt
    c.strokeStyle = 'rgba(110,108,120,0.6)';
    c.lineWidth = 1.4;
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const o = -8 + i * 8;
      c.moveTo(lerp(cx, px, 0.25) + nx * o, lerp(cy, py, 0.25) + ny * o);
      c.quadraticCurveTo(lerp(cx, px, 0.6) + nx * (o + 4), lerp(cy, py, 0.6) + ny * (o + 4), px + nx * (o * 0.6), py + ny * (o * 0.6));
    }
    c.stroke();
    // button placket
    c.strokeStyle = 'rgba(150,148,160,0.8)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx + nx * 15, cy + ny * 15);
    c.lineTo(px + nx * 12, py + ny * 12);
    c.stroke();
    // blood sprayed across the shirt
    c.fillStyle = BLOOD;
    splotch(c, lerp(cx, px, 0.3) + nx * 10, lerp(cy, py, 0.3) + ny * 10, 5.5, 1);
    splotch(c, lerp(cx, px, 0.55) + nx * 4, lerp(cy, py, 0.55) + ny * 4, 3, 2);
    splotch(c, lerp(cx, px, 0.15) - nx * 4, lerp(cy, py, 0.15) - ny * 4, 2.4, 3);
    splotch(c, lerp(cx, px, 0.75) + nx * 14, lerp(cy, py, 0.75) + ny * 14, 2.2, 4);
    c.restore();
    // belt
    capsule(c, px - nx * wa, py - ny * wa + 1, px + nx * wa, py + ny * wa + 1, 3.4, 3.4);
    c.fillStyle = '#0b0a0e';
    c.fill();
    c.fillStyle = '#b2a37a';
    c.fillRect(px + nx * 9 - 2.5, py + ny * 9 - 2.5, 5, 6);
  }

  // neck
  const hx = J[4];
  const hy = J[5];
  const nbx = cx + dx * 8 + nx * 4;
  const nby = cy + dy * 8 + ny * 4;
  seg(c, nbx, nby, lerp(nbx, hx, 0.75), lerp(nby, hy, 0.75), 7, 6.5, SKIN, flat);

  if (!flat) {
    // collar points
    c.fillStyle = SHIRT[2];
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    for (const side of [1, -1]) {
      c.beginPath();
      c.moveTo(nbx + nx * 7 * side - dx * 1, nby + ny * 7 * side - dy * 1);
      c.lineTo(nbx + nx * (side > 0 ? 14 : -10) - dx * 9, nby + ny * (side > 0 ? 14 : -10) - dy * 9);
      c.lineTo(nbx + nx * 2, nby + ny * 2 - dy * 4 - 4);
      c.closePath();
      c.fill();
      c.stroke();
    }
    // tie: knot at the collar, the blade swinging off the chest
    const kx = nbx + nx * 9 - dx * 7;
    const ky = nby + ny * 9 - dy * 7;
    const ta = Math.atan2(-dy, -dx) + l.tie;
    const tl2 = 54;
    const ex = kx + Math.cos(ta) * tl2;
    const ey = ky + Math.sin(ta) * tl2;
    const tnx = -Math.sin(ta);
    const tny = Math.cos(ta);
    c.fillStyle = '#0b0a0f';
    c.beginPath();
    c.moveTo(kx - tnx * 3.5, ky - tny * 3.5);
    c.lineTo(kx + tnx * 3.5, ky + tny * 3.5);
    c.lineTo(lerp(kx, ex, 0.85) + tnx * 6, lerp(ky, ey, 0.85) + tny * 6);
    c.lineTo(ex, ey);
    c.lineTo(lerp(kx, ex, 0.85) - tnx * 6, lerp(ky, ey, 0.85) - tny * 6);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = '#18171e';
    c.beginPath();
    c.ellipse(kx, ky, 4.5, 4, ta, 0, TAU);
    c.fill();
  }

  // starter cord out of the chest, T handle swinging on it
  const ax = lerp(cx, px, 0.35) + nx * (sh - 1);
  const ay = lerp(cy, py, 0.35) + ny * (sh - 1);
  const gx = ax + l.cordX;
  const gy = ay + l.cordY;
  c.strokeStyle = flat ?? '#1b1a1f';
  c.lineWidth = 2.2;
  c.beginPath();
  c.moveTo(ax, ay);
  c.quadraticCurveTo(lerp(ax, gx, 0.5) - l.cordX * 0.2, lerp(ay, gy, 0.5) + 8, gx, gy);
  c.stroke();
  if (!flat) {
    c.fillStyle = BLOOD_DARK;
    c.beginPath();
    c.arc(ax, ay, 4.2, 0, TAU);
    c.fill();
    c.fillStyle = '#2a2a30';
    c.beginPath();
    c.arc(ax, ay, 2.6, 0, TAU);
    c.fill();
  }
  c.save();
  c.translate(gx, gy);
  c.rotate(Math.atan2(l.cordY, l.cordX) - Math.PI / 2);
  c.beginPath();
  c.moveTo(-10, 0);
  c.lineTo(10, 0);
  c.quadraticCurveTo(12, 3.5, 9, 6.5);
  c.lineTo(-9, 6.5);
  c.quadraticCurveTo(-12, 3.5, -10, 0);
  c.closePath();
  c.fillStyle = flat ?? '#1f1d24';
  c.fill();
  if (!flat) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.stroke();
    c.fillStyle = '#5a5866';
    c.fillRect(-8, 1, 16, 1.6);
  }
  c.restore();

  // head on top of the neck, tilted with the torso
  head(c, l, hx, hy, Math.atan2(dy, dx) + Math.PI / 2 + 0.08, flat);

  // near arm and its saw
  const nsx = cx + nx * 6 + dx * 2;
  const nsy = cy + ny * 6 + dy * 2;
  arm(c, l, nsx, nsy, J[6], J[7], J[8], J[9], false, flat);
}

function shoe(c: C, x: number, y: number, flat: string | null) {
  c.beginPath();
  c.moveTo(x - 8, y - 9);
  c.quadraticCurveTo(x + 4, y - 11, x + 16, y - 4);
  c.quadraticCurveTo(x + 18, y, x + 14, y + 0.5);
  c.lineTo(x - 9, y + 0.5);
  c.quadraticCurveTo(x - 11, y - 4, x - 8, y - 9);
  c.closePath();
  c.fillStyle = flat ?? '#08080b';
  c.fill();
  if (!flat) {
    c.strokeStyle = '#4a4a58';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x - 4, y - 8);
    c.quadraticCurveTo(x + 6, y - 9, x + 13, y - 4);
    c.stroke();
  }
}

/** Where a saw ends (in pose space): 0 near arm, 1 far arm, 2 head. Writes [x, y, angle] */
export function bladeTip(J: readonly number[], which: number, out: number[]) {
  if (which === 2) {
    const dx = J[2] - J[0];
    const dy = J[3] - J[1];
    const a = Math.atan2(dy, dx) + Math.PI / 2 + 0.08;
    const ba = a + HEAD_BAR;
    const rx = J[4] + Math.cos(a) * 4 - Math.sin(a) * -26;
    const ry = J[5] + Math.sin(a) * 4 + Math.cos(a) * -26;
    out[0] = rx + Math.cos(ba) * 90;
    out[1] = ry + Math.sin(ba) * 90;
    out[2] = ba;
    return;
  }
  const e = which === 0 ? 6 : 10;
  const ex = J[e];
  const ey = J[e + 1];
  const a = Math.atan2(J[e + 3] - ey, J[e + 2] - ex);
  out[0] = ex + Math.cos(a) * 138;
  out[1] = ey + Math.sin(a) * 138;
  out[2] = a;
}

/* ---------- blood ---------- */

/**
 * Blood drops from a particle pool, drawn in the current transform: each drop is a
 * stretched bead along its velocity with a bright core, so sprays read as streaks.
 */
export function drawBlood(c: C, pool: Pool, kind: number, scale: number, ox = 0, oy = 0) {
  for (const p of pool.items) {
    if (p.life <= 0 || p.kind !== kind) continue;
    const k = p.life / p.max;
    const sp = Math.hypot(p.vx, p.vy);
    const st = 1 + Math.min(3, sp * 0.004 / Math.max(0.2, scale));
    const r = p.size * scale;
    const a = Math.atan2(p.vy, p.vx);
    c.globalAlpha = Math.min(1, k * 2.2);
    c.save();
    c.translate(ox + p.x * scale, oy + p.y * scale);
    c.rotate(a);
    c.fillStyle = BLOOD_DARK;
    c.beginPath();
    c.ellipse(-r * (st - 1) * 0.5, 0, r * st, r, 0, 0, TAU);
    c.fill();
    c.fillStyle = BLOOD;
    c.beginPath();
    c.ellipse(-r * (st - 1) * 0.4, -r * 0.15, r * st * 0.8, r * 0.7, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  c.globalAlpha = 1;
}

export const BLOOD_RED = BLOOD;
export const BLOOD_DEEP = BLOOD_DARK;
