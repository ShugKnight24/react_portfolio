import { clamp, lerp, noise, TAU, tone } from './runtime';
import type { AudioBus } from './runtime';

/**
 * Shared pieces for the basketball legends scenes (Jordan from the line, Kobe at the elbow),
 * drawn in the poster language of the Sports Legends section: backlit ink silhouettes with
 * a warm key rim and a coloured kicker, giant halftone jersey numbers and a dark arena.
 *
 * The athlete is a small 3D rig seen from the side: legs and arms swing in their own
 * sagittal planes off the hips and shoulders, the torso is an elliptical cross section and
 * the whole body turns with a yaw, so a spin move or a three quarter view projects properly.
 * Poses are joint angles (lerp safe); leg IK turns planted foot targets into angles.
 * World units are metres, y up from the floor, the rim centre at x = 0.
 */

/* ---------- camera ---------- */

export interface Cam {
  /** Pixels per metre */
  ppm: number;
  /** World x at the screen centre */
  cx: number;
  /** Screen y of the floor (world y = 0) */
  gy: number;
  w: number;
  h: number;
  /** Shake offset in px */
  sx: number;
  sy: number;
}

export const makeCam = (): Cam => ({ ppm: 100, cx: 0, gy: 0, w: 1, h: 1, sx: 0, sy: 0 });
export const camX = (c: Cam, x: number) => c.w / 2 + (x - c.cx) * c.ppm + c.sx;
export const camY = (c: Cam, y: number) => c.gy - y * c.ppm + c.sy;
/** Half the visible width in metres */
export const halfView = (c: Cam) => c.w / 2 / c.ppm;

/**
 * Fit the camera: show at least `minW` x `minH` metres, put world height `focusY` near the
 * vertical centre, but never lift the floor higher than `floorPad` metres above the bottom.
 */
export function fitCam(c: Cam, w: number, h: number, minW: number, minH: number, focusY: number, floorPad: number) {
  c.w = w;
  c.h = h;
  c.ppm = Math.max(4, Math.min(h / minH, w / minW));
  c.gy = Math.min(h - floorPad * c.ppm, h / 2 + focusY * c.ppm);
}

/** Track a world x, clamped so the view stays inside [lo, hi] (centred when wider) */
export function aimCam(c: Cam, x: number, lo: number, hi: number) {
  const hv = halfView(c);
  c.cx = hi - lo <= hv * 2 ? (lo + hi) / 2 : clamp(x, lo + hv, hi - hv);
}

/* ---------- rig and poses ---------- */

export interface Rig {
  thigh: number;
  shin: number;
  /** Ankle joint above the sole */
  ankleH: number;
  heel: number;
  toe: number;
  /** Hip joints to the shoulder line */
  spine: number;
  neck: number;
  headR: number;
  upper: number;
  fore: number;
  hand: number;
  hipHalf: number;
  shHalf: number;
  /** Girth multiplier */
  build: number;
}

/** Proportions for a standing height in metres (to the crown) */
export function makeRig(height: number, build = 1): Rig {
  const k = height / 1.98;
  return {
    thigh: 0.49 * k,
    shin: 0.49 * k,
    ankleH: 0.085 * k,
    heel: 0.065 * k,
    toe: 0.235 * k,
    spine: 0.56 * k,
    neck: 0.1 * k,
    headR: 0.112 * k,
    upper: 0.355 * k,
    fore: 0.295 * k,
    hand: 0.2 * k,
    hipHalf: 0.095 * k,
    shHalf: 0.195 * k * build,
    build: build * k,
  };
}

/** Pelvis height when standing tall */
export const standH = (r: Rig) => r.ankleH + r.thigh + r.shin;

export interface LegPose {
  /** Thigh angle from straight down, forward positive (absolute, not relative to the torso) */
  hip: number;
  /** Knee flexion, 0 straight */
  knee: number;
  /** Ankle plantar flexion relative to a right angle with the shin (toes down positive) */
  ankle: number;
}

export interface ArmPose {
  /** Shoulder flexion from hanging along the torso, forward positive (pi = straight overhead) */
  sh: number;
  /** Abduction out to the side */
  abd: number;
  /** Elbow flexion */
  el: number;
  /** Wrist flexion */
  wr: number;
}

export interface Pose {
  /** Pelvis (hip joint centre) in world metres */
  x: number;
  y: number;
  /** Facing: 0 faces +x, pi faces -x; the near side (index 0) is toward the viewer at yaw 0 */
  yaw: number;
  /** Torso pitch forward */
  lean: number;
  /** Head pitch relative to the torso, chin down positive */
  head: number;
  legs: [LegPose, LegPose];
  arms: [ArmPose, ArmPose];
}

const D = Math.PI / 180;

/** Author a pose in degrees: legs [hip, knee, ankle], arms [sh, abd, el, wr]; index 0 is the near side */
export function pose(
  x: number,
  y: number,
  yaw: number,
  lean: number,
  head: number,
  l0: readonly [number, number, number],
  l1: readonly [number, number, number],
  a0: readonly [number, number, number, number],
  a1: readonly [number, number, number, number]
): Pose {
  const leg = (l: readonly [number, number, number]): LegPose => ({ hip: l[0] * D, knee: l[1] * D, ankle: l[2] * D });
  const arm = (a: readonly [number, number, number, number]): ArmPose => ({ sh: a[0] * D, abd: a[1] * D, el: a[2] * D, wr: a[3] * D });
  return { x, y, yaw: yaw * D, lean: lean * D, head: head * D, legs: [leg(l0), leg(l1)], arms: [arm(a0), arm(a1)] };
}

export const clonePose = (p: Pose): Pose => ({
  ...p,
  legs: [{ ...p.legs[0] }, { ...p.legs[1] }],
  arms: [{ ...p.arms[0] }, { ...p.arms[1] }],
});

export function copyPose(out: Pose, p: Pose): Pose {
  out.x = p.x;
  out.y = p.y;
  out.yaw = p.yaw;
  out.lean = p.lean;
  out.head = p.head;
  for (let i = 0; i < 2; i++) {
    Object.assign(out.legs[i], p.legs[i]);
    Object.assign(out.arms[i], p.arms[i]);
  }
  return out;
}

export function lerpPose(out: Pose, a: Pose, b: Pose, k: number): Pose {
  out.x = lerp(a.x, b.x, k);
  out.y = lerp(a.y, b.y, k);
  out.yaw = lerp(a.yaw, b.yaw, k);
  out.lean = lerp(a.lean, b.lean, k);
  out.head = lerp(a.head, b.head, k);
  for (let i = 0; i < 2; i++) {
    const la = a.legs[i];
    const lb = b.legs[i];
    const lo = out.legs[i];
    lo.hip = lerp(la.hip, lb.hip, k);
    lo.knee = lerp(la.knee, lb.knee, k);
    lo.ankle = lerp(la.ankle, lb.ankle, k);
    const aa = a.arms[i];
    const ab = b.arms[i];
    const ao = out.arms[i];
    ao.sh = lerp(aa.sh, ab.sh, k);
    ao.abd = lerp(aa.abd, ab.abd, k);
    ao.el = lerp(aa.el, ab.el, k);
    ao.wr = lerp(aa.wr, ab.wr, k);
  }
  return out;
}

