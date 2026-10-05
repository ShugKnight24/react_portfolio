import type { Ctx, Riso, RisoFilm } from '../riso/engine';
import {
  DISPLAY,
  TAU,
  clamp,
  ease,
  hash,
  lerp,
  mulberry,
  noise1,
  polyPath,
  seg,
  smoothPath,
  spacedText,
  tween,
  type Pt,
} from '../riso/kit';

/*
 * Saturday Morning: the screen is the motif. A kid in pajamas sits on the rug with a cereal bowl
 * in front of a chunky CRT at dawn; we push through the glass into an anime energy clash; the
 * clash freezes into the first panel of a comic page and a caped hero leaps panel to panel; his
 * landing panel turns to pixels and becomes the screen of a handheld; the handheld screen widens
 * into a cinema screen, where the grown-up sits in the same spot with popcorn instead of cereal.
 */

/* Inks */
const B = 0; // medium blue
const R = 1; // bright red
const Y = 2; // yellow
const T = 3; // teal

type Spec = readonly (readonly [number, number])[];

const DARK: Spec = [
  [B, 1],
  [R, 0.78],
];
const NIGHT: Spec = [
  [B, 0.9],
  [R, 0.42],
];
const WALL: Spec = [
  [B, 0.3],
  [R, 0.2],
  [Y, 0.12],
];
const WOOD: Spec = [
  [R, 0.62],
  [Y, 0.78],
  [B, 0.3],
];
const WOOD_D: Spec = [
  [R, 0.78],
  [Y, 0.62],
  [B, 0.62],
];
const FLOOR: Spec = [
  [R, 0.42],
  [Y, 0.58],
  [B, 0.16],
];
const PJ: Spec = [
  [T, 1],
  [B, 0.12],
];
const SKIN: Spec = [
  [R, 0.38],
  [Y, 0.5],
];
const HAIR: Spec = [
  [B, 0.92],
  [R, 0.85],
  [Y, 0.25],
];
const GOLD: Spec = [
  [Y, 1],
  [R, 0.28],
];
const ORANGE: Spec = [
  [Y, 1],
  [R, 0.65],
];
const CRIMSON: Spec = [
  [R, 1],
  [B, 0.35],
];
const CAPE: Spec = [
  [R, 1],
  [B, 0.5],
];
/* handheld greens: yellow + teal */
const GB0: Spec = [
  [Y, 0.5],
  [T, 0.1],
];
const GB1: Spec = [
  [Y, 0.68],
  [T, 0.42],
];
const GB2: Spec = [
  [Y, 0.6],
  [T, 0.8],
  [B, 0.12],
];
const GB3: Spec = [
  [T, 1],
  [B, 0.75],
  [Y, 0.25],
];

/* ---------- drawing helpers ---------- */

const knock = (
  r: Riso,
  path: Path2D,
  inks?: readonly number[],
  rule: CanvasFillRule = 'nonzero'
) => {
  const L = r.layers;
  for (let i = 0; i < L.length; i++) {
    if (inks && !inks.includes(i)) continue;
    const c = L[i];
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    c.fill(path, rule);
    c.globalCompositeOperation = 'source-over';
  }
};

const ink = (r: Riso, path: Path2D, spec: Spec, rule: CanvasFillRule = 'nonzero') => {
  const L = r.layers;
  for (const [i, d] of spec) {
    if (d <= 0.012) continue;
    const c = L[i];
    c.fillStyle = r.tone(c, d);
    c.fill(path, rule);
  }
};

const paint = (r: Riso, path: Path2D, spec: Spec, rule: CanvasFillRule = 'nonzero') => {
  knock(r, path, undefined, rule);
  ink(r, path, spec, rule);
};

const knockStroke = (r: Riso, path: Path2D, lw: number, inks?: readonly number[]) => {
  const L = r.layers;
  for (let i = 0; i < L.length; i++) {
    if (inks && !inks.includes(i)) continue;
    const c = L[i];
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = '#000';
    c.lineWidth = lw;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke(path);
    c.restore();
  }
};

const inkStroke = (r: Riso, path: Path2D, spec: Spec, lw: number) => {
  const L = r.layers;
  for (const [i, d] of spec) {
    if (d <= 0.012) continue;
    const c = L[i];
    c.save();
    c.strokeStyle = r.tone(c, d);
    c.lineWidth = lw;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke(path);
    c.restore();
  }
};

const line = (r: Riso, path: Path2D, spec: Spec, lw: number) => {
  knockStroke(r, path, lw);
  inkStroke(r, path, spec, lw);
};

/** Halftone knockout: lift ink in dots (light falling on things) */
const lift = (r: Riso, path: Path2D | null, inks: readonly number[], d: number) => {
  if (d <= 0.012) return;
  for (const i of inks) {
    const c = r.layers[i];
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = r.tone(c, d);
    if (path) c.fill(path);
    else c.fillRect(-5000, -5000, 12000, 12000);
    c.restore();
  }
};

const liftGrad = (
  r: Riso,
  path: Path2D | null,
  inks: readonly number[],
  g: Parameters<Riso['gradient']>[2],
  steps = 8
) => {
  for (const i of inks) {
    const c = r.layers[i];
    c.save();
    c.globalCompositeOperation = 'destination-out';
    r.gradient(c, path, g, steps);
    c.restore();
  }
};

const grad = (
  r: Riso,
  i: number,
  path: Path2D | null,
  g: Parameters<Riso['gradient']>[2],
  steps = 10
) => r.gradient(r.layers[i], path, g, steps);

/** Apply a transform / clip to every layer for the duration of body */
const xf = (r: Riso, set: (c: Ctx) => void, body: () => void) => {
  const L = r.layers;
  for (const c of L) {
    c.save();
    set(c);
  }
  body();
  for (const c of L) c.restore();
};

/** Rounded rect around a centre */
const rr = (
  cx: number,
  cy: number,
  w: number,
  h: number,
  rad: number,
  p: Path2D = new Path2D()
) => {
  const hw = w / 2;
  const hh = h / 2;
  const q = Math.max(0.01, Math.min(rad, hw, hh));
  p.moveTo(cx - hw + q, cy - hh);
  p.arcTo(cx + hw, cy - hh, cx + hw, cy + hh, q);
  p.arcTo(cx + hw, cy + hh, cx - hw, cy + hh, q);
  p.arcTo(cx - hw, cy + hh, cx - hw, cy - hh, q);
  p.arcTo(cx - hw, cy - hh, cx + hw, cy - hh, q);
  p.closePath();
  return p;
};

const rect = (x: number, y: number, w: number, h: number, p: Path2D = new Path2D()) => {
  p.rect(x, y, w, h);
  return p;
};

const circ = (cx: number, cy: number, rad: number, p: Path2D = new Path2D()) => {
  p.moveTo(cx + Math.max(0.01, rad), cy);
  p.arc(cx, cy, Math.max(0.01, rad), 0, TAU);
  return p;
};

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0, p: Path2D = new Path2D()) => {
  p.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  return p;
};

const pl = (pts: Pt[], closed = false, p: Path2D = new Path2D()) => polyPath(pts, closed, p);

/** Pixelated circle built from rows of cell height q */
const blockCircle = (cx: number, cy: number, Rd: number, q: number, p = new Path2D()) => {
  if (Rd <= 0) return p;
  const rows = Math.ceil(Rd / q);
  for (let j = -rows; j < rows; j++) {
    const ym = Math.abs(j + 0.5) * q;
    if (ym >= Rd) continue;
    const hw = Math.round(Math.sqrt(Rd * Rd - ym * ym) / q) * q;
    if (hw <= 0) continue;
    p.rect(cx - hw, cy + j * q, hw * 2, q);
  }
  return p;
};

/** Spiky burst outline */
const burst = (
  cx: number,
  cy: number,
  ro: number,
  ri: number,
  n: number,
  rot: number,
  seed: number,
  p = new Path2D()
) => {
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const j = 0.75 + 0.5 * hash(seed + i * 7.3);
    const rad = i % 2 ? ri : ro * j;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i) p.lineTo(x, y);
    else p.moveTo(x, y);
  }
  p.closePath();
  return p;
};

