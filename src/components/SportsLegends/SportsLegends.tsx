import { CSSProperties, FC, KeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
import styles from './SportsLegends.module.css';

interface Legend {
  id: string;
  name: string;
  short: string;
  nickname: string;
  number: string;
  team: string;
  teamColor1: string;
  teamColor2: string;
  moment: string;
  stats: { label: string; value: string }[];
  quote: string;
  renderScene: FC<SceneProps>;
}

interface SceneProps {
  uid: string;
}

/* ---------- Geometry ---------- */

type P = readonly [number, number];

const f = (v: number) => Math.round(v * 10) / 10;
const rad = (deg: number) => (deg * Math.PI) / 180;
const toward = (o: P, deg: number, d: number): P => [o[0] + Math.cos(rad(deg)) * d, o[1] + Math.sin(rad(deg)) * d];
const at = (a: P, b: P, k: number): P => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const angleOf = (a: P, b: P) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

/** Deterministic pseudo-random points for bokeh, crowds and spray. */
const scatter = (seed: number, n: number, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number) => {
  let s = seed;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, () => ({
    x: f(x0 + rnd() * (x1 - x0)),
    y: f(y0 + rnd() * (y1 - y0)),
    r: f(r0 + rnd() * (r1 - r0)),
    o: f(0.25 + rnd() * 0.75),
  }));
};
type Dot = ReturnType<typeof scatter>[number];

/** Smooth open curve through points (Catmull-Rom as cubic Beziers), without the leading M. */
const through = (pts: readonly P[]) => {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
};

/** Smooth closed outline through points. */
const smooth = (pts: readonly P[]) => {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
};

/** Local outline (x forward, y down) rotated by deg, scaled and moved to o; flip mirrors it first. */
const place = (pts: readonly P[], o: P, deg = 0, s = 1, flip = false): P[] => {
  const c = Math.cos(rad(deg));
  const sn = Math.sin(rad(deg));
  return pts.map(([x, y]) => {
    const X = (flip ? -x : x) * s;
    const Y = y * s;
    return [o[0] + X * c - Y * sn, o[1] + X * sn + Y * c] as P;
  });
};

/** A station along a limb: center x, y, then the half widths on its left and right side. */
type St = readonly [number, number, number, number?];

const normals = (st: readonly St[]) =>
  st.map((_, i) => {
    const a = st[Math.max(i - 1, 0)];
    const b = st[Math.min(i + 1, st.length - 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] as P;
  });

/** Organic limb outline through stations, each with its own half width per side. Ends are rounded. */
const limb = (...st: St[]) => {
  const ns = normals(st);
  const left = st.map((q, i) => [q[0] + ns[i][0] * q[2], q[1] + ns[i][1] * q[2]] as P);
  const right = st.map((q, i) => [q[0] - ns[i][0] * (q[3] ?? q[2]), q[1] - ns[i][1] * (q[3] ?? q[2])] as P).reverse();
  const n = st.length - 1;
  const ce = f((st[n][2] + (st[n][3] ?? st[n][2])) / 2);
  const cs = f((st[0][2] + (st[0][3] ?? st[0][2])) / 2);
  return (
    `M${f(left[0][0])} ${f(left[0][1])}${through(left)}` +
    `A${ce} ${ce} 0 0 0 ${f(right[0][0])} ${f(right[0][1])}${through(right)}` +
    `A${cs} ${cs} 0 0 0 ${f(left[0][0])} ${f(left[0][1])}Z`
  );
};

/** Station at a joint, with optional separate side widths. */
const S = (p: P, a: number, b?: number): St => [p[0], p[1], a, b];

/**
 * Body mass along an axis from a to b (torso, hips): each row is [t along the axis,
 * offset to the front, offset to the back]. side flips which way is the front.
 */
const axis = (a: P, b: P, rows: readonly (readonly [number, number, number])[], side: 1 | -1 = 1) => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const nx = uy * side;
  const ny = -ux * side;
  const front = rows.map(([t, fo]) => [a[0] + (b[0] - a[0]) * t + nx * fo, a[1] + (b[1] - a[1]) * t + ny * fo] as P);
  const back = rows.map(([t, , bo]) => [a[0] + (b[0] - a[0]) * t - nx * bo, a[1] + (b[1] - a[1]) * t - ny * bo] as P).reverse();
  return smooth([...front, ...back]);
};

/** Garment tube with square cut ends (baggy shorts legs, sleeves). */
const sleeve = (a: P, b: P, r1: number, r2: number, flare = 0) => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / len;
  const ny = (b[0] - a[0]) / len;
  const m = at(a, b, 0.55);
  const rm = (r1 + r2) / 2 + flare;
  return (
    `M${f(a[0] + nx * r1)} ${f(a[1] + ny * r1)}Q${f(m[0] + nx * rm * 1.04)} ${f(m[1] + ny * rm * 1.04)} ${f(b[0] + nx * r2)} ${f(b[1] + ny * r2)}` +
    `L${f(b[0] - nx * r2)} ${f(b[1] - ny * r2)}Q${f(m[0] - nx * rm * 1.04)} ${f(m[1] - ny * rm * 1.04)} ${f(a[0] - nx * r1)} ${f(a[1] - ny * r1)}Z`
  );
};

/** Tapered capsule from a (radius r1) to b (radius r2). */
const cap = (a: P, b: P, r1: number, r2: number) => limb(S(a, r1), S(at(a, b, 0.5), (r1 + r2) / 2), S(b, r2));

const ellipse = (c: P, rx: number, ry: number, deg = 0) =>
  smooth(Array.from({ length: 12 }, (_, i) => toward([0, 0], i * 30, 1)).map(([x, y]) => [x * rx, y * ry] as P).map((p) => place([p], c, deg)[0]));

/**
 * Open hand from the wrist w, pointing at deg. s scales it (1 is a hand roughly 20 units long),
 * spread fans the fingers, side picks the thumb side, curl bends the fingertips toward the palm.
 */
const openHand = (w: P, deg: number, s: number, spread = 1, side: 1 | -1 = 1, curl = 0): string[] => {
  const k = toward(w, deg, 9 * s);
  const px = Math.cos(rad(deg + 90));
  const py = Math.sin(rad(deg + 90));
  const out = [limb(S(w, 3.9 * s), S(at(w, k, 0.55), 5.2 * s), S(k, 5 * s))];
  [-1.5, -0.5, 0.5, 1.5].forEach((o, i) => {
    const base: P = [k[0] + px * o * 2.9 * s * side - Math.cos(rad(deg)) * s, k[1] + py * o * 2.9 * s * side - Math.sin(rad(deg)) * s];
    const a = deg + o * 8 * spread * side;
    const len = [7.2, 9.6, 9.2, 7.6][i] * s;
    const mid = toward(base, a, len * 0.55);
    const tip = toward(mid, a + curl * side, len * 0.45);
    out.push(limb(S(base, 1.8 * s), S(mid, 1.6 * s), S(tip, 1.35 * s)));
  });
  const tb: P = [w[0] + Math.cos(rad(deg)) * 3.4 * s - px * 4.4 * s * side, w[1] + Math.sin(rad(deg)) * 3.4 * s - py * 4.4 * s * side];
  const tm = toward(tb, deg - side * 42 * spread, 4.6 * s);
  out.push(limb(S(tb, 2.6 * s), S(tm, 2 * s), S(toward(tm, deg - side * 22 * spread, 4 * s), 1.6 * s)));
  return out;
};

const FIST: P[] = [[-6, -6.5], [1, -7.5], [6.5, -6], [8, -1], [7, 4], [4, 7.5], [-3, 7.5], [-7, 4], [-8, -1]];
const fist = (c: P, deg: number, s: number) => smooth(place(FIST, c, deg, s));

/**
 * Footwear outline in local units (x toward the toe, y toward the sole, ankle at 0 0),
 * placed with the toe at deg; up is a hint pointing from the ankle toward the shin.
 */
const footwear = (pts: readonly P[], ankle: P, deg: number, up: P, s = 1) => {
  const fx = Math.cos(rad(deg));
  const fy = Math.sin(rad(deg));
  let ux = -fy;
  let uy = fx;
  if (ux * up[0] + uy * up[1] < 0) {
    ux = -ux;
    uy = -uy;
  }
  return smooth(pts.map(([x, y]) => [ankle[0] + (fx * x - ux * y) * s, ankle[1] + (fy * x - uy * y) * s] as P));
};

const HIGH_TOP: P[] = [[-6, -14], [5, -13], [8, -5], [15, -1.5], [24, 0.5], [29.5, 4], [30, 8.5], [26, 11], [8, 12], [-7, 12], [-10.5, 8.5], [-10.5, 0], [-8.5, -8]];
const LOW_TOP: P[] = [[-6.5, -8], [5, -8], [10, -3], [18, 0], [26, 2.5], [29.5, 6.5], [27.5, 10.5], [8, 11], [-8, 11], [-10.5, 7], [-9.5, -2]];
const SKATE_BOOT: P[] = [[-7, -15], [6, -15], [7.5, -6], [14, -2.5], [23, 0], [27.5, 3.5], [27.5, 8], [-9, 9], [-11, 2], [-9.5, -8]];
/** Holder pillars under heel and toe, then the long runner with its rounded ends. */
const SKATE_BLADE: P[][] = [
  [[-9, 7], [0, 7], [-1.5, 14.5], [-8, 14.5]],
  [[14, 7], [27, 7], [25, 14.5], [16.5, 14.5]],
  [[-13, 14.4], [30, 13.6], [33.4, 15.2], [32, 17.6], [-12, 18], [-15, 16.4]],
];

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => f(v * 100) / 100);
};