export const smooth01 = (k: number) => {
  const v = clamp(k, 0, 1);
  return v * v * (3 - 2 * v);
};

/** Keyframed pose track: [time, pose] sorted by time, smoothstepped between keys */
export function samplePoses(out: Pose, keys: readonly (readonly [number, Pose])[], t: number): Pose {
  if (t <= keys[0][0]) return copyPose(out, keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    const [tb, pb] = keys[i];
    if (t <= tb) {
      const [ta, pa] = keys[i - 1];
      return lerpPose(out, pa, pb, smooth01((t - ta) / Math.max(1e-6, tb - ta)));
    }
  }
  return copyPose(out, keys[keys.length - 1][1]);
}

/**
 * Leg IK: plant the ankle of leg `i` at world (ax, ay) with the foot pitched `pitch`
 * (0 flat, positive heel up), knee bending forward. Uses the pose's pelvis and yaw.
 */
export function legIK(r: Rig, p: Pose, i: 0 | 1, ax: number, ay: number, pitch = 0) {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const l = (i === 0 ? 1 : -1) * r.hipHalf;
  // Forward offset in the body frame; near a frontal view the forward reach reads as zero
  const f = ((ax - p.x - l * s) * c) / Math.max(c * c, 0.3);
  const u = ay - p.y;
  const T = r.thigh;
  const S = r.shin;
  const d = clamp(Math.hypot(f, u), Math.abs(T - S) + 1e-3, (T + S) * 0.9995);
  const toward = Math.atan2(f, -u);
  const a = Math.acos(clamp((T * T + d * d - S * S) / (2 * T * d), -1, 1));
  const kn = Math.acos(clamp((T * T + S * S - d * d) / (2 * T * S), -1, 1));
  const leg = p.legs[i];
  leg.hip = toward + a;
  leg.knee = Math.PI - kn;
  leg.ankle = leg.hip - leg.knee + pitch;
}

/** Pelvis height that puts the lowest sole point on the floor (for keeping feet grounded) */
export function groundOffset(r: Rig, p: Pose) {
  let lo = Infinity;
  for (let i = 0; i < 2; i++) {
    const L = p.legs[i];
    const a1 = L.hip;
    const a2 = L.hip - L.knee;
    const fa = a2 + Math.PI / 2 - L.ankle;
    const ky = -Math.cos(a1) * r.thigh;
    const ay = ky - Math.cos(a2) * r.shin;
    const dy = -Math.cos(fa);
    const ny = Math.sin(fa);
    const heel = ay - dy * r.heel - ny * r.ankleH;
    const ball = ay + dy * r.toe * 0.72 - ny * r.ankleH;
    const tip = ay + dy * r.toe - ny * r.ankleH * 0.6;
    lo = Math.min(lo, heel, ball, tip);
  }
  return -lo;
}

/* ---------- skeleton ---------- */

export interface Pt {
  x: number;
  y: number;
  /** Depth toward the viewer */
  d: number;
}

export interface Skel {
  c: number;
  s: number;
  pelvis: Pt;
  chest: Pt;
  neck: Pt;
  head: Pt;
  /** Screen-plane head up vector and facing (+1 right, -1 left) blended with frontal amount */
  headUx: number;
  headUy: number;
  hip: [Pt, Pt];
  knee: [Pt, Pt];
  ankle: [Pt, Pt];
  heel: [Pt, Pt];
  ball: [Pt, Pt];
  toe: [Pt, Pt];
  sh: [Pt, Pt];
  el: [Pt, Pt];
  wr: [Pt, Pt];
  knuckle: [Pt, Pt];
  tip: [Pt, Pt];
  thumb: [Pt, Pt];
  /** Where a ball cupped in the palm sits (on the hand's flexion side) */
  palm: [Pt, Pt];
  /** Shoe outline points per foot (world) */
  shoe: [Pt[], Pt[]];
}

const mkPt = (): Pt => ({ x: 0, y: 0, d: 0 });
const two = (): [Pt, Pt] => [mkPt(), mkPt()];

export const makeSkel = (): Skel => ({
  c: 1,
  s: 0,
  pelvis: mkPt(),
  chest: mkPt(),
  neck: mkPt(),
  head: mkPt(),
  headUx: 0,
  headUy: 1,
  hip: two(),
  knee: two(),
  ankle: two(),
  heel: two(),
  ball: two(),
  toe: two(),
  sh: two(),
  el: two(),
  wr: two(),
  knuckle: two(),
  tip: two(),
  thumb: two(),
  palm: two(),
  shoe: [[], []],
});

/** Shoe profile in the foot frame: [along the foot from the ankle, along the foot's up normal], in units of ankle height and foot length */
function shoeProfile(r: Rig, high: boolean): [number, number][] {
  const A = r.ankleH;
  const collar = high ? A * 1.5 : A * 0.35;
  return [
    [-r.heel - 0.012, -A - 0.004],
    [-r.heel - 0.022, -A * 0.45],
    [-r.heel - 0.012, collar * 0.7],
    [-r.heel + 0.012, collar],
    [0.035, collar + 0.004],
    [0.055, high ? A * 0.55 : 0.012],
    [r.toe * 0.45, -A * 0.2],
    [r.toe * 0.82, -A * 0.42],
    [r.toe + 0.012, -A * 0.75],
    [r.toe + 0.006, -A - 0.006],
    [r.toe * 0.5, -A - 0.014],
    [-r.heel * 0.2, -A - 0.012],
  ];
}

