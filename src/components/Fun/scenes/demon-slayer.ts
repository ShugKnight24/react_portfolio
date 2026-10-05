import { clamp, createCanvasScene, damp, easeInOutCubic, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { emit, freeCanvas, glow, glowSprite, layer, makePool, mulberry, setHum, shakeX, shakeY, startHum, stepPool, stopHum } from './heroes-kit';
import type { Hum, Pool } from './heroes-kit';
import { capsule, cel, elbow, inked, makePress, pressDown, stepPress, within } from './anime-more-kit';
import type { C, Press } from './anime-more-kit';

/**
 * Water and Sun: Tanjiro faces a demon in a moonlit cedar forest. Each tap cuts a Water
 * Breathing form (Water Surface Slash, Water Wheel, Striking Tide) that trails a curling
 * woodblock print wave. Hold to switch to Hinokami Kagura: the blade catches fire, flames
 * wreathe him, and on release a full circle of sun fire burns the demon to ash. It reforms.
 */

const INK = '#16121a';
const SKIN = '#ffdcc2';
const SKIN_SH = '#e7ac8e';
const HAIR = '#4a1418';
const HAIR_TIP = '#a42a31';
const GREEN = '#2f9b6a';
const BLACK = '#17161c';
const UNIFORM = '#1e2230';
const UNIFORM_SH = '#11131c';
const WRAP = '#f2f0e8';
const WRAP_SH = '#bdb8ae';

const D_SKIN = '#c9bdd6';
const D_SKIN_SH = '#9488ab';
const D_ROBE = '#5b1b2f';
const D_ROBE_SH = '#360d1b';
const D_HAIR = '#121018';

const SPLASH = 0;
const EMBER = 1;
const ASH = 2;

/** Figure units: feet at y 0, head top near y -200, facing right */
interface Pose {
  hipX: number;
  hipY: number;
  lean: number;
  gx: number;
  gy: number;
  /** Blade direction, radians in figure space (0 forward, negative up) */
  th: number;
  spin: number;
  nFx: number;
  fFx: number;
}

const GUARD: Pose = { hipX: 0, hipY: -88, lean: 0.06, gx: 26, gy: -122, th: -0.95, spin: 0, nFx: 26, fFx: -26 };
const LOW: Pose = { hipX: -6, hipY: -76, lean: 0.2, gx: -14, gy: -96, th: 2.5, spin: 0, nFx: 36, fFx: -36 };

interface Form {
  dur: number;
  fire: boolean;
  /** Writes the pose at progress k (0..1) */
  at(out: Pose, k: number): void;
}

const setPose = (out: Pose, hipY: number, lean: number, gx: number, gy: number, th: number, spin = 0) => {
  out.hipX = 0;
  out.hipY = hipY;
  out.lean = lean;
  out.gx = gx;
  out.gy = gy;
  out.th = th;
  out.spin = spin;
  out.nFx = 36;
  out.fFx = -34;
};

const FORMS: Form[] = [
  {
    // First Form: Water Surface Slash, one wide horizontal cut
    dur: 0.5,
    fire: false,
    at(o, k) {
      const e = easeInOutCubic(clamp(k * 1.3, 0, 1));
      setPose(o, -80, lerp(-0.1, 0.32, e), lerp(-24, 46, e), lerp(-150, -118, e), lerp(-2.5, 0.75, e));
    },
  },
  {
    // Second Form: Water Wheel, a forward somersault with the blade sweeping a full circle
    dur: 0.75,
    fire: false,
    at(o, k) {
      const e = easeInOutCubic(clamp(k * 1.15, 0, 1));
      setPose(o, -86 - Math.sin(e * Math.PI) * 50, 0.15, 30, -118, -0.4, e * TAU);
    },
  },
  {
    // Fourth Form: Striking Tide, quick flowing cuts back and forth
    dur: 0.8,
    fire: false,
    at(o, k) {
      const keys = [-2.0, 0.9, -1.4, 1.1, -0.9];
      const x = clamp(k * 1.1, 0, 0.999) * (keys.length - 1);
      const i = Math.floor(x);
      const e = easeInOutCubic(x - i);
      const th = lerp(keys[i], keys[i + 1], e);
      setPose(o, -82, 0.25, 30 + Math.cos(th) * 14, -124 + Math.sin(th) * 14, th);
    },
  },
];

/** Hinokami Kagura: a full rising circle of fire */
const SUN: Form = {
  dur: 0.95,
  fire: true,
  at(o, k) {
    const e = easeInOutCubic(clamp(k * 1.15, 0, 1));
    setPose(o, -80 - Math.sin(e * Math.PI) * 12, lerp(0.25, 0.05, e), 24, -122, lerp(2.4, 2.4 - TAU * 0.98, e));
  },
};

interface TrailPt {
  tx: number;
  ty: number;
  bx: number;
  by: number;
  age: number;
}

interface State {
  press: Press;
  /** 0 guard, 1 cutting a form, 2 charging Hinokami */
  mode: number;
  form: Form;
  formIdx: number;
  formT: number;
  hit: boolean;
  lunge: number;
  charge: number;
  fireK: number;
  pose: Pose;
  trail: TrailPt[];
  trailFire: boolean;
  demonHit: number;
  demonBurn: number;
  demonA: number;
  flash: number;
  kick: number;
  demoT: number;
  t: number;
  pool: Pool;
  hum: Hum | null;
  // layout
  k: number;
  tx: number;
  dx: number;
  gy: number;
  portrait: boolean;
  bg: HTMLCanvasElement | null;
  sprites: { fire: HTMLCanvasElement; moon: HTMLCanvasElement; water: HTMLCanvasElement };
  tipX: number;
  tipY: number;
}

/* ---------- backdrop ---------- */

function paintBackdrop(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(s.bg, w, h, dpr);
  s.bg = cv;
  if (!c) return;
  const gy = s.gy;
  const sky = c.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, '#060914');
  sky.addColorStop(0.6, '#13203a');
  sky.addColorStop(1, '#253a52');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const rnd = mulberry(19);
  for (let i = 0; i < (w * gy) / 3000; i++) {
    c.globalAlpha = 0.2 + rnd() * 0.6;
    c.fillStyle = '#fff6e0';
    c.fillRect(rnd() * w, rnd() * gy * 0.6, 1.1, 1.1);
  }
  c.globalAlpha = 1;
  // full moon, flat and pale like a print
  const mx = s.portrait ? w * 0.68 : w * 0.52;
  const my = s.portrait ? h * 0.16 : h * 0.24;
  const mr = Math.min(w, h) * (s.portrait ? 0.16 : 0.16);
  c.drawImage(s.sprites.moon, mx - mr * 2.6, my - mr * 2.6, mr * 5.2, mr * 5.2);
  c.fillStyle = '#f6efd6';
  c.beginPath();
  c.arc(mx, my, mr, 0, TAU);
  c.fill();
  // ink bands of cloud across the moon
  c.fillStyle = '#1a2840';
  for (const [oy, wd] of [
    [0.35, 1.8],
    [0.62, 1.2],
  ]) {
    c.beginPath();
    c.ellipse(mx + mr * 0.2, my + mr * oy, mr * wd, mr * 0.09, 0, 0, TAU);
    c.fill();
  }
  // layered mountains
  for (const [col, base, amp, seed] of [
    ['#1c2c44', gy - h * 0.2, h * 0.14, 3],
    ['#142036', gy - h * 0.1, h * 0.1, 8],
  ] as const) {
    const r = mulberry(seed);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, gy);
    for (let x = 0; x <= w + 40; x += 40) c.lineTo(x, base - Math.abs(Math.sin(x * 0.004 + seed)) * amp - r() * amp * 0.2);
    c.lineTo(w, gy);
    c.closePath();
    c.fill();
  }
  // cedar trees framing the clearing
  const u = Math.min(w, h) / 600;
  const tree = (x: number, base: number, ht: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(x - ht * 0.018, base - ht * 0.3, ht * 0.036, ht * 0.3);
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const y = base - ht * 0.22 - i * ht * 0.13;
      const wd = ht * (0.2 - i * 0.028);
      c.moveTo(x - wd, y);
      c.lineTo(x, y - ht * 0.2);
      c.lineTo(x + wd, y);
    }
    c.fill();
  };
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    if (Math.abs(x - w * 0.5) < w * 0.22) continue;
    tree(x, gy - 6 * u, (120 + rnd() * 120) * u, '#0e182a');
  }
  for (const x of [w * 0.03, w * 0.97, w * 0.1]) tree(x, gy + 10 * u, (260 + rnd() * 80) * u, '#080d18');
  // ground
  const g = c.createLinearGradient(0, gy - 10 * u, 0, h);
  g.addColorStop(0, '#1d2a2a');
  g.addColorStop(1, '#0b1012');
  c.fillStyle = g;
  c.fillRect(0, gy - 4 * u, w, h);
  c.strokeStyle = 'rgba(80,120,100,0.35)';
  c.lineWidth = 1.2;
  for (let i = 0; i < 120; i++) {
    const x = rnd() * w;
    const y = gy + rnd() * (h - gy);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (rnd() - 0.5) * 6 * u, y - (4 + rnd() * 8) * u);
    c.stroke();
  }
  // moonlight pool on the ground
  c.save();
  c.translate(w * 0.5, gy + 20 * u);
  c.scale(1, 0.18);
  const pool = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.4);
  pool.addColorStop(0, 'rgba(200,220,255,0.12)');
  pool.addColorStop(1, 'rgba(200,220,255,0)');
  c.fillStyle = pool;
  c.fillRect(-w * 0.4, -w * 0.4, w * 0.8, w * 0.8);
  c.restore();
}

