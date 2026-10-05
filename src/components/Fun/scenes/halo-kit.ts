import { clamp, lerp, TAU } from './runtime';
import { capsule, rpoly } from './games-kit';
import type { Painter } from './games-kit';

export { rpoly };

/**
 * Shared pieces for the Halo scenes: the Master Chief figure (MJOLNIR armour, gold visor,
 * MA5 rifle) on a small two-bone rig, the frame helpers it is painted with, and the ring.
 * The figure is drawn in design units with its origin between the feet, facing right.
 */

/* ---------- palette ---------- */

export const GREEN = ['#b9c884', '#5d6d36', '#232c13'] as const;
export const GREEN_D = ['#8d9c60', '#435026', '#171d0d'] as const;
export const SUIT = ['#646973', '#2b2e35', '#101115'] as const;
export const SUIT_D = ['#474a52', '#1e2025', '#0a0b0d'] as const;
export const METAL = ['#a9ad9c', '#545849', '#1d1f19'] as const;
export const METAL_D = ['#7d8072', '#3c3f34', '#141511'] as const;
export const GUN = ['#8f949e', '#3d4149', '#141519'] as const;
export const GUN_D = ['#646872', '#2b2d33', '#0e0f12'] as const;
export const SEAM = 'rgba(12,18,6,0.8)';
export const SPEC = 'rgba(238,250,200,0.72)';

/* ---------- rig ---------- */

export interface Arm {
  a1: number;
  a2: number;
}

export const newArm = (a1: number, a2: number): Arm => ({ a1, a2 });

export const U_ARM = 60;
export const F_ARM = 56;
/** Hip height above the feet; the legs are long and the stance only slightly flexed */
export const PELVIS = 178;
const THIGH = 88;
const SHIN = 84;
/**
 * Shoulders in the torso frame (origin at the pelvis). He faces right in a three quarter
 * turn, so the near (right) shoulder sits back on the left and the far one peeks out front.
 */
export const NSH = [-26, -126] as const;
export const FSH = [50, -130] as const;
/** Where the hands sit on the rifle, in its own frame */
export const HANDGUARD = [70, 12] as const;
export const GRIP = [-4, 16] as const;
/** Helmet pivot in the torso frame */
export const HEAD = [20, -178] as const;
/** The helmet is kept compact against the broad chest */
const HELM_K = 0.9;

/** Two-bone IK: joint position bending toward +bend on x */
export function knee(hx: number, hy: number, fx: number, fy: number, l1: number, l2: number, bend: number) {
  const dx = fx - hx;
  const dy = fy - hy;
  const d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.01);
  const a = Math.atan2(dy, dx);
  const c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const off = Math.acos(c) * -bend;
  return [hx + Math.cos(a + off) * l1, hy + Math.sin(a + off) * l1] as const;
}

/** Two-bone arm reaching from (sx, sy) to (tx, ty); bend -1 drops the elbow */
export function reach(out: Arm, sx: number, sy: number, tx: number, ty: number, bend = -1) {
  const [ex, ey] = knee(sx, sy, tx, ty, U_ARM, F_ARM, bend);
  out.a1 = Math.atan2(ey - sy, ex - sx);
  out.a2 = Math.atan2(ty - ey, tx - ex);
}

export function setArm(out: Arm, a: Arm, b: Arm, k: number) {
  out.a1 = lerp(a.a1, b.a1, k);
  out.a2 = lerp(a.a2, b.a2, k);
}

/** Hand position of an arm hung from (sx, sy) */
export function handOf(sx: number, sy: number, a: Arm) {
  const ex = sx + Math.cos(a.a1) * U_ARM;
  const ey = sy + Math.sin(a.a1) * U_ARM;
  return [ex + Math.cos(a.a2) * F_ARM, ey + Math.sin(a.a2) * F_ARM] as const;
}

/* ---------- frame helpers ---------- */

/**
 * Paint inside a frame laid along the segment (x1,y1) to (x2,y2): local +x runs down the
 * segment, local -y is the limb's front. The painter's lights are counter-rotated so the
 * rim and core shadow stay put in the world.
 */
export function seg(p: Painter, x1: number, y1: number, x2: number, y2: number, fn: (L: number) => void) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  frame(p, x1, y1, a, 1, () => fn(Math.hypot(x2 - x1, y2 - y1)));
}