/** Forward kinematics + projection: fills `sk` with world points for pose `p` */
export function solve(r: Rig, p: Pose, sk: Skel, highTops = false) {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  sk.c = c;
  sk.s = s;
  const set = (o: Pt, f: number, u: number, l: number) => {
    o.x = p.x + f * c + l * s;
    o.y = p.y + u;
    o.d = -f * s + l * c;
    return o;
  };
  set(sk.pelvis, 0, 0, 0);

  // Legs in their own sagittal planes
  const prof = shoeProfile(r, highTops);
  for (let i = 0; i < 2; i++) {
    const L = p.legs[i];
    const l = (i === 0 ? 1 : -1) * r.hipHalf;
    const a1 = L.hip;
    const kf = Math.sin(a1) * r.thigh;
    const ku = -Math.cos(a1) * r.thigh;
    const a2 = L.hip - L.knee;
    const af = kf + Math.sin(a2) * r.shin;
    const au = ku - Math.cos(a2) * r.shin;
    const fa = a2 + Math.PI / 2 - L.ankle;
    const dx = Math.sin(fa);
    const dy = -Math.cos(fa);
    const nx = -dy;
    const ny = dx;
    set(sk.hip[i], 0, 0, l);
    set(sk.knee[i], kf, ku, l);
    set(sk.ankle[i], af, au, l);
    set(sk.heel[i], af - dx * r.heel - nx * r.ankleH, au - dy * r.heel - ny * r.ankleH, l);
    set(sk.ball[i], af + dx * r.toe * 0.72 - nx * r.ankleH, au + dy * r.toe * 0.72 - ny * r.ankleH, l);
    set(sk.toe[i], af + dx * r.toe - nx * r.ankleH * 0.6, au + dy * r.toe - ny * r.ankleH * 0.6, l);
    const shoe = sk.shoe[i];
    shoe.length = prof.length;
    for (let k = 0; k < prof.length; k++) {
      const [a, b] = prof[k];
      shoe[k] = set(shoe[k] ?? mkPt(), af + dx * a + nx * b, au + dy * a + ny * b, l);
    }
  }

  // Spine, neck and head
  const tf = Math.sin(p.lean);
  const tu = Math.cos(p.lean);
  set(sk.chest, tf * r.spine, tu * r.spine, 0);
  const hn = p.lean + p.head * 0.6;
  const nf = tf * r.spine + Math.sin(hn) * r.neck * 0.55;
  const nu = tu * r.spine + Math.cos(hn) * r.neck * 0.55;
  set(sk.neck, nf, nu, 0);
  const ha = p.lean + p.head;
  set(sk.head, nf + Math.sin(ha) * (r.neck * 0.45 + r.headR * 0.95), nu + Math.cos(ha) * (r.neck * 0.45 + r.headR * 0.95), 0);
  sk.headUx = Math.sin(ha) * c;
  sk.headUy = Math.cos(ha);

  // Arms off the shoulders, flexion relative to the torso, abduction out to the side
  for (let i = 0; i < 2; i++) {
    const A = p.arms[i];
    const side = i === 0 ? 1 : -1;
    const sf = tf * (r.spine - 0.04) - tu * 0.0;
    const su = tu * (r.spine - 0.04);
    const sl = side * r.shHalf;
    set(sk.sh[i], sf, su, sl);
    const cb = Math.cos(A.abd);
    const sb = Math.sin(A.abd);
    const dir = (ang: number): [number, number, number] => {
      const f = Math.sin(ang);
      const u = -Math.cos(ang);
      return [f, u * cb, -u * sb * side];
    };
    const a1 = p.lean + A.sh;
    const [f1, u1, l1] = dir(a1);
    const ef = sf + f1 * r.upper;
    const eu = su + u1 * r.upper;
    const el = sl + l1 * r.upper;
    set(sk.el[i], ef, eu, el);
    const [f2, u2, l2] = dir(a1 + A.el);
    const wf = ef + f2 * r.fore;
    const wu = eu + u2 * r.fore;
    const wl = el + l2 * r.fore;
    set(sk.wr[i], wf, wu, wl);
    const a3 = a1 + A.el + A.wr;
    const [f3, u3, l3] = dir(a3);
    set(sk.knuckle[i], wf + f3 * r.hand * 0.5, wu + u3 * r.hand * 0.5, wl + l3 * r.hand * 0.5);
    set(sk.tip[i], wf + f3 * r.hand, wu + u3 * r.hand, wl + l3 * r.hand);
    // Palm side: the flexion side of the hand
    const [pf, pu, pl] = dir(a3 + Math.PI / 2);
    set(sk.palm[i], wf + f3 * r.hand * 0.42 + pf * 0.1, wu + u3 * r.hand * 0.42 + pu * 0.1, wl + l3 * r.hand * 0.42 + pl * 0.1);
    const [tf3, tu3, tl3] = dir(a3 + 0.7);
    set(sk.thumb[i], wf + tf3 * r.hand * 0.5, wu + tu3 * r.hand * 0.5, wl + tl3 * r.hand * 0.5);
  }
  return sk;
}

/* ---------- shapes (screen space) ---------- */

type V = [number, number];

/** Signed area > 0 means clockwise on screen (y down) */
function area(pts: V[]) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a;
}

function addPoly(path: Path2D, pts: V[]) {
  if (pts.length < 3) return;
  if (area(pts) < 0) pts.reverse();
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
  path.closePath();
}

/** Tapered capsule outline from (x1, y1, r1) to (x2, y2, r2) */
export function capsulePts(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, n = 7): V[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  const out: V[] = [];
  if (d < Math.abs(r1 - r2) + 0.01) {
    const R = Math.max(r1, r2);
    const cx = r1 > r2 ? x1 : x2;
    const cy = r1 > r2 ? y1 : y2;
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TAU;
      out.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    return out;
  }
  const a = Math.atan2(dy, dx);
  const ph = Math.asin(clamp((r1 - r2) / d, -1, 1));
  const half = Math.PI / 2 - ph;
  for (let i = 0; i <= n; i++) {
    const t = a - half + (2 * half * i) / n;
    out.push([x2 + Math.cos(t) * r2, y2 + Math.sin(t) * r2]);
  }
  const back = TAU - 2 * half;
  for (let i = 0; i <= n; i++) {
    const t = a + half + (back * i) / n;
    out.push([x1 + Math.cos(t) * r1, y1 + Math.sin(t) * r1]);
  }
  return out;
}

/* ---------- athlete painter ---------- */

export interface AthleteKit {
  /** Skin ink, top and bottom of the figure */
  skin: [string, string];
  jersey: [string, string];
  shorts: [string, string];
  /** Trim lines on jersey and shorts */
  trim: string;
  shoe: string;
  sole: string;
  number: string;
  numberInk: string;
  numberLine: string;
  highTops: boolean;
  /** Wristband on this arm */
  band?: { arm: 0 | 1; color: string };
  /** Shooting sleeve on this arm */
  sleeve?: { arm: 0 | 1; color: string };
  /** Socks colour, drawn as a band above the shoe */
  sock?: string;
  /** Hair cap (short crop); bald when absent */
  hair?: string;
  /** Mild build multiplier for the muscle bellies */
  bulk?: number;
}

export interface RimLight {
  key: string;
  back: string;
  halo: string;
  /** Unit direction toward the key light on screen (x right, y down) */
  kx: number;
  ky: number;
  /** Rim thickness in metres */
  size?: number;
  haloAlpha?: number;
  /** Interior separation line between overlapping limbs */
  sep: string;
}

