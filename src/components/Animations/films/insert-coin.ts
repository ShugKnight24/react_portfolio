import type { RisoFilm, Riso, Ctx } from '../riso/engine';
import {
  TAU,
  clamp,
  lerp,
  seg,
  tween,
  ease,
  noise1,
  circlePts,
  ellipsePts,
  morphPair,
  morph,
  polyPath,
  spacedText,
  DISPLAY,
  type Pt,
} from '../riso/kit';

/* Inks */
const B = 0; // blue
const PK = 1; // fluorescent pink
const Y = 2; // yellow
const G = 3; // green

type Spec = readonly (readonly [number, number])[];

const DARK: Spec = [
  [B, 1],
  [PK, 0.8],
  [Y, 0.08],
];
const NAVY: Spec = [
  [B, 1],
  [PK, 1],
];
const GOLD: Spec = [
  [Y, 1],
  [PK, 0.2],
];
const ORANGE: Spec = [
  [Y, 1],
  [PK, 0.6],
];

/* ---------- drawing helpers ---------- */

const knock = (r: Riso, path: Path2D, inks?: readonly number[], rule: CanvasFillRule = 'nonzero') => {
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

const rectP = (x: number, y: number, w: number, h: number, p = new Path2D()) => {
  p.rect(x, y, w, h);
  return p;
};

const rrect = (x: number, y: number, w: number, h: number, rr: number, p = new Path2D()) => {
  const q = Math.min(rr, w / 2, h / 2);
  p.moveTo(x + q, y);
  p.lineTo(x + w - q, y);
  p.quadraticCurveTo(x + w, y, x + w, y + q);
  p.lineTo(x + w, y + h - q);
  p.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  p.lineTo(x + q, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - q);
  p.lineTo(x, y + q);
  p.quadraticCurveTo(x, y, x + q, y);
  p.closePath();
  return p;
};

const ellP = (cx: number, cy: number, rx: number, ry: number, rot = 0, p = new Path2D()) => {
  p.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  return p;
};

/** Bulged CRT outline */
const crtPath = (x: number, y: number, w: number, h: number, b: number, rr: number) => {
  const p = new Path2D();
  p.moveTo(x + rr, y);
  p.quadraticCurveTo(x + w / 2, y - b, x + w - rr, y);
  p.quadraticCurveTo(x + w, y, x + w, y + rr);
  p.quadraticCurveTo(x + w + b, y + h / 2, x + w, y + h - rr);
  p.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  p.quadraticCurveTo(x + w / 2, y + h + b, x + rr, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - rr);
  p.quadraticCurveTo(x - b, y + h / 2, x, y + rr);
  p.quadraticCurveTo(x, y, x + rr, y);
  p.closePath();
  return p;
};

/** Pixelated circle built from rows of cell height q */
const blockCircle = (cx: number, cy: number, R: number, q: number, p = new Path2D()) => {
  if (R <= 0) return p;
  const rows = Math.ceil(R / q);
  for (let j = -rows; j < rows; j++) {
    const ym = Math.abs(j + 0.5) * q;
    if (ym >= R) continue;
    const hw = Math.round(Math.sqrt(R * R - ym * ym) / q) * q;
    if (hw <= 0) continue;
    p.rect(cx - hw, cy + j * q, hw * 2, q);
  }
  return p;
};

const starPath = (cx: number, cy: number, ro: number, ri: number, sx: number, sy: number, p = new Path2D()) => {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? ri : ro;
    const x = cx + Math.cos(a) * rr * sx;
    const y = cy + Math.sin(a) * rr * sy;
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
  spacing = 0,
  doKnock = true
) => {
  const L = r.layers;
  for (const c of L) {
    c.font = `900 ${size}px ${DISPLAY}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
  }
  if (doKnock) {
    for (const c of L) {
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      spacedText(c, str, x, y, spacing);
      c.globalCompositeOperation = 'source-over';
    }
  }
  for (const [i, d] of spec) {
    const c = L[i];
    c.fillStyle = r.tone(c, d);
    spacedText(c, str, x, y, spacing);
  }
};

/* ---------- pixel sprites ---------- */

interface Sprite {
  sil: Path2D;
  parts: { spec: Spec; path: Path2D }[];
}

const PAL: Record<string, Spec> = {
  k: NAVY,
  p: [
    [PK, 1],
    [Y, 0.12],
  ],
  s: [
    [Y, 0.38],
    [PK, 0.3],
  ],
  y: [[Y, 1]],
  b: [[B, 1]],
  d: [
    [B, 1],
    [PK, 0.55],
  ],
  o: [
    [Y, 1],
    [PK, 0.72],
  ],
  w: [],
};

const makeSprite = (rows: string[]): Sprite => {
  const sil = new Path2D();
  const byChar = new Map<string, Path2D>();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') {
        x++;
        continue;
      }
      let e = x;
      while (e < row.length && row[e] === ch) e++;
      sil.rect(x, y, e - x, 1);
      let p = byChar.get(ch);
      if (!p) {
        p = new Path2D();
        byChar.set(ch, p);
      }
      p.rect(x, y, e - x, 1);
      x = e;
    }
  });
  const parts = [...byChar.entries()].map(([ch, path]) => ({ spec: PAL[ch] ?? NAVY, path }));
  return { sil, parts };
};

const HEAD = [
  '....ppp.....',
  '..ppppppp...',
  '.ppppppppp..',
  '.kkkkkkkkkk.',
  '.ssssswkss..',
  '.ssssswkss..',
  '..sssssssss.',
  '..sssssss...',
];
const RUN_A = [
  ...HEAD,
  'yyyyyyyyy...',
  '.yybbbbbbb..',
  '..bbbbbbbbss',
  '..bbbbbbbb..',
  '..dddddddd..',
  '..ddd..ddd..',
  '.ooo....ooo.',
  '.ooo.....ooo',
];
const RUN_B = [
  ...HEAD,
  '.yyyyyyyyy..',
  'yy.bbbbbbb..',
  '..bbbbbbbss.',
  '..bbbbbbbb..',
  '..dddddddd..',
  '...dddddd...',
  '...oooooo...',
  '...ooo.ooo..',
];
const JUMP = [
  ...HEAD,
  'yyyyyyyyy..s',
  'y.bbbbbbbbss',
  '..bbbbbbbb..',
  '..bbbbbbbb..',
  '.ddddddddd..',
  'ddd....ddd..',
  'oo......ooo.',
  '..........oo',
];
const IDLE = [
  ...HEAD,
  '.yyyyyyyyy..',
  '.ybbbbbbbb..',
  '.ybbbbbbbbs.',
  '..bbbbbbbb..',
  '..dddddddd..',
  '..ddd..ddd..',
  '..ooo..ooo..',
  '..ooo..ooo..',
];
const CLOUD = [
  '.....XXXX.......',
  '...XXXXXXXX.XX..',
  '..XXXXXXXXXXXXX.',
  'XXXXXXXXXXXXXXXX',
  '.XXXXXXXXXXXXXX.',
];

const drawSprite = (r: Riso, sp: Sprite, x: number, y: number, P: number) => {
  xf(
    r,
    (c) => {
      c.translate(x, y);
      c.scale(P, P);
    },
    () => {
      knock(r, sp.sil);
      for (const part of sp.parts) ink(r, part.path, part.spec);
    }
  );
};

/** Outline of stepped rows (half-widths, top to bottom, centred) */
const steppedPts = (hw: number[]): Pt[] => {
  const n = hw.length;
  const top = -n / 2;
  const right: Pt[] = [];
  const left: Pt[] = [];
  hw.forEach((w, i) => {
    right.push([w, top + i], [w, top + i + 1]);
    left.push([-w, top + i], [-w, top + i + 1]);
  });
  return [...right, ...left.reverse()];
};

/* ---------- state ---------- */

interface State {
  sprites: { a: Sprite; b: Sprite; jump: Sprite; idle: Sprite };
  cloud: Path2D;
  cloudBelly: Path2D;
  outerStep: Pt[];
  innerStep: Pt[];
  oA: Pt[];
  oB: Pt[];
  iA: Pt[];
  iB: Pt[];
  hA: Pt[];
  hB: Pt[];
  farHills: Path2D;
  farHillsLight: Path2D;
  nearHills: Path2D;
  grass: Path2D;
  grassShade: Path2D;
  mortar: Path2D;
  brickShade: Path2D;
  scan: Path2D;
  cabScan: Path2D;
  blockX: number;
  rowX: number[];
}

/* ---------- platformer timeline ---------- */

const vel = (t: number) => 300 * ease.inOutSine(seg(t, 7.5, 8.0)) * (1 - ease.inOutSine(seg(t, 9.45, 10.15)));
const scrollAt = (t: number) => {
  if (t <= 7.5) return 0;
  const dt = 1 / 120;
  let s = 0;
  let u = 7.5;
  while (u < t) {
    const h = Math.min(dt, t - u);
    s += vel(u + h / 2) * h;
    u += h;
  }
  return s;
};
const heroScreenX = (t: number) =>
  lerp(-140, 500, ease.outCubic(seg(t, 7.3, 8.15))) + 250 * ease.inOutSine(seg(t, 9.95, 10.75));
const heroWorldX = (t: number) => scrollAt(t) + heroScreenX(t);

const GROUND = 720;
const U = 60;
const HERO_P = 7;
const HERO_H = 16 * HERO_P;
const HERO_C = 6 * HERO_P;
const COIN_P = 5;

/* ---------- coins ---------- */

/** Pixel coin that morphs (m) into the joystick ball. Local radius is 5 cells of size P */
const drawCoinBall = (r: Riso, s: State, cx: number, cy: number, P: number, c: number, m: number, fade = 1) => {
  const sx = Math.max(0.1, c);
  xf(
    r,
    (ctx) => {
      ctx.translate(cx, cy);
      ctx.scale(P * sx, P);
    },
    () => {
      const outer = m <= 0 ? polyPath(s.outerStep) : polyPath(morph(s.oA, s.oB, m));
      const inner = m <= 0 ? polyPath(s.innerStep) : polyPath(morph(s.iA, s.iB, m));
      knock(r, outer);
      ink(r, outer, [
        [B, fade],
        [PK, fade],
      ]);
      knock(r, inner);
      ink(r, inner, [
        [Y, (1 - m) * fade + 0.08 * m],
        [PK, lerp(0.22, 1, m) * fade],
      ]);
      if (m > 0.01) {
        r.gradient(r.layers[B], inner, { kind: 'radial', cx: -1.7, cy: -1.9, r0: 0.6, r1: 7.2, from: 0, to: 0.7 * m * fade }, 9);
      }
      if (m < 0.99) {
        ink(r, rectP(-0.5, -3, 1, 6), [[PK, 0.85 * (1 - m) * fade]]);
        ink(r, rectP(-0.5, -3, 1, 6), [[B, 0.25 * (1 - m) * fade]]);
      }
      const hl = m <= 0 ? polyPath([[-3, -3], [-2, -3], [-2, -1], [-3, -1]]) : polyPath(morph(s.hA, s.hB, m));
      knock(r, hl, [B, PK, Y]);
    }
  );
};

/** Smooth metal coin: face ellipse (R*sx, R*sy), edge offset (ex, ey) */
const drawCoin = (
  r: Riso,
  cx: number,
  cy: number,
  R: number,
  sx: number,
  sy: number,
  rot: number,
  ex: number,
  ey: number,
  detail = 1
) => {
  xf(
    r,
    (c) => {
      c.translate(cx, cy);
      c.rotate(rot);
    },
    () => {
      const rx = Math.max(0.02 * R, R * sx);
      const ry = Math.max(0.02 * R, R * sy);
      if (Math.abs(ex) > 0.05 || Math.abs(ey) > 0.05) {
        const edge = ellP(ex, ey, rx, ry);
        if (Math.abs(ex) >= Math.abs(ey)) rectP(Math.min(0, ex), -ry, Math.abs(ex), ry * 2, edge);
        else rectP(-rx, Math.min(0, ey), rx * 2, Math.abs(ey), edge);
        paint(r, edge, [
          [Y, 1],
          [PK, 0.7],
          [B, 0.12],
        ]);
      }
      const face = ellP(0, 0, rx, ry);
      paint(r, face, GOLD);
      if (detail > 0.02) {
        const rim = ellP(0, 0, rx, ry);
        ellP(0, 0, rx * 0.8, ry * 0.8, 0, rim);
        ink(r, rim, [[PK, 0.48 * detail]], 'evenodd');
        ink(r, starPath(0, 0, R * 0.46, R * 0.2, sx, sy), [
          [PK, 0.72 * detail],
          [B, 0.1 * detail],
        ]);
        const hl = ellP(-rx * 0.38, -ry * 0.42, rx * 0.26, ry * 0.12, -0.55);
        knock(r, hl, [PK, Y, B]);
      }
    }
  );
};

/* ---------- the platformer world (screen space 1600x900, scroll S) ---------- */

interface WorldP {
  S: number;
  t: number;
  rise: number;
  sun: { x: number; y: number; R: number } | null;
  hero: { x: number; y: number; sp: Sprite } | null;
  bump: number;
  used: boolean;
  pop: { y: number; c: number; m: number } | null;
}

const drawSun = (r: Riso, x: number, y: number, R: number, t: number) => {
  const sun = blockCircle(x, y, R, 12);
  paint(r, sun, [
    [Y, 1],
    [PK, 0.32],
  ]);
  if (R > 30) knock(r, blockCircle(x - R * 0.12, y - R * 0.12, R * 0.62, 12), [PK]);
  if (R > 24) {
    const rays = new Path2D();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + t * 0.35;
      const d = R + 26 + Math.sin(t * 3 + i) * 4;
      const q = 10;
      rays.rect(Math.round((x + Math.cos(a) * d) / 2) * 2 - q / 2, Math.round((y + Math.sin(a) * d) / 2) * 2 - q / 2, q, q);
    }
    paint(r, rays, [[Y, 1]]);
  }
};

const drawBlock = (r: Riso, x: number, y: number, kind: 'brick' | 'coin' | 'used') => {
  const out = rectP(x, y, U, U);
  paint(r, out, NAVY);
  const inner = rectP(x + 4, y + 4, U - 8, U - 8);
  knock(r, inner);
  if (kind === 'brick') {
    ink(r, inner, ORANGE);
    const m = new Path2D();
    m.rect(x + 4, y + 28, U - 8, 4);
    m.rect(x + 28, y + 4, 4, 24);
    m.rect(x + 14, y + 32, 4, 24);
    m.rect(x + 42, y + 32, 4, 24);
    knock(r, m, [PK]);
    ink(r, m, [[B, 0.2]]);
  } else if (kind === 'coin') {
    ink(r, inner, [
      [Y, 1],
      [PK, 0.18],
    ]);
    const em = blockCircle(x + U / 2, y + U / 2, 15, 6);
    ink(r, em, [[PK, 0.85]]);
    knock(r, rectP(x + U / 2 - 3, y + U / 2 - 9, 6, 18), [PK]);
    const riv = new Path2D();
    for (const [a, b] of [
      [8, 8],
      [U - 14, 8],
      [8, U - 14],
      [U - 14, U - 14],
    ])
      riv.rect(x + a, y + b, 6, 6);
    ink(r, riv, NAVY);
    knock(r, rectP(x + 4, y + 4, U - 8, 4), [PK]);
  } else {
    ink(r, inner, [
      [Y, 0.7],
      [PK, 0.75],
      [B, 0.3],
    ]);
    const riv = new Path2D();
    for (const [a, b] of [
      [8, 8],
      [U - 14, 8],
      [8, U - 14],
      [U - 14, U - 14],
    ])
      riv.rect(x + a, y + b, 6, 6);
    ink(r, riv, NAVY);
  }
};

const drawWorld = (r: Riso, s: State, w: WorldP) => {
  const L = r.layers;
  const t = w.t;
  const full = rectP(-800, -400, 3200, 1700);
  knock(r, full);
  // Sky
  r.gradient(L[B], full, { kind: 'linear', x0: 0, y0: 0, x1: 0, y1: 720, from: 0.55, to: 0.08 }, 9);
  r.gradient(L[PK], full, { kind: 'linear', x0: 0, y0: 380, x1: 0, y1: 720, from: 0, to: 0.2 }, 6);

  if (w.sun) drawSun(r, w.sun.x, w.sun.y, w.sun.R, t);

  // Clouds
  const clouds: [number, number, number][] = [
    [260, 120, 1],
    [860, 70, 0.8],
    [1380, 250, 0.9],
    [1900, 150, 1],
  ];
  for (const [cx0, cy, k] of clouds) {
    let cx = cx0 - w.S * 0.15 - t * 10;
    cx = ((((cx + 400) % 2200) + 2200) % 2200) - 400;
    xf(
      r,
      (c) => {
        c.translate(cx, cy + (1 - w.rise) * 120);
        c.scale(14 * k, 14 * k);
      },
      () => {
        knock(r, s.cloud);
        ink(r, s.cloudBelly, [[PK, 0.22]]);
      }
    );
  }

  const riseA = w.rise;
  // Far hills
  xf(
    r,
    (c) => c.translate(-((w.S * 0.3) % 1600) - 1600, (1 - riseA) * 340),
    () => {
      paint(r, s.farHills, [
        [B, 0.5],
        [G, 0.62],
      ]);
      ink(r, s.farHillsLight, [[Y, 0.3]]);
    }
  );
  // Near hills
  xf(
    r,
    (c) => c.translate(-((w.S * 0.62) % 1200) - 1200, (1 - riseA) * 280),
    () => {
      paint(r, s.nearHills, [
        [G, 1],
        [Y, 0.42],
        [B, 0.1],
      ]);
    }
  );
  // Ground
  xf(
    r,
    (c) => c.translate(-(w.S % 120) - 480, (1 - riseA) * 240),
    () => {
      const dirt = rectP(0, GROUND + 22, 2800, 400);
      paint(r, dirt, ORANGE);
      knock(r, s.mortar, [PK]);
      ink(r, s.brickShade, [[B, 0.32]]);
      paint(r, s.grass, [
        [G, 1],
        [Y, 0.45],
      ]);
      ink(r, s.grassShade, [[B, 0.4]]);
    }
  );

  // Floating level pieces (world-x minus scroll)
  const ox = -w.S;
  const by = 420 + (1 - riseA) * 400;
  const bx = s.blockX + ox - U / 2;
  // Coin popping out of the block (behind the block)
  if (w.pop) drawCoinBall(r, s, s.blockX + ox, w.pop.y + (1 - riseA) * 400, COIN_P, w.pop.c, w.pop.m);
  if (bx > -300 && bx < 1900) {
    drawBlock(r, bx - U, by, 'brick');
    drawBlock(r, bx, by + w.bump, w.used ? 'used' : 'coin');
    drawBlock(r, bx + U, by, 'brick');
  }
  // A brick ledge and staircase further on
  const lx = s.blockX + 560 + ox;
  if (lx > -400 && lx < 1700) for (let i = 0; i < 4; i++) drawBlock(r, lx + i * U, 500 + (1 - riseA) * 400, 'brick');
  const stx = s.blockX + 1080 + ox;
  if (stx > -400 && stx < 1700)
    for (let i = 0; i < 4; i++)
      for (let j = 0; j <= i; j++) drawBlock(r, stx + i * U, GROUND - U * (j + 1) + (1 - riseA) * 240, 'brick');

  // Coin row collected by the hero
  const heroC = w.hero ? w.hero.x + HERO_C - ox : -1e9;
  s.rowX.forEach((x, i) => {
    const sxp = x + ox;
    if (sxp < -60 || sxp > 1660) return;
    const d = heroC - (x - 20);
    const spin = Math.abs(Math.cos(t * 4 + i * 0.7));
    const yy = 640 + Math.sin(t * 3 + i) * 3 + (1 - riseA) * 300;
    if (d < 0) drawCoinBall(r, s, sxp, yy, COIN_P, spin, 0);
    else if (d < 140) {
      const k = d / 140;
      drawCoinBall(r, s, sxp, yy - 70 * ease.outCubic(k), COIN_P, Math.abs(Math.cos(t * 14)), 0, 1 - k);
      const sp = new Path2D();
      for (let a = 0; a < 4; a++) {
        const ang = a * (TAU / 4) + 0.785;
        const dd = 20 + 50 * k;
        sp.rect(sxp + Math.cos(ang) * dd - 4, yy - 70 * k + Math.sin(ang) * dd - 4, 8, 8);
      }
      ink(r, sp, [[Y, 1 - k * 0.6]]);
    }
  });

  if (w.hero) drawSprite(r, w.hero.sp, w.hero.x, w.hero.y, HERO_P);
};

/** World state on the main timeline */
const worldAt = (s: State, t: number): WorldP => {
  const S = scrollAt(t);
  const jumping = t > 8.55 && t < 9.35;
  const jy = jumping ? -(GROUND - HERO_H - 480) * (1 - ((t - 8.95) / 0.4) ** 2) : 0;
  const moving = t > 7.3 && t < 10.75;
  const sp = jumping ? s.sprites.jump : moving ? (Math.floor(t * 10) % 2 ? s.sprites.a : s.sprites.b) : s.sprites.idle;
  const hx = heroScreenX(t);
  const bumpK = seg(t, 8.95, 9.17);
  const bump = t >= 8.95 && t <= 9.17 ? -12 * Math.sin(Math.PI * bumpK) : 0;
  let pop: WorldP['pop'] = null;
  if (t >= 8.95) {
    const bob = Math.sin((t - 9.45) * 3.4) * 5 * (t > 9.45 ? 1 : 0) * (1 - seg(t, 10.25, 10.9));
    const y = lerp(450, 330, ease.outCubic(seg(t, 8.95, 9.45))) + bob;
    const th = (t - 8.95) * 8;
    const c = lerp(Math.abs(Math.cos(th)), 1, ease.inOutSine(seg(t, 10.2, 10.95)));
    pop = { y, c, m: tween(t, 10.95, 11.75, ease.inOutSine) };
  }
  return {
    S,
    t,
    rise: t < 6.4 ? 0 : ease.outBack(seg(t, 6.45, 7.55)),
    sun: { x: 1230, y: 190, R: 66 },
    hero: t > 7.25 ? { x: hx, y: GROUND - HERO_H + jy, sp } : null,
    bump,
    used: t >= 8.95,
    pop,
  };
};

/* ---------- the arcade cabinet (world space, framed at zoom 1) ---------- */

interface CabP {
  t: number;
  tilt: number;
  press: number[];
  marquee: number;
  start: number;
  screen: (r: Riso) => void;
}

const BALL: Pt = [690, 454];
const BALL_R = 22;
const SCREEN = { x: 618, y: 160, w: 364, h: 250 };

const neighbour = (r: Riso, cx: number, k: number, glow: number) => {
  xf(
    r,
    (c) => {
      c.translate(cx, 860);
      c.scale(k, k);
      c.translate(-800, -860);
    },
    () => {
      const body = new Path2D();
      polyPath(
        [
          [552, 22],
          [1048, 22],
          [1048, 440],
          [1074, 520],
          [1074, 556],
          [1050, 560],
          [1050, 860],
          [550, 860],
          [550, 560],
          [526, 556],
          [526, 520],
          [552, 440],
        ],
        true,
        body
      );
      paint(r, body, [
        [B, 0.62],
        [PK, 0.3],
      ]);
      paint(r, rectP(575, 40, 450, 80), [
        [PK, 0.6],
        [Y, 0.5],
      ]);
      const scr = crtPath(618, 160, 364, 250, 8, 26);
      paint(r, scr, [
        [G, 0.6],
        [B, 0.35],
        [Y, glow],
      ]);
      paint(r, rectP(552, 440, 496, 80), [
        [PK, 0.4],
        [B, 0.45],
      ]);
    }
  );
};

const drawCabinet = (r: Riso, s: State, p: CabP) => {
  const L = r.layers;
  const t = p.t;
  // Wall and floor
  const wall = rectP(-600, -600, 2800, 1458);
  r.gradient(L[Y], wall, { kind: 'radial', cx: 800, cy: 330, r0: 60, r1: 900, from: 0.42, to: 0.08 }, 6);
  r.gradient(L[PK], wall, { kind: 'radial', cx: 800, cy: 330, r0: 200, r1: 1000, from: 0.05, to: 0.3 }, 4);
  const floor = rectP(-600, 858, 2800, 600);
  paint(r, floor, [
    [PK, 0.42],
    [B, 0.3],
  ]);
  neighbour(r, 160, 0.86, 0.3 + 0.2 * Math.sin(t * 2.3));
  neighbour(r, 1440, 0.86, 0.3 + 0.2 * Math.sin(t * 1.7 + 1));
  paint(r, ellP(800, 864, 330, 14), [[B, 0.6]]);

  // Body
  const body = polyPath([
    [552, 22],
    [1048, 22],
    [1048, 440],
    [1074, 520],
    [1074, 556],
    [1050, 560],
    [1050, 860],
    [550, 860],
    [550, 560],
    [526, 556],
    [526, 520],
    [552, 440],
  ]);
  paint(r, body, [
    [B, 1],
    [PK, 0.36],
  ]);
  const sides = rectP(552, 22, 16, 418);
  rectP(1032, 22, 16, 418, sides);
  rectP(550, 560, 16, 300, sides);
  rectP(1034, 560, 16, 300, sides);
  knock(r, sides, [B]);
  ink(r, sides, [[B, 0.62]]);
  // Stripes on the lower body
  paint(r, rectP(566, 570, 468, 7), [[Y, 1]]);
  paint(r, rectP(566, 582, 468, 7), [[PK, 1]]);
  paint(r, rectP(566, 594, 468, 7), [[G, 1]]);

  // Marquee
  const mq = rectP(572, 36, 456, 86);
  paint(r, mq, [
    [Y, lerp(0.7, 1, p.marquee)],
    [PK, 0.12],
  ]);
  r.gradient(L[PK], mq, { kind: 'linear', x0: 0, y0: 36, x1: 0, y1: 122, from: 0.05, to: 0.35 }, 5);
  text(r, 'ARCADE', 803, 82, 46, [[B, 0.9]], 10, false);
  text(r, 'ARCADE', 800, 79, 46, [[PK, 1]], 10, true);
  drawCoinBall(r, s, 618, 79, 3, Math.abs(Math.cos(t * 3)), 0);
  drawCoinBall(r, s, 982, 79, 3, Math.abs(Math.cos(t * 3 + 1)), 0);
  paint(r, rectP(572, 122, 456, 8), NAVY);

  // Bezel and screen
  paint(r, rectP(572, 130, 456, 310), [
    [B, 1],
    [PK, 0.72],
  ]);
  paint(r, crtPath(610, 152, 380, 266, 9, 30), [
    [B, 0.7],
    [PK, 0.42],
  ]);
  const scr = crtPath(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 8, 26);
  knock(r, scr);
  xf(
    r,
    (c) => c.clip(scr),
    () => {
      p.screen(r);
      L[B].globalCompositeOperation = 'destination-out';
      L[B].fillStyle = r.tone(L[B], 0.4);
      L[B].fill(s.cabScan);
      L[B].globalCompositeOperation = 'source-over';
      // glass glare
      for (const c of L) {
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = r.tone(c, 0.22);
        c.fill(ellP(700, 200, 120, 34, -0.35));
        c.globalCompositeOperation = 'source-over';
      }
    }
  );

  // Control panel
  const panel = polyPath([
    [552, 440],
    [1048, 440],
    [1074, 520],
    [526, 520],
  ]);
  paint(r, panel, [
    [Y, 0.55],
    [PK, 0.5],
    [B, 0.06],
  ]);
  const pstripe = polyPath([
    [548, 452],
    [1052, 452],
    [1054, 458],
    [546, 458],
  ]);
  ink(r, pstripe, [[PK, 0.8]]);
  paint(r, rectP(526, 520, 548, 4), [[Y, 1]]);
  paint(r, rectP(526, 524, 548, 32), [
    [B, 1],
    [PK, 0.75],
  ]);

  // Buttons
  const btns: [number, number, Spec, Spec][] = [
    [
      800,
      486,
      ORANGE,
      [
        [Y, 1],
        [PK, 0.32],
      ],
    ],
    [
      852,
      478,
      [
        [G, 1],
        [B, 0.25],
      ],
      [
        [G, 0.8],
        [Y, 0.35],
      ],
    ],
    [
      904,
      486,
      [
        [B, 1],
        [PK, 0.2],
      ],
      [[B, 0.65]],
    ],
  ];
  btns.forEach(([x, y, side, top], i) => {
    const pr = p.press[i] ?? 0;
    paint(r, ellP(x, y + 4, 19, 10.5), NAVY);
    const h = lerp(7, 2, pr);
    const cyl = ellP(x, y + 3, 15, 8);
    rectP(x - 15, y + 3 - h, 30, h, cyl);
    paint(r, cyl, side);
    const tp = ellP(x, y + 3 - h, 15, 8);
    paint(r, tp, top);
    knock(r, ellP(x - 6, y + 1 - h, 4.5, 2.2, -0.2), [B, PK, Y, G]);
  });
  // Start buttons
  for (let i = 0; i < 2; i++) {
    const x = 968 + i * 34;
    paint(r, ellP(x, 466, 10, 5.6), NAVY);
    const lit = i === 0 ? p.start : 0;
    paint(r, ellP(x, 464, 7.5, 4.2), [
      [Y, lerp(0.15, 1, lit)],
      [PK, lerp(0.1, 0.3, lit)],
    ]);
  }

  // Joystick
  paint(r, ellP(690, 494, 26, 9), NAVY);
  paint(r, ellP(690, 492, 17, 5.5), [[B, 0.5]]);
  const tip: Pt = [690 + Math.sin(p.tilt) * 40, 494 - Math.cos(p.tilt) * 40];
  for (const c of L) {
    c.lineCap = 'round';
    c.lineWidth = 8;
  }
  const shaft = new Path2D();
  shaft.moveTo(690, 492);
  shaft.lineTo(tip[0], tip[1]);
  for (const c of L) {
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = '#000';
    c.stroke(shaft);
    c.globalCompositeOperation = 'source-over';
  }
  L[B].strokeStyle = r.tone(L[B], 0.55);
  L[B].stroke(shaft);
  L[PK].strokeStyle = r.tone(L[PK], 0.15);
  L[PK].stroke(shaft);
  drawCoinBall(r, s, tip[0], tip[1], BALL_R / 5, 1, 1);

  // Coin door
  paint(r, rectP(712, 612, 176, 194), NAVY);
  paint(r, rectP(718, 618, 164, 182), [
    [B, 0.5],
    [PK, 0.2],
  ]);
  const blink = 0.5 + 0.5 * Math.sin(t * 6.5);
  for (const cx of [767, 833]) {
    paint(r, rectP(cx - 24, 624, 48, 22), NAVY);
    const win = rectP(cx - 22, 626, 44, 18);
    paint(r, win, [
      [Y, lerp(0.75, 1, blink)],
      [PK, 0.12],
    ]);
    text(r, 'INSERT', cx, 631.5, 4.6, [[PK, 1]], 0.6, false);
    text(r, 'COIN', cx, 638.5, 4.6, [[PK, 1]], 0.9, false);
    // slot box
    paint(r, rectP(cx - 16, 648, 32, 22), NAVY);
    paint(r, rectP(cx - 15, 649, 30, 13), [[B, 0.14]]);
    paint(r, rectP(cx - 15, 662, 30, 7), [[B, 0.48]]);
    paint(r, rrect(cx - 10, 653.5, 20, 2.6, 1.2), NAVY);
    knock(r, rectP(cx - 14, 649.6, 26, 0.9), [B]);
    // coin return button and cup
    paint(r, rectP(cx - 8, 676, 16, 13), NAVY);
    paint(r, rectP(cx - 6.5, 677.5, 13, 10), [
      [PK, 1],
      [Y, 0.35],
    ]);
    paint(r, rrect(cx - 13, 700, 26, 16, 3), NAVY);
    paint(r, rrect(cx - 10, 703, 20, 6, 2), [[B, 0.4]]);
  }
  paint(r, ellP(800, 770, 8, 8), NAVY);
  paint(r, ellP(800, 770, 5.5, 5.5), [[B, 0.25]]);
  paint(r, rectP(799, 767, 2, 6), NAVY);
  paint(r, rectP(550, 836, 500, 24), NAVY);
};

/* ---------- film ---------- */

const ARC: Pt[] = [
  [722, 598],
  [736, 604],
  [758, 618],
  [767, 636],
];
const bezPt = (k: number): Pt => {
  const u = 1 - k;
  const [p0, p1, p2, p3] = ARC;
  return [
    u * u * u * p0[0] + 3 * u * u * k * p1[0] + 3 * u * k * k * p2[0] + k * k * k * p3[0],
    u * u * u * p0[1] + 3 * u * u * k * p1[1] + 3 * u * k * k * p2[1] + k * k * k * p3[1],
  ];
};

const SLIT_Y = 654.8;

/** The coin falling inside the machine, in screen space (T1 into S2) */
const insideCoin = (r: Riso, t: number) => {
  const L = r.layers;
  const k = seg(t, 3.05, 4.3);
  const y = lerp(40, 450, ease.outCubic(k));
  const R = lerp(74, 17, ease.inOutCubic(seg(t, 3.2, 4.45)));
  const th = 4 * Math.PI * ease.outCubic(seg(t, 3.05, 4.3));
  const m = tween(t, 4.2, 4.75);
  // Glow
  const gl = 0.35 + 0.65 * seg(t, 3.6, 4.6);
  for (const c of [L[B], L[PK]]) {
    c.globalCompositeOperation = 'destination-out';
    r.gradient(c, null, { kind: 'radial', cx: 800, cy: y, r0: R, r1: R * 3 + 150, from: 0.85 * gl, to: 0 }, 9);
    c.globalCompositeOperation = 'source-over';
  }
  r.gradient(L[Y], null, { kind: 'radial', cx: 800, cy: y, r0: R, r1: R * 3.6 + 190, from: 0.75 * gl, to: 0 }, 10);
  // Speed streaks
  const sv = 1 - ease.outCubic(k);
  if (sv > 0.05) {
    const st = new Path2D();
    for (const [dx, len] of [
      [-44, 240],
      [2, 330],
      [40, 200],
    ])
      st.rect(800 + dx * (R / 74) - 2, y - R - 20 - len * sv, 4, len * sv);
    ink(r, st, [[Y, 0.8]]);
  }
  if (m <= 0) {
    const c = Math.cos(th);
    drawCoin(r, 800, y, R, Math.abs(c), 1, 0, R * 0.16 * Math.sin(th), 0, 1);
  } else {
    const [a, b] = morphPair(circlePts(0, 0, R, 64), [
      [-13, -13],
      [13, -13],
      [13, 13],
      [-13, 13],
    ], 64);
    const sh = polyPath(morph(a, b, m));
    xf(
      r,
      (c) => c.translate(800, y),
      () => {
        paint(r, sh, [
          [Y, 1],
          [PK, 0.2 * (1 - m)],
        ]);
        if (m < 0.7) ink(r, starPath(0, 0, R * 0.46, R * 0.2, 1, 1), [[PK, 0.72 * (1 - m / 0.7)]]);
      }
    );
  }
};

export const insertCoinFilm: RisoFilm<State> = {
  id: 'insert-coin',
  title: 'Insert Coin',
  caption: 'One coin, one more go: from the slot to the screen and back.',
  theme: 'Games',
  motif: 'A coin',
  duration: 19,
  paper: '#f3ead8',
  inks: [
    { color: '#0078bf', offset: [-1.2, 0.8] },
    { color: '#ff48b0', offset: [1.5, -1] },
    { color: '#ffe800', offset: [0, 0] },
    { color: '#00a95c', offset: [0.8, 1.3] },
  ],
  scenes: [
    { at: 0, label: 'Coin slot' },
    { at: 3.0, label: 'Into the dark' },
    { at: 6.2, label: 'Level 1' },
    { at: 10.3, label: 'Joystick' },
    { at: 15.2, label: 'Continue?' },
  ],
  posterTime: 9.3,

  setup() {
    const sprites = { a: makeSprite(RUN_A), b: makeSprite(RUN_B), jump: makeSprite(JUMP), idle: makeSprite(IDLE) };
    const cloud = new Path2D();
    const cloudBelly = new Path2D();
    CLOUD.forEach((row, y) => {
      for (let x = 0; x < row.length; x++)
        if (row[x] === 'X') {
          cloud.rect(x, y, 1.02, 1.02);
          if (y >= CLOUD.length - 1 || CLOUD[y + 1][x] !== 'X') cloudBelly.rect(x, y, 1.02, 1.02);
        }
    });

    const outerStep = steppedPts([2, 4, 4, 5, 5, 5, 5, 4, 4, 2]);
    const innerStep = steppedPts([2, 3, 4, 4, 4, 4, 3, 2]);
    const [oA, oB] = morphPair(outerStep, circlePts(0, 0, 5, 120), 360);
    const [iA, iB] = morphPair(innerStep, circlePts(0, 0, 4.55, 120), 360);
    const rot = ellipsePts(0, 0, 1.15, 0.62, 40).map(([x, y]): Pt => {
      const a = -0.6;
      return [-1.9 + x * Math.cos(a) - y * Math.sin(a), -2.15 + x * Math.sin(a) + y * Math.cos(a)];
    });
    const [hA, hB] = morphPair(
      [
        [-3, -3],
        [-2, -3],
        [-2, -1],
        [-3, -1],
      ],
      rot,
      40
    );

    // Stepped hills, tiled
    const hills = (period: number, mounds: [number, number, number][], q: number, base: number) => {
      const p = new Path2D();
      const light = new Path2D();
      const top = (x: number) => {
        let best = base;
        for (const [xc, w, h] of mounds)
          for (const off of [0, period, period * 2]) {
            const u = (x - xc - off) / w;
            if (Math.abs(u) < 1) best = Math.min(best, base - h * (1 - u * u));
          }
        return Math.round(best / q) * q;
      };
      p.moveTo(0, base + 500);
      for (let x = 0; x <= period * 2 + 1600; x += q) {
        const y = top(x + q / 2);
        p.lineTo(x, y);
        p.lineTo(x + q, y);
        // left-facing light edge
        const yl = top(x - q / 2);
        if (y < yl) light.rect(x, y, q, q);
        else if (y < base) light.rect(x + q * 0.3, y, q * 0.4, q * 0.4);
      }
      p.lineTo(period * 2 + 1600 + q, base + 500);
      p.closePath();
      return { p, light };
    };
    const far = hills(
      1600,
      [
        [200, 420, 250],
        [760, 360, 170],
        [1250, 460, 290],
      ],
      20,
      GROUND + 10
    );
    const near = hills(
      1200,
      [
        [140, 170, 96],
        [520, 120, 60],
        [900, 200, 120],
      ],
      12,
      GROUND + 10
    );

    const grass = new Path2D();
    const grassShade = new Path2D();
    grass.rect(0, GROUND, 2800, 22);
    for (let x = 0; x < 2800; x += 24) grass.rect(x + 4, GROUND - (x % 48 ? 6 : 12), 12, 12);
    grassShade.rect(0, GROUND + 16, 2800, 6);
    const mortar = new Path2D();
    const brickShade = new Path2D();
    for (let row = 0; row < 5; row++) {
      const y = GROUND + 22 + row * 40;
      mortar.rect(0, y + 36, 2800, 4);
      brickShade.rect(0, y + 28, 2800, 8);
      for (let x = row % 2 ? 30 : 0; x < 2800; x += 60) mortar.rect(x, y, 4, 36);
    }

    const scan = new Path2D();
    for (let y = 0; y < 900; y += 9) scan.rect(0, y, 1600, 2.6);
    const cabScan = new Path2D();
    for (let y = SCREEN.y - 10; y < SCREEN.y + SCREEN.h + 10; y += 3.2) cabScan.rect(SCREEN.x - 10, y, SCREEN.w + 20, 0.9);

    const blockX = heroWorldX(8.95) + HERO_C;
    const rowX = [0, 1, 2].map((i) => heroWorldX(8.0) + HERO_C + i * 66);

    return {
      sprites,
      cloud,
      cloudBelly,
      outerStep,
      innerStep,
      oA,
      oB,
      iA,
      iB,
      hA,
      hB,
      farHills: far.p,
      farHillsLight: far.light,
      nearHills: near.p,
      grass,
      grassShade,
      mortar,
      brickShade,
      scan,
      cabScan,
      blockX,
      rowX,
    };
  },

  draw(r, t, s) {
    const L = r.layers;

    /* ---- A: the coin slot, then into the dark ---- */
    if (t < 3.95) {
      const kd = tween(t, 2.95, 3.9, ease.inOutCubic);
      const z = t < 2.95 ? lerp(10, 12, tween(t, 0, 2.95, ease.inOutSine)) : 12 * Math.pow(26 / 12, kd);
      const cx = 767;
      const cy = t < 2.95 ? lerp(645, 651, tween(t, 0, 2.95, ease.inOutSine)) : lerp(651, SLIT_Y, kd);
      r.camera(cx, cy, z);
      drawCabinet(r, s, {
        t,
        tilt: 0,
        press: [0, 0, 0],
        marquee: 0,
        start: 0,
        screen: (rr) => paint(rr, rectP(0, 0, 1600, 900), DARK),
      });
      // The coin, clipped by the slit
      if (t > 0.2 && t < 3.1) {
        let p: Pt;
        let th: number;
        let rot: number;
        if (t < 2.25) {
          const k = seg(t, 0.2, 2.25);
          p = bezPt(ease.inOutSine(k));
          th = 6 * Math.PI * ease.outCubic(k);
          rot = lerp(-0.6, 0, ease.outCubic(k));
        } else {
          const kdrop = seg(t, 2.25, 2.85);
          p = [767, 636 + 32 * ease.inCubic(kdrop)];
          th = 0;
          rot = 0;
        }
        const clip = rectP(600, 500, 400, SLIT_Y - 0.4 - 500);
        xf(
          r,
          (c) => c.clip(clip),
          () => drawCoin(r, p[0], p[1], 7.5, Math.abs(Math.cos(th)), 1, rot, 7.5 * 0.16 * Math.sin(th), 0, 1)
        );
      }
      // Glint as it goes in
      const gk = seg(t, 2.85, 3.3);
      if (gk > 0 && gk < 1) {
        const sz = 5 * Math.sin(gk * Math.PI);
        const g = starPath(778, 652, sz, sz * 0.18, 1, 1);
        starPath(778, 652, sz * 0.6, sz * 0.12, 1, 1, g);
        paint(r, g, [[Y, 1]]);
      }
      // The slit opens into darkness
      if (t > 2.95) {
        const hh = lerp(1.3, 46, kd);
        const hw = lerp(10, 82, kd);
        const dark = rrect(767 - hw, SLIT_Y - hh, hw * 2, hh * 2, lerp(1.2, 0, kd));
        paint(r, dark, DARK);
        r.camera(800, 450, 1);
        const sx0 = (767 - hw - cx) * z + 800;
        const sy0 = (SLIT_Y - hh - cy) * z + 450;
        const clip = rectP(sx0, sy0, hw * 2 * z, hh * 2 * z);
        xf(
          r,
          (c) => c.clip(clip),
          () => insideCoin(r, t)
        );
      }
      return;
    }

    /* ---- B: CRT, a single pixel, the world blooms ---- */
    if (t < 7.6) {
      r.camera(800, 450, 1);
      const e = tween(t, 3.95, 4.9, ease.outCubic);
      const ix = lerp(-260, 70, e);
      const iy = lerp(-200, 56, e);
      const crt = crtPath(ix, iy, 1600 - ix * 2, 900 - iy * 2, 18, 70);
      const full = rectP(0, 0, 1600, 900);
      paint(r, full, [
        [B, 0.88],
        [PK, 0.5],
        [Y, 0.14],
      ]);
      paint(r, crtPath(ix - 14, iy - 14, 1600 - ix * 2 + 28, 900 - iy * 2 + 28, 20, 80), [
        [B, 0.6],
        [PK, 0.3],
      ]);
      paint(r, crt, DARK);
      // Coin -> pixel -> sun
      const pm = tween(t, 6.0, 7.15, ease.inOutCubic);
      const px = lerp(800, 1230, pm);
      const py = lerp(450, 190, pm) - Math.sin(pm * Math.PI) * 60;
      xf(
        r,
        (c) => c.clip(crt),
        () => {
          if (t < 4.75) insideCoin(r, t);
          else {
            const pulse = 0.85 + 0.15 * Math.sin((t - 4.75) * 9);
            const R = lerp(17, 66, tween(t, 6.1, 7.2, ease.inOutCubic));
            for (const c of [L[B], L[PK]]) {
              c.globalCompositeOperation = 'destination-out';
              r.gradient(c, null, { kind: 'radial', cx: px, cy: py, r0: R * 0.8, r1: R * 7 * pulse, from: 0.85, to: 0 }, 9);
              c.globalCompositeOperation = 'source-over';
            }
            r.gradient(L[Y], null, { kind: 'radial', cx: px, cy: py, r0: R * 0.8, r1: R * 9 * pulse, from: 0.75, to: 0 }, 10);
            paint(r, blockCircle(px, py, R, 12), [
              [Y, 1],
              [PK, 0.32 * seg(t, 6.2, 7.0)],
            ]);
          }
          // scanlines and a rolling bar
          for (const c of [L[B], L[PK]]) {
            c.globalCompositeOperation = 'destination-out';
            if (c === L[B]) {
              c.fillStyle = r.tone(c, 0.38 * e);
              c.fill(s.scan);
            }
            c.fillStyle = r.tone(c, 0.18 * e);
            c.fillRect(0, ((t * 260) % 1100) - 200, 1600, 110);
            c.globalCompositeOperation = 'source-over';
          }
          const ca = seg(t, 4.6, 5.0) * (1 - seg(t, 6.0, 6.3));
          if (ca > 0.02) text(r, 'CREDIT 1', 800, 770, 30, [[Y, ca]], 8);
        }
      );
      // The bloom
      const kb = seg(t, 6.25, 7.5);
      if (kb > 0) {
        const Rb = 2000 * Math.pow(kb, 2.2);
        const bloom = blockCircle(px, py, Rb, 36);
        knock(r, bloom);
        const w = worldAt(s, t);
        w.sun = null;
        xf(
          r,
          (c) => c.clip(bloom),
          () => drawWorld(r, s, w)
        );
        if (Rb > 4) {
          const ring = blockCircle(px, py, Rb, 36);
          blockCircle(px, py, Rb - 36, 36, ring);
          paint(r, ring, ORANGE, 'evenodd');
        }
        // the pixel-sun rides on top
        const R = lerp(17, 66, tween(t, 6.1, 7.2, ease.inOutCubic));
        drawSun(r, px, py, R, t);
      }
      return;
    }

    /* ---- C: the level, then into the coin ---- */
    if (t < 11.8) {
      const w = worldAt(s, t);
      const zk = tween(t, 10.3, 11.8, ease.inOutSine);
      if (zk > 0 && w.pop) {
        const z = Math.exp(Math.log(40) * zk);
        const coin: Pt = [s.blockX - w.S, w.pop.y];
        const ak = tween(t, 10.3, 11.3, ease.inOutSine);
        const ax = lerp(coin[0], 800, ak);
        const ay = lerp(coin[1], 450, ak);
        r.camera(coin[0] - (ax - 800) / z, coin[1] - (ay - 450) / z, z);
      } else r.camera(800, 450, 1);
      drawWorld(r, s, w);
      return;
    }

    /* ---- D: pull back to the joystick and the cabinet ---- */
    let z: number;
    let cx: number;
    let cy: number;
    const z0 = (5 * COIN_P * 40) / BALL_R;
    if (t < 13.0) {
      const k = tween(t, 11.8, 13.0, ease.inOutSine);
      z = Math.exp(lerp(Math.log(z0), Math.log(4.2), k));
      const tx = (BALL[0] - 800) * 4.2 + 800;
      const ty = (BALL[1] - 488) * 4.2 + 450;
      const ax = lerp(800, tx, k);
      const ay = lerp(450, ty, k);
      cx = BALL[0] - (ax - 800) / z;
      cy = BALL[1] - (ay - 450) / z;
    } else if (t < 13.9) {
      z = lerp(4.2, 3.7, seg(t, 13.0, 13.9));
      cx = 800;
      cy = 488;
    } else {
      const k = tween(t, 13.9, 15.4, ease.inOutCubic);
      const k2 = tween(t, 15.4, 19, ease.inOutSine);
      z = Math.exp(lerp(Math.log(3.7), Math.log(1.2), k)) * lerp(1, 1.18, k2);
      cx = 800 + 30 * k2;
      cy = lerp(488, 415, k) - 70 * k2;
    }
    r.camera(cx, cy, z);

    const wig = seg(t, 12.6, 12.9) * (1 - seg(t, 14.3, 14.8));
    const tilt = wig * (0.32 * noise1(t * 3.2, 4) + 0.12 * Math.sin(t * 9));
    const pressAt = (t0: number) => (t > t0 && t < t0 + 0.16 ? Math.sin((Math.PI * (t - t0)) / 0.16) : 0);
    const press = [pressAt(13.15) + pressAt(13.7), pressAt(13.45), pressAt(14.05)];
    const settled = seg(t, 17.2, 17.5);
    const start = t > 17.25 ? 0.5 + 0.5 * Math.cos((t - 17.25) * 7) : 0;

    drawCabinet(r, s, {
      t,
      tilt,
      press,
      marquee: settled,
      start,
      screen: (rr) => {
        paint(rr, rectP(0, 0, 1600, 900), DARK);
        if (t < 15.05) {
          // the level, still playing on the cabinet screen
          const S = s.blockX - 760 + (t - 11.8) * 150;
          const jt = [13.15, 13.45, 13.7, 14.05].find((j) => t > j && t < j + 0.42);
          const jy = jt !== undefined ? -110 * Math.sin((Math.PI * (t - jt)) / 0.42) : 0;
          const sp = jt !== undefined ? s.sprites.jump : Math.floor(t * 10) % 2 ? s.sprites.a : s.sprites.b;
          const w: WorldP = {
            S,
            t,
            rise: 1,
            sun: { x: 1230, y: 190, R: 66 },
            hero: { x: 760, y: GROUND - HERO_H + jy, sp },
            bump: 0,
            used: true,
            pop: null,
          };
          const k = SCREEN.h / 900;
          const tx = SCREEN.x - ((1600 - SCREEN.w / k) / 2) * k;
          const ik = seg(t, 14.55, 15.05);
          const iris = blockCircle(796, GROUND - 48 + jy, 1100 * (1 - ease.inCubic(ik)), 40);
          xf(
            rr,
            (c) => {
              c.translate(tx, SCREEN.y);
              c.scale(k, k);
              if (ik > 0) c.clip(iris);
            },
            () => drawWorld(rr, s, w)
          );
        } else if (t < 17.25) {
          const n = 3 - Math.floor((t - 15.1) / 0.72);
          text(rr, 'CONTINUE?', 800, 250, 34, [[Y, 1]], 4);
          const pk = ((t - 15.1) / 0.72) % 1;
          const sz = 70 * (1 + 0.25 * Math.max(0, 1 - pk * 4));
          text(rr, String(clamp(n, 1, 3)), 800, 330, sz, ORANGE, 0);
        } else {
          const on = (t - 17.25) % 0.6 < 0.42 || t > 18.0;
          if (on) text(rr, 'PRESS START', 800, 262, 36, [[Y, 1]], 3);
          drawCoinBall(rr, s, 744, 342, 2.4, Math.abs(Math.cos(t * 3)), 0);
          text(rr, 'CREDIT 1', 812, 343, 18, [[Y, 0.75]], 3);
        }
      },
    });

    // The new coin lands on the panel and settles
    if (t > 15.4) {
      const R = 16;
      const surf = 507;
      let x: number;
      let y: number;
      let sx: number;
      let sy = 1;
      let ex = 0;
      let ey = 0;
      let rot = 0;
      if (t < 16.05) {
        const k = seg(t, 15.4, 16.05);
        x = lerp(1030, 990, k);
        y = lerp(-60, surf - R, ease.inCubic(k));
        const th = t * 13;
        sx = Math.abs(Math.cos(th));
        ex = R * 0.16 * Math.sin(th);
        rot = t * 4;
      } else if (t < 16.85) {
        const kb = seg(t, 16.05, 16.33);
        x = 990;
        y = surf - R - 22 * 4 * kb * (1 - kb);
        const th = 16.05 * 13 + (t - 16.05) * 12;
        sx = Math.abs(Math.cos(th));
        ex = R * 0.16 * Math.sin(th);
        rot = 0;
      } else {
        const k = ease.inOutSine(seg(t, 16.85, 17.45));
        const th = 16.05 * 13 + 0.8 * 12 + (t - 16.85) * lerp(12, 30, k) * (1 - k * 0.6);
        x = 990 + Math.sin(th) * 2 * (1 - k);
        sx = lerp(Math.abs(Math.cos(th)), 1, Math.sqrt(k));
        sy = lerp(1, 0.42, k);
        ex = R * 0.16 * Math.sin(th) * (1 - k);
        ey = R * 0.22 * k;
        y = lerp(surf - R, surf - R * 0.42 - ey * 0.5, k);
      }
      drawCoin(r, x, y, R, sx, sy, rot, ex, ey, 1);
      // clinks
      for (const t0 of [16.05, 17.42]) {
        const k = seg(t, t0, t0 + 0.5);
        if (k > 0 && k < 1) {
          for (const c of L) {
            c.lineWidth = 1.6;
          }
          const ring = new Path2D();
          ring.ellipse(990, surf, 12 + 34 * k, (12 + 34 * k) * 0.36, 0, 0, TAU);
          L[PK].strokeStyle = r.tone(L[PK], 1 - k);
          L[PK].stroke(ring);
        }
      }
    }
  },
};