/** Paint in a frame at (x, y) turned by angle a and scaled by k, keeping the lights fixed */
export function frame(p: Painter, x: number, y: number, a: number, k: number, fn: () => void) {
  const ctx = p.ctx;
  const { lx, ly, bx, by } = p;
  const c = Math.cos(-a);
  const sn = Math.sin(-a);
  p.lx = lx * c - ly * sn;
  p.ly = lx * sn + ly * c;
  p.bx = bx * c - by * sn;
  p.by = bx * sn + by * c;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(k, k);
  fn();
  ctx.restore();
  p.lx = lx;
  p.ly = ly;
  p.bx = bx;
  p.by = by;
}

/** Stroke a seam or specular line, skipped in the glow pass */
export function line(p: Painter, color: string, width: number, trace: () => void) {
  if (p.glow) return;
  const ctx = p.ctx;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  trace();
  ctx.stroke();
}

/* ---------- the Spartan ---------- */

export interface ChiefPose {
  /** Pelvis drop */
  crouch: number;
  /** Torso tilt in radians, forward is positive */
  lean: number;
  /** Breathing offset for the chest */
  br: number;
  /** Near (right) and far (left) arms in the torso frame */
  front: Arm;
  back: Arm;
  /** Rifle grip in the torso frame and its angle; slung puts it on the back */
  gripX: number;
  gripY: number;
  rifleA: number;
  rifleK: number;
  slung: boolean;
  /** Helmet turn in radians */
  look: number;
  /** Extra spread of the feet */
  stride: number;
  /** Skip the legs (seated in a vehicle, hidden behind a hull) */
  noLegs?: boolean;
  /** Foot positions [front x, front y, back x, back y] overriding the stance */
  feet?: readonly number[];
  /** Hide the rifle entirely */
  noRifle?: boolean;
}

export interface ChiefHooks {
  /** Painted in the near hand, over the arm and under the pauldron (torso frame) */
  nearHand?: (hx: number, hy: number, a2: number) => void;
  /** Painted in the far hand before the chest covers it (torso frame) */
  farHand?: (hx: number, hy: number, a2: number) => void;
  /** Painted on the visor after it is shaded, in the helmet frame */
  visor?: () => void;
}

/** Set the painter up with the Chief's key light, back light and ink */
export function chiefLights(p: Painter) {
  p.lx = 0.72;
  p.ly = -0.69;
  p.bx = -0.94;
  p.by = -0.34;
  p.backW = 2.6;
  p.back = 'rgba(184,170,255,0.9)';
  p.outline = 'rgba(9,11,5,0.92)';
  p.outlineW = 1.7;
}

export function chiefFigure(p: Painter, pose: ChiefPose, t: number, hooks: ChiefHooks = {}) {
  const ctx = p.ctx;
  chiefLights(p);
  const pelvisY = -PELVIS + pose.crouch;
  const br = pose.br;

  if (!pose.noLegs) {
    // a relaxed three quarter stance: the far foot sits a touch higher, further from us
    const fHip = [24, pelvisY + 10] as const;
    const bHip = [-20, pelvisY + 8] as const;
    const ft = pose.feet;
    const fFoot = ft ? ([ft[0], ft[1]] as const) : ([44 + pose.stride, 0] as const);
    const bFoot = ft ? ([ft[2], ft[3]] as const) : ([-38 - pose.stride * 0.6, -5] as const);
    leg(p, bHip, bFoot, true);
    // thigh tops vanish under the belt and hip plates drawn with the torso
    ctx.save();
    ctx.translate(0, pelvisY);
    ctx.rotate(pose.lean * 0.35);
    hips(p);
    ctx.restore();
    leg(p, fHip, fFoot, false);
  }

  ctx.save();
  ctx.translate(0, pelvisY);
  ctx.rotate(pose.lean);

  if (pose.slung && !pose.noRifle) rifle(p, -40, -84 + br, -2.05, 0.92, true);

  // far arm and pauldron sit behind the chest
  const fsy = FSH[1] + br;
  arm(p, FSH[0], fsy, pose.back, true);
  if (hooks.farHand) {
    const [hx, hy] = handOf(FSH[0], fsy, pose.back);
    hooks.farHand(hx, hy, pose.back.a2);
  }
  pauldron(p, FSH[0] + 6, fsy - 2, pose.back.a1, true);

  torso(p, br);

  ctx.save();
  ctx.translate(HEAD[0], HEAD[1] + br);
  ctx.rotate(pose.look - pose.lean * 0.4);
  ctx.scale(HELM_K, HELM_K);
  helmet(p, t, hooks.visor);
  ctx.restore();

  // the rifle is shouldered on the near side, so it crosses in front of the jaw
  if (!pose.slung && !pose.noRifle) rifle(p, pose.gripX, pose.gripY + br, pose.rifleA, pose.rifleK, false);

  // near arm, pauldron on top
  const nsy = NSH[1] + br;
  arm(p, NSH[0], nsy, pose.front, false);
  if (hooks.nearHand) {
    const [hx, hy] = handOf(NSH[0], nsy, pose.front);
    hooks.nearHand(hx, hy, pose.front.a2);
  }
  pauldron(p, NSH[0], nsy, pose.front.a1, false);
  ctx.restore();
  p.back = '';
}