/* ---------- Poster plumbing: rim light, halftone, rays, grain ---------- */

const ids = (uid: string) => {
  const id = (k: string) => `${uid}-${k}`;
  return { id, url: (k: string) => `url(#${id(k)})` };
};

interface Rim {
  /** Key rim: colour and the offset toward the shadow (the light sits on the opposite side). */
  key: string;
  kx: number;
  ky: number;
  /** Secondary kicker rim from the other side. */
  back: string;
  bx: number;
  by: number;
  /** Backlight bloom hugging the silhouette. */
  halo: string;
  haloOpacity?: number;
}

/** Silhouette treatment: backlight halo, crisp rim on the lit edges with bloom, kicker on the far side. */
const RimFilter: FC<{ id: string; rim: Rim }> = ({ id, rim }) => (
  <filter id={id} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="ha" />
    <feFlood floodColor={rim.halo} floodOpacity={rim.haloOpacity ?? 0.6} />
    <feComposite in2="ha" operator="in" result="halo" />
    <feOffset in="SourceAlpha" dx={rim.kx} dy={rim.ky} result="o1" />
    <feComposite in="SourceAlpha" in2="o1" operator="out" result="e1" />
    <feGaussianBlur in="e1" stdDeviation="0.55" result="e1s" />
    <feFlood floodColor={rim.key} />
    <feComposite in2="e1s" operator="in" result="r1" />
    <feGaussianBlur in="r1" stdDeviation="3.2" result="g1" />
    <feOffset in="SourceAlpha" dx={rim.bx} dy={rim.by} result="o2" />
    <feComposite in="SourceAlpha" in2="o2" operator="out" result="e2" />
    <feGaussianBlur in="e2" stdDeviation="0.6" result="e2s" />
    <feFlood floodColor={rim.back} floodOpacity="0.75" />
    <feComposite in2="e2s" operator="in" result="r2" />
    <feComposite in="r1" in2="SourceAlpha" operator="in" result="r1i" />
    <feComposite in="r2" in2="SourceAlpha" operator="in" result="r2i" />
    <feMerge>
      <feMergeNode in="halo" />
      <feMergeNode in="g1" />
      <feMergeNode in="SourceGraphic" />
      <feMergeNode in="r2i" />
      <feMergeNode in="r1i" />
      <feMergeNode in="r1i" />
    </feMerge>
  </filter>
);

/** Shared defs: blurs, grain and vignette. */
const PosterDefs: FC<{ uid: string; children?: ReactNode }> = ({ uid, children }) => {
  const { id } = ids(uid);
  return (
    <defs>
      {[1, 3, 6, 14].map((b) => (
        <filter key={b} id={id(`b${b}`)} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={b} />
        </filter>
      ))}
      <filter id={id('white')} x="0" y="0" width="100%" height="100%">
        <feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
      </filter>
      <filter id={id('grain')} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <radialGradient id={id('vig')} cx="50%" cy="46%" r="75%">
        <stop offset="0.5" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.85" />
      </radialGradient>
      {children}
    </defs>
  );
};

/**
 * Amplitude modulated halftone: the grey levels painted as children become ink dots that grow
 * with the tone, by thresholding them against a cone shaped dot screen.
 */
const Halftone: FC<{ uid: string; name: string; ink: string; cell?: number; angle?: number; opacity?: number; children: ReactNode }> = ({
  uid,
  name,
  ink,
  cell = 6,
  angle = 45,
  opacity = 1,
  children,
}) => {
  const { id, url } = ids(uid);
  const k = `ht-${name}`;
  const [r, g, b] = rgb(ink);
  return (
    <g opacity={opacity}>
      <defs>
        <radialGradient id={id(`${k}-cone`)}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <pattern id={id(`${k}-p`)} width={cell} height={cell} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
          <rect width={cell} height={cell} fill="#000" />
          <circle cx={cell / 2} cy={cell / 2} r={f(cell * 0.71)} fill={url(`${k}-cone`)} />
        </pattern>
        <filter id={id(`${k}-f`)} filterUnits="userSpaceOnUse" x="0" y="0" width="640" height="400" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope="12" intercept="-6.25" />
          </feComponentTransfer>
          <feColorMatrix values={`0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 1 0 0 0 0`} />
        </filter>
      </defs>
      <g filter={url(`${k}-f`)}>
        <rect width="640" height="400" fill={url(`${k}-p`)} />
        <g opacity="0.5">
          <rect width="640" height="400" fill="#000" />
          {children}
        </g>
      </g>
    </g>
  );
};

/** Light shafts fanning out of a source, blurred soft. */
const Rays: FC<{ uid: string; from: P; angles: number[]; width?: number; len?: number; color: string; opacity: number }> = ({
  uid,
  from,
  angles,
  width = 4,
  len = 700,
  color,
  opacity,
}) => {
  const { id, url } = ids(uid);
  const g = id(`ray${from[0]}${from[1]}`);
  return (
    <g filter={url('b6')} opacity={opacity}>
      <defs>
        <radialGradient id={g} gradientUnits="userSpaceOnUse" cx={from[0]} cy={from[1]} r={len}>
          <stop offset="0" stopColor={color} stopOpacity="1" />
          <stop offset="0.7" stopColor={color} stopOpacity="0.15" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      {angles.map((a, i) => {
        const p1 = toward(from, a - width / 2, len);
        const p2 = toward(from, a + width / 2, len);
        return <polygon key={i} points={`${from[0]},${from[1]} ${f(p1[0])},${f(p1[1])} ${f(p2[0])},${f(p2[1])}`} fill={`url(#${g})`} opacity={0.5 + (i % 3) * 0.25} />;
      })}
    </g>
  );
};

/** Big graphic numeral built from halftone dots with a hairline outline. */
const Numeral: FC<{ uid: string; text: string; x: number; y: number; size: number; ink: string; line: string; opacity?: number; rotate?: number }> = ({
  uid,
  text,
  x,
  y,
  size,
  ink,
  line,
  opacity = 1,
  rotate = 0,
}) => {
  const { id, url } = ids(uid);
  const t = (
    <text x={x} y={y} fontSize={size} fontWeight="900" textAnchor="middle" fontFamily="Geist, 'Arial Black', Impact, sans-serif" letterSpacing={-size * 0.06} transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}>
      {text}
    </text>
  );
  return (
    <g opacity={opacity}>
      <defs>
        <linearGradient id={id('numtone')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <Halftone uid={uid} name="num" ink={ink} cell={5.5} angle={30}>
        <g fill={url('numtone')}>{t}</g>
      </Halftone>
      <g fill="none" stroke={line} strokeWidth="1.2" strokeOpacity="0.5">
        {t}
      </g>
    </g>
  );
};

/** The silhouette: a single ink mass with the rim filter, plus interior accents masked to it. */
const Figure: FC<{ uid: string; name: string; rim: Rim; ink: [string, string]; d: string[]; accents?: ReactNode; from?: P; to?: P }> = ({
  uid,
  name,
  rim,
  ink,
  d,
  accents,
  from = [0, 0],
  to = [0, 400],
}) => {
  const { id, url } = ids(uid);
  return (
    <g>
      <defs>
        <RimFilter id={id(`${name}-rim`)} rim={rim} />
        <linearGradient id={id(`${name}-ink`)} gradientUnits="userSpaceOnUse" x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}>
          <stop offset="0" stopColor={ink[0]} />
          <stop offset="1" stopColor={ink[1]} />
        </linearGradient>
        <mask id={id(`${name}-m`)}>
          <use href={`#${id(name)}`} filter={url('white')} />
        </mask>
      </defs>
      <g filter={url(`${name}-rim`)}>
        <g id={id(name)} fill={url(`${name}-ink`)}>
          {d.map((p, i) => (
            <path key={i} d={p} />
          ))}
        </g>
        {accents && <g mask={url(`${name}-m`)}>{accents}</g>}
      </g>
    </g>
  );
};

const Finish: FC<{ uid: string; grain?: number }> = ({ uid, grain = 0.09 }) => {
  const { url } = ids(uid);
  return (
    <>
      <rect width="640" height="400" fill={url('vig')} />
      <rect width="640" height="400" filter={url('grain')} opacity={grain} style={{ mixBlendMode: 'overlay' }} />
    </>
  );
};

/* ---------- Motion layer: light sweep, drifting motes, flash bulbs (screen blended on top) ---------- */

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

