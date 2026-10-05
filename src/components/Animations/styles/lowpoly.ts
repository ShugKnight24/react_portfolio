/**
 * Low poly series: a tiny software 3D pipeline for PS1 / N64-era cut-scenes (direct mode).
 *
 * Meshes are triangle lists with per-face colours. Every frame they are transformed into view
 * space, back-face culled, clipped against the near plane (and an optional world floor plane),
 * flat shaded from one directional light plus ambient, fogged per vertex, projected with
 * perspective and snapped to whole pixels (the PS1 vertex wobble comes for free). The triangles
 * are painter-sorted by depth inside render layers and rasterised by hand into a 480 x 270
 * Uint32 buffer with Gouraud fog, 15-bit colour and a 4 x 4 ordered dither, then blown up with
 * nearest neighbour. On top: a procedural sky with a sun, billboards, buffer post effects,
 * a soft CRT overlay and a chunky arcade HUD drawn at full resolution.
 * Everything is deterministic; films stay pure functions of t.
 */
import type { Ctx } from '../riso/engine';
import { TAU, clamp, lerp, mulberry, DISPLAY } from '../riso/kit';

export const RW = 480;
export const RH = 270;

export type V3 = [number, number, number];
export type RGB = [number, number, number];

/* ---------- colour ---------- */

export const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mixRGB = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const scaleRGB = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const toCol = (c: RGB | string): RGB => (typeof c === 'string' ? rgb(c) : c);
export const css = (c: RGB, a = 1) =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/* ---------- vectors and 3x4 matrices ---------- */

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** Column-major 3x4: [Xx,Xy,Xz, Yx,Yy,Yz, Zx,Zy,Zz, Tx,Ty,Tz] */
export type M34 = Float64Array;

export const ident = (): M34 => new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);

/** a * b (apply b first) */
export const mmul = (a: M34, b: M34): M34 => {
  const o = new Float64Array(12);
  for (let c = 0; c < 4; c++) {
    const x = b[c * 3];
    const y = b[c * 3 + 1];
    const z = b[c * 3 + 2];
    o[c * 3] = a[0] * x + a[3] * y + a[6] * z + (c === 3 ? a[9] : 0);
    o[c * 3 + 1] = a[1] * x + a[4] * y + a[7] * z + (c === 3 ? a[10] : 0);
    o[c * 3 + 2] = a[2] * x + a[5] * y + a[8] * z + (c === 3 ? a[11] : 0);
  }
  return o;
};

/**
 * T * Ry(yaw) * Rx(pitch) * Rz(roll) * S. Yaw turns +z toward +x, pitch lifts +z toward +y,
 * roll turns +x toward +y. So an object facing +z with yaw a faces (sin a, 0, cos a).
 */
export const mat = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx): M34 => {
  const cy = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  // R = Ry * Rx * Rz, columns
  // Rz columns: X=(cr,sr,0) Y=(-sr,cr,0) Z=(0,0,1)
  // Rx maps (x,y,z) -> (x, y cp - z sp?, ...): pitch lifts +z toward +y => Z -> (0, sp, cp), Y -> (0, cp, -sp)
  const rx = (vx: number, vy: number, vz: number): V3 => [vx, vy * cp + vz * sp, -vy * sp + vz * cp];
  const ry = (v: V3): V3 => [v[0] * cy + v[2] * syw, v[1], -v[0] * syw + v[2] * cy];
  const X = ry(rx(cr, sr, 0));
  const Y = ry(rx(-sr, cr, 0));
  const Z = ry(rx(0, 0, 1));
  return new Float64Array([X[0] * sx, X[1] * sx, X[2] * sx, Y[0] * sy, Y[1] * sy, Y[2] * sy, Z[0] * sz, Z[1] * sz, Z[2] * sz, x, y, z]);
};

/** Frame from an origin and a forward / up pair (forward = +z, up = +y of the object) */
export const frame = (o: V3, fwd: V3, up: V3 = [0, 1, 0], s = 1): M34 => {
  const f = norm(fwd);
  const r = norm(cross(up, f));
  const u = cross(f, r);
  return new Float64Array([r[0] * s, r[1] * s, r[2] * s, u[0] * s, u[1] * s, u[2] * s, f[0] * s, f[1] * s, f[2] * s, o[0], o[1], o[2]]);
};

export const apply = (m: M34, p: V3): V3 => [
  m[0] * p[0] + m[3] * p[1] + m[6] * p[2] + m[9],
  m[1] * p[0] + m[4] * p[1] + m[7] * p[2] + m[10],
  m[2] * p[0] + m[5] * p[1] + m[8] * p[2] + m[11],
];

/** Rotate a vector about an axis (Rodrigues) */
export const rotAxis = (v: V3, axis: V3, a: number): V3 => {
  const k = norm(axis);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
};

/* ---------- meshes ---------- */

/** Face flags */
export const F_UNLIT = 1; // ignore the light (emissive)
export const F_NOFOG = 2;
export const F_TWO = 4; // double sided
export const F_ALPHA = 8; // 50% blend (PS1 semi-transparency)
export const F_ADD = 16; // additive

export interface Mesh {
  v: Float32Array;
  f: Uint32Array;
  /** rgb per face, 0..255 */
  c: Float32Array;
  fl: Uint8Array;
  /** bounding sphere in object space */
  bs: [number, number, number, number];
  /** specular strength (0 = matte) and power */
  spec: number;
  shin: number;
}