/** Belt line, codpiece and the hanging hip plates that cap the thighs */
function hips(p: Painter) {
  const ctx = p.ctx;
  p.part(() => rpoly(ctx, [-38, -10, 44, -10, 44, 8, -38, 8], 4), SUIT[0], SUIT[1], SUIT[2], 2, 4);
  // side plate over the far hip, codpiece in front
  p.part(() => rpoly(ctx, [-44, -6, -8, -8, -6, 26, -38, 32], 5), GREEN_D[0], GREEN_D[1], GREEN_D[2], 2, 5);
  p.part(() => rpoly(ctx, [4, 0, 42, 0, 38, 20, 26, 36, 12, 36, 4, 18], 5), GREEN[0], GREEN[1], GREEN[2], 2.5, 7);
  line(p, SEAM, 1.6, () => {
    ctx.moveTo(10, 8);
    ctx.lineTo(36, 8);
  });
}

function torso(p: Painter, br: number) {
  const ctx = p.ctx;
  // power pack behind the shoulder blades
  p.part(() => rpoly(ctx, [-40, -70, -72, -78, -78, -132, -62, -154, -34, -150], 7, br), GREEN_D[0], GREEN_D[1], GREEN_D[2], 2.5, 8);
  line(p, 'rgba(8,12,4,0.6)', 1.6, () => {
    ctx.moveTo(-72, -112 + br);
    ctx.lineTo(-46, -108 + br);
    ctx.moveTo(-70, -96 + br);
    ctx.lineTo(-46, -92 + br);
  });

  // undersuit at the waist, ribbed, narrow under the big chest
  p.part(() => rpoly(ctx, [-30, 0, 38, 0, 44, -76, -38, -76], 6), SUIT[0], SUIT[1], SUIT[2]);
  line(p, 'rgba(0,0,0,0.55)', 2, () => {
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(-28, -18 - i * 12);
      ctx.lineTo(40, -18 - i * 12);
    }
  });
  // segmented abdominal plates
  for (let i = 0; i < 3; i++) {
    const y = -66 + i * 16;
    p.part(() => rpoly(ctx, [4, y, 38 - i, y - 1, 36 - i * 2, y + 13, 6, y + 13], 3), METAL_D[0], METAL_D[1], METAL_D[2], 1.5, 4);
  }
  // armoured belt with a buckle plate
  p.part(() => rpoly(ctx, [-38, -16, 44, -16, 44, 0, -38, 0], 3), METAL[0], METAL[1], METAL[2], 2, 4);
  p.part(() => rpoly(ctx, [10, -18, 30, -18, 30, 2, 10, 2], 2), '#c9ccbd', '#6c705f', '#262820', 1.5, 3);

  // the breastplate: high, broad and squared off, wider than the hips
  p.part(
    () =>
      rpoly(ctx, [-44, -60, -60, -104, -54, -144, -20, -164, 34, -166, 68, -154, 84, -126, 82, -96, 68, -70, 32, -58, -8, -56], 10, br),
    GREEN[0],
    GREEN[1],
    GREEN[2],
    3.5,
    15
  );
  // the front pectoral plate, the face of the chest turned toward the light
  p.part(() => rpoly(ctx, [16, -156, 60, -150, 80, -124, 78, -96, 62, -80, 26, -76, 18, -116], 8, br), GREEN[0], GREEN[1], GREEN[2], 3, 10);
  // the side of the chest in shadow, under the near arm
  p.part(() => rpoly(ctx, [-50, -108, -14, -112, -10, -74, -40, -66], 6, br), GREEN_D[0], GREEN_D[1], GREEN_D[2], 2, 6);
  // a lower ribcage plate where the chest meets the waist
  p.part(() => rpoly(ctx, [-40, -74, 20, -68, 64, -74, 56, -58, 22, -50, -34, -54], 5, br), GREEN[0], GREEN[1], GREEN[2], 2, 6);
  line(p, SEAM, 2, () => {
    ctx.moveTo(-6, -158 + br);
    ctx.quadraticCurveTo(-2, -122 + br, -12, -90 + br);
    ctx.moveTo(18, -116 + br);
    ctx.quadraticCurveTo(40, -112 + br, 60, -118 + br);
  });
  line(p, SPEC, 2.8, () => {
    ctx.moveTo(24, -150 + br);
    ctx.quadraticCurveTo(56, -146 + br, 72, -122 + br);
  });
  line(p, 'rgba(238,250,200,0.38)', 1.6, () => {
    ctx.moveTo(-36, -140 + br);
    ctx.lineTo(4, -156 + br);
    ctx.moveTo(26, -110 + br);
    ctx.lineTo(26, -84 + br);
  });
  if (!p.glow) {
    // vents on the chest's side panel
    ctx.fillStyle = '#161d0c';
    for (let i = 0; i < 3; i++) ctx.fillRect(-42 + i * 8, -102 + br, 4.5, 16);
  }

  // the thick collar ring that guards the neck
  p.part(() => rpoly(ctx, [-30, -150, -26, -172, 4, -182, 36, -176, 50, -152, 14, -158], 6, br), METAL[0], METAL[1], METAL[2], 2.5, 6);
  // dark undersuit at the throat
  p.flat(() => rpoly(ctx, [-12, -168, 24, -172, 30, -160, -8, -158], 3, br), '#121318');
}