const Fx: FC<{ uid: string; sweep: string; mote: string; motes?: Dot[]; drift?: P; flashes?: Dot[]; glow?: { c: P; r: number; color: string } }> = ({
  uid,
  sweep,
  mote,
  motes = [],
  drift = [0, -40],
  flashes = [],
  glow,
}) => {
  const { id, url } = ids(`${uid}-fx`);
  return (
    <svg className={styles.fx} viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id('sweep')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={sweep} stopOpacity="0" />
          <stop offset="0.5" stopColor={sweep} stopOpacity="0.16" />
          <stop offset="1" stopColor={sweep} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('mote')}>
          <stop offset="0" stopColor={mote} stopOpacity="1" />
          <stop offset="0.35" stopColor={mote} stopOpacity="0.5" />
          <stop offset="1" stopColor={mote} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('flash')}>
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.12" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.4" stopColor="#fff6e0" stopOpacity="0.25" />
          <stop offset="1" stopColor="#fff6e0" stopOpacity="0" />
        </radialGradient>
        {glow && (
          <radialGradient id={id('glow')}>
            <stop offset="0" stopColor={glow.color} stopOpacity="0.35" />
            <stop offset="1" stopColor={glow.color} stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      {glow && <circle className={styles.breathe} cx={glow.c[0]} cy={glow.c[1]} r={glow.r} fill={url('glow')} />}
      <g className={styles.sweep}>
        <rect x="-260" y="-200" width="220" height="800" fill={url('sweep')} transform="rotate(18 -150 200)" />
      </g>
      {motes.map((m, i) => (
        <circle
          key={`m${i}`}
          className={styles.mote}
          cx={m.x}
          cy={m.y}
          r={f(m.r * 2.4)}
          fill={url('mote')}
          opacity={m.o}
          style={v({ '--t': `${f(7 + (i % 7) * 1.3)}s`, '--d': `${f(-((i * 1.7) % 9))}s`, '--o': m.o, '--mx': `${f(drift[0] * (0.6 + (i % 5) * 0.12))}px`, '--my': `${f(drift[1] * (0.6 + (i % 4) * 0.15))}px` })}
        />
      ))}
      {flashes.map((m, i) => (
        <circle
          key={`f${i}`}
          className={styles.flash}
          cx={m.x}
          cy={m.y}
          r={f(m.r * 9)}
          fill={url('flash')}
          opacity={i % 4 === 0 ? 0.55 : 0}
          style={v({ '--t': `${f(3.2 + (i % 5) * 1.1)}s`, '--d': `${f(-((i * 1.37) % 5))}s` })}
        />
      ))}
    </svg>
  );
};

/** A static poster plus its motion layer. */
const Poster: FC<{ uid: string; label: string; defs?: ReactNode; children: ReactNode; fx: ReactNode; grain?: number }> = ({ uid, label, defs, children, fx, grain }) => (
  <>
    <svg viewBox="0 0 640 400" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <PosterDefs uid={uid}>{defs}</PosterDefs>
      {children}
      <Finish uid={uid} grain={grain} />
    </svg>
    {fx}
  </>
);

const Dots: FC<{ dots: Dot[]; fill: string; opacity: number; filter?: string }> = ({ dots, fill, opacity, filter }) => (
  <g fill={fill} opacity={opacity} filter={filter}>
    {dots.map((d, i) => (
      <circle key={i} cx={d.x} cy={d.y} r={d.r} opacity={d.o} />
    ))}
  </g>
);

/** Crowd rows: heads and shoulders as soft dark shapes. */
const crowd = (seed: number, rows: { y: number; n: number; s: number }[]) => {
  const out: { x: number; y: number; s: number }[] = [];
  rows.forEach((row, ri) => {
    const pts = scatter(seed + ri * 13, row.n, -10, row.y - 4, 650, row.y + 4, 0.85, 1.15);
    pts.forEach((p) => out.push({ x: p.x, y: p.y, s: f(row.s * p.r) }));
  });
  return out;
};
const Crowd: FC<{ people: { x: number; y: number; s: number }[]; fill: string; opacity?: number; filter?: string }> = ({ people, fill, opacity = 1, filter }) => (
  <g fill={fill} opacity={opacity} filter={filter}>
    {people.map((p, i) => (
      <g key={i}>
        <ellipse cx={p.x} cy={p.y} rx={f(p.s * 0.82)} ry={p.s} />
        <path d={`M${f(p.x - p.s * 2.2)} ${f(p.y + p.s * 4)}C${f(p.x - p.s * 2.1)} ${f(p.y + p.s * 1.4)} ${f(p.x - p.s * 1.2)} ${f(p.y + p.s * 1.1)} ${p.x} ${f(p.y + p.s * 1.1)}C${f(p.x + p.s * 1.2)} ${f(p.y + p.s * 1.1)} ${f(p.x + p.s * 2.1)} ${f(p.y + p.s * 1.4)} ${f(p.x + p.s * 2.2)} ${f(p.y + p.s * 4)}Z`} />
      </g>
    ))}
  </g>
);

/* ---------- Michael Jordan: 1988 dunk from the free-throw line ---------- */

const MJ_RIM: Rim = { key: '#fff0e4', kx: -1.7, ky: 1.7, back: '#ff2f48', bx: 1.3, by: -0.7, halo: '#ff1d3a', haloOpacity: 0.5 };

const MJ_BALL: P = [268, 22];

const MJ_HEAD: P[] = [
  [0, -18], [8, -16.5], [13, -11.5], [15, -5.5], [14.6, -1.5], [17.6, 3.8], [14.6, 7], [15.4, 10.6], [13.6, 13.6], [11.2, 18.4],
  [4, 19.4], [-3, 16], [-9.5, 14.5], [-14.5, 8.5], [-16, 0], [-14.2, -10], [-8, -16.2],
];

const jordanFigure = () => {
  const N: P = [322, 118];
  const Hp: P = [298, 202];
  const head = smooth(place(MJ_HEAD, [334, 90], 10));
  const neck = limb(S(place([[-3, 12]], [334, 90], 10)[0], 7.6), S(N, 8.4));
  const torso = axis(N, Hp, [
    [0, 7, 8],
    [0.12, 17, 15.5],
    [0.3, 21, 17.5],
    [0.5, 18, 15.5],
    [0.7, 14.5, 13],
    [0.86, 15, 15.5],
    [1, 15, 18],
  ]);
  // Ball arm: raised high and cocked back past the head, ball cradled.
  const sh: P = [317, 132];
  const el: P = [299, 80];
  const wr: P = [276, 38];
  const arm = limb(S(sh, 11.5, 11), S(at(sh, el, 0.35), 11.4, 10.4), S(at(sh, el, 0.7), 9.4, 9), S(el, 7, 7), S(at(el, wr, 0.3), 7.6, 7.2), S(at(el, wr, 0.7), 6, 5.6), S(wr, 4.6));
  const band = cap(at(el, wr, 0.74), at(el, wr, 0.92), 6.6, 6.4);
  const hand = openHand(wr, angleOf(el, wr) + 8, 1.05, 1.4, -1, 18);
  const ball = ellipse(MJ_BALL, 13, 13);
  // Off arm reaching forward for balance, fingers open.
  const sh2: P = [326, 134];
  const el2: P = [358, 156];
  const wr2: P = [392, 152];
  const arm2 = limb(S(sh2, 10.5), S([342, 146], 9.4, 8.8), S(el2, 6.6), S([374, 156], 7.2, 6.6), S(wr2, 4.4));
  const hand2 = openHand(wr2, -6, 1, 1.2, 1, 8);
  // Legs in a wide split: lead leg stretched at the rim, trail leg folded behind.
  const hl: P = [304, 204];
  const kl: P = [356, 230];
  const al: P = [404, 262];
  const lead = limb(S(hl, 15, 15), S(at(hl, kl, 0.5), 13, 12), S(at(hl, kl, 0.88), 9.4, 9), S(kl, 8.6), S(at(kl, al, 0.28), 10.4, 8), S(at(kl, al, 0.62), 7.4, 6.4), S(al, 5.2));
  const ht: P = [296, 206];
  const kt: P = [274, 258];
  const ah: P = [220, 268];
  const trail = limb(S(ht, 15, 15), S(at(ht, kt, 0.5), 13, 12.5), S(at(ht, kt, 0.9), 9.4, 9.4), S(kt, 8.8), S(at(kt, ah, 0.3), 10.4, 8), S(at(kt, ah, 0.65), 7.2, 6.4), S(ah, 5.2));
  const shoe1 = footwear(HIGH_TOP, al, 44, [-48, -32]);
  const shoe2 = footwear(HIGH_TOP, ah, 128, [54, -10]);
  // Baggy shorts: long, loose legs over both thighs.
  const hips = axis(at(N, Hp, 0.82), at(N, Hp, 1.1), [
    [0, 17, 17],
    [0.5, 19, 20],
    [1, 20, 21],
  ]);
  const shorts1 = sleeve(at(hl, kl, -0.1), at(hl, kl, 0.78), 19, 18.5, 1.5);
  const shorts2 = sleeve(at(ht, kt, -0.1), at(ht, kt, 0.76), 19, 18.5, 1.5);
  return [arm2, ...hand2, trail, shoe2, lead, shoe1, torso, hips, shorts1, shorts2, neck, head, arm, band, ...hand, ball];
};

const MJ_D = jordanFigure();
const MJ_MOTES = scatter(41, 26, 40, 40, 620, 360, 0.8, 1.8);
const MJ_FLASH = scatter(5, 12, 0, 300, 640, 330, 0.6, 1);
const MJ_CROWD = crowd(3, [
  { y: 300, n: 80, s: 4.2 },
  { y: 314, n: 64, s: 5.4 },
]);