export const bounds = (m: Mesh) => {
  const v = m.v;
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    x0 = Math.min(x0, v[i]);
    x1 = Math.max(x1, v[i]);
    y0 = Math.min(y0, v[i + 1]);
    y1 = Math.max(y1, v[i + 1]);
    z0 = Math.min(z0, v[i + 2]);
    z1 = Math.max(z1, v[i + 2]);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  let r = 0;
  for (let i = 0; i < v.length; i += 3) r = Math.max(r, Math.hypot(v[i] - cx, v[i + 1] - cy, v[i + 2] - cz));
  m.bs = [cx, cy, cz, r];
  return m;
};

export class MeshB {
  v: number[] = [];
  f: number[] = [];
  c: number[] = [];
  fl: number[] = [];

  vert(p: V3, M?: M34) {
    const q = M ? apply(M, p) : p;
    this.v.push(q[0], q[1], q[2]);
    return this.v.length / 3 - 1;
  }

  tri(a: number, b: number, c: number, col: RGB | string, flags = 0) {
    const k = toCol(col);
    this.f.push(a, b, c);
    this.c.push(k[0], k[1], k[2]);
    this.fl.push(flags);
    return this;
  }

  /** Convex polygon, counter-clockwise seen from outside */
  poly(pts: V3[], col: RGB | string, flags = 0, M?: M34) {
    const ids = pts.map((p) => this.vert(p, M));
    for (let i = 1; i < ids.length - 1; i++) this.tri(ids[0], ids[i], ids[i + 1], col, flags);
    return this;
  }

  quad(a: V3, b: V3, c: V3, d: V3, col: RGB | string, flags = 0, M?: M34) {
    return this.poly([a, b, c, d], col, flags, M);
  }

  /** Axis box centred on the origin, before M. cols: one colour or [top, bottom, sides] */
  box(w: number, h: number, d: number, col: RGB | string | (RGB | string)[], M?: M34, flags = 0) {
    const x = w / 2;
    const y = h / 2;
    const z = d / 2;
    const cs = Array.isArray(col) && typeof col[0] !== 'number' ? (col as (RGB | string)[]) : [col as RGB | string];
    const top = cs[0];
    const bot = cs[1] ?? cs[0];
    const side = cs[2] ?? cs[0];
    const front = cs[3] ?? side;
    this.quad([-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z], top, flags, M);
    this.quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], bot, flags, M);
    this.quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], front, flags, M);
    this.quad([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], side, flags, M);
    this.quad([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], side, flags, M);
    this.quad([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], side, flags, M);
    return this;
  }

  /**
   * Tapered prism along +y from y = 0 to y = h, n sides, radius r0 at the bottom and r1 at the
   * top, flattened in z by `flat`. Good for limbs, columns, trunks, wheels (rotate it).
   */
  frustum(n: number, r0: number, r1: number, h: number, col: RGB | string, M?: M34, o: { flat?: number; caps?: boolean; capCol?: RGB | string; a0?: number; flags?: number; shade?: number } = {}) {
    const flat = o.flat ?? 1;
    const a0 = o.a0 ?? Math.PI / n;
    const fl = o.flags ?? 0;
    const base = toCol(col);
    const bot: number[] = [];
    const top: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      bot.push(this.vert([Math.cos(a) * r0, 0, Math.sin(a) * r0 * flat], M));
      top.push(this.vert([Math.cos(a) * r1, h, Math.sin(a) * r1 * flat], M));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const k = o.shade ? 1 - o.shade * ((i * 7) % 3) / 2 : 1;
      const cc: RGB = [base[0] * k, base[1] * k, base[2] * k];
      this.tri(bot[i], top[i], top[j], cc, fl);
      this.tri(bot[i], top[j], bot[j], cc, fl);
    }
    if (o.caps !== false) {
      const cap = o.capCol ?? col;
      if (r1 > 0.0001) for (let i = 1; i < n - 1; i++) this.tri(top[0], top[i + 1], top[i], cap, fl);
      if (r0 > 0.0001) for (let i = 1; i < n - 1; i++) this.tri(bot[0], bot[i], bot[i + 1], cap, fl);
    }
    return this;
  }

  /** Low poly lumpy rock: an icosahedron with seeded jitter, optionally subdivided once */
  rock(r: number, seed: number, col: RGB | string, M?: M34, o: { jit?: number; sub?: boolean; sy?: number; vary?: number; flags?: number } = {}) {
    const rng = mulberry(seed);
    const t = (1 + Math.sqrt(5)) / 2;
    let verts: V3[] = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map((p) => norm(p as V3));
    let faces: number[][] = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    if (o.sub) {
      const cache = new Map<string, number>();
      const mid = (a: number, b: number) => {
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        let id = cache.get(key);
        if (id === undefined) {
          verts.push(norm(lerp3(verts[a], verts[b], 0.5)));
          id = verts.length - 1;
          cache.set(key, id);
        }
        return id;
      };
      const nf: number[][] = [];
      for (const [a, b, c] of faces) {
        const ab = mid(a, b);
        const bc = mid(b, c);
        const ca = mid(c, a);
        nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = nf;
    }
    const jit = o.jit ?? 0.28;
    const sy = o.sy ?? 1;
    verts = verts.map((p) => {
      const k = r * (1 - jit / 2 + rng() * jit);
      return [p[0] * k, p[1] * k * sy, p[2] * k];
    });
    const ids = verts.map((p) => this.vert(p, M));
    const base = toCol(col);
    const vary = o.vary ?? 0.12;
    for (const [a, b, c] of faces) {
      const k = 1 - vary / 2 + rng() * vary;
      this.tri(ids[a], ids[b], ids[c], [base[0] * k, base[1] * k, base[2] * k], o.flags ?? 0);
    }
    return this;
  }

  /** Copy another builder's triangles in, through M */
  merge(b: MeshB, M?: M34) {
    const off = this.v.length / 3;
    for (let i = 0; i < b.v.length; i += 3) this.vert([b.v[i], b.v[i + 1], b.v[i + 2]], M);
    for (let i = 0; i < b.f.length; i++) this.f.push(b.f[i] + off);
    this.c.push(...b.c);
    this.fl.push(...b.fl);
    return this;
  }

  build(o: { spec?: number; shin?: number } = {}): Mesh {
    return bounds({
      v: new Float32Array(this.v),
      f: new Uint32Array(this.f),
      c: new Float32Array(this.c),
      fl: new Uint8Array(this.fl),
      bs: [0, 0, 0, 0],
      spec: o.spec ?? 0,
      shin: o.shin ?? 24,
    });
  }
}