function leg(p: Painter, hip: readonly [number, number], foot: readonly [number, number], back: boolean) {
  const ctx = p.ctx;
  const G = back ? GREEN_D : GREEN;
  const S = back ? SUIT_D : SUIT;
  const seam = back ? 'rgba(8,12,4,0.55)' : SEAM;
  const ax = foot[0] - 6;
  const ay = foot[1] - 18;
  // knees bend forward; the bend is foreshortened in the three quarter view so the
  // knees never fold in toward each other
  const [ikx, iky] = knee(hip[0], hip[1], ax, ay, THIGH, SHIN, 1);
  const mx = lerp(hip[0], ax, 0.5);
  const my = lerp(hip[1], ay, 0.5);
  const kb = back ? 0.3 : 0.62;
  const kn = [lerp(mx, ikx, kb), lerp(my, iky, 0.92)] as const;
  // thigh: undersuit, then a broad plate over the front and outer side
  seg(p, hip[0], hip[1], kn[0], kn[1], (L) => {
    p.part(() => capsule(ctx, 0, 0, L, 0, 28, 20), S[0], S[1], S[2]);
    p.part(() => rpoly(ctx, [-6, -28, L * 0.8, -24, L * 0.98, -6, L * 0.86, 15, L * 0.18, 22, -10, 4], 9), G[0], G[1], G[2], 3, 11);
    line(p, seam, 1.8, () => {
      ctx.moveTo(L * 0.12, -12);
      ctx.lineTo(L * 0.76, -10);
    });
    if (!back) {
      line(p, SPEC, 2, () => {
        ctx.moveTo(L * 0.1, -24);
        ctx.lineTo(L * 0.72, -21);
      });
    }
  });
  // lower leg: undersuit, then the big shin guard with a raised ridge
  seg(p, kn[0], kn[1], ax, ay, (L) => {
    p.part(() => capsule(ctx, 0, 0, L, 0, 20, 15), S[0], S[1], S[2]);
    p.part(() => rpoly(ctx, [L * 0.04, -23, L * 0.6, -27, L * 1.02, -19, L * 1.04, 14, L * 0.5, 23, L * 0.08, 18], 8), G[0], G[1], G[2], 3, 10);
    line(p, seam, 1.8, () => {
      ctx.moveTo(L * 0.2, -10);
      ctx.lineTo(L * 0.96, -8);
    });
    if (!back) {
      line(p, SPEC, 2, () => {
        ctx.moveTo(L * 0.12, -22);
        ctx.quadraticCurveTo(L * 0.5, -26, L * 0.9, -20);
      });
    }
  });
  // knee: dark joint and an angular cap facing forward
  p.part(() => ctx.arc(kn[0], kn[1], 15, 0, TAU), S[0], S[1], S[2], 2, 4);
  frame(p, kn[0] + 8, kn[1] - 2, 0.2, 1, () =>
    p.part(() => rpoly(ctx, [-12, -16, 10, -18, 18, -2, 10, 14, -10, 12], 7), G[0], G[1], G[2], 2.5, 6)
  );
  // heavy boot: sole, then an armoured upper and toe cap
  const fx = foot[0];
  const fy = foot[1];
  p.part(() => rpoly(ctx, [ax - 22, ay - 8, ax + 16, ay - 12, fx + 26, fy - 14, fx + 42, fy - 5, fx + 42, fy + 1, ax - 24, fy + 1], 5), S[0], S[1], S[2], 2.5, 6);
  p.part(() => rpoly(ctx, [ax - 16, ay - 10, ax + 14, ay - 12, fx + 24, fy - 14, fx + 38, fy - 7, ax + 8, fy - 7, ax - 14, fy - 9], 5), G[0], G[1], G[2], 2.5, 6);
  if (!p.glow) {
    ctx.fillStyle = back ? '#0a0b0d' : '#16181d';
    ctx.fillRect(ax - 24, fy - 3, fx + 66 - ax, 4);
  }
}