const JordanScene: FC<SceneProps> = ({ uid }) => {
  const { id, url } = ids(uid);
  return (
    <Poster
      uid={uid}
      label="Poster style silhouette of Michael Jordan in flight from the free-throw line in 1988: bald head, long limbs, baggy shorts and high-top sneakers, ball raised high in one hand and legs split wide as he soars toward the rim, rim lit against a red and black arena with a giant halftone 23 behind him"
      defs={
        <>
          <radialGradient id={id('bg')} cx="0.52" cy="0.42" r="0.75">
            <stop offset="0" stopColor="#c4122f" />
            <stop offset="0.38" stopColor="#6d0718" />
            <stop offset="0.75" stopColor="#1e0307" />
            <stop offset="1" stopColor="#070102" />
          </radialGradient>
          <radialGradient id={id('spot')} cx="0.86" cy="0.08" r="0.6">
            <stop offset="0" stopColor="#ffd2c2" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffd2c2" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a0409" />
            <stop offset="1" stopColor="#050102" />
          </linearGradient>
          <radialGradient id={id('tone')} cx="0.5" cy="0.45" r="0.6">
            <stop offset="0" stopColor="#fff" stopOpacity="0.62" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </>
      }
      fx={<Fx uid={uid} sweep="#ffd9cf" mote="#ffb3a6" motes={MJ_MOTES} drift={[-30, -50]} flashes={MJ_FLASH} glow={{ c: [320, 170], r: 220, color: '#ff2a44' }} />}
    >
      <rect width="640" height="400" fill={url('bg')} />
      <Halftone uid={uid} name="glow" ink="#ff3b52" cell={7} angle={45} opacity={0.35}>
        <rect width="640" height="400" fill={url('tone')} />
      </Halftone>
      <Numeral uid={uid} text="23" x={178} y={318} size={300} ink="#ff4a5e" line="#ff8a96" opacity={0.55} rotate={-6} />
      <rect width="640" height="400" fill={url('spot')} />
      <Rays uid={uid} from={[600, -30]} angles={[112, 121, 128, 136, 144]} width={3.5} color="#ffd8cc" opacity={0.3} />

      {/* Floor, free-throw line and the flight path to the rim */}
      <Crowd people={MJ_CROWD} fill="#1a0306" opacity={0.85} filter={url('b1')} />
      <rect y="338" width="640" height="62" fill={url('floor')} />
      <line x1="0" y1="338.5" x2="640" y2="338.5" stroke="#ff5a6c" strokeOpacity="0.25" />
      <path d="M110 345 L262 345" stroke="#fff3ee" strokeWidth="2.2" strokeOpacity="0.75" />
      <path d="M110 345 L262 345" stroke="#ffd3c8" strokeWidth="8" strokeOpacity="0.18" filter={url('b3')} />
      <path d="M180 345 Q 300 30 540 128" fill="none" stroke="#ffe3dc" strokeOpacity="0.4" strokeWidth="1.6" strokeDasharray="1 7" strokeLinecap="round" />

      {/* Basket */}
      <g>
        <path d="M596 98 L640 98" stroke="#070203" strokeWidth="6" fill="none" />
        <rect x="588" y="40" width="8" height="104" fill="#070203" stroke="#ff9aa6" strokeOpacity="0.45" />
        <line x1="588" y1="124" x2="566" y2="126" stroke="#070203" strokeWidth="4" />
        <ellipse cx="545" cy="128" rx="22" ry="5" fill="none" stroke="#ff8a3d" strokeWidth="2.6" />
        <ellipse cx="545" cy="128" rx="22" ry="5" fill="none" stroke="#ff8a3d" strokeWidth="6" strokeOpacity="0.35" filter={url('b3')} />
        <path d="M524 129 L531 160 M535 132 L537 163 M546 133 L545 164 M557 132 L553 163 M566 129 L559 160 M528 145 Q545 151 562 145" stroke="#ffd9d0" strokeOpacity="0.4" strokeWidth="0.9" fill="none" />
      </g>

      <g transform="translate(-6 14)">
        <Figure
          uid={uid}
          name="mj"
          rim={MJ_RIM}
          ink={['#1a0408', '#040102']}
          d={MJ_D}
          from={[400, 40]}
          to={[260, 320]}
          accents={
            <path
              d={`M${MJ_BALL[0] - 13} ${MJ_BALL[1] - 1}Q${MJ_BALL[0]} ${MJ_BALL[1] + 7} ${MJ_BALL[0] + 13} ${MJ_BALL[1] - 1}M${MJ_BALL[0] - 2} ${MJ_BALL[1] - 13}Q${MJ_BALL[0] - 8} ${MJ_BALL[1]} ${MJ_BALL[0] + 1} ${MJ_BALL[1] + 13}`}
              stroke="#ff6a7c"
              strokeOpacity="0.55"
              strokeWidth="1"
              fill="none"
            />
          }
        />
      </g>
    </Poster>
  );
};

/* ---------- Alex Ovechkin: the knee slide after a goal ---------- */

const OVI_RIM: Rim = { key: '#eef7ff', kx: 2, ky: 2, back: '#ff3049', bx: -1.8, by: 0.4, halo: '#d61a36', haloOpacity: 0.5 };

/** Helmet dome with a half visor running down past the nose, mouth open under it, ear guard at the back. */
const OVI_HELMET: P[] = [
  [0, -21], [10, -19.6], [17, -13.4], [20, -6.4], [21, -2.4], [23.6, -1.4], [25, 5.4], [23.4, 10.6], [18.6, 11], [19.4, 13.8],
  [17, 16.6], [17.8, 19.6], [12, 22], [4.6, 20.4], [-1, 17.4], [-9, 13.6], [-14, 9.4], [-19, 4.4], [-21.4, -4], [-18.6, -13.4], [-10.4, -19.6],
];
const OVI_GLOVE: P[] = [[-11, 3], [-12, -7], [-7.5, -14], [3, -15.5], [10, -11], [12, -2], [11, 4]];

const OVI_H: P = [272, 140];

const oviFigure = () => {
  const N: P = [276, 168];
  const Hc: P = [290, 250];
  const H = OVI_H;
  const head = smooth(place(OVI_HELMET, H, -20));
  const neck = limb(S(place([[-2, 12]], H, -20)[0], 8.5), S(N, 10));
  const torso = axis(N, Hc, [
    [0, 9, 10],
    [0.06, 24, 24],
    [0.2, 29, 28],
    [0.45, 27, 25],
    [0.7, 27, 25.5],
    [0.9, 30, 28],
    [1.02, 28, 26],
  ]);
  const pad = ellipse([274, 178], 21, 15, -14);
  // Near arm: fist pumped high, big glove with its gauntlet cuff.
  const s1: P = [268, 184];
  const e1: P = [228, 178];
  const g1: P = [216, 130];
  const arm1 = limb(S(s1, 15), S(at(s1, e1, 0.5), 13.4, 13.8), S(e1, 14), S(at(e1, g1, 0.45), 12, 11.6), S(g1, 10.6));
  const cuff1 = limb(S(g1, 11), S(at(g1, [213, 112], 0.5), 12.4), S([213, 114], 13.2));
  const glove1 = smooth(place(OVI_GLOVE, [212, 112], -12, 1.05));
  // Far arm: stick in one glove, blade on the ice ahead.
  const s2: P = [288, 184];
  const e2: P = [326, 206];
  const g2: P = [360, 200];
  const arm2 = limb(S(s2, 14), S(at(s2, e2, 0.5), 12.5), S(e2, 12.5), S(at(e2, g2, 0.5), 11), S(g2, 10));
  const glove2 = ellipse([364, 198], 12.5, 11.5, -20);
  const shaft = limb(S([346, 180], 2.6), S([408, 248], 2.4), S([466, 312], 2.4));
  const blade = smooth([[462, 308], [470, 314], [490, 318], [510, 316], [513, 321], [492, 324], [466, 323], [459, 318]]);
  // Near leg kneeling, shin on the ice, trailing skate up on its toe; far leg lunging ahead.
  const h1: P = [284, 256];
  const k1: P = [294, 311];
  const a1: P = [240, 304];
  const leg1 = limb(S(h1, 17), S(at(h1, k1, 0.5), 15.5), S(k1, 10.5), S(at(k1, a1, 0.35), 9.4, 10), S(a1, 6.5));
  const boot1 = footwear(SKATE_BOOT, a1, 150, [0.5, 1]);
  const blade1 = SKATE_BLADE.map((q) => footwear(q, a1, 150, [0.5, 1]));
  const h2: P = [296, 250];
  const k2: P = [350, 244];
  const a2: P = [360, 300];
  const leg2 = limb(S(h2, 16), S(at(h2, k2, 0.5), 14.5, 14), S(k2, 10.5), S(at(k2, a2, 0.3), 9.6, 10.5), S(a2, 6.5));
  const boot2 = footwear(SKATE_BOOT, a2, 2, [0, -1]);
  const blade2 = SKATE_BLADE.map((q) => footwear(q, a2, 2, [0, -1]));
  // Hockey pants: wide and boxy over the hips and thighs.
  const pants = smooth([[258, 232], [314, 230], [330, 238], [346, 232], [358, 250], [344, 266], [318, 270], [310, 290], [304, 300], [266, 300], [256, 270]]);
  return [arm2, glove2, shaft, blade, leg2, boot2, ...blade2, leg1, boot1, ...blade1, torso, pad, pants, neck, head, arm1, cuff1, glove1];
};

const OVI_D = oviFigure();
const OVI_SPRAY = scatter(31, 90, 376, 276, 480, 322, 0.4, 1.6);
const OVI_SPRAY_FAR = scatter(32, 60, 360, 236, 540, 320, 0.3, 1.1);
const OVI_MOTES = scatter(18, 30, 300, 230, 600, 350, 0.5, 1.4);
const OVI_FLASH = scatter(77, 16, 0, 120, 640, 210, 0.5, 0.9);
const OVI_BOKEH = scatter(9, 60, 0, 90, 640, 220, 2, 6);