/* ---------- woodblock water and fire ---------- */

function ribbon(c: C, tr: TrailPt[], fire: boolean, t: number, scale: number, flame: HTMLCanvasElement) {
  const n = tr.length;
  if (n < 3) return;
  const life = fire ? 0.7 : 0.55;
  const fade = (p: TrailPt) => clamp(1 - p.age / life, 0, 1);
  // the band between the blade root and the tip, thinning toward the oldest end
  const edge = (i: number, out: boolean) => {
    const p = tr[i];
    const k = fade(p);
    const swell = (fire ? 1.25 : 1.12) * (0.4 + 0.6 * k);
    const mx = (p.tx + p.bx) / 2;
    const my = (p.ty + p.by) / 2;
    const x = out ? p.tx : p.bx;
    const y = out ? p.ty : p.by;
    return [mx + (x - mx) * swell, my + (y - my) * swell];
  };
  const band = (g: C) => {
    let q = edge(0, true);
    g.moveTo(q[0], q[1]);
    for (let i = 1; i < n; i++) {
      q = edge(i, true);
      g.lineTo(q[0], q[1]);
    }
    for (let i = n - 1; i >= 0; i--) {
      q = edge(i, false);
      g.lineTo(q[0], q[1]);
    }
    g.closePath();
  };
  const a = fade(tr[n - 1]);
  if (a <= 0) return;
  const lw = Math.max(1.5, 3 * scale);
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (fire) {
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i += 2) {
      const p = tr[i];
      c.globalAlpha = fade(p) * 0.5;
      c.drawImage(flame, p.tx - 60 * scale, p.ty - 60 * scale, 120 * scale, 120 * scale);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  c.globalAlpha = Math.min(1, a * 1.4);
  inked(c, band, fire ? '#e2401c' : '#1d4f9c', fire ? '#3a0c06' : '#0b1d3f', lw);
  within(c, band, () => {
    // printed stripes running along the wave
    for (const [k0, col, wd] of fire
      ? ([
          [0.82, '#ff8a2a', 7],
          [0.62, '#ffc845', 4],
          [0.4, '#ff8a2a', 3],
        ] as const)
      : ([
          [0.85, '#4c8fe0', 7],
          [0.66, '#8cc4f4', 3],
          [0.46, '#3a76c8', 3],
          [0.28, '#8cc4f4', 2],
        ] as const)) {
      c.strokeStyle = col;
      c.lineWidth = wd * scale;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const o = edge(i, true);
        const b = edge(i, false);
        const x = lerp(b[0], o[0], k0);
        const y = lerp(b[1], o[1], k0);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  });
  // the crest: white foam claws (water) or curling flame tongues (fire) off the outer edge
  for (let i = 2; i < n - 1; i += 3) {
    const p = tr[i];
    const f = fade(p);
    if (f <= 0.05) continue;
    const o = edge(i, true);
    const o2 = edge(i - 2, true);
    const b = edge(i, false);
    let nx = o[0] - b[0];
    let ny = o[1] - b[1];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    let tx = o[0] - o2[0];
    let ty = o[1] - o2[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const sz = (fire ? 16 : 13) * scale * (0.6 + 0.4 * f) * (1 + 0.25 * Math.sin(i * 1.7 + t * (fire ? 14 : 4)));
    c.globalAlpha = Math.min(1, f * 1.3);
    if (fire) {
      // tongue of flame curling back
      const tipX = o[0] + nx * sz * 1.6 - tx * sz * 0.6;
      const tipY = o[1] + ny * sz * 1.6 - ty * sz * 0.6;
      inked(
        c,
        (g) => {
          g.moveTo(o[0] - tx * sz * 0.6, o[1] - ty * sz * 0.6);
          g.quadraticCurveTo(o[0] + nx * sz * 1.2 + tx * sz * 0.6, o[1] + ny * sz * 1.2 + ty * sz * 0.6, tipX, tipY);
          g.quadraticCurveTo(o[0] + nx * sz * 0.6 + tx * sz * 0.2, o[1] + ny * sz * 0.6 + ty * sz * 0.2, o[0] + tx * sz * 0.6, o[1] + ty * sz * 0.6);
          g.closePath();
        },
        '#ffb23a',
        '#3a0c06',
        lw * 0.7
      );
      inked(c, (g) => g.arc(o[0] + nx * sz * 0.5, o[1] + ny * sz * 0.5, sz * 0.22, 0, TAU), '#fff1a8', null, 0);
    } else {
      // foam claw: a hooked curl with little fingers
      const cx = o[0] + nx * sz * 0.4;
      const cy = o[1] + ny * sz * 0.4;
      const ang = Math.atan2(ny, nx);
      c.strokeStyle = '#0b1d3f';
      c.lineWidth = lw * 1.9;
      c.beginPath();
      c.arc(cx, cy, sz * 0.7, ang - 1.6, ang + 1.8);
      c.stroke();
      c.strokeStyle = '#ffffff';
      c.lineWidth = lw * 1.1;
      c.beginPath();
      c.arc(cx, cy, sz * 0.7, ang - 1.6, ang + 1.8);
      c.stroke();
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#0b1d3f';
      c.lineWidth = lw * 0.6;
      for (let j = -1; j <= 1; j++) {
        const fa = ang + j * 0.6;
        const fx = cx + Math.cos(fa) * sz * 0.95;
        const fy = cy + Math.sin(fa) * sz * 0.95;
        c.beginPath();
        c.arc(fx, fy, sz * 0.2, 0, TAU);
        c.fill();
        c.stroke();
      }
    }
  }
  c.restore();
  c.globalAlpha = 1;
}

/* ---------- Tanjiro ---------- */

const J = [0, 0, 0, 0];

function checker(c: C, size: number, ang: number) {
  c.save();
  c.fillStyle = GREEN;
  c.fillRect(-400, -400, 800, 800);
  c.rotate(ang);
  c.fillStyle = BLACK;
  for (let y = -300; y < 300; y += size)
    for (let x = -300; x < 300; x += size) if (((Math.round(x / size) + Math.round(y / size)) & 1) === 0) c.fillRect(x, y, size, size);
  c.restore();
}

function drawTanjiro(c: C, s: State, t: number) {
  const p = s.pose;
  const k = s.k;
  c.save();
  c.translate(s.tx + s.lunge * (s.dx - s.tx) * (s.portrait ? 0.22 : 0.42), s.gy);
  c.scale(k, k);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const lw = 2.4;
  if (p.spin) {
    c.translate(p.hipX, p.hipY - 20);
    c.rotate(p.spin);
    c.translate(-p.hipX, -(p.hipY - 20));
  }
  const nkX = p.hipX + Math.sin(p.lean) * 56;
  const nkY = p.hipY - Math.cos(p.lean) * 56;
  const gx = p.gx + p.hipX;
  const gy = p.gy - (-88 - p.hipY) * 0.6;
  const dX = Math.cos(p.th);
  const dY = Math.sin(p.th);
  const fireK = s.fireK;

  // far leg
  const leg = (hx: number, hy: number, fx: number, near: boolean) => {
    elbow(J, hx, hy, fx, -4, 44, 46, near ? -1 : -1);
    const kx = J[0];
    const ky = J[1];
    cel(c, (g) => capsule(g, hx, hy, 12, kx, ky, 10), near ? UNIFORM : UNIFORM_SH, UNIFORM_SH, -2, -2, INK, lw);
    // white leg wraps from knee to ankle
    cel(c, (g) => capsule(g, kx, ky, 9.5, fx, -6, 7), WRAP, WRAP_SH, -2, -2, INK, lw);
    c.strokeStyle = WRAP_SH;
    c.lineWidth = 1.2;
    c.beginPath();
    for (let i = 1; i < 5; i++) {
      const x = lerp(kx, fx, i / 5);
      const y = lerp(ky, -6, i / 5);
      c.moveTo(x - 8, y - 3);
      c.lineTo(x + 8, y + 3);
    }
    c.stroke();
    // straw sandal
    inked(c, (g) => g.ellipse(fx + 6, -2, 13, 3.5, 0, 0, TAU), '#c8a46a', INK, lw * 0.8);
  };
  leg(p.hipX - 6, p.hipY, p.fFx, false);

  // far arm reaching the hilt
  const fhx = gx - dX * 14;
  const fhy = gy - dY * 14;
  const arm = (sx: number, sy: number, hx: number, hy: number, near: boolean) => {
    elbow(J, sx, sy, hx, hy, 30, 30, near ? 1 : 1);
    const ex = J[0];
    const ey = J[1];
    // wide checkered haori sleeve
    const sleeve = (g: C) => capsule(g, sx, sy, 11, ex, ey, 10.5);
    within(c, sleeve, () => checker(c, 7, p.lean));
    c.beginPath();
    sleeve(c);
    c.strokeStyle = INK;
    c.lineWidth = lw;
    c.stroke();
    cel(c, (g) => capsule(g, ex, ey, 7, hx, hy, 6), UNIFORM, UNIFORM_SH, -1, -1, INK, lw);
    cel(c, (g) => g.arc(hx, hy, 6.5, 0, TAU), SKIN, SKIN_SH, -1, -1, INK, lw);
  };
  arm(nkX - 10, nkY + 6, fhx, fhy, false);

  // haori body: checkered coat open over the black uniform
  const coat = (g: C) => {
    g.moveTo(nkX - 16, nkY + 2);
    g.quadraticCurveTo(nkX, nkY - 4, nkX + 15, nkY + 3);
    g.lineTo(p.hipX + 24, p.hipY + 32);
    g.lineTo(p.hipX - 28, p.hipY + 34);
    g.closePath();
  };
  within(c, coat, () => checker(c, 8, p.lean));
  c.beginPath();
  coat(c);
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.stroke();
  // uniform showing through the open front, belt
  inked(
    c,
    (g) => {
      g.moveTo(nkX + 2, nkY + 2);
      g.lineTo(nkX + 14, nkY + 4);
      g.lineTo(p.hipX + 20, p.hipY + 30);
      g.lineTo(p.hipX + 6, p.hipY + 30);
      g.closePath();
    },
    UNIFORM,
    INK,
    lw * 0.8
  );
  c.save();
  c.translate(p.hipX + 12, p.hipY - 2);
  c.rotate(p.lean);
  inked(c, (g) => g.rect(-8, -3, 14, 6), WRAP, INK, 1.4);
  c.restore();
  leg(p.hipX + 6, p.hipY + 2, p.nFx, true);

  // head
  const hx = nkX + 4 + Math.sin(p.lean) * 8;
  const hy = nkY - 22;
  cel(c, (g) => capsule(g, nkX, nkY + 2, 6, hx - 2, hy + 10, 6), SKIN, SKIN_SH, -1, -1, INK, lw);
  // spiky hair behind the face
  const hairBack = (g: C) => {
    const pts = [-22, 0, -30, -8, -22, -14, -30, -24, -16, -24, -18, -34, -6, -28, 0, -36, 6, -27, 18, -30, 14, -20, 24, -16, 16, -10];
    g.moveTo(hx + pts[0], hy + pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(hx + pts[i], hy + pts[i + 1]);
    g.lineTo(hx + 10, hy - 4);
    g.lineTo(hx - 12, hy + 12);
    g.closePath();
  };
  const hairGrad = c.createLinearGradient(hx, hy - 36, hx, hy + 6);
  hairGrad.addColorStop(0, HAIR_TIP);
  hairGrad.addColorStop(0.45, HAIR);
  hairGrad.addColorStop(1, '#2a0a0e');
  inked(c, hairBack, hairGrad, INK, lw);
  const face = (g: C) => {
    g.moveTo(hx - 13, hy - 12);
    g.quadraticCurveTo(hx + 4, hy - 20, hx + 17, hy - 8);
    g.quadraticCurveTo(hx + 20, hy + 4, hx + 14, hy + 13);
    g.quadraticCurveTo(hx + 6, hy + 20, hx - 2, hy + 18);
    g.quadraticCurveTo(hx - 12, hy + 12, hx - 13, hy - 12);
    g.closePath();
  };
  cel(c, face, SKIN, SKIN_SH, 2, -2, INK, lw);
  // ear with a hanafuda earring: white card, red rising sun
  cel(c, (g) => g.ellipse(hx - 9, hy + 1, 3.5, 5, 0, 0, TAU), SKIN, SKIN_SH, 1, -1, INK, lw * 0.7);
  const swing = Math.sin(t * 3) * 0.08 + p.lean * 0.3;
  c.save();
  c.translate(hx - 9, hy + 6);
  c.rotate(swing);
  inked(c, (g) => g.rect(-3.5, 1, 7, 12), '#fbf6ea', INK, 1.2);
  c.fillStyle = '#d92c2c';
  c.beginPath();
  c.arc(0, 5, 2.6, 0, TAU);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 0.6;
  c.beginPath();
  for (const ly of [9, 10.5, 12]) {
    c.moveTo(-3.5, ly);
    c.lineTo(3.5, ly);
  }
  c.stroke();
  c.restore();
  // bangs falling over the forehead
  inked(
    c,
    (g) => {
      g.moveTo(hx - 14, hy - 10);
      g.lineTo(hx - 8, hy - 2);
      g.lineTo(hx - 4, hy - 10);
      g.lineTo(hx + 3, hy - 1);
      g.lineTo(hx + 6, hy - 11);
      g.lineTo(hx + 14, hy - 4);
      g.lineTo(hx + 17, hy - 12);
      g.quadraticCurveTo(hx + 4, hy - 26, hx - 14, hy - 10);
      g.closePath();
    },
    hairGrad,
    INK,
    lw * 0.9
  );
  // the scar on his forehead, flaring like fire under Hinokami
  c.fillStyle = fireK > 0.3 ? '#e2401c' : '#8e2a2a';
  c.beginPath();
  c.moveTo(hx + 8, hy - 9);
  c.quadraticCurveTo(hx + 13, hy - 12, hx + 15, hy - 7);
  c.quadraticCurveTo(hx + 12, hy - 8, hx + 11, hy - 4);
  c.quadraticCurveTo(hx + 9, hy - 7, hx + 8, hy - 9);
  c.fill();
  // determined eyes: dark red irises, heavy upper lids
  for (const [ex, sz] of [
    [hx + 3, 1],
    [hx + 13, 0.8],
  ]) {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(ex, hy + 1, 3.6 * sz, 3.4, 0, 0, TAU);
    c.fill();
    const ir = c.createRadialGradient(ex + 0.6, hy + 1.5, 0.2, ex + 0.6, hy + 1.5, 2.8);
    ir.addColorStop(0, '#2b0a10');
    ir.addColorStop(0.4, '#8c1d2a');
    ir.addColorStop(1, '#c84a3a');
    c.fillStyle = ir;
    c.beginPath();
    c.arc(ex + 0.6, hy + 1.6, 2.7 * sz, 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(ex - 0.4, hy + 0.4, 0.8, 0, TAU);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(ex - 4 * sz, hy - 1);
    c.quadraticCurveTo(ex, hy - 3.4, ex + 4 * sz, hy - 1.4);
    c.stroke();
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(ex - 4 * sz, hy - 5.6);
    c.lineTo(ex + 4 * sz, hy - 4);
    c.stroke();
  }
  c.strokeStyle = INK;
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(hx + 7, hy + 12);
  c.quadraticCurveTo(hx + 10, hy + 11 + fireK * 2, hx + 13, hy + 12);
  c.stroke();

  // the sword: black Nichirin blade, round guard, wrapped hilt
  const bl = 118;
  const glowK = fireK;
  c.save();
  c.translate(gx, gy);
  c.rotate(p.th);
  inked(c, (g) => g.rect(-28, -3.4, 26, 6.8), '#2a2a34', INK, 1.5);
  c.strokeStyle = '#d8d2c0';
  c.lineWidth = 1;
  c.beginPath();
  for (let x = -26; x < -4; x += 5) {
    c.moveTo(x, -3);
    c.lineTo(x + 3, 3);
  }
  c.stroke();
  inked(c, (g) => g.ellipse(0, 0, 3, 9, 0, 0, TAU), '#1a1a20', INK, 1.5);
  const blade = (g: C) => {
    g.moveTo(3, -2.8);
    g.lineTo(bl - 8, -2.2);
    g.lineTo(bl, 1.5);
    g.lineTo(3, 2.6);
    g.closePath();
  };
  const bg = c.createLinearGradient(0, -3, 0, 3);
  bg.addColorStop(0, glowK > 0.05 ? `rgb(${lerp(26, 255, glowK) | 0},${lerp(26, 120, glowK) | 0},${lerp(32, 40, glowK) | 0})` : '#1a1a22');
  bg.addColorStop(0.55, glowK > 0.05 ? `rgb(${lerp(40, 255, glowK) | 0},${lerp(40, 200, glowK) | 0},80)` : '#3a3a48');
  bg.addColorStop(1, '#0d0d12');
  inked(c, blade, bg, INK, 1.4);
  c.strokeStyle = glowK > 0.05 ? '#fff1b0' : '#9ab0d8';
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(8, 1.6);
  c.lineTo(bl - 6, 0.8);
  c.stroke();
  c.restore();

  arm(nkX + 6, nkY + 7, gx, gy, true);
  c.restore();

  // world space blade points for the trail
  const ox = s.tx + s.lunge * (s.dx - s.tx) * (s.portrait ? 0.22 : 0.42);
  const toWorld = (lx: number, ly: number): [number, number] => {
    let x = lx;
    let y = ly;
    if (p.spin) {
      const cx = p.hipX;
      const cy = p.hipY - 20;
      const ca = Math.cos(p.spin);
      const sa = Math.sin(p.spin);
      const rx = x - cx;
      const ry = y - cy;
      x = cx + rx * ca - ry * sa;
      y = cy + rx * sa + ry * ca;
    }
    return [ox + x * k, s.gy + y * k];
  };
  const tip = toWorld(gx + dX * bl, gy + dY * bl);
  const root = toWorld(gx + dX * bl * 0.3, gy + dY * bl * 0.3);
  s.tipX = tip[0];
  s.tipY = tip[1];
  return root;
}

/* ---------- the demon ---------- */

function drawDemon(c: C, s: State, t: number) {
  if (s.demonA <= 0.01) return;
  const k = s.k * 1.18;
  const hitX = Math.sin(s.demonHit * 30) * s.demonHit * 10;
  c.save();
  c.globalAlpha = s.demonA;
  c.translate(s.dx + hitX * k + s.demonHit * 14 * k, s.gy);
  c.scale(-k, k);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const lw = 2.4;
  const sway = Math.sin(t * 1.3) * 3;
  const hY = -86;
  // legs, thin and bare below the robe
  for (const [fx, sh] of [
    [-20, D_SKIN_SH],
    [22, D_SKIN],
  ] as const) {
    cel(c, (g) => capsule(g, fx * 0.4, hY + 20, 9, fx, -4, 6), sh, D_SKIN_SH, -2, -2, INK, lw);
    inked(
      c,
      (g) => {
        g.moveTo(fx - 6, -6);
        g.lineTo(fx + 14, -4);
        g.lineTo(fx + 18, 0);
        g.lineTo(fx - 6, 0);
        g.closePath();
      },
      sh,
      INK,
      lw * 0.8
    );
  }
  // wild hair behind
  inked(
    c,
    (g) => {
      g.moveTo(-6 + sway, -196);
      g.bezierCurveTo(-60 + sway, -190, -70, -120, -56 + sway * 2, -70);
      g.lineTo(-40, -96);
      g.lineTo(-46 + sway, -60);
      g.bezierCurveTo(-26, -100, -20, -150, 0, -160);
      g.lineTo(20, -150);
      g.bezierCurveTo(30, -170, 20, -196, -6 + sway, -196);
      g.closePath();
    },
    D_HAIR,
    INK,
    lw
  );
  // tattered robe
  const robe = (g: C) => {
    g.moveTo(-26, -150 + sway * 0.3);
    g.quadraticCurveTo(0, -158, 28, -148 + sway * 0.3);
    g.lineTo(34, -40);
    g.lineTo(26, -30);
    g.lineTo(18, -44);
    g.lineTo(8, -26);
    g.lineTo(-4, -42);
    g.lineTo(-16, -28);
    g.lineTo(-24, -44);
    g.lineTo(-34, -34);
    g.closePath();
  };
  cel(c, robe, D_ROBE, D_ROBE_SH, 4, -3, INK, lw);
  c.strokeStyle = D_ROBE_SH;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-4, -150);
  c.lineTo(10, -96);
  c.lineTo(-2, -50);
  c.stroke();
  inked(c, (g) => g.rect(-28, -100, 60, 9), '#1a0d14', INK, 1.6);
  // arms raised with long claws
  const claw = (sx: number, sy: number, hx: number, hy: number, front: boolean) => {
    elbow(J, sx, sy, hx, hy, 40, 40, front ? -1 : 1);
    const ex = J[0];
    const ey = J[1];
    cel(c, (g) => capsule(g, sx, sy, 8, ex, ey, 6.5), front ? D_SKIN : D_SKIN_SH, D_SKIN_SH, -1, -2, INK, lw);
    cel(c, (g) => capsule(g, ex, ey, 6.5, hx, hy, 5.5), front ? D_SKIN : D_SKIN_SH, D_SKIN_SH, -1, -2, INK, lw);
    const a = Math.atan2(hy - ey, hx - ex);
    for (let i = -1; i <= 1; i++) {
      const ca = a + i * 0.35;
      inked(
        c,
        (g) => {
          g.moveTo(hx + Math.cos(ca + 1.4) * 3, hy + Math.sin(ca + 1.4) * 3);
          g.quadraticCurveTo(hx + Math.cos(ca) * 18, hy + Math.sin(ca) * 18, hx + Math.cos(ca - 0.3) * 26, hy + Math.sin(ca - 0.3) * 26);
          g.lineTo(hx + Math.cos(ca - 1.4) * 3, hy + Math.sin(ca - 1.4) * 3);
          g.closePath();
        },
        '#e8e0f0',
        INK,
        1.2
      );
    }
  };
  claw(-14, -142, 30 + sway, -176, false);
  // head: horns, burning eyes, wide fanged grin
  const hx = 8;
  const hy = -170 + sway * 0.4;
  for (const sx of [-1, 1]) {
    inked(
      c,
      (g) => {
        g.moveTo(hx + sx * 8, hy - 14);
        g.quadraticCurveTo(hx + sx * 18, hy - 34, hx + sx * 10 + 6, hy - 48);
        g.quadraticCurveTo(hx + sx * 12, hy - 30, hx + sx * 2, hy - 16);
        g.closePath();
      },
      '#e9dcc8',
      INK,
      lw * 0.8
    );
  }
  const head = (g: C) => g.ellipse(hx, hy, 16, 20, 0.1, 0, TAU);
  cel(c, head, D_SKIN, D_SKIN_SH, -3, -2, INK, lw);
  // veined markings
  c.strokeStyle = '#7a2238';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(hx - 12, hy - 8);
  c.lineTo(hx - 6, hy - 2);
  c.lineTo(hx - 10, hy + 6);
  c.moveTo(hx + 14, hy - 6);
  c.lineTo(hx + 8, hy);
  c.stroke();
  const rage = clamp(s.demonHit * 2, 0, 1);
  for (const ex of [hx - 5, hx + 8]) {
    c.fillStyle = '#ffd23a';
    c.beginPath();
    c.ellipse(ex, hy - 3, 4.4, 2.8 + rage, -0.2, 0, TAU);
    c.fill();
    c.fillStyle = '#b3121f';
    c.beginPath();
    c.ellipse(ex + 0.5, hy - 3, 1, 2.6, 0, 0, TAU);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(ex - 5, hy - 7);
    c.lineTo(ex + 5, hy - 4);
    c.stroke();
  }
  inked(
    c,
    (g) => {
      g.moveTo(hx - 9, hy + 8);
      g.quadraticCurveTo(hx + 2, hy + 16 + rage * 4, hx + 13, hy + 7);
      g.quadraticCurveTo(hx + 2, hy + 11, hx - 9, hy + 8);
      g.closePath();
    },
    '#3a0a14',
    INK,
    1.2
  );
  c.fillStyle = '#ffffff';
  for (const fx of [hx - 5, hx + 1, hx + 7]) {
    c.beginPath();
    c.moveTo(fx - 1.5, hy + 9);
    c.lineTo(fx, hy + 13);
    c.lineTo(fx + 1.5, hy + 9);
    c.fill();
  }
  claw(16, -140, 54 - sway, -120, true);
  c.restore();
  c.globalAlpha = 1;
}

/* ---------- actions ---------- */

function startForm(s: State, env: SceneEnv, f: Form) {
  s.mode = 1;
  s.form = f;
  s.formT = 0;
  s.hit = false;
  s.trail.length = 0;
  s.trailFire = f.fire;
  const bus = s.press.touched ? env.audio() : null;
  if (bus) {
    if (f.fire) {
      noise(bus, { duration: 0.9, freq: 700, q: 0.5, gain: 0.3 });
      tone(bus, 220, { type: 'sawtooth', glideTo: 110, decay: 0.8, gain: 0.08 });
    } else {
      noise(bus, { duration: 0.45, freq: 1800, q: 0.7, gain: 0.18 });
      tone(bus, 880, { type: 'sine', glideTo: 440, decay: 0.3, gain: 0.04 });
    }
  }
}

function strike(s: State, env: SceneEnv) {
  s.hit = true;
  const fire = s.form.fire;
  const k = s.k;
  const x = s.dx;
  const y = s.gy - 120 * k;
  if (fire) {
    s.demonBurn = 0.001;
    s.flash = env.reducedMotion ? 0.4 : 0.8;
    s.kick = 1;
    for (let i = 0; i < 60; i++) emit(s.pool, x + rand(-30, 30) * k, y + rand(-90, 110) * k, rand(-40, 40) * k, -rand(20, 120) * k, rand(1.2, 2.6), rand(2, 5) * k, ASH, 0.8, -20 * k);
    for (let i = 0; i < 40; i++) emit(s.pool, x + rand(-30, 30) * k, y + rand(-90, 110) * k, rand(-160, 160) * k, -rand(40, 240) * k, rand(0.5, 1.2), rand(1.5, 3.5) * k, EMBER, 1.5, -40 * k);
  } else {
    s.demonHit = 1;
    s.kick = Math.max(s.kick, 0.4);
    for (let i = 0; i < 26; i++) emit(s.pool, x + rand(-20, 20) * k, y + rand(-40, 40) * k, rand(-260, 120) * k, -rand(60, 300) * k, rand(0.5, 1), rand(2, 5) * k, SPLASH, 0.5, 700 * k);
  }
  const bus = s.press.touched ? env.audio() : null;
  if (bus) {
    if (fire) {
      tone(bus, 90, { type: 'sine', glideTo: 35, decay: 1.4, gain: 0.3 });
      noise(bus, { duration: 1.6, freq: 400, type: 'lowpass', gain: 0.35 });
    } else {
      noise(bus, { duration: 0.25, freq: 2600, q: 1.2, gain: 0.16 });
      tone(bus, 1320, { type: 'triangle', decay: 0.2, gain: 0.04 });
    }
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 2.1,
    init: () => {
      const sprites = {
        fire: glowSprite(128, [
          [0, 'rgba(255,240,180,0.9)'],
          [0.25, 'rgba(255,140,40,0.5)'],
          [0.6, 'rgba(220,50,10,0.15)'],
          [1, 'rgba(160,20,0,0)'],
        ]),
        moon: glowSprite(128, [
          [0, 'rgba(240,235,210,0.5)'],
          [0.4, 'rgba(160,180,220,0.15)'],
          [1, 'rgba(80,100,160,0)'],
        ]),
        water: glowSprite(64, [
          [0, 'rgba(180,220,255,0.7)'],
          [1, 'rgba(60,120,220,0)'],
        ]),
      };
      return {
        press: makePress(),
        mode: 0,
        form: FORMS[0],
        formIdx: -1,
        formT: 0,
        hit: false,
        lunge: 0,
        charge: 0,
        fireK: 0,
        pose: { ...GUARD },
        trail: [],
        trailFire: false,
        demonHit: 0,
        demonBurn: 0,
        demonA: 1,
        flash: 0,
        kick: 0,
        demoT: 0,
        t: 0,
        pool: makePool(360),
        hum: null,
        k: 1,
        tx: 0,
        dx: 0,
        gy: 0,
        portrait: false,
        bg: null,
        sprites,
        tipX: 0,
        tipY: 0,
      };
    },
    resize: (s, env) => {
      const { w, h } = env;
      s.portrait = h > w * 1.1;
      if (s.portrait) {
        s.k = Math.min((h * 0.3) / 210, (w * 0.42) / 130);
        s.gy = h * 0.72;
        s.tx = w * 0.27;
        s.dx = w * 0.76;
      } else {
        s.k = (h * 0.5) / 210;
        s.gy = h * 0.86;
        s.tx = w * 0.3;
        s.dx = w * 0.7;
      }
      paintBackdrop(s, env);
    },
    update: (s, env, dt, t) => {
      s.t = t;
      const rm = env.reducedMotion;
      const p = s.press;
      const demo = !p.touched && (!env.interactive || rm);
      if (demo) {
        s.demoT += dt;
        const ph = s.demoT % 8;
        const was = p.key;
        p.key = (ph > 0.3 && ph < 0.4) || (ph > 1.3 && ph < 1.4) || (ph > 2.6 && ph < 4.4);
        if (p.key && !was) p.began = true;
      }
      const down = stepPress(p, dt, 0.25);
      if (p.tapped && s.mode !== 1) {
        s.formIdx = (s.formIdx + 1) % FORMS.length;
        startForm(s, env, FORMS[s.formIdx]);
      }
      if (p.long && s.mode === 0) {
        s.mode = 2;
        s.charge = 0;
      }
      if (s.mode === 2 && !down) startForm(s, env, SUN);
      if (rm && p.touched && (s.mode !== 0 || s.trail.length || s.demonBurn > 0)) env.wake(300);

      // pose
      const target: Pose = { ...GUARD };
      if (s.mode === 1) {
        s.formT += dt;
        const k = s.formT / s.form.dur;
        s.form.at(target, k);
        s.lunge = damp(s.lunge, k < 0.85 ? 1 : 0, 12, dt);
        for (const key of Object.keys(target) as (keyof Pose)[]) s.pose[key] = target[key];
        if (!s.hit && k > (s.form.fire ? 0.45 : 0.4) && s.demonA > 0.5) strike(s, env);
        if (k >= 1) {
          s.mode = 0;
          s.pose.spin = 0;
        }
      } else {
        s.lunge = damp(s.lunge, 0, 6, dt);
        const tgt = s.mode === 2 ? LOW : GUARD;
        const breath = Math.sin(t * 2) * 1.2;
        for (const key of Object.keys(tgt) as (keyof Pose)[]) s.pose[key] = damp(s.pose[key], tgt[key] + (key === 'hipY' ? breath : 0), 10, dt);
        s.pose.spin = 0;
      }
      if (s.mode === 2) s.charge = Math.min(1, s.charge + dt * 0.9);
      const burning = s.mode === 2 || (s.mode === 1 && s.form.fire);
      s.fireK = damp(s.fireK, burning ? (s.mode === 2 ? 0.4 + 0.6 * s.charge : 1) : 0, burning ? 6 : 2.5, dt);

      // blade trail
      for (const tp of s.trail) tp.age += dt;
      while (s.trail.length && s.trail[0].age > 0.75) s.trail.shift();

      // demon reactions
      s.demonHit = Math.max(0, s.demonHit - dt * 2.5);
      if (s.demonBurn > 0) {
        s.demonBurn += dt;
        s.demonA = Math.max(0, 1 - s.demonBurn * 1.4);
        if (s.demonBurn < 0.8 && dt > 0)
          for (let i = 0; i < 3; i++) emit(s.pool, s.dx + rand(-30, 30) * s.k, s.gy - rand(0, 220) * s.k, rand(-20, 20) * s.k, -rand(20, 80) * s.k, rand(1, 2.2), rand(2, 4.5) * s.k, ASH, 0.6, -15 * s.k);
        if (s.demonBurn > 4.5) s.demonBurn = 0;
      } else s.demonA = Math.min(1, s.demonA + dt * 0.7);

      // fire swirling around him while Hinokami builds
      if (s.fireK > 0.2 && dt > 0 && Math.random() < s.fireK) {
        const a = rand(0, TAU);
        const r = rand(30, 70) * s.k;
        emit(s.pool, s.tx + Math.cos(a) * r, s.gy - 90 * s.k + Math.sin(a) * r * 1.2, -Math.sin(a) * 80 * s.k, -rand(40, 120) * s.k, rand(0.4, 0.9), rand(1.5, 3.5) * s.k, EMBER, 1, -30 * s.k);
      }
      stepPool(s.pool, dt);
      s.flash = Math.max(0, s.flash - dt * 1.8);
      s.kick = Math.max(0, s.kick - dt * 2);

      // charge hum
      if (s.mode === 2 && !s.hum && p.touched) {
        const bus = env.audio();
        if (bus) s.hum = startHum(bus, { type: 'sawtooth', freq: 60, cutoff: 400, noiseAmt: 0.6 });
      }
      if (s.hum) {
        if (s.mode === 2) setHum(s.hum, 60 + 50 * s.charge, 0.05 + 0.1 * s.charge, 400 + 1400 * s.charge);
        else {
          stopHum(s.hum);
          s.hum = null;
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx: c, w, h } = env;
      const amp = env.reducedMotion ? 0 : s.kick * 10 * s.k;
      c.save();
      c.translate(shakeX(amp, t), shakeY(amp, t));
      if (s.bg) c.drawImage(s.bg, -20, -20, w + 40, h + 40);

      // warm firelight floods the clearing under Hinokami
      if (s.fireK > 0.02) {
        c.globalCompositeOperation = 'lighter';
        glow(c, s.sprites.fire, s.tx, s.gy - 90 * s.k, 260 * s.k, s.fireK * 0.55);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }
      // ground shadows
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (const x of [s.tx + s.lunge * (s.dx - s.tx) * (s.portrait ? 0.22 : 0.42), s.dx]) {
        c.beginPath();
        c.ellipse(x, s.gy + 2, 50 * s.k, 7 * s.k, 0, 0, TAU);
        c.fill();
      }

      drawDemon(c, s, t);
      // burning: the demon crumbles from the edges into embers
      if (s.demonBurn > 0 && s.demonBurn < 1) {
        c.globalCompositeOperation = 'lighter';
        glow(c, s.sprites.fire, s.dx, s.gy - 110 * s.k, 200 * s.k, (1 - s.demonBurn) * 0.9);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }

      const root = drawTanjiro(c, s, t);
      if (s.mode === 1) {
        s.trail.push({ tx: s.tipX, ty: s.tipY, bx: root[0], by: root[1], age: 0 });
        if (s.trail.length > 70) s.trail.shift();
      }
      ribbon(c, s.trail, s.trailFire, t, s.k, s.sprites.fire);

      // flames hugging the blade while charging
      if (s.mode === 2 && s.fireK > 0.05) {
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const q = (t * 2.5 + i / 5) % 1;
          glow(c, s.sprites.fire, s.tipX + Math.sin(t * 9 + i) * 8 * s.k, s.tipY - q * 40 * s.k, (24 + 20 * s.charge) * s.k * (1 - q * 0.5), s.fireK * (1 - q));
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
        // a ring of printed flame around him, building with the charge
        const cx = s.tx;
        const cy = s.gy - 92 * s.k;
        const R = (70 + 20 * s.charge) * s.k;
        const n = 14;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + t * 1.8;
          const fx = cx + Math.cos(a) * R;
          const fy = cy + Math.sin(a) * R * 1.15;
          const sz = (8 + 10 * s.charge) * s.k * (0.8 + 0.3 * Math.sin(t * 12 + i * 2));
          c.globalAlpha = s.fireK * 0.95;
          inked(
            c,
            (g) => {
              g.moveTo(fx - sz * 0.6, fy + sz * 0.4);
              g.quadraticCurveTo(fx - sz * 0.8, fy - sz * 0.8, fx + sz * 0.2, fy - sz * 1.8);
              g.quadraticCurveTo(fx + sz * 0.1, fy - sz * 0.6, fx + sz * 0.7, fy - sz * 0.3);
              g.quadraticCurveTo(fx + sz * 0.8, fy + sz * 0.5, fx - sz * 0.6, fy + sz * 0.4);
              g.closePath();
            },
            i % 2 ? '#ff8a2a' : '#e2401c',
            '#3a0c06',
            Math.max(1, 1.6 * s.k)
          );
        }
        c.globalAlpha = 1;
      }

      // particles
      for (const pt of s.pool.items) {
        if (pt.life <= 0) continue;
        const q = pt.life / pt.max;
        if (pt.kind === SPLASH) {
          c.globalAlpha = q;
          c.fillStyle = '#ffffff';
          c.strokeStyle = '#1d4f9c';
          c.lineWidth = 1.2;
          c.beginPath();
          c.arc(pt.x, pt.y, pt.size, 0, TAU);
          c.fill();
          c.stroke();
        } else if (pt.kind === EMBER) {
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = q;
          c.fillStyle = q > 0.5 ? '#ffd27a' : '#ff6a2a';
          c.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
          c.globalCompositeOperation = 'source-over';
        } else {
          c.globalAlpha = q * 0.9;
          c.save();
          c.translate(pt.x, pt.y);
          c.rotate(pt.rot);
          c.fillStyle = q > 0.7 ? '#ff7a3a' : '#2a2026';
          c.fillRect(-pt.size, -pt.size * 0.5, pt.size * 2, pt.size);
          c.restore();
        }
      }
      c.globalAlpha = 1;
      c.restore();

      if (s.flash > 0) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(255,160,60,${(s.flash * 0.5).toFixed(3)})`;
        c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
      }
      // paper grain vignette
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = v;
      c.fillRect(0, 0, w, h);
    },
    onPointerDown: (s) => pressDown(s.press, 'pointer'),
    onPointerUp: (s) => {
      s.press.pointer = false;
    },
    onKey: (s, _env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (e.repeat && down) return true;
      if (down) pressDown(s.press, 'key');
      else s.press.key = false;
      return true;
    },
    dispose: (s) => {
      stopHum(s.hum);
      s.hum = null;
      freeCanvas(s.bg);
    },
  });