/** Arm from the shoulder: undersuit upper arm, elbow pad, armoured gauntlet and fist */
function arm(p: Painter, sx: number, sy: number, a: Arm, back: boolean) {
  const ctx = p.ctx;
  const G = back ? GREEN_D : GREEN;
  const S = back ? SUIT_D : SUIT;
  const M = back ? METAL_D : METAL;
  const ex = sx + Math.cos(a.a1) * U_ARM;
  const ey = sy + Math.sin(a.a1) * U_ARM;
  const hx = ex + Math.cos(a.a2) * F_ARM;
  const hy = ey + Math.sin(a.a2) * F_ARM;
  seg(p, sx, sy, ex, ey, (L) => {
    p.part(() => capsule(ctx, 0, 0, L, 0, 21, 16), S[0], S[1], S[2]);
    p.part(() => rpoly(ctx, [L * 0.2, -19, L * 0.72, -17, L * 0.76, 5, L * 0.22, 7], 6), G[0], G[1], G[2], 2.5, 6);
  });
  p.part(() => ctx.arc(ex, ey, 14, 0, TAU), M[0], M[1], M[2], 2, 4);
  seg(p, ex, ey, hx, hy, (L) => {
    p.part(() => rpoly(ctx, [L * 0.02, -17, L * 0.5, -21, L * 0.86, -16, L * 0.88, 14, L * 0.4, 19, -4, 12], 7), G[0], G[1], G[2], 3, 8);
    line(p, back ? 'rgba(8,12,4,0.55)' : SEAM, 1.6, () => {
      ctx.moveTo(L * 0.68, -17);
      ctx.lineTo(L * 0.7, 15);
    });
    if (!back) {
      line(p, SPEC, 1.8, () => {
        ctx.moveTo(L * 0.1, -15);
        ctx.lineTo(L * 0.58, -19);
      });
    }
  });
  // gloved fist with an armoured back plate
  frame(p, hx, hy, a.a2, 1, () => {
    p.part(() => rpoly(ctx, [-8, -12, 11, -13, 16, -2, 13, 12, -8, 12], 5), S[0], S[1], S[2], 2, 4);
    p.part(() => rpoly(ctx, [-6, -14, 9, -14, 13, -6, -4, -5], 3), G[0], G[1], G[2], 1.5, 3);
  });
}

function pauldron(p: Painter, sx: number, sy: number, a1: number, back: boolean) {
  const ctx = p.ctx;
  const G = back ? GREEN_D : GREEN;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate((a1 - 1.4) * 0.18);
  ctx.scale(1.12, 1.12);
  // lower lip, then the rounded shell over it
  p.part(() => rpoly(ctx, [-26, 8, 36, 6, 34, 24, 4, 32, -22, 24], 7), G[0], G[1], G[2], 2.5, 6);
  p.part(() => rpoly(ctx, [-32, 10, -32, -14, -14, -32, 16, -34, 38, -22, 44, 2, 36, 14, -6, 18], 12), G[0], G[1], G[2], 3.5, 11);
  if (!back) {
    line(p, SEAM, 1.8, () => {
      ctx.moveTo(-26, 0);
      ctx.quadraticCurveTo(8, 8, 40, -2);
    });
    line(p, SPEC, 2.4, () => {
      ctx.moveTo(-14, -26);
      ctx.quadraticCurveTo(14, -34, 34, -18);
    });
  }
  ctx.restore();
}