/** Unshare a mesh so each face owns its three vertices (for shattering) */
export const shardsOf = (m: Mesh, M?: M34) => {
  const nf = m.f.length / 3;
  const v = new Float32Array(nf * 9);
  const f = new Uint32Array(nf * 3);
  const cen = new Float32Array(nf * 3);
  const nrm = new Float32Array(nf * 3);
  for (let i = 0; i < nf; i++) {
    const ps: V3[] = [];
    for (let k = 0; k < 3; k++) {
      const j = m.f[i * 3 + k] * 3;
      const p: V3 = [m.v[j], m.v[j + 1], m.v[j + 2]];
      ps.push(M ? apply(M, p) : p);
    }
    const c = mul(add(add(ps[0], ps[1]), ps[2]), 1 / 3);
    const n = norm(cross(sub(ps[1], ps[0]), sub(ps[2], ps[0])));
    for (let k = 0; k < 3; k++) {
      v.set([ps[k][0] - c[0], ps[k][1] - c[1], ps[k][2] - c[2]], i * 9 + k * 3);
      f[i * 3 + k] = i * 3 + k;
    }
    cen.set(c, i * 3);
    nrm.set(n, i * 3);
  }
  return { local: v, cen, nrm, mesh: bounds({ v: new Float32Array(v.length), f, c: m.c.slice(), fl: m.fl.slice(), bs: [0, 0, 0, 0], spec: m.spec, shin: m.shin }) };
};

/* ---------- the renderer ---------- */

export interface Cam {
  eye: V3;
  at: V3;
  /** vertical field of view in degrees */
  fov: number;
  roll?: number;
}

export interface Env {
  fog: RGB;
  fogNear: number;
  fogFar: number;
  /** direction toward the light, world space */
  sun: V3;
  sunCol: RGB;
  amb: RGB;
  /** optional sky-light from below/above: added as amb * (0.5 + 0.5 n.y) * hemi */
  hemi?: number;
  /** pixel snap grid for vertices (1 = PS1 wobble, 0 = off) */
  snap?: number;
}

export interface DrawOpts {
  /** render layer: lower layers are drawn first (ground under everything) */
  layer?: number;
  /** keep only geometry with world y >= clipY */
  clipY?: number;
  /** multiply face colour */
  tint?: RGB;
  /** add to face colour (flash / glow) */
  glow?: RGB;
  /** depth bias in world units (positive = drawn later / in front) */
  bias?: number;
  /** override blend flags for every face */
  flags?: number;
  alpha?: number;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b / 16 - 0.47) * 8);
const Q5 = new Uint8Array(256);
for (let i = 0; i < 256; i++) Q5[i] = ((i >> 3) << 3) | (i >> 5);

const STRIDE = 15;

export class LowPoly {
  readonly w: number;
  readonly h: number;
  readonly canvas: HTMLCanvasElement;
  private ctx: Ctx;
  private img: ImageData;
  readonly buf: Uint32Array;
  // camera
  private V: M34 = ident();
  private f = 1;
  private tanX = 1;
  private tanY = 1;
  near = 0.25;
  far = 2000;
  private env: Env = { fog: [0, 0, 0], fogNear: 50, fogFar: 300, sun: [0, 1, 0], sunCol: [255, 255, 255], amb: [60, 60, 60] };
  private lv: V3 = [0, 1, 0];
  private upv: V3 = [0, 1, 0];
  private fwdW: V3 = [0, 0, 1];
  private rightW: V3 = [1, 0, 0];
  private upW: V3 = [0, 1, 0];
  eye: V3 = [0, 0, 0];
  // triangle queue
  private cap = 0;
  private tri = new Float32Array(0);
  private key = new Float64Array(0);
  private alpha = new Float32Array(0);
  private mode = new Uint8Array(0);
  private order = new Uint32Array(0);
  n = 0;
  // scratch
  private tv = new Float32Array(3 * 4096);
  private twy = new Float32Array(4096);