const text = (
  r: Riso,
  str: string,
  x: number,
  y: number,
  size: number,
  spec: Spec,
  spacing = 0
) => {
  const L = r.layers;
  for (const c of L) {
    c.font = `900 ${size}px ${DISPLAY}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    spacedText(c, str, x, y, spacing);
    c.globalCompositeOperation = 'source-over';
  }
  for (const [i, d] of spec) {
    const c = L[i];
    c.fillStyle = r.tone(c, d);
    spacedText(c, str, x, y, spacing);
  }
};

/** Log-space zoom from (c0, z0) to (c1, z1) that keeps the anchor point gliding to the centre */
const zoomTo = (
  k: number,
  from: [number, number, number],
  anchor: Pt,
  z1: number
): [number, number, number] => {
  const [cx0, cy0, z0] = from;
  const z = Math.exp(lerp(Math.log(z0), Math.log(z1), k));
  // anchor's canvas position at the start, then glide it to the centre
  const sx = (anchor[0] - cx0) * z0 + 800;
  const sy = (anchor[1] - cy0) * z0 + 450;
  const ax = lerp(sx, 800, k);
  const ay = lerp(sy, 450, k);
  return [anchor[0] - (ax - 800) / z, anchor[1] - (ay - 450) / z, z];
};

/* ---------- timeline ---------- */

const T_PUSH0 = 2.5;
const T_PUSH1 = 4.35;
const T_MASK0 = 3.95;
const T_MASK1 = 4.6;
const T_FREEZE = 7.25;
const T_PULL1 = 8.45;
const T_LEAP0 = 8.7;
const T_LEAP1 = 9.5;
const T_DROP0 = 9.82;
const T_LAND = 10.72;
const T_ZIN0 = 10.5;
const T_ZIN1 = 11.42;
const T_WIPE0 = 11.45;
const T_WIPE1 = 12.15;
const T_HH1 = 13.25;
const T_RUN = 12.85;
const T_HZ0 = 14.35;
const T_HZ1 = 15.25;
const T_CIN1 = 17.1;
const T_STOP = 16.9;
const DUR = 19;

/* ---------- room (scene 1) ---------- */

const SCX = 780;
const SCY = 345;
const SCW = 384;
const SCH = 288;
const SCR = 30;
const CK = SCH / 900; // content -> world scale on the TV
const Z_TV = 900 / SCH;

/** Flicker of the TV light, follows the show */
const flick = (t: number) => {
  const base = t < 1.1 ? 0.45 : 0.62 + 0.25 * seg(t, 2.6, 3.1);
  const f = base + 0.16 * noise1(t * 7.3, 2) + 0.08 * noise1(t * 19, 5);
  return clamp(f, 0.2, 1);
};

const drawRoom = (r: Riso, s: State, t: number) => {
  const fl = flick(t);
  const full = rect(-200, -200, 2000, 1300);
  /* wall */
  paint(r, full, WALL);
  const paperW = new Path2D();
  for (let x = -200; x < 1800; x += 56) paperW.rect(x, -200, 18, 840);
  ink(r, paperW, [
    [R, 0.28],
    [Y, 0.2],
  ]);
  const flowers = new Path2D();
  for (let x = -172; x < 1800; x += 112)
    for (let y = 30; y < 640; y += 90) circ(x + ((y / 90) % 2) * 56, y, 4, flowers);
  ink(r, flowers, [[Y, 0.6]]);
  grad(r, B, null, { kind: 'radial', cx: SCX, cy: SCY, r0: 260, r1: 1050, from: 0.3, to: 0.62 }, 8);
  grad(
    r,
    T,
    null,
    { kind: 'radial', cx: SCX, cy: SCY + 20, r0: 220, r1: 620, from: 0.42 * fl, to: 0 },
    7
  );

  /* window, dawn outside */
  const frame = rect(90, 100, 300, 380);
  paint(r, frame, [
    [Y, 0.3],
    [R, 0.16],
    [B, 0.1],
  ]);
  const glass = rect(110, 120, 260, 340);
  knock(r, glass);
  grad(r, Y, glass, { kind: 'linear', x0: 0, y0: 120, x1: 0, y1: 460, from: 0.2, to: 0.95 }, 8);
  grad(r, R, glass, { kind: 'linear', x0: 0, y0: 120, x1: 0, y1: 460, from: 0.62, to: 0.3 }, 8);
  grad(r, B, glass, { kind: 'linear', x0: 0, y0: 120, x1: 0, y1: 320, from: 0.42, to: 0 }, 6);
  xf(
    r,
    (c) => c.clip(glass),
    () => {
      const sy = 438 - 14 * tween(t, 0, 4, ease.outSine);
      const halo = circ(282, sy, 150);
      grad(r, Y, halo, { kind: 'radial', cx: 282, cy: sy, r0: 40, r1: 150, from: 0.9, to: 0.2 }, 6);
      paint(r, circ(282, sy, 40), [
        [Y, 1],
        [R, 0.12],
      ]);
      paint(r, s.roofs, [
        [B, 0.62],
        [R, 0.5],
        [Y, 0.15],
      ]);
      // a bird or two
      const bx = 150 + ((t * 26) % 260);
      const bird = new Path2D();
      bird.moveTo(bx - 7, 200);
      bird.quadraticCurveTo(bx - 3, 194, bx, 200);
      bird.quadraticCurveTo(bx + 3, 194, bx + 7, 200);
      inkStroke(r, bird, [[B, 0.8]], 2);
    }
  );
  const mull = rect(236, 120, 8, 340);
  rect(110, 286, 260, 8, mull);
  paint(r, mull, [
    [Y, 0.3],
    [R, 0.16],
    [B, 0.1],
  ]);
  /* sill */
  paint(r, rect(78, 472, 324, 18), WOOD);

  /* curtains */
  const sway = Math.sin(t * 0.9) * 6;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 58 : 344;
    const cur = new Path2D();
    cur.moveTo(x0, 84);
    cur.lineTo(x0 + 78, 84);
    cur.quadraticCurveTo(x0 + 70 - side * 8, 330, x0 + 82 + sway * side, 560);
    for (let i = 0; i <= 4; i++) {
      const x = x0 + 82 + sway * side - i * 21;
      cur.quadraticCurveTo(x - 6, 572, x - 21, 560);
    }
    cur.quadraticCurveTo(x0 + 10, 330, x0, 84);
    cur.closePath();
    paint(r, cur, [
      [R, 0.9],
      [Y, 0.4],
    ]);
    const folds = new Path2D();
    for (let i = 1; i < 4; i++) {
      const x = x0 + i * 20;
      folds.moveTo(x, 90);
      folds.quadraticCurveTo(x + 4, 330, x + sway * side * 0.8 + 2, 556);
    }
    xf(
      r,
      (c) => c.clip(cur),
      () => inkStroke(r, folds, [[B, 0.5]], 7)
    );
  }
  line(
    r,
    pl([
      [40, 84],
      [440, 84],
    ]),
    WOOD_D,
    7
  );

  /* floor */
  const floor = rect(-200, 640, 2000, 500);
  paint(r, floor, FLOOR);
  xf(
    r,
    (c) => c.clip(floor),
    () => {
      knockStroke(r, s.boards, 2.4, [R, Y]);
      inkStroke(r, s.boards, [[B, 0.45]], 2.4);
      grad(r, B, null, { kind: 'linear', x0: 0, y0: 640, x1: 0, y1: 900, from: 0.05, to: 0.38 }, 6);
    }
  );
  paint(r, rect(-200, 628, 2000, 16), WOOD_D);

  /* dawn light through the window */
  const beam = pl(
    [
      [110, 472],
      [370, 472],
      [880, 900],
      [380, 900],
    ],
    true
  );
  ink(r, beam, [[Y, 0.32]]);
  lift(r, beam, [B], 0.18);
  // dust in the beam
  const motes = new Path2D();
  for (let i = 0; i < 26; i++) {
    const k = hash(i * 3.1);
    const yy = 480 + ((hash(i * 7.7) * 420 + t * (8 + 10 * hash(i))) % 420);
    const span = (yy - 472) / 428;
    const x = lerp(110 + 260 * k, 380 + 500 * k, span) + 8 * noise1(t * 0.6 + i, 3);
    circ(x, yy - 160 * (1 - span), 1.6 + hash(i * 1.3) * 1.6, motes);
  }
  knock(r, motes, [B, R]);
  ink(r, motes, [[Y, 0.9]]);

  /* rug */
  const rug = ell(600, 832, 440, 92);
  paint(r, rug, [
    [R, 0.95],
    [Y, 0.35],
  ]);
  knockStroke(r, ell(600, 832, 400, 76), 7);
  inkStroke(r, ell(600, 832, 400, 76), [[Y, 0.9]], 7);
  inkStroke(r, ell(600, 832, 360, 62), [[T, 0.8]], 4);
  // TV light on the floor
  xf(
    r,
    (c) => c.clip(floor),
    () => {
      grad(
        r,
        T,
        null,
        { kind: 'radial', cx: SCX, cy: 660, r0: 40, r1: 520, from: 0.38 * fl, to: 0 },
        7
      );
      liftGrad(
        r,
        null,
        [R],
        { kind: 'radial', cx: SCX, cy: 660, r0: 40, r1: 420, from: 0.25 * fl, to: 0 },
        6
      );
    }
  );

  /* TV stand */
  paint(r, ell(800, 690, 330, 22), [
    [B, 0.5],
    [R, 0.4],
  ]);
  paint(r, rect(530, 650, 22, 40), DARK);
  paint(r, rect(1048, 650, 22, 40), DARK);
  paint(r, rect(515, 560, 570, 92), WOOD_D);
  knockStroke(
    r,
    pl([
      [800, 572],
      [800, 640],
    ]),
    3
  );
  paint(r, circ(780, 606, 6), GOLD);
  paint(r, circ(820, 606, 6), GOLD);
  paint(r, rect(500, 540, 600, 22), WOOD);
  inkStroke(
    r,
    pl([
      [500, 561],
      [1100, 561],
    ]),
    [[B, 0.7]],
    3
  );

  /* TV */
  const body = rr(820, 352, 560, 380, 46);
  paint(r, rr(820, 545, 470, 12, 4), DARK);
  paint(r, body, WOOD);
  xf(
    r,
    (c) => c.clip(body),
    () => {
      inkStroke(r, s.grain, [[R, 0.85]], 2);
      grad(r, B, null, { kind: 'linear', x0: 0, y0: 170, x1: 0, y1: 540, from: 0.1, to: 0.5 }, 7);
      lift(r, rect(548, 168, 20, 370), [B, R], 0.5);
    }
  );
  paint(r, rr(SCX, SCY, SCW + 60, SCH + 56, 54), DARK);
  // control panel
  const panel = rr(1040, 352, 84, 334, 16);
  paint(r, panel, [
    [B, 0.6],
    [R, 0.42],
    [Y, 0.3],
  ]);
  for (const [ky, kr, ka] of [
    [248, 28, 0.6 + 0.3 * Math.sin(t * 0.4)],
    [326, 21, -0.8],
  ] as const) {
    paint(r, circ(1040, ky, kr), DARK);
    knockStroke(r, circ(1040, ky, kr - 6), 2);
    knockStroke(
      r,
      pl([
        [1040, ky],
        [1040 + Math.cos(ka - Math.PI / 2) * (kr - 4), ky + Math.sin(ka - Math.PI / 2) * (kr - 4)],
      ]),
      4
    );
  }
  const slots = new Path2D();
  for (let i = 0; i < 8; i++) slots.rect(1014, 384 + i * 15, 52, 6);
  paint(r, slots, DARK);
  // power light
  paint(r, circ(1040, 490, 6), [[R, 1]]);
  // antenna
  const ears = new Path2D();
  ears.moveTo(830, 150);
  ears.lineTo(700, 34);
  ears.moveTo(852, 150);
  ears.lineTo(996, 46);
  line(r, ears, DARK, 5);
  paint(r, circ(700, 34, 9), DARK);
  paint(r, circ(996, 46, 9), DARK);
  const dome = new Path2D();
  dome.ellipse(840, 166, 54, 26, 0, Math.PI, TAU);
  dome.closePath();
  paint(r, dome, DARK);
  lift(r, ell(824, 152, 18, 5), [B, R], 0.6);
};

const drawKid = (r: Riso, t: number) => {
  const fl = flick(t);
  const bob = Math.sin(t * 1.4) * 3;
  const tilt = 0.04 * Math.sin(t * 0.7);
  // shadow on the rug
  ink(r, ell(570, 885, 175, 26), [[B, 0.45]]);
  // crossed legs
  const legs = new Path2D();
  legs.ellipse(565, 862, 140, 36, 0, 0, TAU);
  paint(r, legs, [
    [T, 0.95],
    [B, 0.5],
  ]);
  paint(r, ell(432, 872, 22, 13, 0.2), [[R, 0.95]]);
  paint(r, ell(700, 876, 22, 13, -0.2), [[R, 0.95]]);
  // torso
  const torso = new Path2D();
  torso.moveTo(504, 712);
  torso.quadraticCurveTo(560, 690, 622, 712);
  torso.quadraticCurveTo(650, 730, 652, 770);
  torso.lineTo(658, 850);
  torso.quadraticCurveTo(565, 868, 474, 850);
  torso.lineTo(478, 770);
  torso.quadraticCurveTo(480, 728, 504, 712);
  torso.closePath();
  paint(r, torso, PJ);
  xf(
    r,
    (c) => c.clip(torso),
    () => {
      const st = new Path2D();
      for (let y = 722; y < 860; y += 26) st.rect(440, y, 260, 9);
      knock(r, st, [T, B]);
      ink(r, st, [[T, 0.3]]);
      grad(r, B, null, { kind: 'linear', x0: 480, y0: 0, x1: 660, y1: 0, from: 0.5, to: 0.05 }, 6);
    }
  );
  // neck + ears
  paint(r, rect(546, 672, 30, 30), SKIN);
  // head (from behind: mostly hair)
  xf(
    r,
    (c) => {
      c.translate(560, 680);
      c.rotate(tilt);
      c.translate(-560, -680);
    },
    () => {
      paint(r, ell(512, 650, 10, 14), SKIN);
      paint(r, ell(608, 650, 10, 14), SKIN);
      const head = circ(560, 638, 47);
      paint(r, head, HAIR);
      // cowlick
      const tuft = new Path2D();
      tuft.moveTo(548, 596);
      tuft.quadraticCurveTo(552, 562, 584, 566);
      tuft.quadraticCurveTo(566, 574, 566, 596);
      tuft.closePath();
      tuft.moveTo(564, 594);
      tuft.quadraticCurveTo(580, 572, 600, 586);
      tuft.quadraticCurveTo(584, 586, 578, 600);
      tuft.closePath();
      paint(r, tuft, HAIR);
      // TV rim light on the hair
      const rim = new Path2D();
      rim.arc(560, 638, 45, Math.PI * 1.08, Math.PI * 1.92);
      knockStroke(r, rim, 4);
      inkStroke(
        r,
        rim,
        [
          [Y, 0.6 * fl],
          [T, 0.5],
        ],
        4
      );
    }
  );
  // shoulder rim light
  const srim = new Path2D();
  srim.moveTo(506, 712);
  srim.quadraticCurveTo(560, 692, 620, 712);
  knockStroke(r, srim, 4);
  inkStroke(r, srim, [[Y, 0.5 * fl]], 4);

  // bowl in the lap, peeking out on the right
  const bx = 672;
  const by = 818;
  const bowl = new Path2D();
  bowl.moveTo(bx - 62, by);
  bowl.quadraticCurveTo(bx - 56, by + 46, bx, by + 48);
  bowl.quadraticCurveTo(bx + 56, by + 46, bx + 62, by);
  bowl.closePath();
  paint(r, bowl, [
    [R, 1],
    [Y, 0.3],
  ]);
  const dots = new Path2D();
  for (let i = 0; i < 5; i++) circ(bx - 40 + i * 20, by + 22 + (i % 2) * 8, 4, dots);
  knock(r, dots);
  ink(r, dots, [[Y, 0.7]]);
  const rim = ell(bx, by, 62, 15);
  paint(r, rim, [[Y, 0.12]]);
  const oats = new Path2D();
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    circ(bx + Math.cos(a) * (14 + (i % 3) * 14), by + Math.sin(a) * 7, 5.5, oats);
  }
  inkStroke(r, oats, ORANGE, 3.4);
  // left hand holding the bowl
  paint(r, ell(bx - 58, by + 10, 14, 11), SKIN);
  // spoon arm
  const hand: Pt = [662, 744 + bob];
  const arm = new Path2D();
  arm.moveTo(616, 722);
  arm.quadraticCurveTo(668, 760, hand[0], hand[1] + 10);
  line(r, arm, PJ, 26);
  paint(r, circ(hand[0], hand[1], 13), SKIN);
  const spoon = new Path2D();
  spoon.moveTo(hand[0] + 2, hand[1] + 8);
  spoon.lineTo(hand[0] + 16, hand[1] - 34);
  line(r, spoon, [[B, 0.55]], 5);
  const sb = ell(hand[0] + 19, hand[1] - 44, 9, 13, 0.3);
  paint(r, sb, [[B, 0.55]]);
  lift(r, ell(hand[0] + 17, hand[1] - 46, 3, 6, 0.3), [B], 1);
  // a drip of milk
  const dk = (t * 0.8) % 1;
  if (dk < 0.6) knock(r, circ(hand[0] + 20, hand[1] - 28 + dk * 70, 2.5));
};

/* ---------- the energy clash (scene 2, content space 1600 x 900) ---------- */

const clashPt = (t: number): Pt => {
  const k = seg(t, 3.05, 3.7);
  return [800 + (70 * noise1(t * 1.2, 3) + 22 * Math.sin(t * 5.3)) * k, 486];
};

interface FighterOpts {
  x: number;
  dir: number;
  kind: 0 | 1;
  t: number;
  p: number;
}

const drawAura = (r: Riso, o: FighterOpts) => {
  const { t, p } = o;
  if (p <= 0.01) return;
  const pts: Pt[] = [];
  const n = 56;
  const base = 120 + 60 * p;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const up = Math.max(0, -Math.sin(a));
    let rad = base * (1 + 0.12 * noise1(a * 3 + t * 5, o.kind + 1));
    rad += up * (60 + 90 * p) * Math.abs(noise1(a * 7 + t * 9, o.kind + 4));
    pts.push([o.x + Math.cos(a) * rad * 0.82, 548 + Math.sin(a) * rad * 1.15 - up * 40]);
  }
  const outer = smoothPath(pts);
  const inner = smoothPath(
    pts.map(([x, y]): Pt => [o.x + (x - o.x) * 0.72, 560 + (y - 560) * 0.74])
  );
  paint(r, outer, o.kind ? CRIMSON : GOLD);
  knock(r, inner);
  ink(r, inner, o.kind ? [[R, 0.25]] : [[Y, 0.35]]);
};

const drawFighter = (r: Riso, o: FighterOpts) => {
  const { t } = o;
  xf(
    r,
    (c) => {
      c.translate(o.x, 700);
      c.scale(o.dir * (o.kind ? 1.08 : 1), o.kind ? 1.08 : 1);
    },
    () => {
      const w = Math.sin(t * 11 + o.kind) * 6;
      if (o.kind === 0) {
        // sash ribbon
        const sash = new Path2D();
        sash.moveTo(-12, -140);
        for (let x = -12; x >= -120; x -= 12)
          sash.lineTo(x, -142 + Math.sin(x * 0.06 + t * 12) * (4 - x * 0.08) + w * 0.3);
        for (let x = -120; x <= -12; x += 12)
          sash.lineTo(x, -128 + Math.sin(x * 0.06 + t * 12) * (4 - x * 0.08) + w * 0.3);
        sash.closePath();
        paint(r, sash, ORANGE);
      } else {
        // coat tails and streaming hair
        const coat = new Path2D();
        coat.moveTo(-20, -150);
        coat.quadraticCurveTo(-70, -90, -130 + w, -20 + w);
        coat.lineTo(-96 + w, -6);
        coat.quadraticCurveTo(-40, -60, 16, -120);
        coat.closePath();
        paint(r, coat, DARK);
        knockStroke(
          r,
          pl([
            [-28, -140],
            [-110 + w, -22 + w],
          ]),
          3
        );
        const hair = new Path2D();
        hair.moveTo(14, -290);
        hair.quadraticCurveTo(-60, -300 + w, -150, -250 + w * 2);
        hair.quadraticCurveTo(-80, -264, -40, -244 + w);
        hair.quadraticCurveTo(-10, -250, 4, -246);
        hair.closePath();
        paint(r, hair, DARK);
      }
      // legs
      const legs = new Path2D();
      legs.moveTo(-6, -130);
      legs.lineTo(-48, -66);
      legs.lineTo(-86, -6);
      legs.moveTo(8, -130);
      legs.lineTo(52, -76);
      legs.lineTo(72, -6);
      line(r, legs, DARK, 30);
      paint(r, ell(-88, -6, 26, 10), DARK);
      paint(r, ell(80, -6, 26, 10), DARK);
      // torso
      const torso = pl(
        [
          [-24, -134],
          [22, -134],
          [38, -228],
          [-14, -238],
        ],
        true
      );
      paint(r, torso, DARK);
      paint(r, circ(12, -226, 26), DARK);
      if (o.kind === 1) {
        // shoulder spikes
        const pad = pl(
          [
            [-14, -244],
            [-40, -282],
            [8, -252],
          ],
          true
        );
        pl(
          [
            [24, -246],
            [36, -284],
            [44, -240],
          ],
          true,
          pad
        );
        paint(r, pad, DARK);
      }
      // head
      paint(r, circ(28, -262, 24), DARK);
      if (o.kind === 0) {
        const spikes: Pt[] = [
          [8, -280],
          [-52, -302 + w * 0.4],
          [-6, -292],
          [-34, -342 + w * 0.5],
          [6, -302],
          [4, -356 + w * 0.6],
          [24, -300],
          [42, -338 + w * 0.4],
          [42, -290],
          [66, -300],
          [48, -268],
          [10, -256],
        ];
        paint(r, pl(spikes, true), DARK);
      }
      // eye glint
      knock(
        r,
        pl(
          [
            [36, -266],
            [50, -268],
            [48, -262],
          ],
          true
        )
      );
      // arms
      const arms = new Path2D();
      if (o.kind === 0) {
        arms.moveTo(-2, -222);
        arms.lineTo(52, -214);
        arms.lineTo(98, -212);
        arms.moveTo(20, -218);
        arms.lineTo(66, -204);
        arms.lineTo(106, -206);
      } else {
        arms.moveTo(16, -226);
        arms.lineTo(64, -222);
        arms.lineTo(108, -220);
        arms.moveTo(-4, -220);
        arms.lineTo(-30, -180);
        arms.lineTo(-14, -150);
      }
      line(r, arms, DARK, 22);
      paint(r, circ(106, o.kind ? -220 : -209, 17), DARK);
      // rim light from the blast
      const rim = new Path2D();
      rim.moveTo(40, -234);
      rim.lineTo(24, -136);
      rim.moveTo(56, -78);
      rim.lineTo(74, -12);
      rim.moveTo(52, -276);
      rim.quadraticCurveTo(54, -258, 46, -246);
      knockStroke(r, rim, 3.5);
      inkStroke(r, rim, [[Y, 0.9]], 3.5);
    }
  );
};

const drawBeam = (
  r: Riso,
  x0: number,
  x1: number,
  y: number,
  t: number,
  kind: number,
  p: number
) => {
  const dir = Math.sign(x1 - x0) || 1;
  const len = Math.abs(x1 - x0);
  if (len < 2) return;
  const top: Pt[] = [];
  const bot: Pt[] = [];
  const coreT: Pt[] = [];
  const coreB: Pt[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = x0 + dir * len * k;
    const wv = 6 * noise1(k * 9 - t * 14 * dir, kind + 2);
    const hw = (22 + 26 * k) * (0.85 + 0.3 * p);
    top.push([x, y - hw + wv]);
    bot.push([x, y + hw + wv * 0.6]);
    coreT.push([x, y - hw * 0.42 + wv * 0.5]);
    coreB.push([x, y + hw * 0.42 + wv * 0.4]);
  }
  const band = pl([...top, ...bot.reverse()], true);
  const core = pl([...coreT, ...coreB.reverse()], true);
  paint(r, band, kind ? CRIMSON : GOLD);
  knock(r, core);
  ink(r, core, kind ? [[R, 0.18]] : [[Y, 0.3]]);
  // energy dashes running along the beam
  const dash = new Path2D();
  for (let i = 0; i < 7; i++) {
    const k = (i / 7 + t * 2.2) % 1;
    const x = x0 + dir * len * k;
    dash.moveTo(x, y + (i % 2 ? -14 : 14) * (0.6 + k));
    dash.lineTo(x + dir * 40, y + (i % 2 ? -14 : 14) * (0.6 + k));
  }
  knockStroke(r, dash, 3);
};

const drawClash = (r: Riso, s: State, t: number) => {
  const p = seg(t, 1.1, 7.2);
  const [cx, cy] = clashPt(t);
  const shake = 7 * seg(t, 3.0, 6.9) * (1 - seg(t, 6.95, T_FREEZE));
  const zc = 1 + 0.07 * tween(t, 3.0, T_FREEZE, ease.inOutSine);
  xf(
    r,
    (c) => {
      c.translate(800 + shake * noise1(t * 31, 1), 450 + shake * noise1(t * 29, 2));
      c.scale(zc, zc);
      c.translate(-800, -450);
    },
    () => {
      const full = rect(-300, -300, 2200, 1500);
      /* sky */
      knock(r, full);
      grad(r, B, full, { kind: 'linear', x0: 0, y0: 0, x1: 0, y1: 700, from: 0.95, to: 0.4 }, 10);
      grad(r, R, full, { kind: 'linear', x0: 0, y0: 0, x1: 0, y1: 700, from: 0.35, to: 0.9 }, 10);
      grad(r, Y, full, { kind: 'linear', x0: 0, y0: 250, x1: 0, y1: 700, from: 0, to: 0.6 }, 8);
      /* speed rays from the clash */
      const rays = new Path2D();
      const rot = t * 0.06;
      for (let i = 0; i < 28; i++) {
        const a0 = rot + (i * TAU) / 28;
        const a1 = a0 + (TAU / 28) * (0.35 + 0.3 * hash(i * 1.9));
        rays.moveTo(cx, cy);
        rays.lineTo(cx + Math.cos(a0) * 2400, cy + Math.sin(a0) * 2400);
        rays.lineTo(cx + Math.cos(a1) * 2400, cy + Math.sin(a1) * 2400);
        rays.closePath();
      }
      lift(r, rays, [B], 0.15 + 0.3 * p);
      ink(r, rays, [[Y, 0.12 + 0.25 * p]]);
      /* blast glow */
      const gR = 180 + 300 * p;
      grad(r, Y, null, { kind: 'radial', cx, cy, r0: 30, r1: gR, from: 0.9 * p, to: 0 }, 8);
      liftGrad(
        r,
        null,
        [B],
        { kind: 'radial', cx, cy, r0: 20, r1: gR * 0.8, from: 0.7 * p, to: 0 },
        6
      );
      /* mountains */
      paint(r, s.mountains, [
        [B, 0.78],
        [R, 0.62],
        [T, 0.3],
      ]);
      liftGrad(
        r,
        s.mountains,
        [B, T],
        { kind: 'radial', cx, cy: 600, r0: 0, r1: 520, from: 0.45 * p, to: 0 },
        6
      );
      /* ground */
      paint(r, s.ground, DARK);
      knockStroke(r, s.groundEdge, 4);
      inkStroke(r, s.groundEdge, ORANGE, 4);
      // cracks open as the power grows
      const ck = seg(t, 3.2, 7.0);
      if (ck > 0) {
        const cr = new Path2D();
        for (const crack of s.cracks) {
          const m = Math.max(2, Math.floor(crack.length * ck));
          cr.moveTo(cx + crack[0][0], crack[0][1]);
          for (let i = 1; i < m; i++) cr.lineTo(cx + crack[i][0], crack[i][1]);
        }
        knockStroke(r, cr, 4.5);
        inkStroke(r, cr, GOLD, 4.5);
      }
      /* auras, fighters */
      const pa = seg(t, 1.2, 2.4) * (0.7 + 0.3 * p);
      const left: FighterOpts = { x: 330, dir: 1, kind: 0, t, p: pa };
      const right: FighterOpts = { x: 1270, dir: -1, kind: 1, t, p: pa };
      drawAura(r, left);
      drawAura(r, right);
      drawFighter(r, left);
      drawFighter(r, right);
      /* beams */
      const bk = tween(t, 2.6, 3.05, ease.outCubic);
      const lx0 = 436;
      const rx0 = 1270 - 117;
      if (bk > 0) {
        drawBeam(r, lx0, lerp(lx0, cx, bk), 491, t, 0, p);
        drawBeam(r, rx0, lerp(rx0, cx, bk), 463 + 22, t, 1, p);
      }
      // charging balls at the palms
      for (const [x, y, k] of [
        [lx0, 491, 0],
        [rx0, 485, 1],
      ] as const) {
        const cr = (18 + 16 * seg(t, 1.3, 2.6)) * (0.9 + 0.1 * Math.sin(t * 30 + k));
        if (t > 1.3) {
          paint(r, circ(x, y, cr * 1.5), k ? CRIMSON : GOLD);
          knock(r, circ(x, y, cr));
        }
      }
      /* the clash ball */
      if (t > 2.95) {
        const kf = tween(t, 6.55, 7.15, ease.outCubic);
        const Rb = (40 + 55 * seg(t, 3.0, 6.6)) * (1 + 0.08 * Math.sin(t * 23));
        const ro = Rb * 1.9 + 250 * kf;
        const spin = t * 0.7;
        paint(r, burst(cx, cy, ro * 1.18, ro * 0.62, 14, spin + 0.1, 3), ORANGE);
        paint(r, burst(cx, cy, ro, ro * 0.6, 14, spin, Math.floor(t * 10)), GOLD);
        knock(r, burst(cx, cy, ro * 0.78, Rb * 0.9, 11, -spin * 1.3, Math.floor(t * 14) + 50));
        ink(r, circ(cx, cy, Rb * 0.5), [[Y, 0.25]]);
        // lightning arcs
        const seed = Math.floor(t * 12);
        const bolts = new Path2D();
        for (let b = 0; b < 4; b++) {
          let a = hash(seed * 3.7 + b) * TAU;
          let x = cx + Math.cos(a) * Rb;
          let y = cy + Math.sin(a) * Rb;
          bolts.moveTo(x, y);
          const L = 80 + 160 * p + 160 * kf;
          for (let j = 0; j < 6; j++) {
            a += (hash(seed + b * 13 + j) - 0.5) * 1.4;
            x += Math.cos(a) * (L / 6);
            y += Math.sin(a) * (L / 6);
            bolts.lineTo(x, y);
          }
        }
        knockStroke(r, bolts, 6);
        inkStroke(r, bolts, [[T, 0.9]], 3);
        // shockwave ring at the climax
        const kr = seg(t, 6.85, T_FREEZE);
        if (kr > 0) {
          const rad = 120 + 760 * ease.outCubic(kr);
          knockStroke(r, ell(cx, cy, rad, rad * 0.8), 18 * (1 - kr) + 4);
        }
      }
      /* rocks lifting off the ground */
      const rocks = new Path2D();
      const rockLit = new Path2D();
      for (const rk of s.rocks) {
        if (t < rk.t0) continue;
        const dt = t - rk.t0;
        const y = rk.y - 70 * dt - 22 * dt * dt * (0.5 + p);
        if (y < -100) continue;
        const a = rk.spin * dt;
        const pts = rk.pts.map(([px, py]): Pt => [
          rk.x + px * Math.cos(a) - py * Math.sin(a),
          y + px * Math.sin(a) + py * Math.cos(a),
        ]);
        pl(pts, true, rocks);
        rockLit.moveTo(pts[0][0], pts[0][1]);
        rockLit.lineTo(pts[1][0], pts[1][1]);
      }
      paint(r, rocks, DARK);
      knockStroke(r, rockLit, 3);
      inkStroke(r, rockLit, [[Y, 0.9]], 3);
    }
  );
};

/* ---------- comic page (scene 3, page space 1600 x 900) ---------- */

interface Panel {
  x: number;
  y: number;
  w: number;
  h: number;
}
const P1: Panel = { x: 50, y: 50, w: 650, h: 365.6 };
const P2: Panel = { x: 730, y: 50, w: 350, h: 365.6 };
const P3: Panel = { x: 1110, y: 50, w: 440, h: 365.6 };
const P4: Panel = { x: 50, y: 445, w: 400, h: 405 };
const P5: Panel = { x: 480, y: 445, w: 420, h: 405 };
const P6: Panel = { x: 930, y: 445, w: 620, h: 405 };
const K1 = P1.w / 1600;
const P1C: Pt = [P1.x + P1.w / 2, P1.y + P1.h / 2];
const P6C: Pt = [P6.x + P6.w / 2, P6.y + P6.h / 2];
const PANEL_R = 14;
const panelPath = (p: Panel, rad = PANEL_R) => rr(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, rad);

/** Comic street ground line inside P6, which is also the pixel ground */
const GROUND6 = 797.5;

type PoseKey =
  'neck' | 'head' | 'sh' | 'eF' | 'hF' | 'eB' | 'hB' | 'kF' | 'fF' | 'kB' | 'fB' | 'cape';
type Pose = Record<PoseKey, Pt>;

const POSE_CROUCH: Pose = {
  neck: [10, -36],
  head: [16, -50],
  sh: [8, -32],
  eF: [26, -16],
  hF: [30, 4],
  eB: [-6, -14],
  hB: [4, 6],
  kF: [24, -12],
  fF: [26, 18],
  kB: [-14, 8],
  fB: [-28, 18],
  cape: [-50, 12],
};
const POSE_LEAP: Pose = {
  neck: [22, -30],
  head: [34, -42],
  sh: [18, -27],
  eF: [40, -40],
  hF: [62, -54],
  eB: [0, -12],
  hB: [-16, -4],
  kF: [20, 12],
  fF: [8, 32],
  kB: [-20, 10],
  fB: [-44, 18],
  cape: [-86, -8],
};
const POSE_FALL: Pose = {
  neck: [4, -38],
  head: [6, -53],
  sh: [4, -34],
  eF: [24, -46],
  hF: [34, -62],
  eB: [-22, -30],
  hB: [-40, -26],
  kF: [16, 8],
  fF: [12, 32],
  kB: [-8, 18],
  fB: [-20, 34],
  cape: [-34, -74],
};
const POSE_LAND: Pose = {
  neck: [12, -30],
  head: [20, -43],
  sh: [10, -27],
  eF: [26, -8],
  hF: [32, 18],
  eB: [-10, -16],
  hB: [-34, -26],
  kF: [28, -4],
  fF: [32, 22],
  kB: [-8, 20],
  fB: [-38, 22],
  cape: [-64, 14],
};

const lerpPose = (a: Pose, b: Pose, k: number): Pose => {
  const o = {} as Pose;
  for (const key of Object.keys(a) as PoseKey[])
    o[key] = [lerp(a[key][0], b[key][0], k), lerp(a[key][1], b[key][1], k)];
  return o;
};

const HERO_S = 1.9;

const drawCaped = (r: Riso, x: number, y: number, pose: Pose, t: number, wind: number) => {
  xf(
    r,
    (c) => {
      c.translate(x, y);
      c.scale(HERO_S, HERO_S);
    },
    () => {
      const q = pose;
      const w = Math.sin(t * 13) * 3 * wind + Math.sin(t * 7.1) * 2;
      // cape
      const tip: Pt = [q.cape[0] + w, q.cape[1] + w * 0.7];
      const dx = tip[0] - q.sh[0];
      const dy = tip[1] - q.sh[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const cape = new Path2D();
      cape.moveTo(q.sh[0] - 6, q.sh[1] - 4);
      cape.quadraticCurveTo(
        q.sh[0] + dx * 0.5 - nx * 14,
        q.sh[1] + dy * 0.5 - ny * 14,
        tip[0] - nx * 20,
        tip[1] - ny * 20
      );
      cape.lineTo(tip[0] + nx * 4 - dx * 0.06 + w, tip[1] + ny * 4 - dy * 0.06);
      cape.lineTo(tip[0] + nx * 20, tip[1] + ny * 20);
      cape.quadraticCurveTo(
        q.sh[0] + dx * 0.45 + nx * 12,
        q.sh[1] + dy * 0.45 + ny * 12,
        q.sh[0] + 4,
        q.sh[1] + 6
      );
      cape.closePath();
      // paper halo so he reads against any panel
      const sk = new Path2D();
      sk.moveTo(q.hB[0], q.hB[1]);
      sk.lineTo(q.eB[0], q.eB[1]);
      sk.lineTo(q.sh[0], q.sh[1]);
      sk.lineTo(q.eF[0], q.eF[1]);
      sk.lineTo(q.hF[0], q.hF[1]);
      sk.moveTo(q.fB[0], q.fB[1]);
      sk.lineTo(q.kB[0], q.kB[1]);
      sk.lineTo(0, 0);
      sk.lineTo(q.kF[0], q.kF[1]);
      sk.lineTo(q.fF[0], q.fF[1]);
      knockStroke(r, sk, 19);
      knockStroke(r, pl([q.sh, [0, 0]]), 26);
      knockStroke(r, cape, 8);
      knock(r, circ(q.head[0], q.head[1], 15));
      paint(r, cape, CAPE);
      inkStroke(r, pl([q.sh, [q.sh[0] + dx * 0.8, q.sh[1] + dy * 0.8]]), [[B, 0.5]], 3);
      const back = new Path2D();
      back.moveTo(q.sh[0], q.sh[1]);
      back.lineTo(q.eB[0], q.eB[1]);
      back.lineTo(q.hB[0], q.hB[1]);
      back.moveTo(0, 0);
      back.lineTo(q.kB[0], q.kB[1]);
      back.lineTo(q.fB[0], q.fB[1]);
      line(
        r,
        back,
        [
          [B, 0.9],
          [R, 0.55],
        ],
        11
      );
      const torso = new Path2D();
      torso.moveTo(q.sh[0], q.sh[1]);
      torso.lineTo(0, 0);
      line(r, torso, DARK, 18);
      const front = new Path2D();
      front.moveTo(0, 0);
      front.lineTo(q.kF[0], q.kF[1]);
      front.lineTo(q.fF[0], q.fF[1]);
      front.moveTo(q.sh[0], q.sh[1]);
      front.lineTo(q.eF[0], q.eF[1]);
      front.lineTo(q.hF[0], q.hF[1]);
      line(r, front, DARK, 11);
      // head with cowl ears
      const [hx, hy] = q.head;
      const head = circ(hx, hy, 10);
      pl(
        [
          [hx - 8, hy - 4],
          [hx - 6, hy - 18],
          [hx - 1, hy - 8],
        ],
        true,
        head
      );
      pl(
        [
          [hx + 2, hy - 8],
          [hx + 6, hy - 18],
          [hx + 9, hy - 4],
        ],
        true,
        head
      );
      paint(r, head, DARK);
      knock(
        r,
        pl(
          [
            [hx + 3, hy - 2],
            [hx + 10, hy - 3],
            [hx + 9, hy + 1],
          ],
          true
        )
      );
      ink(
        r,
        pl(
          [
            [hx + 3, hy - 2],
            [hx + 10, hy - 3],
            [hx + 9, hy + 1],
          ],
          true
        ),
        [[Y, 0.6]]
      );
      // emblem
      const ex = lerp(q.sh[0], 0, 0.35);
      const ey = lerp(q.sh[1], 0, 0.35);
      const em = pl(
        [
          [ex, ey - 5],
          [ex + 4, ey],
          [ex, ey + 5],
          [ex - 4, ey],
        ],
        true
      );
      knock(r, em);
      ink(r, em, GOLD);
      // belt
      knockStroke(
        r,
        pl([
          [lerp(q.sh[0], 0, 0.9) - 7, lerp(q.sh[1], 0, 0.9)],
          [lerp(q.sh[0], 0, 0.9) + 7, lerp(q.sh[1], 0, 0.9)],
        ]),
        3
      );
    }
  );
};

/** Where the comic hero is and what he's doing */
const heroAt = (t: number): { x: number; y: number; pose: Pose; wind: number } => {
  const A: Pt = [905, 316 + 2];
  const Bp: Pt = [1205, 257];
  const C: Pt = [1240, GROUND6 - 22 * HERO_S - 2];
  if (t < T_LEAP0) {
    const ant = tween(t, 8.42, T_LEAP0, ease.inOutSine);
    return { x: A[0], y: A[1] + 6 * ant + Math.sin(t * 2.4) * 1.2, pose: POSE_CROUCH, wind: 0.4 };
  }
  if (t < T_LEAP1) {
    const k = seg(t, T_LEAP0, T_LEAP1);
    const e = ease.inOutSine(k);
    const x = lerp(A[0], Bp[0], e);
    const y = lerp(A[1], Bp[1], e) - 120 * Math.sin(Math.PI * e);
    const pk =
      k < 0.2 ? ease.outCubic(k / 0.2) : k > 0.78 ? 1 - ease.inOutSine((k - 0.78) / 0.22) : 1;
    return { x, y, pose: lerpPose(POSE_CROUCH, POSE_LEAP, pk), wind: 1 };
  }
  if (t < T_DROP0)
    return {
      x: Bp[0],
      y: Bp[1] + 3 * Math.sin(seg(t, T_LEAP1, T_DROP0) * Math.PI),
      pose: POSE_CROUCH,
      wind: 0.5,
    };
  if (t < T_LAND) {
    const k = seg(t, T_DROP0, T_LAND);
    const x = lerp(Bp[0], C[0], ease.inOutSine(k));
    const yy = Bp[1] - 60 * Math.sin(Math.PI * k) * (1 - k) + (C[1] - Bp[1]) * k * k;
    const pk = tween(k, 0, 0.3, ease.outCubic);
    return { x, y: yy, pose: lerpPose(POSE_CROUCH, POSE_FALL, pk), wind: 1.4 };
  }
  const k = tween(t, T_LAND, T_LAND + 0.18, ease.outCubic);
  return {
    x: C[0],
    y: C[1] + 4 * Math.sin(Math.PI * seg(t, T_LAND, T_LAND + 0.3)),
    pose: lerpPose(POSE_FALL, POSE_LAND, k),
    wind: 0.5,
  };
};

const panelSky = (r: Riso, p: Panel, from: Spec, to: Spec) => {
  const path = rect(p.x - 2, p.y - 2, p.w + 4, p.h + 4);
  knock(r, path);
  for (let i = 0; i < 4; i++) {
    const a = from.find((f) => f[0] === i)?.[1] ?? 0;
    const b = to.find((f) => f[0] === i)?.[1] ?? 0;
    if (a <= 0.012 && b <= 0.012) continue;
    grad(r, i, path, { kind: 'linear', x0: 0, y0: p.y, x1: 0, y1: p.y + p.h, from: a, to: b }, 8);
  }
};

const skyline = (
  r: Riso,
  s: State,
  x0: number,
  x1: number,
  base: number,
  seed: number,
  hMin: number,
  hMax: number,
  spec: Spec,
  lit = 0.9
) => {
  const rng = mulberry(seed);
  const p = new Path2D();
  const win = new Path2D();
  let x = x0;
  while (x < x1) {
    const w = 30 + rng() * 50;
    const h = hMin + rng() * (hMax - hMin);
    p.rect(x, base - h, w, h + 400);
    for (let wy = base - h + 10; wy < base - 8; wy += 16)
      for (let wx = x + 6; wx < x + w - 8; wx += 12) if (rng() < 0.32) win.rect(wx, wy, 5, 7);
    x += w + rng() * 6;
  }
  void s;
  paint(r, p, spec);
  if (lit > 0) {
    knock(r, win);
    ink(r, win, [[Y, lit]]);
  }
};

const drawP2 = (r: Riso, s: State, t: number) => {
  panelSky(r, P2, NIGHT, [
    [B, 0.6],
    [R, 0.6],
  ]);
  // the blast glows on the horizon
  grad(r, Y, null, { kind: 'radial', cx: 735, cy: 340, r0: 10, r1: 260, from: 0.8, to: 0 }, 7);
  liftGrad(
    r,
    null,
    [B],
    { kind: 'radial', cx: 735, cy: 340, r0: 10, r1: 220, from: 0.6, to: 0 },
    6
  );
  paint(r, circ(1012, 116, 30), [[Y, 0.95]]);
  ink(r, circ(1004, 110, 6, circ(1022, 124, 4)), [[R, 0.3]]);
  skyline(r, s, 726, 1084, 380, 41, 40, 120, [
    [B, 0.8],
    [R, 0.55],
  ]);
  // water tower
  const tw = new Path2D();
  tw.rect(1008, 266, 58, 52);
  pl(
    [
      [1002, 268],
      [1037, 238],
      [1072, 268],
    ],
    true,
    tw
  );
  paint(r, tw, DARK);
  const legs = new Path2D();
  legs.moveTo(1014, 318);
  legs.lineTo(1008, 350);
  legs.moveTo(1060, 318);
  legs.lineTo(1066, 350);
  line(r, legs, DARK, 4);
  knockStroke(
    r,
    pl([
      [1008, 284],
      [1066, 284],
    ]),
    2
  );
  // rooftop
  paint(r, rect(820, 352, 270, 70), DARK);
  paint(r, rect(816, 344, 274, 12), [
    [B, 0.6],
    [R, 0.4],
    [Y, 0.3],
  ]);
  void t;
};

const drawP3 = (r: Riso, s: State, t: number) => {
  panelSky(
    r,
    P3,
    [
      [B, 0.95],
      [R, 0.35],
    ],
    [
      [B, 0.5],
      [R, 0.8],
      [Y, 0.3],
    ]
  );
  // stars
  const stars = new Path2D();
  for (let i = 0; i < 14; i++) {
    const x = P3.x + 20 + hash(i * 5.1) * (P3.w - 40);
    const y = P3.y + 16 + hash(i * 2.3) * 170;
    const sz = 2 + 3 * (0.5 + 0.5 * Math.sin(t * 4 + i * 1.7));
    stars.moveTo(x - sz, y);
    stars.lineTo(x + sz, y);
    stars.moveTo(x, y - sz);
    stars.lineTo(x, y + sz);
  }
  knockStroke(r, stars, 2);
  inkStroke(r, stars, [[Y, 0.9]], 2);
  // clouds
  const cl = new Path2D();
  for (let i = 0; i < 6; i++)
    ell(P3.x + 60 + i * 70 + ((t * 10) % 70), 230 + (i % 2) * 14, 60, 16, 0, cl);
  lift(r, cl, [B], 0.3);
  ink(r, cl, [[R, 0.25]]);
  skyline(
    r,
    s,
    1106,
    1560,
    416,
    77,
    50,
    140,
    [
      [B, 0.75],
      [R, 0.6],
    ],
    0.6
  );
  // the spire he lands on
  const spire = new Path2D();
  spire.rect(1150, 286, 120, 140);
  spire.rect(1168, 268, 84, 22);
  paint(r, spire, DARK);
  const ww = new Path2D();
  for (let y = 300; y < 416; y += 18)
    for (let x = 1160; x < 1262; x += 14) if (hash(x * 0.3 + y) > 0.45) ww.rect(x, y, 6, 9);
  knock(r, ww);
  ink(r, ww, [[Y, 0.8]]);
  line(
    r,
    pl([
      [1232, 268],
      [1232, 150],
    ]),
    DARK,
    4
  );
  if (Math.sin(t * 6) > 0) paint(r, circ(1232, 148, 6), [[R, 1]]);
};

const drawP4 = (r: Riso, s: State, t: number) => {
  panelSky(r, P4, NIGHT, [
    [B, 0.55],
    [R, 0.75],
  ]);
  for (const [bx, a0, sp] of [
    [150, -1.9, 0.9],
    [360, -1.2, 1.2],
  ] as const) {
    const a = a0 + 0.35 * Math.sin(t * sp);
    const L = 600;
    const beam = pl(
      [
        [bx - 8, 850],
        [bx + Math.cos(a - 0.09) * L, 850 + Math.sin(a - 0.09) * L],
        [bx + Math.cos(a + 0.09) * L, 850 + Math.sin(a + 0.09) * L],
        [bx + 8, 850],
      ],
      true
    );
    lift(r, beam, [B], 0.35);
    ink(r, beam, [[Y, 0.5]]);
  }
  skyline(r, s, 46, 456, 850, 13, 70, 190, DARK);
};

const drawP5 = (r: Riso, s: State, t: number) => {
  panelSky(
    r,
    P5,
    [
      [B, 0.9],
      [R, 0.55],
      [T, 0.4],
    ],
    [
      [B, 0.7],
      [R, 0.5],
      [T, 0.4],
    ]
  );
  // lamp light
  const cone = pl(
    [
      [748, 528],
      [772, 528],
      [880, 792],
      [640, 792],
    ],
    true
  );
  lift(r, cone, [B, T], 0.35);
  ink(r, cone, [[Y, 0.55]]);
  paint(r, rect(480, 792, 420, 60), [
    [B, 0.75],
    [R, 0.6],
  ]);
  const pud = ell(760, 818, 110, 12);
  lift(r, pud, [B, R], 0.5);
  ink(r, pud, [[Y, 0.6]]);
  const pole = new Path2D();
  pole.moveTo(620, 792);
  pole.lineTo(620, 512);
  pole.quadraticCurveTo(620, 496, 640, 496);
  pole.lineTo(760, 496);
  line(r, pole, DARK, 9);
  paint(r, rr(760, 514, 40, 26, 8), DARK);
  paint(r, ell(760, 528, 16, 6), [[Y, 1]]);
  // rain
  const rain = new Path2D();
  for (let i = 0; i < 46; i++) {
    const x = P5.x + hash(i * 3.3) * (P5.w + 60);
    const y = P5.y + ((hash(i * 9.1) * P5.h + t * 520) % P5.h);
    rain.moveTo(x, y);
    rain.lineTo(x - 7, y + 24);
  }
  knockStroke(r, rain, 2);
  inkStroke(r, rain, [[T, 0.7]], 2);
  // a kid watching the sky with an umbrella
  const kid = new Path2D();
  kid.ellipse(560, 742, 10, 11, 0, 0, TAU);
  kid.rect(552, 752, 16, 30);
  kid.rect(552, 780, 6, 12);
  kid.rect(562, 780, 6, 12);
  paint(r, kid, DARK);
  const um = new Path2D();
  um.moveTo(526, 726);
  um.quadraticCurveTo(556, 690, 600, 712);
  um.closePath();
  paint(r, um, [[R, 1]]);
  line(
    r,
    pl([
      [562, 712],
      [560, 750],
    ]),
    DARK,
    3
  );
};

const drawP6Comic = (r: Riso, s: State, t: number) => {
  panelSky(
    r,
    P6,
    [
      [B, 0.6],
      [R, 0.3],
    ],
    [
      [B, 0.15],
      [R, 0.8],
      [Y, 0.75],
    ]
  );
  // setting sun, where the pixel sun will be
  paint(r, circ(1390, 547, 46), [
    [Y, 1],
    [R, 0.2],
  ]);
  skyline(
    r,
    s,
    926,
    1560,
    GROUND6,
    99,
    60,
    170,
    [
      [B, 0.55],
      [R, 0.6],
    ],
    0.5
  );
  paint(r, rect(926, GROUND6, 630, 60), DARK);
  knockStroke(
    r,
    pl([
      [926, GROUND6 + 2],
      [1556, GROUND6 + 2],
    ]),
    4
  );
  inkStroke(
    r,
    pl([
      [926, GROUND6 + 2],
      [1556, GROUND6 + 2],
    ]),
    ORANGE,
    4
  );
  // falling: speed lines
  const fk = seg(t, T_DROP0 + 0.2, T_LAND) * (1 - seg(t, T_LAND, T_LAND + 0.25));
  if (fk > 0) {
    const sl = new Path2D();
    for (let i = 0; i < 16; i++) {
      const x = P6.x + 20 + hash(i * 4.4) * (P6.w - 40);
      const y = P6.y + hash(i * 1.7) * 200;
      sl.moveTo(x, y);
      sl.lineTo(x, y + 60 + 120 * hash(i));
    }
    knockStroke(r, sl, 3);
    inkStroke(r, sl, [[Y, 0.5 * fk]], 3);
  }
  // impact
  const ik = seg(t, T_LAND, T_LAND + 0.7);
  if (ik > 0) {
    const cr = new Path2D();
    for (let i = 0; i < 7; i++) {
      const dir = i % 2 ? 1 : -1;
      const L = (40 + 90 * hash(i * 2.2)) * ease.outCubic(Math.min(1, ik * 3));
      cr.moveTo(1240 + dir * 10, GROUND6 + 3);
      cr.lineTo(1240 + dir * (L * 0.5), GROUND6 + 10 + 10 * hash(i));
      cr.lineTo(1240 + dir * L, GROUND6 + 6 + 30 * hash(i + 3));
    }
    knockStroke(r, cr, 3);
    inkStroke(r, cr, GOLD, 3);
    if (ik < 1) {
      const rad = 30 + 260 * ease.outCubic(ik);
      knockStroke(r, ell(1240, GROUND6, rad, rad * 0.16), 10 * (1 - ik) + 1);
      const dust = new Path2D();
      for (let i = 0; i < 8; i++) {
        const side = i % 2 ? 1 : -1;
        const dx = side * (30 + 120 * ease.outCubic(ik) * (0.5 + hash(i)));
        circ(
          1240 + dx,
          GROUND6 - 8 - 30 * ik * hash(i + 9),
          (10 + 14 * hash(i * 3)) * (1 - ik * 0.7),
          dust
        );
      }
      paint(r, dust, [
        [Y, 0.5 * (1 - ik)],
        [R, 0.3 * (1 - ik)],
      ]);
    }
  }
};

/* ---------- pixel level (screen content, centred on the screen) ---------- */

const Q = 9;
const PG = 148.5; // pixel ground (content y)
const SQ = 8; // sprite cell

const runSpeed = (t: number) =>
  250 *
  tween(t, T_RUN, T_RUN + 0.25, ease.inOutSine) *
  (1 - tween(t, T_STOP - 0.6, T_STOP, ease.inOutSine));
const scrollAt = (t: number) => {
  if (t <= T_RUN) return 0;
  const steps = 160;
  const t1 = Math.min(t, T_STOP + 0.1);
  const dt = (t1 - T_RUN) / steps;
  let x = 0;
  for (let i = 0; i < steps; i++) x += runSpeed(T_RUN + (i + 0.5) * dt) * dt;
  return x;
};
const JUMPS = [13.48, 14.18, 15.75];
const JUMP_D = 0.56;
const jumpY = (t: number) => {
  for (const j of JUMPS)
    if (t > j && t < j + JUMP_D) return -150 * Math.sin((Math.PI * (t - j)) / JUMP_D);
  return 0;
};
const inJump = (t: number) => JUMPS.some((j) => t > j && t < j + JUMP_D);

interface Sprite {
  parts: { spec: Spec; path: Path2D }[];
}

const SPR_PAL: Record<string, Spec> = { X: GB3, c: GB2, s: GB1, e: GB0 };

const makeSprite = (rows: string[]): Sprite => {
  const by: Record<string, Path2D> = {};
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!SPR_PAL[ch]) continue;
      (by[ch] ??= new Path2D()).rect(x, y, 1.04, 1.04);
    }
  });
  return { parts: Object.keys(by).map((k) => ({ spec: SPR_PAL[k], path: by[k] })) };
};

const SPR_IDLE = [
  '.....X..X...',
  '.....XXXX...',
  '.....XsXs...',
  '......ss....',
  '...ccXXXX...',
  '..cccXXXXX..',
  '..cccXeXXX..',
  '.cccXXXX.X..',
  '.cccXXXX.X..',
  'cccc.XXX.s..',
  'ccc..XeX....',
  'cc..XXXXX...',
  'c...XX..XX..',
  '....XX..XX..',
  '....XX..XX..',
  '...XXX..XXX.',
];
const SPR_CROUCH = [
  '............',
  '............',
  '.....X..X...',
  '.....XXXX...',
  '.....XsXs...',
  '...ccXXXX...',
  '.ccccXXXXX..',
  'ccccXXeXXX..',
  'cccXXXXXXXX.',
  'ccc.XeXX..X.',
  'cc.XXXXXXXs.',
  'c..XX.XXXX..',
  '..XXX...XX..',
  '..XX....XX..',
  '..XX...XXX..',
  '.XXXXXXXXX..',
];
const SPR_RUN_A = [
  '.....X..X...',
  '.....XXXX...',
  '.....XsXs...',
  '......ss....',
  '.cccXXXXX...',
  'ccccXXXXXX..',
  'cccXXXeXXXX.',
  'cc.XXXXX..Xs',
  'c...XXXX....',
  '....XeXX....',
  '...XXXXXX...',
  '..XXX..XXX..',
  '.XXX....XX..',
  'XXX......XX.',
  'X........XX.',
  '.........XXX',
];
const SPR_RUN_B = [
  '.....X..X...',
  '.....XXXX...',
  '.....XsXs...',
  '......ss....',
  '..ccXXXXX...',
  '.cccXXXXXX..',
  'ccccXXeXX...',
  'ccc.XXXXX...',
  'cc..XXXXs...',
  'c...XeXX....',
  '....XXXX....',
  '....XXXX....',
  '....XXX.....',
  '....XXXX....',
  '....XX.XX...',
  '....XXX.....',
];
const SPR_JUMP = [
  '.....X..X.Xs',
  '.....XXXX.X.',
  '.....XsXsX..',
  '......ssX...',
  'cc..XXXXX...',
  'cccXXXXXX...',
  'ccccXXeXX...',
  '.cccXXXXX...',
  '..ccXeXX....',
  '...XXXXXX...',
  '..XXX..XXX..',
  '..XX....XX..',
  '...XX..XX...',
  '............',
  '............',
  '............',
];

/** Pixel cloud (char grid) */
const CLOUD = [
  '....XXXX......',
  '..XXXXXXXX.XX.',
  '.XXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  '.XXXXXXXXXXXX.',
];

const tiled = (r: Riso, path: Path2D, period: number, shift: number, halfW: number, spec: Spec) => {
  const k0 = Math.floor((-halfW + shift) / period) - 1;
  const k1 = Math.floor((halfW + shift) / period) + 1;
  for (let k = k0; k <= k1; k++) {
    xf(
      r,
      (c) => c.translate(k * period - shift, 0),
      () => paint(r, path, spec)
    );
  }
};

const drawPixel = (r: Riso, s: State, t: number, halfW: number) => {
  const S = scrollAt(t);
  const H = 205;
  const full = rect(-halfW - 4, -H, halfW * 2 + 8, H * 2);
  paint(r, full, GB0);
  // horizon dither bands
  const band = new Path2D();
  for (let y = 40; y < PG; y += Q * 2) {
    const k = (y - 40) / (PG - 40);
    for (let x = Math.floor((-halfW - S * 0.1) / Q) * Q; x < halfW + Q; x += Q * 2)
      band.rect(x + (y % (Q * 4) ? Q : 0), y, Q * (k > 0.5 ? 2 : 1), Q);
  }
  ink(r, band, [[T, 0.25]]);
  // clouds
  for (const [cx, cy, sp] of [
    [-220, -150, 0.12],
    [90, -170, 0.08],
    [380, -120, 0.15],
    [-520, -110, 0.1],
  ] as const) {
    const period = 1300;
    let x = cx - S * sp - t * 6;
    x = ((((x + period / 2) % period) + period) % period) - period / 2;
    for (const off of [0, -period, period]) {
      if (Math.abs(x + off) > halfW + 140) continue;
      xf(
        r,
        (c) => {
          c.translate(x + off, cy);
          c.scale(Q, Q);
        },
        () => {
          knock(r, s.cloud);
          ink(r, s.cloudBelly, [[T, 0.3]]);
        }
      );
    }
  }
  // hills
  tiled(r, s.farHills, 900, S * 0.35, halfW, GB1);
  // sun
  const sk = tween(t, 15.4, 17.6, ease.inOutSine);
  const sunX = Math.round(lerp(150, 4, sk) / Q) * Q;
  const sunY = Math.round(lerp(-100, 6, sk) / Q) * Q;
  knock(r, blockCircle(sunX, sunY, 54, Q));
  ink(r, blockCircle(sunX, sunY, 54, Q), GB1);
  knock(r, blockCircle(sunX, sunY, 45, Q));
  ink(r, blockCircle(sunX, sunY, 45, Q), [[Y, 0.85]]);
  tiled(r, s.nearHills, 640, S * 0.65, halfW, GB2);
  // ground
  const ground = rect(-halfW - 4, PG, halfW * 2 + 8, 80);
  paint(r, ground, GB2);
  const bricks = new Path2D();
  const x0 = Math.floor((-halfW + S) / 36) * 36 - S;
  bricks.rect(-halfW - 4, PG, halfW * 2 + 8, Q);
  for (let row = 0; row < 4; row++) {
    const y = PG + Q + row * 18;
    bricks.rect(-halfW - 4, y + 16, halfW * 2 + 8, 2);
    for (let x = x0 + (row % 2 ? 18 : 0) - 36; x < halfW + 36; x += 36) bricks.rect(x, y, 2, 16);
  }
  ink(r, bricks, GB3);
  // blocks and the coin
  const blk = new Path2D();
  const blkIn = new Path2D();
  for (const [bx, used] of s.blocks) {
    const sx = bx - S;
    if (Math.abs(sx) > halfW + 40) continue;
    const hitT = used;
    const bump =
      hitT > 0 && t > hitT && t < hitT + 0.2 ? -10 * Math.sin((Math.PI * (t - hitT)) / 0.2) : 0;
    blk.rect(sx - 18, -14 + bump, 36, 36);
    if (!(hitT > 0 && t > hitT)) blkIn.rect(sx - 4, -2 + bump, 9, 9);
  }
  paint(r, blk, GB3);
  knock(r, blkIn);
  ink(r, blkIn, GB0);
  for (const [bx, used] of s.blocks) {
    if (used <= 0 || t < used || t > used + 0.6) continue;
    const k = (t - used) / 0.6;
    const cy = -40 - 90 * ease.outCubic(k);
    const sx = bx - S;
    const w = 9 * Math.abs(Math.cos(k * 12)) + 3;
    paint(r, rect(sx - w / 2, cy - 12, w, 24), k < 0.85 ? GB3 : GB2);
  }
  // bushes
  for (const bx of s.bushes) {
    const sx = bx - S;
    if (Math.abs(sx) > halfW + 80) continue;
    paint(r, blockCircle(sx, PG, 34, Q), GB3);
    knock(r, blockCircle(sx - 9, PG - 9, 12, Q));
    ink(r, blockCircle(sx - 9, PG - 9, 12, Q), GB2);
  }
  // goal flag
  {
    const sx = s.goalX - S;
    if (Math.abs(sx) < halfW + 80) {
      paint(r, rect(sx - 3, -96, 6, PG + 96), GB3);
      paint(r, blockCircle(sx, -100, 9, 4.5), GB3);
      const fl = new Path2D();
      const wv = Math.floor(t * 6) % 2;
      for (let i = 0; i < 6; i++)
        fl.rect(sx - 4 - (i + 1) * Q, -88 + i * 0 + ((i + wv) % 2) * 3, Q, 42 - i * 6);
      paint(r, fl, GB2);
    }
  }
  // the hero
  let spr: Sprite;
  if (t < 12.6) spr = s.sprCrouch;
  else if (t < T_RUN || (t > T_STOP && !inJump(t))) spr = s.sprIdle;
  else if (inJump(t)) spr = s.sprJump;
  else spr = Math.floor(t * 9) % 2 ? s.sprRunA : s.sprRunB;
  const hx = -6 * SQ + 2;
  const hy = PG - 16 * SQ + jumpY(t);
  xf(
    r,
    (c) => {
      c.translate(hx, hy);
      c.scale(SQ, SQ);
    },
    () => {
      for (const part of spr.parts) paint(r, part.path, part.spec);
    }
  );
  // scanline grid
  const grid = new Path2D();
  for (let y = -H; y < H; y += 3) grid.rect(-halfW - 4, y, halfW * 2 + 8, 0.8);
  lift(r, grid, [T, Y], 0.25);
};

/* ---------- P6 interior: comic panel turning into pixels ---------- */

const drawP6Interior = (r: Riso, s: State, t: number) => {
  const wk = seg(t, T_WIPE0, T_WIPE1);
  if (wk >= 1) {
    xf(
      r,
      (c) => c.translate(P6C[0], P6C[1]),
      () => drawPixel(r, s, t, P6.w / 2)
    );
    return;
  }
  const comic = new Path2D();
  const pix = new Path2D();
  const cs = 45;
  const cols = Math.ceil(P6.w / cs);
  const rows = Math.ceil(P6.h / cs);
  const hp: Pt = [1240, 740];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = P6.x + i * cs;
      const y = P6.y + j * cs;
      const d = Math.hypot(x + cs / 2 - hp[0], y + cs / 2 - hp[1]) / 520;
      const th = clamp(d * 0.8 + hash(i * 17 + j * 31) * 0.2);
      if (wk > th) pix.rect(x, y, cs + 0.5, cs + 0.5);
      else comic.rect(x, y, cs + 0.5, cs + 0.5);
    }
  xf(
    r,
    (c) => c.clip(comic),
    () => {
      drawP6Comic(r, s, t);
      const h = heroAt(t);
      drawCaped(r, h.x, h.y, h.pose, t, h.wind);
    }
  );
  xf(
    r,
    (c) => {
      c.clip(pix);
      c.translate(P6C[0], P6C[1]);
    },
    () => drawPixel(r, s, t, P6.w / 2)
  );
};

const drawPage = (r: Riso, s: State, t: number, pk: number) => {
  const page = rect(-400, -400, 2400, 1700);
  knock(r, page);
  ink(r, page, [[Y, 0.1]]);
  // P1: the frozen clash
  const p1 = panelPath(P1, PANEL_R * pk);
  xf(
    r,
    (c) => {
      c.clip(p1);
      c.translate(P1.x, P1.y);
      c.scale(K1, K1);
    },
    () => drawClash(r, s, Math.min(t, T_FREEZE))
  );
  if (pk > 0.02) {
    for (const [p, fn] of [
      [P2, drawP2],
      [P3, drawP3],
      [P4, drawP4],
      [P5, drawP5],
    ] as const) {
      xf(
        r,
        (c) => c.clip(panelPath(p)),
        () => fn(r, s, t)
      );
    }
  }
  xf(
    r,
    (c) => c.clip(panelPath(P6)),
    () => drawP6Interior(r, s, t)
  );
  // borders
  const borders = new Path2D();
  for (const p of [P2, P3, P4, P5, P6]) borders.addPath(panelPath(p));
  inkStroke(r, borders, DARK, 6);
  if (pk > 0.01) inkStroke(r, p1, DARK, 6 * pk);
  // caption box on P1
  if (pk > 0.6) {
    const cb = rect(P1.x + 16, P1.y + 14, 120, 30);
    paint(r, cb, [[Y, 0.9 * seg(pk, 0.6, 1)]]);
    inkStroke(r, cb, DARK, 3);
    text(r, 'MEANWHILE', P1.x + 76, P1.y + 30, 15, DARK, 1.5);
  }
  // the hero rides over the gutters
  if (t < T_WIPE0) {
    const h = heroAt(t);
    if (t > T_LEAP0 && t < T_LAND) {
      // motion trail
      const tr = new Path2D();
      for (let i = 1; i <= 4; i++) {
        const hp = heroAt(t - i * 0.035);
        tr.moveTo(hp.x - 10, hp.y - 30);
        tr.lineTo(hp.x - 10 - 3, hp.y - 30 + 2);
      }
      const ghost = heroAt(t - 0.07);
      const sl = new Path2D();
      sl.moveTo(ghost.x - 30, ghost.y - 40);
      sl.lineTo(h.x - 30, h.y - 40);
      sl.moveTo(ghost.x - 20, ghost.y + 10);
      sl.lineTo(h.x - 20, h.y + 10);
      knockStroke(r, sl, 5);
      inkStroke(r, sl, [[R, 0.6]], 3);
    }
    drawCaped(r, h.x, h.y, h.pose, t, h.wind);
  }
};

/* ---------- handheld (scene 4, world = page space around P6) ---------- */

const drawHandheld = (r: Riso, s: State, t: number) => {
  // under the covers
  const full = rect(-800, -400, 3600, 2000);
  paint(r, full, [
    [B, 0.85],
    [R, 0.45],
  ]);
  const quilt = new Path2D();
  for (let i = -6; i < 20; i++) {
    quilt.moveTo(400 + i * 120, 200);
    quilt.quadraticCurveTo(460 + i * 120, 650, 380 + i * 120, 1100);
  }
  inkStroke(r, quilt, [[T, 0.4]], 30);
  grad(
    r,
    T,
    null,
    { kind: 'radial', cx: P6C[0], cy: P6C[1], r0: 300, r1: 900, from: 0.55, to: 0 },
    7
  );
  grad(
    r,
    Y,
    null,
    { kind: 'radial', cx: P6C[0], cy: P6C[1], r0: 300, r1: 800, from: 0.35, to: 0 },
    6
  );
  // body
  const body = rr(1240, 648, 1180, 580, 130);
  paint(r, rr(1250, 668, 1180, 580, 130), [
    [B, 1],
    [R, 0.9],
  ]);
  paint(r, body, [
    [R, 0.95],
    [Y, 0.2],
  ]);
  xf(
    r,
    (c) => c.clip(body),
    () => {
      grad(r, B, null, { kind: 'linear', x0: 0, y0: 380, x1: 0, y1: 940, from: 0, to: 0.45 }, 7);
      const gl = new Path2D();
      gl.arc(1240, 648, 548, Math.PI * 1.1, Math.PI * 1.42);
      knockStroke(r, gl, 9);
    }
  );
  // bezel
  paint(r, rr(P6C[0], P6C[1], P6.w + 60, P6.h + 64, 34), DARK);
  paint(r, circ(P6.x - 16, P6.y + 40, 6), [
    [R, 1],
    [Y, 0.5 * (0.6 + 0.4 * Math.sin(t * 3))],
  ]);
  // d-pad
  const press = (t0: number) => (t > t0 - 0.05 && t < t0 + 0.18 ? 1 : 0);
  const right = t > T_RUN && t < T_STOP ? 1 : 0;
  const dp = new Path2D();
  dp.rect(780 - 22, 640 - 66, 44, 132);
  dp.rect(780 - 66, 640 - 22, 132, 44);
  paint(r, ell(784, 646, 84, 84), [
    [B, 0.6],
    [R, 0.9],
  ]);
  paint(r, dp, DARK);
  knock(r, circ(780, 640, 10));
  ink(r, circ(780, 640, 10), [[B, 0.6]]);
  if (right) lift(r, rect(800, 622, 40, 36), [B, R], 0.5);
  // buttons
  const jumpP = JUMPS.reduce((a, j) => Math.max(a, press(j)), 0);
  for (const [bx, by, pr] of [
    [1726, 600, jumpP],
    [1650, 668, 0],
  ] as const) {
    paint(r, circ(bx + 3, by + 5, 40), [
      [B, 0.8],
      [R, 1],
    ]);
    const bb = circ(bx, by + pr * 4, 38);
    paint(r, bb, DARK);
    lift(r, circ(bx - 10, by - 10 + pr * 4, 14), [B, R], 0.45);
  }
  // start / select
  for (const x of [1170, 1290]) {
    const pill = rr(x, 900, 64, 18, 9);
    paint(r, pill, DARK);
  }
  // speaker
  const sp = new Path2D();
  for (let i = 0; i < 5; i++) {
    sp.moveTo(1640 + i * 22, 800);
    sp.lineTo(1680 + i * 22, 760);
  }
  line(r, sp, DARK, 8);
  // screen
  const scr = panelPath(P6);
  xf(
    r,
    (c) => c.clip(scr),
    () => drawP6Interior(r, s, t)
  );
  // glare on the glass
  const gl = pl(
    [
      [P6.x + 40, P6.y],
      [P6.x + 150, P6.y],
      [P6.x + 40, P6.y + 160],
      [P6.x, P6.y + 160],
      [P6.x, P6.y + 60],
    ],
    true
  );
  xf(
    r,
    (c) => c.clip(scr),
    () => lift(r, gl, [T, Y, B], 0.22 * seg(t, T_WIPE1, T_HH1) * (1 - seg(t, T_HZ0, T_HZ1)))
  );
};

/* ---------- cinema (scene 5) ---------- */

const CIN_CY = 285;
const CIN_H = 455;
const CIN_W1 = 1000;
const CIN_K = CIN_H / 405;

const drawCinema = (r: Riso, s: State, t: number, wS: number) => {
  const full = rect(-2000, -2000, 5600, 5000);
  paint(r, full, [
    [B, 0.95],
    [R, 0.66],
    [T, 0.15],
  ]);
  const scrPath = rr(800, CIN_CY, wS, CIN_H, 12);
  // light from the screen spills into the room
  grad(
    r,
    T,
    null,
    { kind: 'radial', cx: 800, cy: CIN_CY + 80, r0: 300, r1: 1000, from: 0.4, to: 0 },
    7
  );
  liftGrad(
    r,
    null,
    [R],
    { kind: 'radial', cx: 800, cy: CIN_CY, r0: 300, r1: 900, from: 0.35, to: 0 },
    6
  );
  // curtains
  for (const side of [-1, 1]) {
    const xi = 800 + side * (wS / 2 + 10);
    const xo = 800 + side * (wS / 2 + 260);
    const cur = new Path2D();
    cur.moveTo(xi, -40);
    cur.lineTo(xo, -40);
    cur.lineTo(xo, 620);
    for (let i = 0; i <= 6; i++) {
      const x = lerp(xo, xi + side * 40, i / 6);
      cur.lineTo(x, 612 + (i % 2) * 10);
    }
    cur.quadraticCurveTo(xi, 300, xi, -40);
    cur.closePath();
    paint(r, cur, [
      [R, 1],
      [B, 0.35],
    ]);
    const folds = new Path2D();
    for (let i = 1; i < 7; i++) {
      const x = lerp(xi, xo, i / 7) + Math.sin(t * 0.8 + i) * 2;
      folds.moveTo(x, -40);
      folds.lineTo(x + side * 6, 612);
    }
    xf(
      r,
      (c) => c.clip(cur),
      () => {
        inkStroke(r, folds, [[B, 0.7]], 14);
        liftGrad(
          r,
          null,
          [B],
          { kind: 'linear', x0: xi, y0: 0, x1: xi + side * 200, y1: 0, from: 0.35, to: 0 },
          5
        );
      }
    );
  }
  // valance
  const val = new Path2D();
  val.moveTo(-200, -40);
  val.lineTo(1800, -40);
  val.lineTo(1800, 40);
  for (let x = 1800; x >= -200; x -= 80) val.quadraticCurveTo(x - 40, 74, x - 80, 40);
  val.closePath();
  paint(r, val, [
    [R, 1],
    [B, 0.6],
  ]);
  inkStroke(
    r,
    pl([
      [-200, 30],
      [1800, 30],
    ]),
    GOLD,
    4
  );
  // stage lip
  paint(r, rect(800 - wS / 2 - 300, CIN_CY + CIN_H / 2 + 60, wS + 600, 14), [
    [B, 0.6],
    [R, 0.5],
    [Y, 0.3],
  ]);
  // screen
  paint(r, rr(800, CIN_CY, wS + 26, CIN_H + 26, 18), DARK);
  xf(
    r,
    (c) => {
      c.clip(scrPath);
      c.translate(800, CIN_CY);
      c.scale(CIN_K, CIN_K);
    },
    () => drawPixel(r, s, t, wS / 2 / CIN_K)
  );
  // title, small, under the screen
  const tk = seg(t, 17.3, 17.9);
  if (tk > 0) {
    text(
      r,
      'SATURDAY MORNING',
      800,
      CIN_CY + CIN_H / 2 + 36 + 8 * (1 - ease.outCubic(tk)),
      24,
      [
        [Y, tk],
        [R, 0.3 * tk],
      ],
      9
    );
  }
  // seat rows (far to near)
  const rows: [number, number, number, number][] = [
    [640, 64, 46, 22],
    [722, 92, 64, 14],
  ];
  rows.forEach(([y, w, h, n], ri) => {
    const seats = new Path2D();
    const off = ri % 2 ? w / 2 : 0;
    for (let i = -n; i <= n; i++) rr(800 + i * w + off, y + h / 2, w - 8, h, w * 0.3, seats);
    paint(r, seats, [
      [B, 1],
      [R, 0.85],
      [Y, 0.1],
    ]);
    const tops = new Path2D();
    for (let i = -n; i <= n; i++) {
      const x = 800 + i * w + off;
      tops.moveTo(x - w * 0.3, y + 3);
      tops.lineTo(x + w * 0.3, y + 3);
    }
    inkStroke(r, tops, [[T, 0.6]], 3);
    // a few heads
    const heads = new Path2D();
    for (const [i, hk] of ri === 0
      ? [
          [-5, 0.9],
          [-1, 1],
          [3, 0.95],
          [6, 1.05],
        ]
      : [
          [-4, 1],
          [4, 0.95],
        ]) {
      const x = 800 + i * w + off;
      circ(x, y - h * 0.32 * hk, h * 0.4 * hk, heads);
      heads.rect(x - h * 0.55 * hk, y - h * 0.1, h * 1.1 * hk, h * 0.4);
    }
    paint(r, heads, DARK);
  });
  xf(
    r,
    (c) => {
      c.translate(560, 952);
      c.scale(1.18, 1.18);
      c.translate(-560, -920);
    },
    () => {
      // the grown-up, where the kid sat
      const ox = 560;
      const bob = Math.sin(t * 1.1) * 2;
      const body = new Path2D();
      body.moveTo(430, 920);
      body.quadraticCurveTo(440, 706, 520, 694);
      body.lineTo(600, 694);
      body.quadraticCurveTo(686, 706, 700, 920);
      body.closePath();
      paint(r, body, [
        [T, 0.85],
        [B, 0.75],
        [R, 0.3],
      ]);
      // hood
      paint(r, ell(560, 700, 70, 22), [
        [T, 1],
        [B, 0.9],
        [R, 0.45],
      ]);
      const head = circ(ox, 640 + bob * 0.3, 44);
      paint(r, head, HAIR);
      const tuft = new Path2D();
      tuft.moveTo(548, 600);
      tuft.quadraticCurveTo(552, 568, 582, 572);
      tuft.quadraticCurveTo(566, 580, 566, 600);
      tuft.closePath();
      paint(r, tuft, HAIR);
      const rim = new Path2D();
      rim.arc(ox, 640 + bob * 0.3, 43, Math.PI * 1.15, Math.PI * 1.85);
      rim.moveTo(522, 696);
      rim.quadraticCurveTo(560, 686, 598, 696);
      knockStroke(r, rim, 3.5);
      inkStroke(
        r,
        rim,
        [
          [Y, 1],
          [T, 0.5],
        ],
        3.5
      );
      // seat back in front of him
      paint(r, rr(560, 860, 250, 120, 36), [
        [B, 1],
        [R, 0.9],
      ]);
      inkStroke(
        r,
        pl([
          [470, 802],
          [650, 802],
        ]),
        [[T, 0.6]],
        3
      );
      // popcorn bucket
      const bx = 690;
      const by = 760;
      const bucket = pl(
        [
          [bx - 40, by - 50],
          [bx + 40, by - 50],
          [bx + 30, by + 40],
          [bx - 30, by + 40],
        ],
        true
      );
      paint(r, bucket, [[R, 1]]);
      const stripes = new Path2D();
      for (let i = -2; i <= 2; i++) {
        stripes.moveTo(bx + i * 16 - 4, by - 50);
        stripes.lineTo(bx + i * 12 - 3, by + 40);
      }
      xf(
        r,
        (c) => c.clip(bucket),
        () => {
          knockStroke(r, stripes, 7);
          grad(
            r,
            B,
            null,
            { kind: 'linear', x0: bx - 40, y0: 0, x1: bx + 40, y1: 0, from: 0.5, to: 0 },
            5
          );
        }
      );
      const corn = new Path2D();
      for (let i = 0; i < 9; i++)
        circ(bx - 34 + i * 8.5, by - 54 - 8 * hash(i * 2.1), 9 + 3 * hash(i), corn);
      paint(r, corn, [[Y, 0.75]]);
      // hand reaching in, now and then
      const reach = Math.sin(clamp(seg(t, 16.2, 17.4)) * Math.PI) * 0.6 + 0.4;
      const hand: Pt = [lerp(630, bx - 6, reach), lerp(780, by - 52, reach)];
      const arm = new Path2D();
      arm.moveTo(640, 830);
      arm.quadraticCurveTo(620, 790, hand[0], hand[1]);
      line(r, arm, DARK, 22);
      paint(r, circ(hand[0], hand[1], 12), DARK);
    }
  );
  // dust in the light
  const motes = new Path2D();
  for (let i = 0; i < 22; i++) {
    const x = 300 + hash(i * 3.7) * 1000 + 10 * noise1(t * 0.5 + i, 2);
    const y = 560 + hash(i * 1.9) * 60 - ((t * 6 + i * 13) % 80);
    circ(x, y, 1.3 + hash(i) * 1.2, motes);
  }
  knock(r, motes, [B, R]);
  ink(r, motes, [[Y, 0.6]]);
};

/* ---------- state ---------- */

interface Rock {
  x: number;
  y: number;
  t0: number;
  spin: number;
  pts: Pt[];
}

interface State {
  roofs: Path2D;
  boards: Path2D;
  grain: Path2D;
  mountains: Path2D;
  ground: Path2D;
  groundEdge: Path2D;
  cracks: Pt[][];
  rocks: Rock[];
  farHills: Path2D;
  nearHills: Path2D;
  cloud: Path2D;
  cloudBelly: Path2D;
  blocks: [number, number][];
  bushes: number[];
  goalX: number;
  sprIdle: Sprite;
  sprCrouch: Sprite;
  sprRunA: Sprite;
  sprRunB: Sprite;
  sprJump: Sprite;
}

const hills = (period: number, mounds: [number, number, number][], q: number, base: number) => {
  const top = (x: number) => {
    let best = base;
    for (const [xc, w, h] of mounds)
      for (const off of [-period, 0, period]) {
        const u = (x - xc - off) / w;
        if (Math.abs(u) < 1) best = Math.min(best, base - h * (1 - u * u));
      }
    return base - Math.round((base - best) / q) * q;
  };
  const p = new Path2D();
  p.moveTo(0, base + 300);
  for (let x = 0; x < period; x += q) {
    const y = top(x + q / 2);
    p.lineTo(x, y);
    p.lineTo(x + q, y);
  }
  p.lineTo(period, base + 300);
  p.closePath();
  return p;
};

export const saturdayMorningFilm: RisoFilm<State> = {
  id: 'saturday-morning',
  title: 'Saturday Morning',
  caption: 'One screen, many shapes: the TV, the panel, the handheld, the big screen.',
  theme: 'Fun',
  motif: 'The screen / a rounded rectangle',
  series: 'Risograph',
  duration: DUR,
  paper: '#f3ead8',
  inks: [
    { color: '#3255a4', offset: [-1.2, 0.8], angle: 15 },
    { color: '#f15060', offset: [1.5, -1], angle: 75 },
    { color: '#ffe800', offset: [0, 0], angle: 0 },
    { color: '#00838a', offset: [0.8, 1.3], angle: 45 },
  ],
  scenes: [
    { at: 0, label: 'Saturday, 7 a.m.' },
    { at: T_MASK1, label: 'Final clash' },
    { at: T_FREEZE, label: 'Panel to panel' },
    { at: T_WIPE0, label: 'Pocket level' },
    { at: T_HZ1, label: 'Big screen' },
  ],
  posterTime: 9.1,

  setup() {
    const rng = mulberry(17);
    /* rooftops outside the window */
    const roofPts: Pt[] = [[100, 470]];
    let x = 100;
    while (x < 380) {
      const w = 30 + rng() * 40;
      const h = 390 + rng() * 40;
      roofPts.push([x, h], [x + w * 0.5, h - 18 * rng()], [x + w, h]);
      x += w;
    }
    roofPts.push([380, 470]);
    const roofs = pl(roofPts, true);
    const boards = new Path2D();
    for (let i = -14; i <= 14; i++) {
      boards.moveTo(SCX + i * 22, 640);
      boards.lineTo(SCX + i * 150, 900);
    }
    const grain = new Path2D();
    for (let i = 0; i < 14; i++) {
      const y0 = 176 + i * 27 + rng() * 8;
      grain.moveTo(540, y0);
      for (let xx = 540; xx <= 1100; xx += 20)
        grain.lineTo(xx, y0 + 5 * noise1(xx / 90, i) + 2 * noise1(xx / 20, i + 30));
    }
    /* clash backdrop */
    const mt: Pt[] = [[-300, 900]];
    for (let xx = -300; xx <= 1900; xx += 40)
      mt.push([xx, 600 - 90 * Math.abs(noise1(xx / 260, 7)) - 40 * noise1(xx / 80, 3)]);
    mt.push([1900, 900]);
    const mountains = pl(mt, true);
    const gTop: Pt[] = [];
    for (let xx = -300; xx <= 1900; xx += 30) gTop.push([xx, 700 + 8 * noise1(xx / 120, 11)]);
    const ground = pl([...gTop, [1900, 1300], [-300, 1300]], true);
    const groundEdge = pl(gTop);
    const cracks: Pt[][] = [];
    for (let i = 0; i < 9; i++) {
      const dir = i % 2 ? 1 : -1;
      const pts: Pt[] = [[0, 704]];
      let cx = 0;
      let cy = 704;
      for (let j = 0; j < 9; j++) {
        cx += dir * (30 + rng() * 40);
        cy += 6 + rng() * 16 * (i / 9 + 0.3);
        pts.push([cx + (rng() - 0.5) * 14, cy]);
      }
      cracks.push(pts);
    }
    const rocks: Rock[] = [];
    for (let i = 0; i < 16; i++) {
      const sz = 8 + rng() * 20;
      const n = 6;
      const pts: Pt[] = [];
      for (let j = 0; j < n; j++) {
        const a = (j / n) * TAU;
        const rad = sz * (0.7 + rng() * 0.5);
        pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
      }
      const xx = 120 + rng() * 1360;
      rocks.push({
        x: xx,
        y: 720 + rng() * 120,
        t0: 1.6 + rng() * 5,
        spin: (rng() - 0.5) * 3,
        pts,
      });
    }
    /* pixel level */
    const farHills = hills(
      900,
      [
        [120, 260, 150],
        [520, 220, 100],
        [760, 200, 180],
      ],
      Q,
      PG
    );
    const nearHills = hills(
      640,
      [
        [100, 120, 63],
        [400, 160, 90],
      ],
      Q,
      PG
    );
    const cloud = new Path2D();
    const cloudBelly = new Path2D();
    CLOUD.forEach((row, y) => {
      for (let xx = 0; xx < row.length; xx++)
        if (row[xx] === 'X') {
          cloud.rect(xx, y, 1.02, 1.02);
          if (y >= CLOUD.length - 1 || CLOUD[y + 1][xx] !== 'X') cloudBelly.rect(xx, y, 1.02, 1.02);
        }
    });
    const peak = JUMP_D / 2;
    const blocks: [number, number][] = [
      [scrollAt(JUMPS[0] + peak) + 4, JUMPS[0] + peak - 0.04],
      [scrollAt(JUMPS[0] + peak) + 40, 0],
      [scrollAt(JUMPS[0] + peak) - 32, 0],
      [scrollAt(JUMPS[2] + peak) + 4, JUMPS[2] + peak - 0.04],
    ];
    const bushes = [scrollAt(JUMPS[1] + peak) + 4, scrollAt(JUMPS[0]) - 260, scrollAt(15.2) + 40];
    const goalX = scrollAt(T_STOP + 0.1) + 120;
    return {
      roofs,
      boards,
      grain,
      mountains,
      ground,
      groundEdge,
      cracks,
      rocks,
      farHills,
      nearHills,
      cloud,
      cloudBelly,
      blocks,
      bushes,
      goalX,
      sprIdle: makeSprite(SPR_IDLE),
      sprCrouch: makeSprite(SPR_CROUCH),
      sprRunA: makeSprite(SPR_RUN_A),
      sprRunB: makeSprite(SPR_RUN_B),
      sprJump: makeSprite(SPR_JUMP),
    };
  },

  draw(r, t, s) {
    const L = r.layers;

    /* ---- 1: the room, then through the glass ---- */
    if (t < T_MASK1) {
      const k = tween(t, T_PUSH0, T_PUSH1, ease.inOutCubic);
      const z0 = lerp(1, 1.04, seg(t, 0, T_PUSH0));
      const [cx, cy, z] = zoomTo(k, [800, 450, z0], [SCX, SCY], Z_TV);
      r.camera(cx, cy, z);
      drawRoom(r, s, t);
      const m = tween(t, T_MASK0, T_MASK1, ease.inOutSine);
      const mask = rr(
        SCX,
        SCY,
        lerp(SCW, 1640 / Z_TV, m),
        lerp(SCH, 930 / Z_TV, m),
        lerp(SCR, 0, m)
      );
      xf(
        r,
        (c) => {
          c.clip(mask);
          c.translate(SCX, SCY);
          c.scale(CK, CK);
          c.translate(-800, -450);
        },
        () => {
          if (t < 1.1) {
            // colour bars before the show
            const bars: Spec[] = [
              [[Y, 0.15]],
              [[Y, 1]],
              [
                [T, 1],
                [Y, 0.6],
              ],
              [[T, 1]],
              [
                [R, 1],
                [Y, 0.2],
              ],
              [[R, 1]],
              [[B, 1]],
            ];
            bars.forEach((spec, i) => paint(r, rect(-200 + i * 286, -100, 287, 760), spec));
            paint(r, rect(-200, 660, 2000, 400), DARK);
            const roll = ((t * 900) % 1100) - 100;
            lift(r, rect(-200, roll, 2000, 60), [B, R, T], 0.4);
          } else {
            drawClash(r, s, t);
            // vertical roll as the show starts
            const vk = seg(t, 1.1, 1.45);
            if (vk < 1) knock(r, rect(-200, -200 + 1400 * vk, 2000, 50));
          }
          // scanlines and a darker tube edge
          const sl = new Path2D();
          for (let y = -60; y < 960; y += 9) sl.rect(-200, y, 2000, 3);
          lift(r, sl, [B, R, T], 0.4 * (1 - m));
          const edge = rr(800, 450, 1250, 940, 110);
          xf(
            r,
            (c) => c.clip(outsideOf(edge), 'evenodd'),
            () => ink(r, rect(-400, -400, 2400, 1700), [[B, 0.5 * (1 - m)]])
          );
        }
      );
      // glare on the curved glass
      const gk = 1 - m;
      if (gk > 0.02) {
        const glare = pl(
          [
            [SCX - SCW / 2 + 30, SCY - SCH / 2],
            [SCX - SCW / 2 + 110, SCY - SCH / 2],
            [SCX - SCW / 2 + 20, SCY - SCH / 2 + 120],
            [SCX - SCW / 2, SCY - SCH / 2 + 120],
            [SCX - SCW / 2, SCY - SCH / 2 + 30],
          ],
          true
        );
        xf(
          r,
          (c) => c.clip(mask),
          () => lift(r, glare, [B, R, T], 0.3 * gk)
        );
      }
      drawKid(r, t);
      return;
    }

    /* ---- 2: the clash, full frame ---- */
    if (t < T_FREEZE) {
      r.camera(800, 450, 1);
      drawClash(r, s, t);
      return;
    }

    /* ---- 3: a comic page; the hero leaps panel to panel ---- */
    if (t < T_WIPE0 + 0.05) {
      const pk = tween(t, T_FREEZE, T_PULL1, ease.inOutCubic);
      let cam: [number, number, number];
      if (t < T_PULL1) {
        // pull back from P1 (which filled the frame) to the whole page
        const z = Math.exp(lerp(Math.log(1 / K1), 0, pk));
        const ax = lerp(800, P1C[0], pk);
        const ay = lerp(450, P1C[1], pk);
        cam = [P1C[0] - (ax - 800) / z, P1C[1] - (ay - 450) / z, z];
      } else {
        const dk = tween(t, T_PULL1, T_ZIN0 + 0.3, ease.inOutSine);
        const base: [number, number, number] = [
          lerp(800, 830, dk),
          lerp(450, 462, dk),
          lerp(1, 1.04, dk),
        ];
        const zk = tween(t, T_ZIN0, T_ZIN1, ease.inOutCubic);
        cam = zk > 0 ? zoomTo(zk, base, P6C, 2.7) : base;
      }
      r.camera(cam[0], cam[1], cam[2]);
      drawPage(r, s, t, pk);
      return;
    }

    /* ---- 4: the panel is a handheld screen ---- */
    if (t < T_HZ1) {
      let cam: [number, number, number];
      if (t < T_HZ0) {
        const k = tween(t, T_WIPE1, T_HH1, ease.inOutCubic);
        const z = Math.exp(lerp(Math.log(2.7), Math.log(1.18), k));
        cam = [P6C[0], lerp(P6C[1], 642, k), z];
      } else {
        const k = tween(t, T_HZ0, T_HZ1, ease.inOutCubic);
        cam = [P6C[0], lerp(642, P6C[1], k), Math.exp(lerp(Math.log(1.18), Math.log(2.7), k))];
      }
      r.camera(cam[0], cam[1], cam[2]);
      drawHandheld(r, s, t);
      return;
    }

    /* ---- 5: the handheld screen widens into a cinema screen ---- */
    const k = tween(t, T_HZ1, T_CIN1, ease.inOutCubic);
    const zc0 = (405 * 2.7) / CIN_H;
    const z = Math.exp(lerp(Math.log(zc0), Math.log(1), k));
    const wS = lerp((620 * 2.7) / zc0, CIN_W1, ease.inOutSine(k));
    const settle = tween(t, T_CIN1, DUR, ease.outSine);
    r.camera(800, lerp(CIN_CY, 450, k) - 6 * settle, z * (1 + 0.015 * settle));
    drawCinema(r, s, t, wS);
    void L;
  },
};

/** Big rect plus a hole (use with evenodd) */
function outsideOf(hole: Path2D) {
  const p = new Path2D();
  p.rect(-4000, -4000, 9600, 8900);
  p.addPath(hole);
  return p;
}