/** MJOLNIR helmet in its own frame, facing +x, about 84 units across */
function helmet(p: Painter, t: number, visorHook?: () => void) {
  const ctx = p.ctx;
  // the shell: rounded crown, flat brow and a jutting jaw guard
  p.part(
    () => {
      ctx.moveTo(-22, 30);
      ctx.bezierCurveTo(-36, 20, -40, -6, -33, -22);
      ctx.bezierCurveTo(-26, -38, -6, -45, 14, -43);
      ctx.bezierCurveTo(30, -41, 40, -31, 42, -18);
      ctx.lineTo(44, -2);
      ctx.lineTo(48, 10);
      ctx.bezierCurveTo(48, 20, 42, 28, 30, 31);
      ctx.lineTo(-4, 33);
      ctx.closePath();
    },
    GREEN[0],
    GREEN[1],
    GREEN[2],
    3,
    12
  );
  // ear module with its antenna slot
  p.part(() => rpoly(ctx, [-26, -10, -6, -12, -2, 14, -22, 18], 5), METAL[0], METAL[1], METAL[2], 2, 4);
  p.part(() => rpoly(ctx, [-20, -4, -10, -5, -8, 8, -18, 10], 2), GREEN_D[0], GREEN_D[1], GREEN_D[2], 1.5, 3);
  // jaw guard with breather vents
  p.part(
    () => {
      ctx.moveTo(6, 6);
      ctx.lineTo(45, 3);
      ctx.lineTo(49, 11);
      ctx.bezierCurveTo(48, 21, 41, 28, 29, 31);
      ctx.lineTo(10, 31);
      ctx.quadraticCurveTo(2, 20, 6, 6);
      ctx.closePath();
    },
    METAL[0],
    METAL[1],
    METAL[2],
    2,
    5
  );
  line(p, 'rgba(10,12,8,0.9)', 2, () => {
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(30 + i * 1.5, 13 + i * 5);
      ctx.lineTo(42 - i * 2.5, 12 + i * 5);
    }
  });
  if (p.glow) return;
  // crown ridge and the seam from the visor round to the back
  line(p, SPEC, 2.2, () => {
    ctx.moveTo(-22, -32);
    ctx.quadraticCurveTo(4, -46, 30, -34);
  });
  line(p, SEAM, 1.8, () => {
    ctx.moveTo(0, -20);
    ctx.quadraticCurveTo(-18, -22, -34, -12);
    ctx.moveTo(-30, 18);
    ctx.lineTo(-6, 22);
  });

  // the big gold visor, wrapping from the side round to the front
  const visor = () => {
    ctx.moveTo(0, -20);
    ctx.bezierCurveTo(10, -30, 34, -30, 43, -18);
    ctx.bezierCurveTo(48, -9, 48, -1, 45, 5);
    ctx.bezierCurveTo(34, 9, 15, 9, 6, 5);
    ctx.bezierCurveTo(-2, 0, -4, -13, 0, -20);
    ctx.closePath();
  };
  const vg = ctx.createLinearGradient(8, -28, 30, 10);
  vg.addColorStop(0, '#fff3c0');
  vg.addColorStop(0.18, '#ffc93e');
  vg.addColorStop(0.5, '#e08a18');
  vg.addColorStop(0.8, '#8a3e08');
  vg.addColorStop(1, '#3a1503');
  ctx.beginPath();
  visor();
  ctx.fillStyle = vg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // reflections: the sky band, the ring's arc, a hot highlight and a slow sweep
  ctx.fillStyle = 'rgba(120,90,200,0.32)';
  ctx.beginPath();
  ctx.ellipse(26, -4, 26, 7, -0.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(170,190,255,0.7)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(2, 4);
  ctx.quadraticCurveTo(20, -14, 46, -2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(70,24,4,0.5)';
  ctx.fillRect(-4, 3, 54, 10);
  ctx.fillStyle = 'rgba(255,255,240,0.95)';
  ctx.beginPath();
  ctx.ellipse(14, -19, 10, 2.6, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,240,0.6)';
  ctx.beginPath();
  ctx.ellipse(38, -15, 3, 1.6, 0.6, 0, TAU);
  ctx.fill();
  const sweep = ((t * 0.25) % 1) * 70 - 14;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(sweep, -32);
  ctx.lineTo(sweep + 8, -32);
  ctx.lineTo(sweep - 2, 12);
  ctx.lineTo(sweep - 10, 12);
  ctx.closePath();
  ctx.fill();
  visorHook?.();
  ctx.restore();
  ctx.strokeStyle = 'rgba(28,16,4,0.95)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  visor();
  ctx.stroke();
  // brow lip over the visor
  line(p, 'rgba(14,20,8,0.95)', 3, () => {
    ctx.moveTo(-1, -22);
    ctx.bezierCurveTo(10, -32, 34, -32, 44, -19);
  });
}

/** MA5 assault rifle; origin at the top of the pistol grip, barrel along +x */
export function rifle(p: Painter, x: number, y: number, a: number, k: number, slung: boolean) {
  const ctx = p.ctx;
  const G = slung ? GUN_D : GUN;
  frame(p, x, y, a, k, () => {
    // stock with a butt pad
    p.part(() => rpoly(ctx, [-64, -10, -16, -14, -14, 8, -38, 10, -62, 18], 4), G[0], G[1], G[2], 2, 5);
    p.part(() => rpoly(ctx, [-68, -11, -60, -11, -58, 19, -66, 19], 2), '#2a2c31', '#1a1b1f', '#0b0b0d', 1, 2);
    // magazine ahead of the trigger, then the pistol grip
    p.part(() => rpoly(ctx, [16, 6, 34, 6, 42, 46, 25, 48], 3), G[0], G[1], G[2], 2, 4);
    p.part(() => rpoly(ctx, [-10, 6, 4, 6, 0, 32, -14, 30], 3), G[0], G[1], G[2], 2, 4);
    // boxy receiver and the long shroud ending in a squared muzzle
    p.part(() => rpoly(ctx, [-18, -16, 46, -18, 50, 10, -16, 10], 3), G[0], G[1], G[2], 2.5, 6);
    p.part(() => rpoly(ctx, [40, -20, 104, -16, 118, -10, 118, 6, 104, 10, 42, 12], 4), G[0], G[1], G[2], 2.5, 7);
    // flashlight under the barrel, rail and counter housing on top
    p.part(() => rpoly(ctx, [76, 10, 100, 10, 100, 17, 76, 17], 2), G[0], G[1], G[2], 1.5, 3);
    p.part(() => rpoly(ctx, [-12, -24, 30, -24, 32, -15, -14, -15], 2), G[0], G[1], G[2], 1.5, 3);
    if (p.glow) return;
    ctx.fillStyle = '#0b0c0f';
    ctx.fillRect(112, -6, 7, 8);
    // shroud vents and a lit edge
    ctx.fillStyle = 'rgba(8,9,12,0.75)';
    for (let i = 0; i < 4; i++) ctx.fillRect(60 + i * 11, -10, 6, 2.5);
    ctx.fillRect(48, 2, 56, 1.5);
    ctx.fillStyle = 'rgba(220,226,240,0.5)';
    ctx.fillRect(-14, -14, 56, 1.5);
    ctx.fillRect(44, -17, 60, 1.4);
    // the ammo counter: a small cyan screen with two blocky digits
    ctx.fillStyle = '#081418';
    ctx.fillRect(-4, -12, 22, 9);
    ctx.fillStyle = slung ? '#2d5a6a' : '#7fe8ff';
    ctx.fillRect(-1, -10, 7, 5);
    ctx.fillRect(8, -10, 7, 5);
    ctx.fillStyle = '#081418';
    ctx.fillRect(1, -9, 3, 3);
    ctx.fillRect(10, -9, 3, 1.4);
    // trigger guard
    ctx.strokeStyle = G[2];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 10);
    ctx.quadraticCurveTo(10, 22, 16, 12);
    ctx.stroke();
  });
}