  constructor(w = RW, h = RH) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    this.img = ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.grow(8192);
  }

  private grow(n: number) {
    const old = this.tri;
    const ok = this.key;
    const oa = this.alpha;
    const om = this.mode;
    this.cap = n;
    this.tri = new Float32Array(n * STRIDE);
    this.tri.set(old);
    this.key = new Float64Array(n);
    this.key.set(ok);
    this.alpha = new Float32Array(n);
    this.alpha.set(oa);
    this.mode = new Uint8Array(n);
    this.mode.set(om);
    this.order = new Uint32Array(n);
  }

  /** Set camera and lighting and clear the queue */
  begin(cam: Cam, env: Env) {
    const f = norm(sub(cam.at, cam.eye));
    let r = norm(cross(f, [0, 1, 0]));
    if (!isFinite(r[0]) || len(r) < 0.5) r = [1, 0, 0];
    let u = cross(r, f);
    if (cam.roll) {
      const r2 = rotAxis(r, f, cam.roll);
      u = rotAxis(u, f, cam.roll);
      r = r2;
    }
    const e = cam.eye;
    this.eye = e;
    this.fwdW = f;
    this.rightW = r;
    this.upW = u;
    this.V = new Float64Array([r[0], u[0], f[0], r[1], u[1], f[1], r[2], u[2], f[2], -dot(e, r), -dot(e, u), -dot(e, f)]);
    this.f = this.h / 2 / Math.tan((cam.fov * Math.PI) / 360);
    this.tanY = this.h / 2 / this.f;
    this.tanX = this.w / 2 / this.f;
    this.env = env;
    const s = norm(env.sun);
    this.lv = [dot(s, r), dot(s, u), dot(s, f)];
    this.upv = [r[1], u[1], f[1]];
    this.n = 0;
  }

  /** Screen position (in RW x RH px) and view depth of a world point, or null behind the camera */
  project(p: V3): [number, number, number] | null {
    const V = this.V;
    const x = V[0] * p[0] + V[3] * p[1] + V[6] * p[2] + V[9];
    const y = V[1] * p[0] + V[4] * p[1] + V[7] * p[2] + V[10];
    const z = V[2] * p[0] + V[5] * p[1] + V[8] * p[2] + V[11];
    if (z < this.near) return null;
    return [this.w / 2 + (x * this.f) / z, this.h / 2 - (y * this.f) / z, z];
  }

  /** Procedural sky: gradient over elevation (stops: [sinElev, colour]), plus an optional sun */
  sky(stops: [number, RGB][], sun?: { dir: V3; col: RGB; size: number; glow: RGB; glowPow?: number; glowAmt?: number }) {
    const { w, h, buf } = this;
    const LUT = 128;
    const lr = new Float32Array(LUT * 3);
    for (let i = 0; i < LUT; i++) {
      const e = (i / (LUT - 1)) * 2 - 1;
      let j = 0;
      while (j < stops.length - 2 && e > stops[j + 1][0]) j++;
      const a = stops[j];
      const b = stops[Math.min(stops.length - 1, j + 1)];
      const k = clamp((e - a[0]) / (b[0] - a[0] || 1));
      lr[i * 3] = lerp(a[1][0], b[1][0], k);
      lr[i * 3 + 1] = lerp(a[1][1], b[1][1], k);
      lr[i * 3 + 2] = lerp(a[1][2], b[1][2], k);
    }
    const F = this.fwdW;
    const R = this.rightW;
    const U = this.upW;
    const inv = 1 / this.f;
    const sd = sun ? norm(sun.dir) : ([0, 1, 0] as V3);
    const sF = dot(sd, F);
    const sR = dot(sd, R);
    const sU = dot(sd, U);
    const cosS = sun ? Math.cos(sun.size) : 2;
    const gp = sun?.glowPow ?? 6;
    const ga = sun?.glowAmt ?? 1;
    for (let y = 0; y < h; y++) {
      const v = (h / 2 - (y + 0.5)) * inv;
      const row = y * w;
      const by = (y & 3) << 2;
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5 - w / 2) * inv;
        const il = 1 / Math.sqrt(1 + u * u + v * v);
        const e = (F[1] + R[1] * u + U[1] * v) * il;
        const li = ((clamp((e + 1) / 2) * (LUT - 1)) | 0) * 3;
        let cr = lr[li];
        let cg = lr[li + 1];
        let cb = lr[li + 2];
        if (sun) {
          const s = (sF + sR * u + sU * v) * il;
          if (s > cosS) {
            cr = sun.col[0];
            cg = sun.col[1];
            cb = sun.col[2];
          } else if (s > 0) {
            const g = Math.pow(s, gp) * ga;
            cr += sun.glow[0] * g;
            cg += sun.glow[1] * g;
            cb += sun.glow[2] * g;
          }
        }
        const d = BAYER[by | (x & 3)];
        const R8 = cr + d;
        const G8 = cg + d;
        const B8 = cb + d;
        buf[row + x] =
          0xff000000 |
          (Q5[B8 < 0 ? 0 : B8 > 255 ? 255 : B8 | 0] << 16) |
          (Q5[G8 < 0 ? 0 : G8 > 255 ? 255 : G8 | 0] << 8) |
          Q5[R8 < 0 ? 0 : R8 > 255 ? 255 : R8 | 0];
      }
    }
  }

  clear(c: RGB) {
    this.buf.fill(0xff000000 | ((c[2] | 0) << 16) | ((c[1] | 0) << 8) | (c[0] | 0));
  }

  private push(n: number) {
    if (this.n + n >= this.cap) this.grow(this.cap * 2);
  }

  /** Queue a mesh through model matrix M */
  mesh(m: Mesh, M: M34, o: DrawOpts = {}) {
    const V = this.V;
    // bounding sphere cull
    const [bx, by, bz, br] = m.bs;
    const sc = Math.max(Math.hypot(M[0], M[1], M[2]), Math.hypot(M[3], M[4], M[5]), Math.hypot(M[6], M[7], M[8]));
    const wc = apply(M, [bx, by, bz]);
    const R = br * sc;
    const cx = V[0] * wc[0] + V[3] * wc[1] + V[6] * wc[2] + V[9];
    const cy = V[1] * wc[0] + V[4] * wc[1] + V[7] * wc[2] + V[10];
    const cz = V[2] * wc[0] + V[5] * wc[1] + V[8] * wc[2] + V[11];
    if (cz + R < this.near || cz - R > this.far) return;
    if (Math.abs(cx) - R * 1.05 > (cz + R) * this.tanX + R) return;
    if (Math.abs(cy) - R * 1.05 > (cz + R) * this.tanY + R) return;
    if (o.clipY !== undefined && wc[1] + R < o.clipY) return;
    const VM = mmul(V, M);
    const nv = m.v.length / 3;
    if (this.tv.length < nv * 3) {
      this.tv = new Float32Array(nv * 3 * 2);
      this.twy = new Float32Array(nv * 2);
    }
    const tv = this.tv;
    const twy = this.twy;
    const src = m.v;
    for (let i = 0; i < nv; i++) {
      const x = src[i * 3];
      const y = src[i * 3 + 1];
      const z = src[i * 3 + 2];
      tv[i * 3] = VM[0] * x + VM[3] * y + VM[6] * z + VM[9];
      tv[i * 3 + 1] = VM[1] * x + VM[4] * y + VM[7] * z + VM[10];
      tv[i * 3 + 2] = VM[2] * x + VM[5] * y + VM[8] * z + VM[11];
      if (o.clipY !== undefined) twy[i] = M[1] * x + M[4] * y + M[7] * z + M[10];
    }
    const env = this.env;
    const L = this.lv;
    const UP = this.upv;
    const fog = env.fog;
    const fn = env.fogNear;
    const fd = 1 / Math.max(1e-3, env.fogFar - env.fogNear);
    const hemi = env.hemi ?? 0;
    const tint = o.tint;
    const glow = o.glow;
    const bias = o.bias ?? 0;
    const layer = (o.layer ?? 1) * 1e6;
    const F = m.f;
    const nf = F.length / 3;
    this.push(nf * 3);
    const P = this.poly;
    for (let t = 0; t < nf; t++) {
      const ia = F[t * 3] * 3;
      const ib = F[t * 3 + 1] * 3;
      const ic = F[t * 3 + 2] * 3;
      const ax = tv[ia];
      const ay = tv[ia + 1];
      const az = tv[ia + 2];
      const bx2 = tv[ib];
      const by2 = tv[ib + 1];
      const bz2 = tv[ib + 2];
      const cx2 = tv[ic];
      const cy2 = tv[ic + 1];
      const cz2 = tv[ic + 2];
      if (az < this.near && bz2 < this.near && cz2 < this.near) continue;
      if (az > this.far && bz2 > this.far && cz2 > this.far) continue;
      const ux = bx2 - ax;
      const uy = by2 - ay;
      const uz = bz2 - az;
      const vx = cx2 - ax;
      const vy = cy2 - ay;
      const vz = cz2 - az;
      // outward normal in (left handed) view space
      let nx = -(uy * vz - uz * vy);
      let ny = -(uz * vx - ux * vz);
      let nz = -(ux * vy - uy * vx);
      const fl = m.fl[t] | (o.flags ?? 0);
      const facing = nx * ax + ny * ay + nz * az;
      if (facing >= 0) {
        if (!(fl & F_TWO)) continue;
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const nl = 1 / (Math.hypot(nx, ny, nz) || 1);
      nx *= nl;
      ny *= nl;
      nz *= nl;
      let r = m.c[t * 3];
      let g = m.c[t * 3 + 1];
      let b = m.c[t * 3 + 2];
      if (tint) {
        r *= tint[0] / 255;
        g *= tint[1] / 255;
        b *= tint[2] / 255;
      }
      if (!(fl & F_UNLIT)) {
        const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const hu = hemi ? (0.5 + 0.5 * (nx * UP[0] + ny * UP[1] + nz * UP[2])) * hemi : 0;
        const kr = (env.amb[0] * (1 + hu) + env.sunCol[0] * d) / 255;
        const kg = (env.amb[1] * (1 + hu) + env.sunCol[1] * d) / 255;
        const kb = (env.amb[2] * (1 + hu) + env.sunCol[2] * d) / 255;
        r *= kr;
        g *= kg;
        b *= kb;
        if (m.spec > 0 && d > 0) {
          // half vector between light and the view ray to the face centre
          const mx = (ax + bx2 + cx2) / 3;
          const my = (ay + by2 + cy2) / 3;
          const mz = (az + bz2 + cz2) / 3;
          const ml = 1 / (Math.hypot(mx, my, mz) || 1);
          let hx = L[0] - mx * ml;
          let hy = L[1] - my * ml;
          let hz = L[2] - mz * ml;
          const hl = 1 / (Math.hypot(hx, hy, hz) || 1);
          hx *= hl;
          hy *= hl;
          hz *= hl;
          const s = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), m.shin) * m.spec;
          r += env.sunCol[0] * s;
          g += env.sunCol[1] * s;
          b += env.sunCol[2] * s;
        }
      }
      if (glow) {
        r += glow[0];
        g += glow[1];
        b += glow[2];
      }
      // polygon buffer: x,y,z,wy,r,g,b per vertex
      let pn = 3;
      P[0] = ax; P[1] = ay; P[2] = az; P[3] = o.clipY !== undefined ? twy[ia / 3] : 0;
      P[7] = bx2; P[8] = by2; P[9] = bz2; P[10] = o.clipY !== undefined ? twy[ib / 3] : 0;
      P[14] = cx2; P[15] = cy2; P[16] = cz2; P[17] = o.clipY !== undefined ? twy[ic / 3] : 0;
      for (let k = 0; k < 3; k++) {
        P[k * 7 + 4] = r;
        P[k * 7 + 5] = g;
        P[k * 7 + 6] = b;
      }
      if (o.clipY !== undefined) {
        pn = this.clip(pn, 3, 1, -o.clipY);
        if (pn < 3) continue;
      }
      if (az < this.near || bz2 < this.near || cz2 < this.near) {
        pn = this.clip(pn, 2, 1, -this.near);
        if (pn < 3) continue;
      }
      const nofog = fl & F_NOFOG;
      let zs = 0;
      for (let k = 0; k < pn; k++) {
        const z = P[k * 7 + 2];
        zs += z;
        if (!nofog) {
          const q = clamp((z - fn) * fd);
          const fq = q * q * (3 - 2 * q);
          P[k * 7 + 4] = lerp(P[k * 7 + 4], fog[0], fq);
          P[k * 7 + 5] = lerp(P[k * 7 + 5], fog[1], fq);
          P[k * 7 + 6] = lerp(P[k * 7 + 6], fog[2], fq);
        }
      }
      const md = fl & F_ADD ? 2 : fl & F_ALPHA ? 1 : o.alpha !== undefined && o.alpha < 1 ? 1 : 0;
      const al = fl & F_ALPHA ? (o.alpha ?? 0.5) : (o.alpha ?? 1);
      this.emit(pn, layer + 1e5 - zs / pn + bias, md, al);
    }
  }

  private poly = new Float32Array(7 * 10);
  private poly2 = new Float32Array(7 * 10);

  /** Clip the polygon in this.poly against attribute[comp] * sign + off >= 0 */
  private clip(pn: number, comp: number, sign: number, off: number) {
    const A = this.poly;
    const B = this.poly2;
    let on = 0;
    for (let i = 0; i < pn; i++) {
      const j = (i + 1) % pn;
      const da = A[i * 7 + comp] * sign + off;
      const db = A[j * 7 + comp] * sign + off;
      if (da >= 0) {
        for (let k = 0; k < 7; k++) B[on * 7 + k] = A[i * 7 + k];
        on++;
      }
      if (da >= 0 !== db >= 0) {
        const tt = da / (da - db);
        for (let k = 0; k < 7; k++) B[on * 7 + k] = A[i * 7 + k] + (A[j * 7 + k] - A[i * 7 + k]) * tt;
        on++;
      }
      if (on >= 9) break;
    }
    A.set(B.subarray(0, on * 7));
    return on;
  }

  private emit(pn: number, key: number, md: number, al: number) {
    const P = this.poly;
    const hw = this.w / 2;
    const hh = this.h / 2;
    const f = this.f;
    const snap = this.env.snap ?? 1;
    // project in place (x,y)
    let minx = Infinity;
    let maxx = -Infinity;
    let miny = Infinity;
    let maxy = -Infinity;
    for (let k = 0; k < pn; k++) {
      const z = P[k * 7 + 2];
      let sx = hw + (P[k * 7] * f) / z;
      let sy = hh - (P[k * 7 + 1] * f) / z;
      if (snap > 0) {
        sx = Math.round(sx / snap) * snap;
        sy = Math.round(sy / snap) * snap;
      }
      P[k * 7] = sx;
      P[k * 7 + 1] = sy;
      if (sx < minx) minx = sx;
      if (sx > maxx) maxx = sx;
      if (sy < miny) miny = sy;
      if (sy > maxy) maxy = sy;
    }
    if (maxx < 0 || minx > this.w || maxy < 0 || miny > this.h) return;
    this.push(pn);
    for (let k = 1; k < pn - 1; k++) {
      const o = this.n * STRIDE;
      const T = this.tri;
      const vs = [0, k, k + 1];
      for (let q = 0; q < 3; q++) {
        const s = vs[q] * 7;
        T[o + q * 5] = P[s];
        T[o + q * 5 + 1] = P[s + 1];
        T[o + q * 5 + 2] = P[s + 4];
        T[o + q * 5 + 3] = P[s + 5];
        T[o + q * 5 + 4] = P[s + 6];
      }
      this.key[this.n] = key;
      this.mode[this.n] = md;
      this.alpha[this.n] = al;
      this.n++;
    }
  }

  /** Camera-facing n-gon at world point p with world radius rad */
  sprite(p: V3, rad: number, col: RGB, o: { flags?: number; layer?: number; alpha?: number; sides?: number; rot?: number; sy?: number; bias?: number } = {}) {
    const V = this.V;
    const x = V[0] * p[0] + V[3] * p[1] + V[6] * p[2] + V[9];
    const y = V[1] * p[0] + V[4] * p[1] + V[7] * p[2] + V[10];
    const z = V[2] * p[0] + V[5] * p[1] + V[8] * p[2] + V[11];
    if (z < this.near + rad * 0.2 || z > this.far) return;
    const fl = o.flags ?? F_UNLIT;
    let r = col[0];
    let g = col[1];
    let b = col[2];
    if (!(fl & F_NOFOG)) {
      const q = clamp((z - this.env.fogNear) / Math.max(1e-3, this.env.fogFar - this.env.fogNear));
      const fq = q * q * (3 - 2 * q);
      r = lerp(r, this.env.fog[0], fq);
      g = lerp(g, this.env.fog[1], fq);
      b = lerp(b, this.env.fog[2], fq);
    }
    const n = o.sides ?? 6;
    const P = this.poly;
    const rot = o.rot ?? 0;
    const sy = o.sy ?? 1;
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * TAU;
      P[k * 7] = x + Math.cos(a) * rad;
      P[k * 7 + 1] = y + Math.sin(a) * rad * sy;
      P[k * 7 + 2] = z;
      P[k * 7 + 4] = r;
      P[k * 7 + 5] = g;
      P[k * 7 + 6] = b;
    }
    // winding does not matter for the rasteriser
    const md = fl & F_ADD ? 2 : fl & F_ALPHA || (o.alpha ?? 1) < 1 ? 1 : 0;
    this.emit(n, (o.layer ?? 1) * 1e6 + 1e5 - z + (o.bias ?? 0), md, o.alpha ?? (fl & F_ALPHA ? 0.5 : 1));
  }

  /** Sort and rasterise everything queued */
  flush() {
    const n = this.n;
    const ord = this.order.subarray(0, n);
    for (let i = 0; i < n; i++) ord[i] = i;
    const key = this.key;
    ord.sort((a, b) => key[a] - key[b]);
    for (let i = 0; i < n; i++) this.raster(ord[i]);
    this.n = 0;
  }

  /** Immediate 2D triangle in buffer pixels (for screen-space effects) */
  tri2D(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, col: RGB, md = 0, al = 1) {
    this.push(1);
    const o = this.n * STRIDE;
    const T = this.tri;
    const xs = [x0, x1, x2];
    const ys = [y0, y1, y2];
    for (let q = 0; q < 3; q++) {
      T[o + q * 5] = xs[q];
      T[o + q * 5 + 1] = ys[q];
      T[o + q * 5 + 2] = col[0];
      T[o + q * 5 + 3] = col[1];
      T[o + q * 5 + 4] = col[2];
    }
    this.mode[this.n] = md;
    this.alpha[this.n] = al;
    this.raster(this.n);
  }

  private raster(i: number) {
    const T = this.tri;
    const o = i * STRIDE;
    // sort the three vertices by y
    let a = o;
    let b = o + 5;
    let c = o + 10;
    if (T[a + 1] > T[b + 1]) [a, b] = [b, a];
    if (T[b + 1] > T[c + 1]) [b, c] = [c, b];
    if (T[a + 1] > T[b + 1]) [a, b] = [b, a];
    const y0 = T[a + 1];
    const y1 = T[b + 1];
    const y2 = T[c + 1];
    if (y2 - y0 < 1e-4) return;
    const w = this.w;
    const h = this.h;
    const buf = this.buf;
    const md = this.mode[i];
    const al = this.alpha[i];
    const ys = Math.max(0, Math.ceil(y0 - 0.5));
    const ye = Math.min(h - 1, Math.ceil(y2 - 0.5) - 1);
    const x0 = T[a];
    const x1 = T[b];
    const x2 = T[c];
    const inv02 = 1 / (y2 - y0);
    for (let y = ys; y <= ye; y++) {
      const py = y + 0.5;
      const t02 = (py - y0) * inv02;
      let xa = x0 + (x2 - x0) * t02;
      let ra = T[a + 2] + (T[c + 2] - T[a + 2]) * t02;
      let ga = T[a + 3] + (T[c + 3] - T[a + 3]) * t02;
      let ba = T[a + 4] + (T[c + 4] - T[a + 4]) * t02;
      let xb: number;
      let rb: number;
      let gb: number;
      let bb: number;
      if (py < y1) {
        const tt = (py - y0) / (y1 - y0 || 1e-6);
        xb = x0 + (x1 - x0) * tt;
        rb = T[a + 2] + (T[b + 2] - T[a + 2]) * tt;
        gb = T[a + 3] + (T[b + 3] - T[a + 3]) * tt;
        bb = T[a + 4] + (T[b + 4] - T[a + 4]) * tt;
      } else {
        const tt = (py - y1) / (y2 - y1 || 1e-6);
        xb = x1 + (x2 - x1) * tt;
        rb = T[b + 2] + (T[c + 2] - T[b + 2]) * tt;
        gb = T[b + 3] + (T[c + 3] - T[b + 3]) * tt;
        bb = T[b + 4] + (T[c + 4] - T[b + 4]) * tt;
      }
      if (xa > xb) {
        let s = xa; xa = xb; xb = s;
        s = ra; ra = rb; rb = s;
        s = ga; ga = gb; gb = s;
        s = ba; ba = bb; bb = s;
      }
      const xs = Math.max(0, Math.ceil(xa - 0.5));
      const xe = Math.min(w - 1, Math.ceil(xb - 0.5) - 1);
      if (xs > xe) continue;
      const span = xb - xa || 1e-6;
      const dr = (rb - ra) / span;
      const dg = (gb - ga) / span;
      const db = (bb - ba) / span;
      const off = xs + 0.5 - xa;
      let r = ra + dr * off;
      let g = ga + dg * off;
      let bl = ba + db * off;
      const row = y * w;
      const by = (y & 3) << 2;
      for (let x = xs; x <= xe; x++) {
        const d = BAYER[by | (x & 3)];
        let R8 = r;
        let G8 = g;
        let B8 = bl;
        if (md !== 0) {
          const p = buf[row + x];
          const pr = p & 255;
          const pg = (p >> 8) & 255;
          const pb = (p >> 16) & 255;
          if (md === 1) {
            R8 = pr + (r - pr) * al;
            G8 = pg + (g - pg) * al;
            B8 = pb + (bl - pb) * al;
          } else {
            R8 = pr + r * al;
            G8 = pg + g * al;
            B8 = pb + bl * al;
          }
        }
        R8 += d;
        G8 += d;
        B8 += d;
        buf[row + x] =
          0xff000000 |
          (Q5[B8 < 0 ? 0 : B8 > 255 ? 255 : B8 | 0] << 16) |
          (Q5[G8 < 0 ? 0 : G8 > 255 ? 255 : G8 | 0] << 8) |
          Q5[R8 < 0 ? 0 : R8 > 255 ? 255 : R8 | 0];
        r += dr;
        g += dg;
        bl += db;
      }
    }
  }

  /* ---------- buffer post ---------- */

  /** Blend the whole buffer toward a colour */
  wash(c: RGB, k: number) {
    if (k <= 0) return;
    const buf = this.buf;
    const kk = clamp(k);
    for (let i = 0; i < buf.length; i++) {
      const p = buf[i];
      const r = (p & 255) + (c[0] - (p & 255)) * kk;
      const g = ((p >> 8) & 255) + (c[1] - ((p >> 8) & 255)) * kk;
      const b = ((p >> 16) & 255) + (c[2] - ((p >> 16) & 255)) * kk;
      buf[i] = 0xff000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
    }
  }

  /** Two-tone impact frame: everything darker than the threshold becomes ink, the rest paper */
  impact(ink: RGB, paper: RGB, thr = 110) {
    const buf = this.buf;
    const a = 0xff000000 | ((ink[2] | 0) << 16) | ((ink[1] | 0) << 8) | (ink[0] | 0);
    const b = 0xff000000 | ((paper[2] | 0) << 16) | ((paper[1] | 0) << 8) | (paper[0] | 0);
    for (let i = 0; i < buf.length; i++) {
      const p = buf[i];
      const l = (p & 255) * 0.3 + ((p >> 8) & 255) * 0.55 + ((p >> 16) & 255) * 0.15;
      buf[i] = l > thr ? a : b;
    }
  }

  /** Copy the buffer onto the frame, nearest neighbour */
  blit(c: Ctx, x = 0, y = 0, w = 1600, h = 900) {
    this.ctx.putImageData(this.img, 0, 0);
    const s = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.canvas, x, y, w, h);
    c.imageSmoothingEnabled = s;
  }
}