/** Extra layer merged into the athlete's depth order (a held ball, say) */
export interface Layer {
  d: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

/** Profile head outline (x forward, y up) in units of the skull radius, from the poster figures */
const HEAD: V[] = [
  [0, 18], [8, 16.5], [13, 11.5], [15, 5.5], [14.6, 1.5], [17.6, -3.8], [14.6, -7], [15.4, -10.6], [13.6, -13.6], [11.2, -18.4],
  [4, -19.4], [-3, -16], [-9.5, -14.5], [-14.5, -8.5], [-16, 0], [-14.2, 10], [-8, 16.2],
].map(([x, y]) => [x / 16.5, y / 16.5] as V);
const HEAD_ROUND: V[] = HEAD.map(([x, y]) => {
  const a = Math.atan2(y, x);
  const k = y < -0.6 ? 0.92 : 1;
  return [Math.cos(a) * 0.93, Math.sin(a) * k] as V;
});

interface Group {
  d: number;
  path: Path2D;
  fill: string | CanvasGradient;
  sep: boolean;
  after?: (ctx: CanvasRenderingContext2D) => void;
}

/**
 * Paint the athlete: halo, key and kicker rims from offset copies of the whole silhouette,
 * then each body group in depth order (far limbs first) with interior separation lines,
 * the jersey number and the trims.
 */
export function drawAthlete(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  r: Rig,
  sk: Skel,
  kit: AthleteKit,
  light: RimLight,
  layers: Layer[] = [],
  alpha = 1
) {
  const ppm = cam.ppm;
  const X = (p: Pt) => camX(cam, p.x);
  const Y = (p: Pt) => camY(cam, p.y);
  const B = r.build * (kit.bulk ?? 1);
  const groups: Group[] = [];
  const union = new Path2D();

  const add = (d: number, fill: string | CanvasGradient, polys: V[][], sep = true, after?: Group['after']) => {
    const path = new Path2D();
    for (const pts of polys) {
      addPoly(path, pts);
      addPoly(union, pts.slice());
    }
    groups.push({ d, path, fill, sep, after });
    return path;
  };
  const cap = (a: Pt, ra: number, b: Pt, rb: number, n = 7) => capsulePts(X(a), Y(a), ra * ppm, X(b), Y(b), rb * ppm, n);
  const mid = (a: Pt, b: Pt, k: number): Pt => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), d: lerp(a.d, b.d, k) });
  /** Muscle belly: a capsule along a segment from k0 to k1, pushed sideways by `off` metres (screen-perpendicular, toward the facing side when positive) */
  const belly = (a: Pt, b: Pt, k0: number, k1: number, r0: number, r1: number, off: number) => {
    const p0 = mid(a, b, k0);
    const p1 = mid(a, b, k1);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular that points to the figure's front when the segment points down
    const face = sk.c >= 0 ? 1 : -1;
    const nx = (-dy / len) * face;
    const ny = (dx / len) * face;
    const shift = (p: Pt): Pt => ({ x: p.x + nx * off * -1, y: p.y + ny * off * -1, d: p.d });
    return cap(shift(p0), r0, shift(p1), r1);
  };

  const top = Y(sk.head) - r.headR * ppm * 1.2;
  const bottom = camY(cam, Math.min(sk.toe[0].y, sk.toe[1].y, sk.heel[0].y, sk.heel[1].y));
  const grad = (cols: [string, string]) => {
    const g = ctx.createLinearGradient(0, top, 0, Math.max(top + 1, bottom));
    g.addColorStop(0, cols[0]);
    g.addColorStop(1, cols[1]);
    return g;
  };
  const skin = grad(kit.skin);
  const jersey = grad(kit.jersey);
  const shorts = grad(kit.shorts);

  // Legs: thigh and shin capsules with quad and calf bellies, shoes, shorts sleeve
  for (let i = 0; i < 2; i++) {
    const hip = sk.hip[i];
    const knee = sk.knee[i];
    const ank = sk.ankle[i];
    const d = (hip.d + knee.d) / 2;
    const polys = [
      cap(hip, 0.082 * B, knee, 0.05 * B),
      belly(hip, knee, 0.18, 0.62, 0.07 * B, 0.055 * B, -0.018 * B),
      belly(hip, knee, 0.25, 0.7, 0.062 * B, 0.05 * B, 0.014 * B),
      cap(knee, 0.05 * B, ank, 0.03 * B),
      belly(knee, ank, 0.12, 0.42, 0.052 * B, 0.04 * B, 0.024 * B),
    ];
    add(d, skin, polys);
    const shoePts = sk.shoe[i].map((p) => [X(p), Y(p)] as V);
    add(d + 0.001, kit.shoe, [shoePts, cap(sk.heel[i], 0.035, sk.ball[i], 0.04, 5)], true, (c) => {
      // Sole stripe and a sock band
      c.strokeStyle = kit.sole;
      c.lineWidth = Math.max(1, 0.02 * ppm);
      c.beginPath();
      const h = sk.heel[i];
      const b = sk.ball[i];
      c.moveTo(X(h), Y(h));
      c.lineTo(X(b), Y(b));
      c.stroke();
    });
    if (kit.sock) {
      const s0 = mid(ank, knee, 0.08);
      const s1 = mid(ank, knee, kit.highTops ? 0.3 : 0.22);
      add(d + 0.002, kit.sock, [cap(s0, 0.034 * B, s1, 0.038 * B, 5)], false);
    }
    // Baggy shorts leg down most of the thigh
    const sh1 = mid(hip, knee, 0.74);
    add(d + 0.003, shorts, [cap(mid(hip, knee, -0.05), 0.098 * B, sh1, 0.084 * B)], true, (c) => {
      const kx = X(knee) - X(hip);
      const ky = Y(knee) - Y(hip);
      const len = Math.hypot(kx, ky) || 1;
      const nx = (-ky / len) * 0.082 * B * ppm;
      const ny = (kx / len) * 0.082 * B * ppm;
      c.strokeStyle = kit.trim;
      c.lineWidth = Math.max(1, 0.012 * ppm);
      c.beginPath();
      c.moveTo(X(sh1) + nx, Y(sh1) + ny);
      c.lineTo(X(sh1) - nx, Y(sh1) - ny);
      c.stroke();
    });
  }

  // Torso: elliptical cross sections along the spine, projected with the yaw
  const bx = X(sk.pelvis);
  const by = Y(sk.pelvis);
  const tx = X(sk.chest);
  const ty = Y(sk.chest);
  const sdx = tx - bx;
  const sdy = ty - by;
  const slen = Math.hypot(sdx, sdy) || 1;
  const ux = sdx / slen;
  const uy = sdy / slen;
  // Screen normal pointing right when upright
  const nrx = -uy;
  const nry = ux;
  const cY = sk.c;
  const sY = sk.s;
  const ext = (front: number, back: number, wide: number, toRight: boolean) => {
    const a = (cY >= 0) === toRight ? front : back;
    return Math.sqrt((a * cY) ** 2 + (wide * sY) ** 2) * ppm;
  };
  // [t along spine, front, back, half width]
  const ROWS: [number, number, number, number][] = [
    [-0.12, 0.09, 0.11, 0.15],
    [0.04, 0.105, 0.125, 0.17],
    [0.22, 0.1, 0.1, 0.155],
    [0.42, 0.105, 0.095, 0.15],
    [0.62, 0.125, 0.105, 0.175],
    [0.8, 0.13, 0.11, 0.2],
    [0.93, 0.105, 0.105, 0.215],
    [1.05, 0.055, 0.075, 0.16],
  ];
  const torsoPts = (from: number, to: number, grow = 1): V[] => {
    const right: V[] = [];
    const left: V[] = [];
    for (const [t, f, b, w] of ROWS) {
      const tt = clamp(t, from, to);
      if (t < from - 0.2 || t > to + 0.2) continue;
      const cx = bx + sdx * tt;
      const cy = by + sdy * tt;
      const er = ext(f * B * grow, b * B * grow, w * B * grow, true);
      const el = ext(f * B * grow, b * B * grow, w * B * grow, false);
      right.push([cx + nrx * er, cy + nry * er]);
      left.push([cx - nrx * el, cy - nry * el]);
    }
    return [...right, ...left.reverse()];
  };
  const jerseyPts = torsoPts(0.1, 1.05);
  const shortsPts = torsoPts(-0.12, 0.22, 1.0);
  const neckPoly = cap(sk.chest, 0.07 * B, sk.neck, 0.055 * B);
  const torsoD = 0;
  add(torsoD - 0.002, shorts, [shortsPts], true, (c) => {
    // Waistband
    const cx = bx + sdx * 0.2;
    const cy = by + sdy * 0.2;
    const er = ext(0.11 * B, 0.11 * B, 0.17 * B, true);
    const el = ext(0.11 * B, 0.11 * B, 0.17 * B, false);
    c.strokeStyle = kit.trim;
    c.lineWidth = Math.max(1, 0.014 * ppm);
    c.beginPath();
    c.moveTo(cx + nrx * er, cy + nry * er);
    c.lineTo(cx - nrx * el, cy - nry * el);
    c.stroke();
  });
  const jerseyPath = add(torsoD, jersey, [jerseyPts], true, (c) => {
    // Number: on the chest when the front shows, on the back when the back shows
    const show = Math.abs(sY);
    if (show < 0.08) return;
    const frontShows = -sY > 0; // depth of the forward axis
    const t = frontShows ? 0.6 : 0.62;
    const depth = frontShows ? 0.12 : 0.1;
    // Shift toward the visible surface's screen position
    const shift = (frontShows ? 1 : -1) * cY * depth * 0.55 * ppm;
    const cx = bx + sdx * t + nrx * shift;
    const cy = by + sdy * t + nry * shift;
    const size = (frontShows ? 0.2 : 0.26) * ppm;
    c.save();
    c.clip(jerseyPath);
    c.translate(cx, cy);
    c.rotate(Math.atan2(nry, nrx));
    c.scale(Math.max(0.12, show), 1);
    c.font = `900 ${size}px "Geist", "Arial Black", Impact, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalAlpha = 0.25 + 0.75 * show;
    c.fillStyle = kit.numberInk;
    c.fillText(kit.number, 0, 0);
    c.lineWidth = Math.max(0.8, size * 0.04);
    c.strokeStyle = kit.numberLine;
    c.strokeText(kit.number, 0, 0);
    c.restore();
    // Arm holes and neckline trim
    c.strokeStyle = kit.trim;
    c.lineWidth = Math.max(1, 0.012 * ppm);
    c.beginPath();
    const nx = X(sk.neck);
    const ny = Y(sk.neck);
    c.arc(nx + (X(sk.chest) - nx) * 0.6, ny + (Y(sk.chest) - ny) * 0.6, 0.075 * B * ppm, 0, TAU);
    c.stroke();
  });
  add(torsoD + 0.001, skin, [neckPoly], false);

  // Head: profile blended toward a round skull as the face turns to camera
  {
    const hx = X(sk.head);
    const hy = Y(sk.head);
    const R = r.headR * ppm;
    const face = Math.abs(cY);
    const fsign = cY >= 0 ? 1 : -1;
    // Screen up for the head (y down)
    const upx = sk.headUx;
    const upy = -sk.headUy;
    const ul = Math.hypot(upx, upy) || 1;
    const ax = upx / ul;
    const ay = upy / ul;
    // Forward on screen: perpendicular to up, toward the facing side
    const fx = -ay * fsign;
    const fy = ax * fsign;
    // A head point (qx forward, qy up) maps to forward * qx + up * qy on screen
    const pts: V[] = HEAD.map(([px, py], k) => {
      const qx = lerp(HEAD_ROUND[k][0], px, face);
      const qy = lerp(HEAD_ROUND[k][1], py, face);
      return [hx + (fx * qx + ax * qy) * R, hy + (fy * qx + ay * qy) * R] as V;
    });
    add(sk.head.d + 0.004, skin, [pts], false, kit.hair
      ? (c) => {
          // Short crop: a cap over the crown and back of the skull
          c.save();
          c.fillStyle = kit.hair!;
          c.beginPath();
          const n = 14;
          for (let k = 0; k <= n; k++) {
            const a = lerp(0.4, Math.PI + 0.6, k / n);
            const qx = Math.cos(a) * 1.02;
            const qy = Math.sin(a) * 1.04 - 0.02;
            const xx = hx + (fx * qx + ax * qy) * R;
            const yy = hy + (fy * qx + ay * qy) * R;
            if (k === 0) c.moveTo(xx, yy);
            else c.lineTo(xx, yy);
          }
          for (let k = n; k >= 0; k--) {
            const a = lerp(0.4, Math.PI + 0.6, k / n);
            const qx = Math.cos(a) * 0.86;
            const qy = Math.sin(a) * 0.86 + 0.06;
            c.lineTo(hx + (fx * qx + ax * qy) * R, hy + (fy * qx + ay * qy) * R);
          }
          c.closePath();
          c.fill();
          c.restore();
        }
      : undefined);
  }

  // Arms: deltoid, upper arm with biceps and triceps, forearm, hand with thumb
  for (let i = 0; i < 2; i++) {
    const sh = sk.sh[i];
    const el = sk.el[i];
    const wr = sk.wr[i];
    const d = sh.d * 1.02 + 0.01;
    const polys = [
      cap(mid(sh, el, -0.08), 0.068 * B, mid(sh, el, 0.36), 0.052 * B),
      cap(sh, 0.058 * B, el, 0.041 * B),
      belly(sh, el, 0.3, 0.72, 0.052 * B, 0.043 * B, 0.01 * B),
      belly(sh, el, 0.25, 0.7, 0.05 * B, 0.04 * B, -0.012 * B),
      cap(el, 0.043 * B, wr, 0.029 * B),
      belly(el, wr, 0.08, 0.45, 0.049 * B, 0.036 * B, 0.004 * B),
      cap(wr, 0.029, sk.knuckle[i], 0.036, 5),
      cap(sk.knuckle[i], 0.03, sk.tip[i], 0.016, 5),
      cap(wr, 0.022, sk.thumb[i], 0.014, 4),
    ];
    const sleeve = kit.sleeve?.arm === i;
    const band = kit.band?.arm === i;
    add(d, skin, polys, true, sleeve || band
      ? (c) => {
          if (sleeve) {
            c.fillStyle = kit.sleeve!.color;
            const p = new Path2D();
            addPoly(p, cap(mid(sh, el, 0.15), 0.05 * B, el, 0.041 * B, 6));
            addPoly(p, cap(el, 0.042 * B, mid(el, wr, 0.92), 0.03 * B, 6));
            c.fill(p);
          }
          if (band) {
            c.fillStyle = kit.band!.color;
            const p = new Path2D();
            addPoly(p, cap(mid(el, wr, 0.72), 0.034 * B, mid(el, wr, 0.95), 0.031 * B, 6));
            c.fill(p);
          }
        }
      : undefined);
  }

  // Rims: halo, key copy toward the light, kicker copy away from it
  const rs = Math.max(1.2, (light.size ?? 0.022) * ppm);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = light.halo;
  ctx.shadowBlur = Math.min(40, 0.22 * ppm);
  ctx.fillStyle = light.halo;
  ctx.globalAlpha = alpha * (light.haloAlpha ?? 0.5);
  ctx.fill(union);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = alpha;
  ctx.translate(-light.kx * rs * 0.8, -light.ky * rs * 0.8);
  ctx.fillStyle = light.back;
  ctx.fill(union);
  ctx.translate(light.kx * rs * 1.8, light.ky * rs * 1.8);
  ctx.fillStyle = light.key;
  ctx.fill(union);
  ctx.restore();

  // Body groups and extra layers in depth order
  const order: (Group | Layer)[] = [...groups, ...layers];
  order.sort((a, b) => a.d - b.d);
  ctx.save();
  ctx.globalAlpha = alpha;
  const sepW = Math.max(1, 0.012 * ppm);
  for (const g of order) {
    if ('draw' in g) {
      g.draw(ctx);
      continue;
    }
    if (g.sep) {
      ctx.save();
      ctx.clip(union);
      ctx.strokeStyle = light.sep;
      ctx.lineWidth = sepW * 2;
      ctx.lineJoin = 'round';
      ctx.stroke(g.path);
      ctx.restore();
    }
    ctx.fillStyle = g.fill;
    ctx.fill(g.path);
    g.after?.(ctx);
  }
  ctx.restore();
}

/* ---------- ball ---------- */

export const BALL_R = 0.12;

/**
 * Ball centre for hand `i`: 'palm' cups it on the flexion side, 'up' rests it on whichever
 * side of the hand faces up (a ball cocked overhead), 'down' palms it from above.
 */
export function gripPoint(sk: Skel, i: 0 | 1, mode: 'palm' | 'up' | 'down', out: { x: number; y: number; d: number }) {
  const w = sk.wr[i];
  const t = sk.tip[i];
  const hx = lerp(w.x, t.x, 0.45);
  const hy = lerp(w.y, t.y, 0.45);
  let nx: number;
  let ny: number;
  if (mode === 'palm') {
    const p = sk.palm[i];
    const l = Math.hypot(p.x - hx, p.y - hy) || 1;
    nx = (p.x - hx) / l;
    ny = (p.y - hy) / l;
  } else {
    const dx = t.x - w.x;
    const dy = t.y - w.y;
    const l = Math.hypot(dx, dy) || 1;
    nx = -dy / l;
    ny = dx / l;
    if ((mode === 'up') !== ny >= 0) {
      nx = -nx;
      ny = -ny;
    }
  }
  out.x = hx + nx * (BALL_R + 0.02);
  out.y = hy + ny * (BALL_R + 0.02);
  out.d = lerp(w.d, t.d, 0.5);
  return out;
}

/** A basketball: dark leather with a warm lit edge and seams that turn with `rot` */
export function drawBall(ctx: CanvasRenderingContext2D, cam: Cam, x: number, y: number, rot: number, light: RimLight, scale = 1) {
  const X = camX(cam, x);
  const Y = camY(cam, y);
  const R = BALL_R * cam.ppm * scale;
  ctx.save();
  ctx.shadowColor = light.halo;
  ctx.shadowBlur = Math.min(24, R * 0.9);
  const g = ctx.createRadialGradient(X + light.kx * R * 0.5, Y + light.ky * R * 0.5, R * 0.1, X, Y, R);
  g.addColorStop(0, '#c4581c');
  g.addColorStop(0.55, '#6b260a');
  g.addColorStop(1, '#1d0903');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(X, Y, R, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();
  ctx.strokeStyle = 'rgba(12,4,2,0.85)';
  ctx.lineWidth = Math.max(0.8, R * 0.09);
  ctx.translate(X, Y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(-R, 0);
  ctx.lineTo(R, 0);
  ctx.moveTo(0, -R);
  ctx.lineTo(0, R);
  ctx.moveTo(-R * 0.7, -R * 0.8);
  ctx.quadraticCurveTo(-R * 0.15, 0, -R * 0.7, R * 0.8);
  ctx.moveTo(R * 0.7, -R * 0.8);
  ctx.quadraticCurveTo(R * 0.15, 0, R * 0.7, R * 0.8);
  ctx.stroke();
  ctx.restore();
  // Rim light crescent toward the key
  ctx.save();
  ctx.strokeStyle = light.key;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(1, R * 0.14);
  const a = Math.atan2(light.ky, light.kx);
  ctx.beginPath();
  ctx.arc(X, Y, R * 0.94, a - 1.1, a + 1.1);
  ctx.stroke();
  ctx.restore();
}

/* ---------- hoop, rim and net ---------- */

const NET_S = 10;
const NET_K = 5;

export interface Hoop {
  x: number;
  y: number;
  r: number;
  /** Backboard face x */
  board: number;
  /** Rim vertical offset and velocity (spring), plus a held-down pull */
  dy: number;
  vy: number;
  pull: number;
  /** Net node offsets and velocities, [strand * NET_K + row] */
  ox: Float32Array;
  oy: Float32Array;
  vx: Float32Array;
  vyN: Float32Array;
  /** Net flare 0..1 (ball inside stretches it) */
  bulge: number;
}

export function makeHoop(x = 0, y = 3.05): Hoop {
  const n = NET_S * NET_K;
  return {
    x,
    y,
    r: 0.23,
    board: x + 0.38,
    dy: 0,
    vy: 0,
    pull: 0,
    ox: new Float32Array(n),
    oy: new Float32Array(n),
    vx: new Float32Array(n),
    vyN: new Float32Array(n),
    bulge: 0,
  };
}

const NET_DROP = 0.44;
const restOf = (h: Hoop, s: number, k: number) => {
  const a = (s / NET_S) * TAU + (k % 2) * (Math.PI / NET_S);
  const rr = lerp(h.r, h.r * 0.55, k / (NET_K - 1));
  return { a, rr, x: h.x + Math.cos(a) * rr, y: h.y - (k / (NET_K - 1)) * NET_DROP, depth: Math.sin(a) };
};

/** Kick the rim down (a dunk or a hard rim hit) */
export function rimHit(h: Hoop, v: number) {
  h.vy -= v;
}

/** Snap the net: a ball through pushes every node down and out, lower rows more */
export function netSnap(h: Hoop, strength: number, vx = 0) {
  for (let s = 0; s < NET_S; s++) {
    for (let k = 1; k < NET_K; k++) {
      const i = s * NET_K + k;
      const { a } = restOf(h, s, k);
      const kk = k / (NET_K - 1);
      h.vyN[i] -= strength * (0.6 + kk);
      h.vx[i] += Math.cos(a) * strength * 0.5 * kk + vx * 0.25 * kk;
    }
  }
}

/** Advance the rim spring and the net; `ball` (if any) stretches the net while inside it */
export function updateHoop(h: Hoop, dt: number, ball?: { x: number; y: number } | null) {
  // Rim: stiff spring with a held pull (a hand hanging on it)
  const target = -h.pull;
  h.vy += ((target - h.dy) * 900 - h.vy * 14) * dt;
  h.dy += h.vy * dt;
  let inside = 0;
  if (ball && Math.abs(ball.x - h.x) < h.r && ball.y < h.y + 0.05 && ball.y > h.y - NET_DROP - 0.1) inside = 1;
  h.bulge += (inside - h.bulge) * Math.min(1, dt * 18);
  for (let s = 0; s < NET_S; s++) {
    for (let k = 1; k < NET_K; k++) {
      const i = s * NET_K + k;
      const above = s * NET_K + k - 1;
      // Spring to rest, pulled toward the node above so motion travels down the strand
      const ax = -h.ox[i] * 160 + (h.ox[above] - h.ox[i]) * 60 - h.vx[i] * 7;
      const ay = -h.oy[i] * 160 + (h.oy[above] - h.oy[i]) * 60 - h.vyN[i] * 7;
      h.vx[i] += ax * dt;
      h.vyN[i] += ay * dt;
    }
  }
  for (let i = 0; i < h.ox.length; i++) {
    if (i % NET_K === 0) continue;
    h.ox[i] += h.vx[i] * dt;
    h.oy[i] += h.vyN[i] * dt;
  }
}

export interface HoopStyle {
  rim: string;
  rimGlow: string;
  net: string;
  board: string;
  boardEdge: string;
  pole: string;
}

const nodeXY = (cam: Cam, h: Hoop, s: number, k: number): [number, number, number] => {
  const rest = restOf(h, s, k);
  const i = s * NET_K + k;
  const flare = h.bulge * Math.max(0, 0.13 - rest.rr * 0.35) * (k > 0 ? 1 : 0);
  const tilt = h.r * 0.2;
  const x = h.x + Math.cos(rest.a) * (rest.rr + flare) + h.ox[i];
  const y = rest.y + h.dy * (1 - k / NET_K) + h.oy[i] + Math.sin(rest.a) * tilt * (1 - (k / NET_K) * 0.5);
  return [camX(cam, x), camY(cam, y), rest.depth];
};

/** Stanchion, backboard, the back half of the rim and net (draw before the ball) */
export function drawHoopBack(ctx: CanvasRenderingContext2D, cam: Cam, h: Hoop, st: HoopStyle) {
  const ppm = cam.ppm;
  const bd = h.dy * 0.35;
  const bx = camX(cam, h.board);
  // Stanchion: base behind the baseline, a pole and an arm out to the board
  const px = camX(cam, h.board + 1.25);
  ctx.save();
  ctx.fillStyle = st.pole;
  ctx.strokeStyle = st.boardEdge;
  ctx.lineWidth = Math.max(1, 0.01 * ppm);
  ctx.beginPath();
  ctx.moveTo(px - 0.1 * ppm, camY(cam, 0));
  ctx.lineTo(px - 0.07 * ppm, camY(cam, 3.3));
  ctx.lineTo(bx + 0.06 * ppm, camY(cam, 3.42 + bd));
  ctx.lineTo(bx + 0.06 * ppm, camY(cam, 3.3 + bd));
  ctx.lineTo(px + 0.07 * ppm, camY(cam, 2.95));
  ctx.lineTo(px + 0.12 * ppm, camY(cam, 0));
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Padded base
  ctx.fillRect(px - 0.32 * ppm, camY(cam, 0.55), 0.7 * ppm, 0.55 * ppm);
  // Backboard, edge on, with a lit face
  const by0 = camY(cam, 3.95 + bd);
  const by1 = camY(cam, 2.9 + bd);
  ctx.fillStyle = st.board;
  ctx.fillRect(bx, by0, 0.05 * ppm, by1 - by0);
  ctx.fillStyle = st.boardEdge;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(bx - Math.max(1, 0.008 * ppm), by0, Math.max(1, 0.012 * ppm), by1 - by0);
  ctx.globalAlpha = 1;
  // Bracket from the board to the rim
  ctx.strokeStyle = st.pole;
  ctx.lineWidth = Math.max(1.5, 0.035 * ppm);
  ctx.beginPath();
  ctx.moveTo(bx, camY(cam, h.y + h.dy - 0.06));
  ctx.lineTo(camX(cam, h.x + h.r), camY(cam, h.y + h.dy));
  ctx.stroke();
  ctx.restore();
  drawNet(ctx, cam, h, st, false);
  drawRimArc(ctx, cam, h, st, false);
}

/** The front half of the net and rim (draw after the ball) */
export function drawHoopFront(ctx: CanvasRenderingContext2D, cam: Cam, h: Hoop, st: HoopStyle) {
  drawNet(ctx, cam, h, st, true);
  drawRimArc(ctx, cam, h, st, true);
}

function drawRimArc(ctx: CanvasRenderingContext2D, cam: Cam, h: Hoop, st: HoopStyle, front: boolean) {
  const cx = camX(cam, h.x);
  const cy = camY(cam, h.y + h.dy);
  const rx = h.r * cam.ppm;
  const ry = rx * 0.2;
  ctx.save();
  ctx.lineCap = 'round';
  const a0 = front ? 0 : Math.PI;
  const a1 = front ? Math.PI : TAU;
  ctx.strokeStyle = st.rimGlow;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(2, 0.06 * cam.ppm);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, a0, a1);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = st.rim;
  ctx.lineWidth = Math.max(1.5, 0.026 * cam.ppm);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, a0, a1);
  ctx.stroke();
  ctx.restore();
}

function drawNet(ctx: CanvasRenderingContext2D, cam: Cam, h: Hoop, st: HoopStyle, front: boolean) {
  ctx.save();
  ctx.strokeStyle = st.net;
  ctx.lineWidth = Math.max(0.7, 0.008 * cam.ppm);
  ctx.globalAlpha = front ? 0.85 : 0.45;
  ctx.beginPath();
  for (let s = 0; s < NET_S; s++) {
    for (let k = 0; k < NET_K - 1; k++) {
      // Diamond mesh: each node ties to the next row on its own strand and the neighbour's
      const [x0, y0, d0] = nodeXY(cam, h, s, k);
      const [x1, y1] = nodeXY(cam, h, s, k + 1);
      const s2 = k % 2 === 0 ? (s + NET_S - 1) % NET_S : (s + 1) % NET_S;
      const [x2, y2, d2] = nodeXY(cam, h, s2, k + 1);
      if (d0 >= 0 === front) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      if ((d0 + d2) / 2 >= 0 === front) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x2, y2);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

/* ---------- arena ---------- */

/**
 * Amplitude modulated halftone: paint grey levels with `paint` (white, alpha = tone) and get
 * back a layer of ink dots on a rotated screen whose size follows the tone.
 */
export function halftoneLayer(
  w: number,
  h: number,
  dpr: number,
  cell: number,
  angleDeg: number,
  ink: string,
  paint: (ctx: CanvasRenderingContext2D) => void,
  into?: HTMLCanvasElement
): HTMLCanvasElement {
  const mw = Math.max(1, Math.round(w));
  const mh = Math.max(1, Math.round(h));
  const mask = document.createElement('canvas');
  mask.width = mw;
  mask.height = mh;
  const mc = mask.getContext('2d', { willReadFrequently: true });
  const out = into ?? document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * dpr));
  out.height = Math.max(1, Math.round(h * dpr));
  const oc = out.getContext('2d');
  if (!mc || !oc) return out;
  paint(mc);
  const data = mc.getImageData(0, 0, mw, mh).data;
  oc.setTransform(dpr, 0, 0, dpr, 0, 0);
  oc.fillStyle = ink;
  oc.beginPath();
  const a = angleDeg * D;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const reach = Math.hypot(w, h);
  const n = Math.ceil(reach / cell);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const gx = i * cell;
      const gy = j * cell;
      const x = w / 2 + gx * ca - gy * sa;
      const y = h / 2 + gx * sa + gy * ca;
      if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
      const px = clamp(Math.round(x), 0, mw - 1);
      const py = clamp(Math.round(y), 0, mh - 1);
      const tone01 = data[(py * mw + px) * 4 + 3] / 255;
      if (tone01 < 0.02) continue;
      const rr = cell * 0.62 * Math.sqrt(tone01);
      oc.moveTo(x + rr, y);
      oc.arc(x, y, rr, 0, TAU);
    }
  }
  oc.fill();
  return out;
}

/** Paint a giant jersey numeral as a tone mask (for halftoneLayer) */
export function numeralTone(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, rotDeg: number, top = 0.95, bottom = 0.35) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotDeg * D);
  ctx.font = `900 ${size}px "Geist", "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const g = ctx.createLinearGradient(0, -size * 0.75, 0, 0);
  g.addColorStop(0, `rgba(255,255,255,${top})`);
  g.addColorStop(1, `rgba(255,255,255,${bottom})`);
  ctx.fillStyle = g;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Hairline outline of the numeral over its dots */
export function numeralLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, rotDeg: number, color: string, alpha = 0.5) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotDeg * D);
  ctx.font = `900 ${size}px "Geist", "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.004);
  ctx.strokeText(text, 0, 0);
  ctx.restore();
}

export interface Fan {
  x: number;
  row: number;
  s: number;
  lean: number;
  arm: number;
}

/** Deterministic rows of fans spread along the far sideline */
export function makeCrowd(seed: number, x0: number, x1: number, rows: number, perMetre: number): Fan[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: Fan[] = [];
  for (let r = 0; r < rows; r++) {
    const n = Math.round((x1 - x0) * perMetre);
    for (let i = 0; i < n; i++) {
      out.push({ x: x0 + ((i + rnd() * 0.8) / n) * (x1 - x0), row: r, s: 0.85 + rnd() * 0.3, lean: rnd() * 2 - 1, arm: rnd() });
    }
  }
  return out;
}

/**
 * Fans as head-and-shoulder silhouettes, back rows higher and smaller, panned with
 * parallax `par`. `cheer` 0..1 raises arms and bounces the crowd.
 */
export function drawCrowd(ctx: CanvasRenderingContext2D, cam: Cam, fans: Fan[], par: number, baseY: number, rowH: number, fill: string, cheer: number, t: number) {
  const ppm = cam.ppm * par;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (const f of fans) {
    const x = cam.w / 2 + (f.x - cam.cx * par) * ppm + cam.sx * par;
    if (x < -40 || x > cam.w + 40) continue;
    const bounce = cheer * Math.max(0, Math.sin(t * 9 + f.lean * 5)) * 0.06 * ppm;
    const y = baseY - f.row * rowH * ppm - bounce + cam.sy * par;
    const hr = 0.11 * f.s * ppm * (1 - f.row * 0.08);
    const sw = hr * 2.1;
    ctx.moveTo(x - sw, y + hr * 3);
    ctx.quadraticCurveTo(x - sw, y + hr * 0.9, x, y + hr * 0.85);
    ctx.quadraticCurveTo(x + sw, y + hr * 0.9, x + sw, y + hr * 3);
    ctx.closePath();
    ctx.moveTo(x + hr, y);
    ctx.arc(x, y, hr, 0, TAU);
    if (cheer > 0.2 && f.arm > 1 - cheer * 0.6) {
      const side = f.lean > 0 ? 1 : -1;
      const ax = x + side * sw * 0.8;
      ctx.moveTo(ax - hr * 0.35, y + hr * 1.2);
      ctx.lineTo(ax + side * hr * 0.9 - hr * 0.3, y - hr * 2.6);
      ctx.lineTo(ax + side * hr * 0.9 + hr * 0.3, y - hr * 2.6);
      ctx.lineTo(ax + hr * 0.35, y + hr * 1.2);
      ctx.closePath();
    }
  }
  ctx.fill();
  ctx.restore();
}

export interface Flash {
  x: number;
  y: number;
  life: number;
  size: number;
}

/** Camera flash pops: a hot core and a soft star */
export function drawFlashes(ctx: CanvasRenderingContext2D, flashes: Flash[], color: string) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of flashes) {
    if (f.life <= 0) continue;
    const k = f.life;
    const R = f.size * (0.6 + k);
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R * 3);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
    g.addColorStop(0.2, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = k;
    ctx.fillStyle = g;
    ctx.fillRect(f.x - R * 3, f.y - R * 3, R * 6, R * 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(f.x - R * 2.5, f.y);
    ctx.lineTo(f.x + R * 2.5, f.y);
    ctx.moveTo(f.x, f.y - R * 2.5);
    ctx.lineTo(f.x, f.y + R * 2.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** Darken the corners so the poster reads as one image */
export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.6) {
  const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Small mono caps label */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${size}px "Geist Mono", ui-monospace, Menlo, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Big poster word, heavy and slightly tracked */
export function headline(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, glow: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px "Geist", "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glow;
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* ---------- sound ---------- */

/** Crowd roar: a swell of band-passed noise */
export function crowdRoar(bus: AudioBus, dur = 1.8, gain = 0.16) {
  const { ctx, out } = bus;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 0.6;
  const g = ctx.createGain();
  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out);
  src.start();
}

export function sfxSwish(bus: AudioBus, gain = 0.22) {
  noise(bus, { duration: 0.22, gain, freq: 5200, q: 0.7, type: 'highpass' });
  noise(bus, { duration: 0.12, gain: gain * 0.6, freq: 2600, q: 1.2 });
}

export function sfxRim(bus: AudioBus, hard = 1) {
  tone(bus, 520, { type: 'triangle', decay: 0.35 * hard, gain: 0.12 * hard });
  tone(bus, 1310, { type: 'sine', decay: 0.25, gain: 0.06 * hard });
  noise(bus, { duration: 0.06, gain: 0.12 * hard, freq: 3000, q: 2 });
}

export function sfxSlam(bus: AudioBus) {
  tone(bus, 110, { type: 'sine', decay: 0.4, gain: 0.35, glideTo: 48 });
  sfxRim(bus, 1.3);
  noise(bus, { duration: 0.3, gain: 0.25, freq: 400, q: 0.6, type: 'lowpass' });
}

export function sfxBounce(bus: AudioBus, k = 1) {
  tone(bus, 140, { type: 'sine', decay: 0.12, gain: 0.22 * k, glideTo: 90 });
  noise(bus, { duration: 0.05, gain: 0.08 * k, freq: 700, q: 1 });
}

export function sfxSqueak(bus: AudioBus) {
  tone(bus, 1900 + Math.random() * 500, { type: 'sine', decay: 0.07, gain: 0.05, glideTo: 2600 });
}

export function sfxShutter(bus: AudioBus) {
  noise(bus, { duration: 0.025, gain: 0.12, freq: 6000, q: 1, type: 'highpass' });
  noise(bus, { duration: 0.03, gain: 0.08, freq: 4000, q: 1, type: 'highpass' });
}

export function sfxWhoosh(bus: AudioBus, gain = 0.12) {
  noise(bus, { duration: 0.35, gain, freq: 900, q: 0.5 });
}