/* ---------- the ring ---------- */

export interface RingShape {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
}

/** The ring: inner surface of land, ocean and cloud, metal hull on the outside, far side lost in haze (fadeRgb tints that haze) */
export function drawRing(c: CanvasRenderingContext2D, ring: RingShape, hash: (n: number) => number, fadeRgb?: string) {
  const N = 180;
  const { cx, cy, rx, ry, rot } = ring;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const ox = new Float32Array(N + 1);
  const oy = new Float32Array(N + 1);
  const ix = new Float32Array(N + 1);
  const iy = new Float32Array(N + 1);
  const hx = new Float32Array(N + 1);
  const hy = new Float32Array(N + 1);
  const wid = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const th = Math.PI + (i / N) * Math.PI;
    const ex = Math.cos(th) * rx;
    const ey = Math.sin(th) * ry;
    const x = cx + ex * cr - ey * sr;
    const y = cy + ex * sr + ey * cr;
    // inward normal of the ellipse
    let nx = -(Math.cos(th) / rx);
    let ny = -(Math.sin(th) / ry);
    const nl = Math.hypot(nx, ny);
    nx /= nl;
    ny /= nl;
    const rnx = nx * cr - ny * sr;
    const rny = nx * sr + ny * cr;
    const co = Math.cos(th);
    const near = Math.pow(Math.max(0, -co), 1.2) + 0.35 * Math.pow(Math.max(0, co), 1.5);
    const w = 7 + 92 * near;
    wid[i] = w;
    ox[i] = x;
    oy[i] = y;
    ix[i] = x + rnx * w;
    iy[i] = y + rny * w;
    const hull = 3 + 14 * near;
    hx[i] = x - rnx * hull;
    hy[i] = y - rny * hull;
  }
  const strip = (ax: Float32Array, ay: Float32Array, bx: Float32Array, by: Float32Array) => {
    c.beginPath();
    c.moveTo(ax[0], ay[0]);
    for (let i = 1; i <= N; i++) c.lineTo(ax[i], ay[i]);
    for (let i = N; i >= 0; i--) c.lineTo(bx[i], by[i]);
    c.closePath();
  };
  const path = (ax: Float32Array, ay: Float32Array) => {
    c.beginPath();
    c.moveTo(ax[0], ay[0]);
    for (let i = 1; i <= N; i++) c.lineTo(ax[i], ay[i]);
  };

  // soft glow around the ring
  c.globalCompositeOperation = 'lighter';
  c.lineJoin = 'round';
  path(ix, iy);
  c.strokeStyle = 'rgba(140,170,255,0.08)';
  c.lineWidth = 40;
  c.stroke();
  c.globalCompositeOperation = 'source-over';

  // outer hull
  strip(hx, hy, ox, oy);
  c.fillStyle = '#2a2b4a';
  c.fill();
  path(hx, hy);
  c.strokeStyle = 'rgba(190,195,240,0.55)';
  c.lineWidth = 1.4;
  c.stroke();

  // inner surface
  strip(ox, oy, ix, iy);
  c.fillStyle = '#4e7f78';
  c.fill();
  c.save();
  c.clip();
  const palette = ['#2f64a8', '#2a5a9c', '#4a8a3c', '#6e9a48', '#c0a468', '#7b7266', '#3d7fb8', '#3f7a34'];
  const blob = (j: number, col: string, a: number, sz: number, lat: number, stretch: number) => {
    const f = hash(j);
    const i = Math.min(N - 1, Math.floor(f * N));
    const w = wid[i];
    const tx = ox[i + 1] - ox[i];
    const ty = oy[i + 1] - oy[i];
    const ang = Math.atan2(ty, tx);
    const px = lerp(ox[i], ix[i], lat);
    const py = lerp(oy[i], iy[i], lat);
    c.globalAlpha = a;
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(px, py, w * sz * stretch, w * sz * 0.5, ang, 0, TAU);
    c.fill();
  };
  for (let j = 0; j < 260; j++) {
    blob(j * 3 + 1, palette[Math.floor(hash(j * 7 + 5) * palette.length)], 0.9, 0.35 + hash(j * 11) * 0.5, hash(j * 13 + 2), 2.4);
  }
  for (let j = 0; j < 120; j++) {
    blob(j * 5 + 7000, '#eef1ff', 0.25 + hash(j * 17) * 0.4, 0.08 + hash(j * 19) * 0.2, hash(j * 23 + 9), 3.5);
  }
  c.globalAlpha = 1;
  // shadow cast by the outer wall, and atmosphere along the inner edge
  path(ox, oy);
  c.strokeStyle = 'rgba(20,18,50,0.45)';
  c.lineWidth = 10;
  c.stroke();
  c.restore();
  path(ix, iy);
  c.strokeStyle = 'rgba(200,220,255,0.65)';
  c.lineWidth = 2.2;
  c.stroke();
  path(ix, iy);
  c.strokeStyle = 'rgba(160,190,255,0.18)';
  c.lineWidth = 9;
  c.stroke();

  // the far side dissolves into space
  const ax = cx + sr * ry;
  const ay = cy - cr * ry;
  const fr = 700;
  const fade = c.createRadialGradient(ax + 300, ay, 0, ax + 300, ay, fr);
  fade.addColorStop(0, fadeRgb ? `rgba(${fadeRgb},0.7)` : 'rgba(22,16,58,0.7)');
  fade.addColorStop(0.5, `rgba(${fadeRgb ?? '26,18,66'},0.4)`);
  fade.addColorStop(1, `rgba(${fadeRgb ?? '26,18,66'},0)`);
  c.fillStyle = fade;
  c.fillRect(ax + 300 - fr, ay - fr, fr * 2, fr * 2);
}