/* ---------- full resolution overlays ---------- */

let crtCache: HTMLCanvasElement | null = null;
/** Soft CRT: faint scanlines on the 270 line grid plus a vignette (logical 1600 x 900) */
export const crt = (c: Ctx, k = 1) => {
  if (!crtCache) {
    const cv = document.createElement('canvas');
    cv.width = 800;
    cv.height = 450;
    const x = cv.getContext('2d');
    if (!x) return;
    for (let y = 0; y < 450; y += 450 / RH) {
      x.fillStyle = 'rgba(0,0,0,0.16)';
      x.fillRect(0, y + (450 / RH) * 0.55, 800, (450 / RH) * 0.45);
    }
    const g = x.createRadialGradient(400, 225, 140, 400, 225, 520);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = g;
    x.fillRect(0, 0, 800, 450);
    crtCache = cv;
  }
  c.save();
  c.globalAlpha = k;
  c.drawImage(crtCache, 0, 0, 1600, 900);
  c.restore();
};

export interface HudStyle {
  fill?: string | [string, string];
  stroke?: string;
  sw?: number;
  shadow?: string;
  align?: CanvasTextAlign;
  italic?: boolean;
  weight?: number;
  font?: string;
  spacing?: number;
  alpha?: number;
}

/** Chunky arcade HUD text: heavy italic face, vertical two-tone fill, fat outline, drop shadow */
export const hud = (c: Ctx, text: string, x: number, y: number, size: number, st: HudStyle = {}) => {
  c.save();
  c.globalAlpha = st.alpha ?? 1;
  c.font = `${st.italic === false ? '' : 'italic '}${st.weight ?? 900} ${size}px ${st.font ?? DISPLAY}`;
  c.textAlign = st.align ?? 'left';
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  if (st.spacing) (c as Ctx & { letterSpacing: string }).letterSpacing = `${st.spacing}px`;
  const sh = st.shadow ?? 'rgba(10,6,30,0.85)';
  const sw = st.sw ?? Math.max(3, size * 0.14);
  c.fillStyle = sh;
  c.strokeStyle = sh;
  c.lineWidth = sw;
  c.strokeText(text, x + size * 0.06, y + size * 0.08);
  c.fillText(text, x + size * 0.06, y + size * 0.08);
  c.strokeStyle = st.stroke ?? '#120a24';
  c.lineWidth = sw;
  c.strokeText(text, x, y);
  const f = st.fill ?? ['#ffffff', '#ffd060'];
  if (Array.isArray(f)) {
    const g = c.createLinearGradient(0, y - size * 0.8, 0, y);
    g.addColorStop(0, f[0]);
    g.addColorStop(0.5, f[0]);
    g.addColorStop(0.52, f[1]);
    g.addColorStop(1, f[1]);
    c.fillStyle = g;
  } else c.fillStyle = f;
  c.fillText(text, x, y);
  c.restore();
};

/** Slanted HUD panel */
export const hudPanel = (c: Ctx, x: number, y: number, w: number, h: number, fill = 'rgba(12,8,40,0.55)', edge = 'rgba(255,255,255,0.55)', slant = 14) => {
  c.save();
  c.beginPath();
  c.moveTo(x + slant, y);
  c.lineTo(x + w, y);
  c.lineTo(x + w - slant, y + h);
  c.lineTo(x, y + h);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = edge;
  c.lineWidth = 2;
  c.stroke();
  c.restore();
};

/** Map buffer px to logical frame px */
export const toFrame = (p: [number, number, number] | null, w = RW): [number, number] | null => (p ? [(p[0] * 1600) / w, (p[1] * 1600) / w] : null);