const OvechkinScene: FC<SceneProps> = ({ uid }) => {
  const { id, url } = ids(uid);
  return (
    <Poster
      uid={uid}
      label="Poster style silhouette of Alex Ovechkin sliding across the ice on one knee after a goal: helmet, bulky shoulders and hockey pants, one glove pumped high, stick in the other hand with the blade on the ice, skate blades and a spray of ice, rim lit in white and red against a navy arena with a giant halftone 8 behind him"
      defs={
        <>
          <radialGradient id={id('bg')} cx="0.48" cy="0.5" r="0.75">
            <stop offset="0" stopColor="#8a0f26" />
            <stop offset="0.35" stopColor="#2a0f2e" />
            <stop offset="0.7" stopColor="#071633" />
            <stop offset="1" stopColor="#020711" />
          </radialGradient>
          <linearGradient id={id('ice')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b9d3ee" stopOpacity="0.55" />
            <stop offset="0.25" stopColor="#5f7fa8" stopOpacity="0.4" />
            <stop offset="1" stopColor="#0b1a33" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id={id('tone')} cx="0.5" cy="0.55" r="0.55">
            <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </>
      }
      fx={<Fx uid={uid} sweep="#dff1ff" mote="#eaf6ff" motes={OVI_MOTES} drift={[60, -26]} flashes={OVI_FLASH} glow={{ c: [300, 230], r: 200, color: '#ff2f4a' }} />}
    >
      <rect width="640" height="400" fill={url('bg')} />
      <Dots dots={OVI_BOKEH} fill="#9fc0ff" opacity={0.16} filter={url('b3')} />
      <Halftone uid={uid} name="glow" ink="#ff3550" cell={7} angle={15} opacity={0.3}>
        <rect width="640" height="400" fill={url('tone')} />
      </Halftone>
      <Numeral uid={uid} text="8" x={330} y={330} size={380} ink="#e8203d" line="#ff8090" opacity={0.6} />
      <Rays uid={uid} from={[320, -40]} angles={[70, 80, 90, 100, 110]} width={4} color="#cfe6ff" opacity={0.22} />

      {/* Boards and ice */}
      <rect y="250" width="640" height="52" fill="#040a16" opacity="0.85" />
      <rect y="250" width="640" height="2" fill="#e8f2ff" opacity="0.35" />
      <rect y="290" width="640" height="4" fill="#c8102e" opacity="0.4" />
      <rect y="302" width="640" height="98" fill={url('ice')} />
      <rect y="302" width="640" height="98" fill="#030915" opacity="0.35" />
      <line x1="0" y1="302.5" x2="640" y2="302.5" stroke="#f2f8ff" strokeOpacity="0.45" />
      <g stroke="#e9f4ff" strokeLinecap="round" filter={url('b1')}>
        {[[30, 352, 196, 1.6, 0.5], [80, 362, 232, 1.2, 0.35], [0, 376, 150, 2, 0.28], [110, 344, 220, 1, 0.5], [50, 390, 190, 1.4, 0.2]].map(([x1, y, x2, w, o], i) => (
          <line key={i} x1={x1} y1={y} x2={x2} y2={y} strokeWidth={w} strokeOpacity={o} />
        ))}
      </g>

      {/* Speed trails behind the slide */}
      <g stroke="#f4f9ff" strokeLinecap="round" filter={url('b3')}>
        {[[20, 214, 3, 0.2], [0, 240, 4, 0.16], [40, 268, 3, 0.22], [10, 292, 5, 0.18], [60, 196, 2, 0.14]].map(([x1, y, w, o], i) => (
          <line key={i} x1={x1} y1={y} x2={x1 + 150 + (i % 3) * 30} y2={y} strokeWidth={w} strokeOpacity={o} />
        ))}
      </g>

      <g transform="translate(316 346) scale(1.12) translate(-320 -322)">
        {/* Reflection in the ice */}
        <g opacity="0.2" transform="translate(0 644) scale(1 -1)" filter={url('b3')}>
          <use href={`#${id('ovi')}`} />
        </g>

        <Figure
          uid={uid}
          name="ovi"
          rim={OVI_RIM}
          ink={['#120a1a', '#03050b']}
          d={OVI_D}
          from={[260, 100]}
          to={[320, 330]}
        />

        {/* Ice spray off the front skate */}
        <Dots dots={OVI_SPRAY_FAR} fill="#dcecff" opacity={0.35} filter={url('b1')} />
        <Dots dots={OVI_SPRAY} fill="#ffffff" opacity={0.75} />
        <ellipse cx="420" cy="316" rx="64" ry="10" fill="#eaf5ff" opacity="0.3" filter={url('b6')} />
      </g>
    </Poster>
  );
};

/* ---------- Arnold Schwarzenegger: the Conquer photo, from behind on stage ---------- */

const ARNOLD_RIM: Rim = { key: '#fff1cf', kx: 1.4, ky: 2.2, back: '#ffd28a', bx: -1.4, by: 2.2, halo: '#ffbf5c', haloOpacity: 0.55 };

/** Head turned in profile to his left, under thick, feathered 1970s hair that covers the ears and flips at the nape. */
const ARNOLD_HEAD: P[] = [
  [-2, -29], [9, -28.5], [17, -24], [21, -16], [20, -10], [21.6, -5.6], [20.8, -1.8], [25.6, 4.4], [21.4, 7.6], [22.4, 10.6], [21, 13.4],
  [21.4, 17], [16.4, 21], [10, 22.4], [4, 21], [-2, 26], [-9, 30], [-17, 33], [-23, 31], [-26, 26], [-29, 14], [-31, 2], [-30, -11], [-25, -21],
  [-15, -27.5],
];
/** Feathered strands catching the light. */
const ARNOLD_HAIR = ['M-24 -16C-14 -24 0 -25 12 -21', 'M-27 12C-24 0 -16 -8 -4 -11'];

const ARNOLD_H: P = [324, 104];

const arnoldArm = (flip: boolean) => {
  const m = (p: P): P => (flip ? [644 - p[0], p[1]] : p);
  const s: P = m([248, 170]);
  const e: P = m([194, 116]);
  const w: P = m([162, 64]);
  // Biceps peak on the upper inner side, triceps hanging below, forearm thick at the elbow.
  const st = (p: P, inner: number, outer: number): St => (flip ? [p[0], p[1], outer, inner] : [p[0], p[1], inner, outer]);
  const arm = limb(
    st(s, 25, 27),
    st(at(s, e, 0.3), 22, 25),
    st(at(s, e, 0.62), 21.5, 19.5),
    st(at(s, e, 0.9), 14, 14.5),
    st(e, 12.5, 12.5),
    st(at(e, w, 0.28), 14.5, 13.5),
    st(at(e, w, 0.7), 10.5, 9.5),
    st(w, 8, 8),
  );
  const deg = angleOf(e, w);
  return [arm, ...openHand(w, deg + (flip ? 8 : -8), 1.75, 1.6, flip ? -1 : 1, 0)];
};

const arnoldFigure = () => {
  const head = smooth(place(ARNOLD_HEAD, ARNOLD_H, 2));
  const neck = limb(S([320, 122], 18), S([322, 150], 24));
  // The back: traps sloping into the raised arms, lats sweeping straight down from the triceps to a tight waist.
  const back = smooth([
    [304, 134], [282, 146], [258, 152], [236, 166], [222, 186], [230, 212], [246, 250], [263, 290], [276, 328], [281, 364], [282, 420],
    [362, 420], [363, 364], [368, 328], [381, 290], [398, 250], [414, 212], [422, 186], [408, 166], [386, 152], [362, 146], [340, 134], [322, 130],
  ]);
  return [back, ...arnoldArm(false), ...arnoldArm(true), neck, head];
};

/** Back musculature carved in light: spine, scapulae, teres and lat edges, the trunks line. */
const ARNOLD_LINES = [
  'M322 160C321 210 323 270 322 372',
  'M258 226C272 260 288 290 304 314M386 226C372 260 356 290 340 314',
  'M282 374C304 368 340 368 362 374',
];

const ARNOLD_D = arnoldFigure();
const ARNOLD_PEOPLE = crowd(6, [
  { y: 236, n: 70, s: 4.4 },
  { y: 256, n: 64, s: 5.2 },
  { y: 280, n: 56, s: 6.3 },
  { y: 308, n: 46, s: 7.6 },
  { y: 340, n: 38, s: 9.2 },
  { y: 378, n: 30, s: 11 },
]);
const ARNOLD_FLASH = scatter(14, 22, 0, 150, 640, 330, 0.6, 1.2);
const ARNOLD_MOTES = scatter(52, 36, 0, 20, 640, 260, 0.5, 1.5);

const ArnoldScene: FC<SceneProps> = ({ uid }) => {
  const { id, url } = ids(uid);
  return (
    <Poster
      uid={uid}
      label="Poster style silhouette of Arnold Schwarzenegger seen from behind on stage, the Conquer photo: arms raised wide in a V with open hands, head turned in profile under 1970s hair, a huge V-tapered back, facing a packed auditorium with spotlights and camera flashes, in sepia and gold"
      defs={
        <>
          <radialGradient id={id('bg')} cx="0.5" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#f5d48e" />
            <stop offset="0.22" stopColor="#b98a45" />
            <stop offset="0.55" stopColor="#4a3317" />
            <stop offset="1" stopColor="#120c05" />
          </radialGradient>
          <radialGradient id={id('tone')} cx="0.5" cy="0.3" r="0.7">
            <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.05" />
          </radialGradient>
          <linearGradient id={id('hall')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a1208" stopOpacity="0" />
            <stop offset="0.5" stopColor="#1a1208" stopOpacity="0.55" />
            <stop offset="1" stopColor="#0b0703" stopOpacity="0.95" />
          </linearGradient>
        </>
      }
      fx={<Fx uid={uid} sweep="#fff0c8" mote="#ffe2a6" motes={ARNOLD_MOTES} drift={[10, 30]} flashes={ARNOLD_FLASH} glow={{ c: [322, 110], r: 240, color: '#ffd27a' }} />}
      grain={0.12}
    >
      <rect width="640" height="400" fill={url('bg')} />
      <Halftone uid={uid} name="glow" ink="#ffe3a3" cell={6} angle={45} opacity={0.32}>
        <rect width="640" height="400" fill={url('tone')} />
      </Halftone>
      <Rays uid={uid} from={[120, 60]} angles={[10, 22, 34, 48, 62, 80, 100]} width={5} color="#fff1cc" opacity={0.3} />
      <Rays uid={uid} from={[520, 60]} angles={[80, 100, 118, 132, 146, 158, 170]} width={5} color="#fff1cc" opacity={0.3} />
      {[[120, 60], [520, 60], [260, 34], [384, 34]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="22" fill="#fff4d6" opacity="0.5" filter={url('b14')} />
          <circle cx={x} cy={y} r="5" fill="#fffaf0" />
        </g>
      ))}
      <rect y="200" width="640" height="200" fill={url('hall')} />
      <Crowd people={ARNOLD_PEOPLE} fill="#140d05" opacity={0.92} filter={url('b1')} />
      <Figure
        uid={uid}
        name="arnold"
        rim={ARNOLD_RIM}
        ink={['#24180b', '#0a0603']}
        d={ARNOLD_D}
        from={[322, 100]}
        to={[322, 400]}
        accents={
          <g fill="none" stroke="#ffd98f" strokeLinecap="round" filter={url('b1')}>
            {ARNOLD_LINES.map((d, i) => (
              <path key={i} d={d} strokeWidth={i === 0 ? 4 : 3} strokeOpacity={i === 2 ? 0.3 : 0.1} filter={i === 2 ? undefined : url('b3')} />
            ))}
            <g transform={`translate(${ARNOLD_H[0]} ${ARNOLD_H[1]}) rotate(2)`} strokeWidth="1.3" strokeOpacity="0.32">
              {ARNOLD_HAIR.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          </g>
        }
      />
    </Poster>
  );
};

/* ---------- Ben Pakulski: most muscular ---------- */

const BPAK_RIM: Rim = { key: '#d9f3ff', kx: 2, ky: 1.6, back: '#5fb4ff', bx: -2, by: 1.2, halo: '#5aa9d6', haloOpacity: 0.45 };

/** Bald dome, small ears, full beard squaring off the jaw. */
const BPAK_HEAD: P[] = [
  [0, -21], [10.5, -18.5], [15, -10], [15.6, -1], [18, 0.6], [17.6, 7.4], [15, 8.6], [15.6, 15], [13, 23], [6, 29.5], [0, 30.5], [-6, 29.5],
  [-13, 23], [-15.6, 15], [-15, 8.6], [-17.6, 7.4], [-18, 0.6], [-15.6, -1], [-15, -10], [-10.5, -18.5],
];

const bpakSide = (flip: boolean) => {
  const m = (p: P): P => (flip ? [640 - p[0], p[1]] : p);
  const st = (p: P, a: number, b: number): St => {
    const q = m(p);
    return flip ? [q[0], q[1], b, a] : [q[0], q[1], a, b];
  };
  // Traps flexed up to the jaw, rolling over into round, forward delts.
  const trap = smooth([m([306, 92]), m([292, 100]), m([268, 114]), m([244, 130]), m([250, 150]), m([290, 146]), m([320, 136]), m([320, 98])]);
  const delt = ellipse(m([236, 154]), 31, 29, flip ? 24 : -24);
  // Upper arm down and out to a wide elbow, forearm driving down and in to the fists at the navel.
  const upper = limb(st([240, 160], 28, 28), st([226, 192], 27, 25), st([216, 220], 21, 20), st([216, 236], 17, 17));
  const fore = limb(st([216, 236], 17, 16), st([238, 252], 19.5, 16), st([266, 264], 15, 12.5), st([292, 274], 11.5, 11));
  const fst = fist(m([306, 278]), flip ? 205 : -25, 1.6);
  const thigh = limb(st([298, 320], 30, 30), st([282, 358], 35, 31), st([270, 412], 32, 29));
  return { mass: [trap, delt, upper, thigh], front: [fore, fst] };
};

const bpakFigure = () => {
  const head = smooth(place(BPAK_HEAD, [320, 80], 0, 1.08));
  const torso = smooth([
    [320, 112], [290, 120], [262, 150], [260, 196], [268, 236], [280, 276], [284, 310], [280, 340], [360, 340], [356, 310], [360, 276], [372, 236],
    [380, 196], [378, 150], [350, 120],
  ]);
  const l = bpakSide(false);
  const r = bpakSide(true);
  return { d: [torso, ...l.mass, ...r.mass, ...l.front, ...r.front, head], front: [...l.front, ...r.front] };
};

const BPAK = bpakFigure();
/** Pecs, abs, quads and the beard line, carved in light. */
const BPAK_LINES = [
  'M270 200C286 216 304 222 318 218M370 200C354 216 336 222 322 218',
  'M320 150L320 214',
  'M320 292L320 334M304 300Q312 304 320 302Q328 304 336 300M302 318Q312 322 320 320Q328 322 338 318',
  'M282 352C290 372 292 390 290 404M358 352C350 372 348 390 350 404',
  'M305 96C308 106 314 110 320 111C326 110 332 106 335 96',
];
const BPAK_CHALK = scatter(40, 44, 160, 20, 480, 330, 0.5, 1.5);

const BPakScene: FC<SceneProps> = ({ uid }) => {
  const { id, url } = ids(uid);
  return (
    <Poster
      uid={uid}
      label="Poster style silhouette of Ben Pakulski hitting a most muscular pose on the gym floor: bald head and full beard, enormous traps and shoulders, elbows out and fists together in front of his waist, under a single industrial lamp in steel blue with racks and plates behind and a giant halftone 40"
      defs={
        <>
          <radialGradient id={id('bg')} cx="0.5" cy="0.22" r="0.85">
            <stop offset="0" stopColor="#6f8aa3" />
            <stop offset="0.3" stopColor="#2c3c4d" />
            <stop offset="0.7" stopColor="#111922" />
            <stop offset="1" stopColor="#05080b" />
          </radialGradient>
          <linearGradient id={id('cone')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e6f6ff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#e6f6ff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={id('tone')} cx="0.5" cy="0.3" r="0.6">
            <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </>
      }
      fx={<Fx uid={uid} sweep="#e2f4ff" mote="#f4fbff" motes={BPAK_CHALK} drift={[8, -36]} glow={{ c: [320, 140], r: 200, color: '#9ad4ff' }} />}
    >
      <rect width="640" height="400" fill={url('bg')} />
      <Halftone uid={uid} name="glow" ink="#9fc6e4" cell={6} angle={45} opacity={0.3}>
        <rect width="640" height="400" fill={url('tone')} />
      </Halftone>
      <Numeral uid={uid} text="40" x={320} y={300} size={290} ink="#7fb6dd" line="#bfe2ff" opacity={0.42} />

      {/* Racks and plates in the shadows */}
      <g fill="#070b10">
        <rect x="40" y="70" width="12" height="330" />
        <rect x="118" y="70" width="12" height="330" />
        <rect x="510" y="70" width="12" height="330" />
        <rect x="588" y="70" width="12" height="330" />
        <rect x="0" y="176" width="170" height="6" />
        <rect x="470" y="176" width="170" height="6" />
        {[[22, 179], [148, 179], [492, 179], [618, 179]].map(([x, y], i) => (
          <g key={i}>
            <ellipse cx={x} cy={y} rx="9" ry="40" />
            <ellipse cx={x + (x < 320 ? -12 : 12)} cy={y} rx="7" ry="34" />
          </g>
        ))}
      </g>
      <g fill="none" stroke="#9fd2f5" strokeOpacity="0.28">
        {[[22, 179], [148, 179], [492, 179], [618, 179]].map(([x, y], i) => (
          <ellipse key={i} cx={x} cy={y} rx="9" ry="40" />
        ))}
      </g>

      {/* The lamp and its cone */}
      <polygon points="296,8 344,8 470,400 170,400" fill={url('cone')} filter={url('b6')} />
      <path d="M318 -2 L318 10 M296 18 Q320 2 344 18 Z" stroke="#0a0f14" strokeWidth="3" fill="#0a0f14" />
      <ellipse cx="320" cy="18" rx="22" ry="3" fill="#f4fbff" />
      <ellipse cx="320" cy="20" rx="40" ry="10" fill="#e6f6ff" opacity="0.5" filter={url('b6')} />

      <rect y="380" width="640" height="20" fill="#05080b" opacity="0.6" />
      <Figure
        uid={uid}
        name="bpak"
        rim={BPAK_RIM}
        ink={['#101921', '#04070a']}
        d={BPAK.d}
        from={[320, 60]}
        to={[320, 400]}
        accents={
          <g fill="none" strokeLinecap="round">
            <g stroke="#cfeeff" strokeOpacity="0.38" strokeWidth="1.3">
              {BPAK.front.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
            <g stroke="#bfe6ff" strokeOpacity="0.2" strokeWidth="2" filter={url('b1')}>
              {BPAK_LINES.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          </g>
        }
      />
    </Poster>
  );
};

/* ---------- Kobe Bryant: Dec 4, 2009 buzzer beater over Dwyane Wade ---------- */

const KOBE_RIM: Rim = { key: '#ffe39a', kx: -1.8, ky: 1.8, back: '#b48cff', bx: 1.3, by: -0.4, halo: '#f5b72a', haloOpacity: 0.5 };
const WADE_RIM: Rim = { key: '#c9adff', kx: -1.6, ky: 1.6, back: '#ff9a4a', bx: 1.2, by: 0, halo: '#7a45c0', haloOpacity: 0.35 };

const KOBE_HEAD: P[] = [
  [0, -17.5], [8, -16], [13, -11], [14.6, -5], [14.2, -1.5], [17, 3.8], [14, 6.8], [14.8, 10.4], [13, 13.4], [10.6, 17.8],
  [4, 18.6], [-3, 15.5], [-9.5, 14], [-14.5, 8], [-15.6, 0], [-13.6, -10], [-7.6, -15.8],
];

const kobeFigure = () => {
  const N: P = [214, 156];
  const Hp: P = [246, 234];
  const H: P = [208, 126];
  const head = smooth(place(KOBE_HEAD, H, -22));
  const neck = limb(S(place([[-3, 12]], H, -22)[0], 7.4), S(N, 8.6));
  const torso = axis(N, Hp, [
    [0, 7, 8],
    [0.12, 16, 15],
    [0.3, 18.5, 16],
    [0.55, 15.5, 14],
    [0.78, 14, 13],
    [1, 15, 16.5],
  ]);
  // Shooting arm high, wrist snapped through; guide hand peeling off.
  const s1: P = [220, 164];
  const e1: P = [248, 118];
  const w1: P = [276, 76];
  const arm1 = limb(S(s1, 11, 10.5), S(at(s1, e1, 0.5), 9.6, 9), S(e1, 6.8), S(at(e1, w1, 0.4), 7.2, 6.8), S(w1, 4.6));
  const hand1 = openHand(w1, 36, 1.05, 0.5, 1, 34);
  const s2: P = [224, 166];
  const e2: P = [258, 146];
  const w2: P = [286, 122];
  const arm2 = limb(S(s2, 10.4), S(at(s2, e2, 0.5), 9), S(e2, 6.4), S(at(e2, w2, 0.4), 6.8, 6.2), S(w2, 4.4));
  const hand2 = openHand(w2, -44, 1, 1.3, -1, 6);
  // Legs: the lead knee driving up for space, the other reaching down as he drifts back.
  const hf: P = [252, 232];
  const kf: P = [300, 238];
  const af: P = [304, 292];
  const legF = limb(S(hf, 14), S(at(hf, kf, 0.5), 12.4, 11.6), S(kf, 8.4), S(at(kf, af, 0.3), 8, 10), S(at(kf, af, 0.65), 6.4, 7), S(af, 5));
  const hn: P = [242, 236];
  const kn: P = [264, 284];
  const an: P = [252, 334];
  const legN = limb(S(hn, 14.5), S(at(hn, kn, 0.5), 12.6, 12), S(kn, 8.6), S(at(kn, an, 0.3), 8, 10.4), S(at(kn, an, 0.65), 6.4, 7), S(an, 5));
  const shoeF = footwear(LOW_TOP, af, 70, [-4, -54]);
  const shoeN = footwear(LOW_TOP, an, 92, [12, -50]);
  const hips = axis(at(N, Hp, 0.84), at(N, Hp, 1.1), [
    [0, 16, 16],
    [1, 19, 19],
  ]);
  const short1 = sleeve(at(hf, kf, -0.1), at(hf, kf, 0.84), 18.5, 17.5, 1);
  const short2 = sleeve(at(hn, kn, -0.1), at(hn, kn, 0.82), 18.5, 17.5, 1);
  return [legF, shoeF, legN, shoeN, torso, hips, short1, short2, neck, head, arm2, ...hand2, arm1, ...hand1];
};

const wadeFigure = () => {
  const N: P = [376, 162];
  const Hp: P = [396, 244];
  const H: P = [370, 132];
  const head = smooth(place(KOBE_HEAD, H, -28, 0.98, true));
  const neck = limb(S(place([[-3, 12]], H, -28, 0.98, true)[0], 7.4), S(N, 8.4));
  const torso = axis(N, Hp, [
    [0, 7, 8],
    [0.12, 16, 15],
    [0.3, 18.5, 16],
    [0.55, 15.5, 14],
    [0.78, 14, 13],
    [1, 15, 16.5],
  ], -1);
  // Contest: long arm reaching up at the ball, fingers spread, just short.
  const s1: P = [372, 170];
  const e1: P = [352, 124];
  const w1: P = [338, 82];
  const arm1 = limb(S(s1, 10.8), S(at(s1, e1, 0.5), 9.4), S(e1, 6.6), S(at(e1, w1, 0.4), 7, 6.6), S(w1, 4.5));
  const hand1 = openHand(w1, angleOf(e1, w1), 1.05, 1.5, -1, 0);
  const s2: P = [384, 172];
  const e2: P = [404, 208];
  const w2: P = [400, 244];
  const arm2 = limb(S(s2, 10), S(at(s2, e2, 0.5), 8.6), S(e2, 6.2), S(at(e2, w2, 0.4), 6.6), S(w2, 4.4));
  const hand2 = openHand(w2, 96, 1, 0.6, 1, 10);
  // Knees bent and feet tucked back under him as he rises late.
  const ha: P = [386, 244];
  const ka: P = [362, 286];
  const aa: P = [380, 330];
  const legA = limb(S(ha, 14), S(at(ha, ka, 0.5), 12.4), S(ka, 8.4), S(at(ka, aa, 0.3), 8, 10), S(at(ka, aa, 0.65), 7, 6.4), S(aa, 5));
  const hb: P = [400, 242];
  const kb: P = [414, 290];
  const ab: P = [440, 326];
  const legB = limb(S(hb, 14), S(at(hb, kb, 0.5), 12.4), S(kb, 8.4), S(at(kb, ab, 0.3), 8, 10), S(at(kb, ab, 0.65), 7, 6.4), S(ab, 5));
  const shoeA = footwear(LOW_TOP, aa, 108, [-18, -44], 0.95);
  const shoeB = footwear(LOW_TOP, ab, 112, [-26, -36], 0.95);
  const hips = axis(at(N, Hp, 0.84), at(N, Hp, 1.1), [
    [0, 16, 16],
    [1, 19, 19],
  ], -1);
  const shortA = sleeve(at(ha, ka, -0.1), at(ha, ka, 0.72), 18, 17.5, 1);
  const shortB = sleeve(at(hb, kb, -0.1), at(hb, kb, 0.72), 18, 17.5, 1);
  return [arm2, ...hand2, legB, shoeB, legA, shoeA, torso, hips, shortA, shortB, neck, head, arm1, ...hand1];
};

const KOBE_D = kobeFigure();
const WADE_D = wadeFigure();
const KOBE_FLASH = scatter(8, 18, 0, 300, 640, 350, 0.6, 1);
const KOBE_CROWD = crowd(5, [
  { y: 316, n: 80, s: 4.4 },
  { y: 334, n: 64, s: 5.6 },
]);
const KOBE_MOTES = scatter(61, 28, 0, 40, 640, 360, 0.6, 1.6);
const KOBE_BOKEH = scatter(24, 70, 0, 280, 640, 366, 1.5, 4.5);

const KobeScene: FC<SceneProps> = ({ uid }) => {
  const { id, url } = ids(uid);
  return (
    <Poster
      uid={uid}
      label="Poster style silhouette of Kobe Bryant hitting the buzzer beater over Dwyane Wade in 2009: Kobe fading away in the air with one knee up and his shooting wrist snapped through, Wade leaping in with his arm stretched toward the ball, the shot arcing toward the rim, gold rim light on purple with a giant halftone 24 and the clock at zero"
      defs={
        <>
          <radialGradient id={id('bg')} cx="0.42" cy="0.4" r="0.8">
            <stop offset="0" stopColor="#6a35a8" />
            <stop offset="0.35" stopColor="#36175f" />
            <stop offset="0.7" stopColor="#140726" />
            <stop offset="1" stopColor="#06020c" />
          </radialGradient>
          <radialGradient id={id('gold')} cx="0.34" cy="0.42" r="0.4">
            <stop offset="0" stopColor="#fdb927" stopOpacity="0.45" />
            <stop offset="1" stopColor="#fdb927" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id('tone')} cx="0.38" cy="0.42" r="0.6">
            <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b1647" />
            <stop offset="1" stopColor="#07030d" />
          </linearGradient>
        </>
      }
      fx={<Fx uid={uid} sweep="#ffe7a8" mote="#ffd36b" motes={KOBE_MOTES} drift={[-20, -40]} flashes={KOBE_FLASH} glow={{ c: [240, 180], r: 210, color: '#fdb927' }} />}
    >
      <rect width="640" height="400" fill={url('bg')} />
      <Halftone uid={uid} name="glow" ink="#fdb927" cell={7} angle={45} opacity={0.22}>
        <rect width="640" height="400" fill={url('tone')} />
      </Halftone>
      <Numeral uid={uid} text="24" x={180} y={316} size={300} ink="#fdb927" line="#ffe08a" opacity={0.5} rotate={-4} />
      <rect width="640" height="400" fill={url('gold')} />
      <Rays uid={uid} from={[620, -30]} angles={[110, 118, 126, 134, 142]} width={3.5} color="#ffe9b0" opacity={0.26} />

      <Crowd people={KOBE_CROWD} fill="#12061f" opacity={0.85} filter={url('b1')} />
      <rect y="368" width="640" height="32" fill={url('floor')} />
      <Dots dots={KOBE_BOKEH} fill="#ffd36b" opacity={0.22} filter={url('b3')} />
      <line x1="0" y1="368.5" x2="640" y2="368.5" stroke="#fdb927" strokeOpacity="0.3" />

      {/* Clock at zero */}
      <g fontFamily="'Geist Mono', ui-monospace, monospace" fontWeight="700" fill="#ffcf5a">
        <text x="28" y="50" fontSize="30" letterSpacing="2" opacity="0.9">0.0</text>
        <text x="30" y="66" fontSize="8.5" letterSpacing="2.4" opacity="0.6">4TH QTR</text>
      </g>

      {/* Basket and the shot arc */}
      <path d="M609 104 L640 104" stroke="#07030e" strokeWidth="6" fill="none" />
      <rect x="600" y="52" width="9" height="100" fill="#07030e" stroke="#ffd36b" strokeOpacity="0.4" />
      <line x1="600" y1="130" x2="584" y2="132" stroke="#07030e" strokeWidth="4" />
      <ellipse cx="566" cy="134" rx="19" ry="4.5" fill="none" stroke="#ff9a3a" strokeWidth="2.4" />
      <path d="M548 135 L554 162 M557 137 L559 165 M566 138 L566 166 M575 137 L572 165 M584 135 L578 162" stroke="#ffe7c0" strokeOpacity="0.35" strokeWidth="0.9" fill="none" />
      <path d="M312 40 Q 450 -60 562 128" fill="none" stroke="#ffd36b" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="1 7" strokeLinecap="round" />
      <circle cx="312" cy="40" r="11.5" fill="#0a0410" />
      <circle cx="312" cy="40" r="11.5" fill="none" stroke="#ffd36b" strokeOpacity="0.85" strokeWidth="1.4" />
      <path d="M301 38 Q312 44 323 38 M310 29 Q306 40 312 51" stroke="#ffd36b" strokeOpacity="0.45" strokeWidth="0.8" fill="none" />

      <Figure uid={uid} name="wade" rim={WADE_RIM} ink={['#0b0612', '#030106']} d={WADE_D} from={[380, 60]} to={[380, 340]} />
      <Figure uid={uid} name="kobe" rim={KOBE_RIM} ink={['#170b24', '#040208']} d={KOBE_D} from={[260, 50]} to={[240, 340]} />
    </Poster>
  );
};

/* ---------- Data ---------- */

const legendsData: Legend[] = [
  {
    id: 'jordan',
    name: 'Michael Jordan',
    short: 'Jordan',
    nickname: 'Air Jordan · His Airness',
    number: '23',
    team: 'Chicago Bulls',
    teamColor1: '#CE1141',
    teamColor2: '#000000',
    moment: '1988 Dunk Contest, free-throw line',
    stats: [
      { label: 'NBA Champion', value: '6×' },
      { label: 'Finals MVP', value: '6×' },
      { label: 'Scoring Titles', value: '10×' },
      { label: 'Indomitable Will', value: '100%' },
    ],
    quote: "I've failed over and over and over again in my life. And that is why I succeed. Heart is what separates the good from the great.",
    renderScene: JordanScene,
  },
  {
    id: 'ovechkin',
    name: 'Alex Ovechkin',
    short: 'Ovechkin',
    nickname: 'The Great 8 · Ovi',
    number: '8',
    team: 'Washington Capitals',
    teamColor1: '#C8102E',
    teamColor2: '#041E42',
    moment: 'The knee slide goal celebration',
    stats: [
      { label: 'NHL Goals', value: '850+' },
      { label: 'Rocket Richard', value: '9×' },
      { label: 'Stanley Cup', value: '1×' },
      { label: 'All-Time PPG', value: '#1' },
    ],
    quote: 'You have to play with passion. When you score, you feel the energy of everyone who believed in you. You never let them down.',
    renderScene: OvechkinScene,
  },
  {
    id: 'arnold',
    name: 'Arnold Schwarzenegger',
    short: 'Arnold',
    nickname: 'The Austrian Oak',
    number: '7×',
    team: 'Mr. Olympia',
    teamColor1: '#F59E0B',
    teamColor2: '#78350F',
    moment: 'Arms wide over the crowd, the Conquer photo',
    stats: [
      { label: 'Mr. Olympia', value: '7×' },
      { label: 'Mr. Universe', value: '5×' },
      { label: 'Mental Vision', value: '100%' },
      { label: 'Compromise', value: '0%' },
    ],
    quote: 'The mind is the limit. As long as the mind can envision the fact that you can do something, you can do it, as long as you really believe it 100 percent.',
    renderScene: ArnoldScene,
  },
  {
    id: 'bpak',
    name: 'Ben Pakulski',
    short: 'Pakulski',
    nickname: 'BPak · MI40',
    number: '40',
    team: 'IFBB Pro',
    teamColor1: '#06B6D4',
    teamColor2: '#0F172A',
    moment: 'Most muscular, gym floor',
    stats: [
      { label: 'IFBB Pro', value: 'Elite' },
      { label: 'MI40 Protocol', value: 'Master' },
      { label: 'Momentum', value: '0%' },
      { label: 'TUT & Intent', value: '100%' },
    ],
    quote: "Success isn't owned, it's leased. And rent is due every single day. Execute with uncompromising intent.",
    renderScene: BPakScene,
  },
  {
    id: 'kobe',
    name: 'Kobe Bryant',
    short: 'Kobe',
    nickname: 'The Black Mamba',
    number: '24',
    team: 'LA Lakers',
    teamColor1: '#552583',
    teamColor2: '#FDB927',
    moment: 'Buzzer beater over Wade, Dec 4, 2009',
    stats: [
      { label: 'NBA Champion', value: '5×' },
      { label: 'Finals MVP', value: '2×' },
      { label: 'All-Star', value: '18×' },
      { label: 'Mentality', value: 'Mamba' },
    ],
    quote: 'Everything negative, pressure, challenges, is all an opportunity for me to rise.',
    renderScene: KobeScene,
  },
];

/* ---------- Section ---------- */

export const SportsLegends: FC = () => {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const frameRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);

  // Ambient motion only runs while the poster is on screen.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (prev === null) return;
    const t = window.setTimeout(() => setPrev(null), 500);
    return () => window.clearTimeout(t);
  }, [prev, active]);

  const select = (i: number) => {
    if (i === active) return;
    setPrev(active);
    setActive(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = legendsData.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = active === last ? 0 : active + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = active === 0 ? last : active - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  const legend = legendsData[active];
  const previous = prev === null ? null : legendsData[prev];
  const panelId = `${base}-panel`;
  const tabId = (l: Legend) => `${base}-tab-${l.id}`;

  return (
    <section className={styles.legends} aria-labelledby={`${base}-title`}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Five who inspire me</p>
          <h2 id={`${base}-title`} className={styles.title}>
            Legends of the game
          </h2>
        </div>
        <p className={styles.lede}>Men of indomitable will. Uncompromising mentality, relentless aggression.</p>
      </header>

      <div className={styles.body}>
        <div className={styles.roster} role="tablist" aria-label="Choose a legend" onKeyDown={onKeyDown}>
          {legendsData.map((l, i) => (
            <button
              key={l.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(l)}
              aria-selected={i === active}
              aria-controls={panelId}
              tabIndex={i === active ? 0 : -1}
              className={styles.tab}
              onClick={() => select(i)}
            >
              <span className={styles.tabIndex}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.tabName}>{l.short}</span>
              <span className={styles.tabTeam}>{l.team}</span>
            </button>
          ))}
        </div>

        <div
          className={styles.stage}
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabId(legend)}
          style={{ '--legend-accent': legend.teamColor1 } as CSSProperties}
        >
          <div className={styles.frame} ref={frameRef} data-paused={onScreen ? undefined : ''}>
            {previous && (
              <div className={`${styles.layer} ${styles.layerOut}`} aria-hidden="true" key={`out-${previous.id}`}>
                <previous.renderScene uid={`${base}-${previous.id}-o`} />
              </div>
            )}
            <div className={`${styles.layer} ${styles.layerIn}`} key={legend.id}>
              <legend.renderScene uid={`${base}-${legend.id}`} />
            </div>
            <p className={styles.caption}>{legend.moment}</p>
          </div>

          <div className={styles.details} key={legend.id}>
            <p className={styles.team}>
              <span className={styles.swatch} aria-hidden="true" />
              {legend.team}
            </p>
            <h3 className={styles.name}>{legend.name}</h3>
            <p className={styles.nickname}>{legend.nickname}</p>

            <dl className={styles.stats}>
              {legend.stats.slice(0, 3).map((stat) => (
                <div key={stat.label} className={styles.stat}>
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>

            <blockquote className={styles.quote}>
              <p>&ldquo;{legend.quote}&rdquo;</p>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
};
