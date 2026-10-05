import { createCanvasScene, clamp, easeOutBack, easeOutCubic, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';

/**
 * Arise: a shadow monarch backlit by a violet moon, raising an army out of the ground.
 * Polish over the original: a cached moonlit backdrop with a ruined skyline, a monarch with
 * a long coat, daggers and a flame aura, and soldiers (knight, horned brute, spearman) that
 * rise with an eased climb out of dark portal pools trailing smoke and purple flame. Eyes
 * ignite and blink, the army is capped and the oldest soldier sinks back into shadow.
 */

interface Soldier {
  x: number;
  y: number;
  /** 0 far (horizon) .. 1 near */
  k: number;
  variant: number;
  face: 1 | -1;
  born: number;
  /** Scene time the soldier started sinking, or -1 */
  dying: number;
  blinkIn: number;
  blink: number;
  phase: number;
  wisp: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  kind: number; // 0 smoke, 1 flame, 2 ember
}

interface State {
  soldiers: Soldier[];
  parts: Particle[];
  nextPart: number;
  now: number;
  auraAcc: number;
  autoIn: number;
  idle: number;
  boom: number;
  // layout
  s: number;
  cx: number;
  hy: number;
  my: number;
  bg: HTMLCanvasElement | null;
  pen: Pen;
  sway: number;
  monarch: (c: Pen) => void;
  glow: HTMLCanvasElement;
  cyan: HTMLCanvasElement;
  smoke: HTMLCanvasElement;
  portal: HTMLCanvasElement;
}

const MAX_ARMY = 14;
const MAX_PARTS = 240;
const RISE_AT = 0.25;
const RISE_DUR = 1.3;
const SINK_DUR = 0.9;
const EYE_SOLDIER = [
  [4, -134],
  [4.5, -124],
  [4, -131],
];

function sprite(size: number, stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) grd.addColorStop(o, col);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Knights and spearmen make up most of the army, brutes are rarer */
const pickVariant = () => {
  const r = Math.random();
  return r < 0.42 ? 0 : r < 0.78 ? 2 : 1;
};

const scaleAt = (k: number) => 0.55 + 0.65 * k;

function paintBackdrop(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const bg = s.bg ?? document.createElement('canvas');
  s.bg = bg;
  bg.width = Math.max(1, Math.round(w * dpr));
  bg.height = Math.max(1, Math.round(h * dpr));
  const c = bg.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const u = s.s;
  const { cx, hy } = s;

  const sky = c.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#07060f');
  sky.addColorStop(0.6, '#110a24');
  sky.addColorStop(1, '#2a1350');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, hy + 1);

  const rnd = mulberry(11);
  for (let i = 0; i < Math.round((w * hy) / 2600); i++) {
    c.globalAlpha = 0.2 + rnd() * 0.5;
    c.fillStyle = rnd() < 0.2 ? '#cdb4ff' : '#ffffff';
    const r = rnd() < 0.1 ? 1.4 : 0.8;
    c.fillRect(rnd() * w, rnd() * hy * 0.8, r, r);
  }
  c.globalAlpha = 1;

  // moon behind the monarch
  const mx = cx;
  const my = s.my - 232 * u;
  const mr = 96 * u;
  const halo = c.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3.2);
  halo.addColorStop(0, 'rgba(170,120,255,0.35)');
  halo.addColorStop(0.4, 'rgba(110,60,210,0.12)');
  halo.addColorStop(1, 'rgba(60,20,140,0)');
  c.fillStyle = halo;
  c.fillRect(mx - mr * 3.2, my - mr * 3.2, mr * 6.4, mr * 6.4);
  const disc = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  disc.addColorStop(0, '#f1e8ff');
  disc.addColorStop(0.7, '#cdb6ff');
  disc.addColorStop(1, '#a987f5');
  c.fillStyle = disc;
  c.beginPath();
  c.arc(mx, my, mr, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(120,80,200,0.18)';
  for (const [ox, oy, rr] of [
    [-0.35, -0.2, 0.18],
    [0.25, 0.3, 0.24],
    [0.4, -0.35, 0.1],
    [-0.15, 0.45, 0.12],
  ]) {
    c.beginPath();
    c.arc(mx + ox * mr, my + oy * mr, rr * mr, 0, TAU);
    c.fill();
  }

  // ruined skyline on the horizon
  c.fillStyle = '#0d0719';
  c.beginPath();
  c.moveTo(0, hy + 1);
  let x = 0;
  while (x < w) {
    const bw = (18 + rnd() * 50) * u;
    const bh = (8 + rnd() * rnd() * 70) * u;
    const top = hy - bh;
    c.lineTo(x, top);
    if (rnd() < 0.3) {
      c.lineTo(x + bw * 0.5, top - (10 + rnd() * 26) * u);
      c.lineTo(x + bw, top);
    } else {
      c.lineTo(x + bw * 0.3, top - rnd() * 6 * u);
      c.lineTo(x + bw, top + rnd() * 4 * u);
    }
    x += bw;
  }
  c.lineTo(w, hy + 1);
  c.closePath();
  c.fill();

  // ground
  const ground = c.createLinearGradient(0, hy, 0, h);
  ground.addColorStop(0, '#150b28');
  ground.addColorStop(0.25, '#0c0718');
  ground.addColorStop(1, '#040308');
  c.fillStyle = ground;
  c.fillRect(0, hy, w, h - hy);
  const fog = c.createLinearGradient(0, hy - 30 * u, 0, hy + 40 * u);
  fog.addColorStop(0, 'rgba(120,70,220,0)');
  fog.addColorStop(0.5, 'rgba(120,70,220,0.16)');
  fog.addColorStop(1, 'rgba(120,70,220,0)');
  c.fillStyle = fog;
  c.fillRect(0, hy - 30 * u, w, 70 * u);
  // moonlight path on the ground
  c.save();
  c.translate(mx, hy + (h - hy) * 0.35);
  c.scale(1, 0.25);
  const path = c.createRadialGradient(0, 0, 0, 0, 0, 260 * u);
  path.addColorStop(0, 'rgba(160,110,255,0.14)');
  path.addColorStop(1, 'rgba(160,110,255,0)');
  c.fillStyle = path;
  c.fillRect(-260 * u, -260 * u, 520 * u, 520 * u);
  c.restore();
}

/* ---------- silhouettes (local units, feet at y = 0, height about 160) ---------- */

/** The subset of path calls the silhouettes use; closePath ends each sub-shape */
interface Pen {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  closePath(): void;
}

/**
 * Fills every sub-shape on its own, so overlapping parts drawn in opposite directions
 * never cancel into holes under the nonzero rule.
 */
function solidPen(ctx: CanvasRenderingContext2D): Pen {
  return {
    moveTo: (x, y) => ctx.moveTo(x, y),
    lineTo: (x, y) => ctx.lineTo(x, y),
    bezierCurveTo: (a, b, c, d, e, f) => ctx.bezierCurveTo(a, b, c, d, e, f),
    ellipse: (x, y, rx, ry, rot, a0, a1) => ctx.ellipse(x, y, rx, ry, rot, a0, a1),
    arc: (x, y, r, a0, a1) => ctx.arc(x, y, r, a0, a1),
    rect: (x, y, w, h) => {
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.beginPath();
    },
    closePath: () => {
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
    },
  };
}

/** Stroke the outline glow, then fill the body shape by shape */
function silhouette(ctx: CanvasRenderingContext2D, pen: Pen, trace: (c: Pen) => void, rim: string, width: number, body: string) {
  ctx.beginPath();
  trace(ctx);
  ctx.strokeStyle = rim;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = body;
  ctx.beginPath();
  trace(pen);
  ctx.fill();
}

function traceKnight(c: Pen) {
  c.moveTo(-26, -118);
  c.lineTo(26, -118);
  c.lineTo(34, -12);
  c.lineTo(22, -20);
  c.lineTo(14, -5);
  c.lineTo(4, -18);
  c.lineTo(-6, -3);
  c.lineTo(-16, -17);
  c.lineTo(-26, -6);
  c.lineTo(-34, -15);
  c.closePath();
  c.moveTo(-16, 0);
  c.lineTo(-7, 0);
  c.lineTo(-4, -50);
  c.lineTo(4, -50);
  c.lineTo(7, 0);
  c.lineTo(16, 0);
  c.lineTo(17, -64);
  c.lineTo(-17, -64);
  c.closePath();
  c.moveTo(-30, -112);
  c.lineTo(30, -112);
  c.lineTo(22, -58);
  c.lineTo(-22, -58);
  c.closePath();
  c.moveTo(-15, -110);
  c.ellipse(-27, -110, 13, 9, -0.2, 0, TAU);
  c.closePath();
  c.moveTo(40, -110);
  c.ellipse(27, -110, 13, 9, 0.2, 0, TAU);
  c.closePath();
  c.moveTo(-13, -118);
  c.bezierCurveTo(-15, -140, -8, -151, 0, -151);
  c.bezierCurveTo(8, -151, 15, -140, 13, -118);
  c.closePath();
  c.moveTo(-3, -150);
  c.lineTo(3, -151);
  c.lineTo(10, -164);
  c.lineTo(-2, -160);
  c.closePath();
  // sword planted point down, hands on the pommel
  c.moveTo(-2.5, 0);
  c.lineTo(2.5, 0);
  c.lineTo(3.2, -56);
  c.lineTo(-3.2, -56);
  c.closePath();
  c.rect(-13, -61, 26, 5);
  c.rect(-2.2, -73, 4.4, 12);
  c.moveTo(-30, -106);
  c.lineTo(-20, -108);
  c.lineTo(-2, -72);
  c.lineTo(-9, -66);
  c.closePath();
  c.moveTo(30, -106);
  c.lineTo(20, -108);
  c.lineTo(2, -72);
  c.lineTo(9, -66);
  c.closePath();
}

function traceBrute(c: Pen) {
  c.moveTo(-21, 0);
  c.lineTo(-10, 0);
  c.lineTo(-7, -48);
  c.lineTo(7, -48);
  c.lineTo(10, 0);
  c.lineTo(21, 0);
  c.lineTo(23, -60);
  c.lineTo(-23, -60);
  c.closePath();
  c.moveTo(-38, -116);
  c.bezierCurveTo(-46, -100, -32, -70, -26, -54);
  c.lineTo(26, -54);
  c.bezierCurveTo(32, -70, 46, -100, 38, -116);
  c.closePath();
  c.moveTo(-15, -112);
  c.bezierCurveTo(-18, -136, 18, -136, 15, -112);
  c.closePath();
  c.moveTo(-11, -126);
  c.bezierCurveTo(-26, -132, -34, -148, -27, -162);
  c.bezierCurveTo(-25, -148, -16, -140, -5, -133);
  c.closePath();
  c.moveTo(11, -126);
  c.bezierCurveTo(26, -132, 34, -148, 27, -162);
  c.bezierCurveTo(25, -148, 16, -140, 5, -133);
  c.closePath();
  // axe over the shoulder
  c.moveTo(28, -36);
  c.lineTo(32, -36);
  c.lineTo(43, -150);
  c.lineTo(39, -150);
  c.closePath();
  c.moveTo(41, -148);
  c.bezierCurveTo(62, -150, 68, -124, 58, -108);
  c.bezierCurveTo(52, -122, 46, -128, 38, -126);
  c.closePath();
  c.moveTo(33, -112);
  c.lineTo(42, -108);
  c.lineTo(40, -80);
  c.lineTo(31, -84);
  c.closePath();
  c.moveTo(-38, -112);
  c.lineTo(-29, -112);
  c.lineTo(-35, -64);
  c.lineTo(-45, -66);
  c.closePath();
}

function traceSpear(c: Pen) {
  c.moveTo(-18, 0);
  c.lineTo(18, 0);
  c.bezierCurveTo(20, -40, 26, -90, 22, -112);
  c.bezierCurveTo(16, -122, -16, -122, -22, -112);
  c.bezierCurveTo(-26, -90, -20, -40, -18, 0);
  c.closePath();
  c.moveTo(-14, -113);
  c.bezierCurveTo(-18, -138, -4, -150, 4, -148);
  c.bezierCurveTo(14, -144, 17, -128, 13, -113);
  c.closePath();
  c.rect(22.8, -168, 2.6, 172);
  c.moveTo(24, -166);
  c.lineTo(29.5, -180);
  c.lineTo(24, -198);
  c.lineTo(18.5, -180);
  c.closePath();
  c.moveTo(29, -86);
  c.arc(24, -86, 5, 0, TAU);
  c.closePath();
}

const TRACE = [traceKnight, traceBrute, traceSpear];

function traceMonarch(c: Pen, sway: number) {
  // legs
  c.moveTo(-17, 0);
  c.lineTo(-7, 0);
  c.lineTo(-2, -104);
  c.lineTo(-14, -104);
  c.closePath();
  c.moveTo(17, 0);
  c.lineTo(7, 0);
  c.lineTo(2, -104);
  c.lineTo(14, -104);
  c.closePath();
  // long coat, split at the front, hem swaying
  c.moveTo(-33, -188);
  c.lineTo(33, -188);
  c.bezierCurveTo(38, -150, 44, -92, 50 + sway, -30);
  c.lineTo(40 + sway, -36);
  c.lineTo(32 + sway * 0.8, -26);
  c.lineTo(15 + sway * 0.5, -40);
  c.lineTo(4, -108);
  c.lineTo(-4, -108);
  c.lineTo(-15 + sway * 0.5, -40);
  c.lineTo(-30 + sway * 0.8, -28);
  c.lineTo(-40 + sway, -36);
  c.lineTo(-50 + sway, -30);
  c.bezierCurveTo(-44, -92, -38, -150, -33, -188);
  c.closePath();
  // popped collar and neck
  c.moveTo(-18, -186);
  c.lineTo(-22, -204);
  c.lineTo(-7, -192);
  c.closePath();
  c.moveTo(18, -186);
  c.lineTo(22, -204);
  c.lineTo(7, -192);
  c.closePath();
  c.rect(-6, -202, 12, 16);
  // head and spiky hair
  c.moveTo(13, -212);
  c.ellipse(0, -212, 13, 15, 0, 0, TAU);
  c.closePath();
  c.moveTo(-14, -214);
  c.lineTo(-19, -226);
  c.lineTo(-11, -223);
  c.lineTo(-11, -235);
  c.lineTo(-3, -227);
  c.lineTo(2, -239);
  c.lineTo(5, -227);
  c.lineTo(13, -233);
  c.lineTo(11, -221);
  c.lineTo(18, -223);
  c.lineTo(14, -210);
  c.bezierCurveTo(10, -226, -10, -226, -14, -214);
  c.closePath();
  // arms hanging, hands low
  c.moveTo(-33, -184);
  c.lineTo(-24, -182);
  c.lineTo(-37, -106);
  c.lineTo(-46, -109);
  c.closePath();
  c.moveTo(33, -184);
  c.lineTo(24, -182);
  c.lineTo(37, -106);
  c.lineTo(46, -109);
  c.closePath();
  c.moveTo(-36, -104);
  c.arc(-41, -104, 5, 0, TAU);
  c.closePath();
  c.moveTo(46, -104);
  c.arc(41, -104, 5, 0, TAU);
  c.closePath();
}

function addPart(s: State, kind: number, x: number, y: number, vx: number, vy: number, r: number, life: number) {
  const p = s.parts[s.nextPart];
  s.nextPart = (s.nextPart + 1) % MAX_PARTS;
  p.kind = kind;
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.r = r;
  p.life = life;
  p.max = life;
}

function raise(s: State, env: SceneEnv, x: number, y: number, now: number, delay = 0, silent = false) {
  const h = env.h;
  const gy = clamp(y, s.hy + (h - s.hy) * 0.12, h - 8);
  const k = clamp((gy - s.hy) / (h - s.hy), 0, 1);
  const alive = s.soldiers.filter((o) => o.dying < 0);
  if (alive.length >= MAX_ARMY) {
    let oldest = alive[0];
    for (const o of alive) if (o.born < oldest.born) oldest = o;
    oldest.dying = now;
  }
  s.soldiers.push({
    x: clamp(x, 20, env.w - 20),
    y: gy,
    k,
    variant: pickVariant(),
    face: x < s.cx ? 1 : -1,
    born: now + delay,
    dying: -1,
    blinkIn: rand(1.5, 5),
    blink: 0,
    phase: rand(0, TAU),
    wisp: 0,
  });
  if (silent) return;
  s.boom = 1;
  const bus = env.audio();
  if (bus) {
    tone(bus, 58, { type: 'sine', attack: 0.01, decay: 1.4, gain: 0.4, glideTo: 30 });
    noise(bus, { duration: 0.8, gain: 0.4, freq: 180, q: 0.7, type: 'lowpass' });
    tone(bus, 110, { type: 'triangle', attack: 0.15, decay: 1.1, gain: 0.05, glideTo: 55, delay: 0.1 });
    noise(bus, { duration: 0.5, gain: 0.03, freq: 2200, q: 1.2 });
  }
}

function drawSoldier(ctx: CanvasRenderingContext2D, s: State, o: Soldier, now: number, t: number) {
  const age = now - o.born;
  if (age < 0) return;
  const size = s.s * scaleAt(o.k);
  // portal pool: opens, holds while he climbs, then shrinks to a shadow
  const open = easeOutBack(clamp(age / 0.35, 0, 1));
  const close = clamp((age - (RISE_AT + RISE_DUR + 0.3)) / 0.8, 0, 1);
  let pool = open * (1 - close * 0.55);
  let rise = easeOutCubic(clamp((age - RISE_AT) / RISE_DUR, 0, 1));
  let alpha = 1;
  if (o.dying >= 0) {
    const d = clamp((now - o.dying) / SINK_DUR, 0, 1);
    rise *= 1 - d * d;
    pool = Math.max(pool, Math.sin(d * Math.PI) * 0.8);
    alpha = 1 - d * d;
  }
  const pr = 44 * size * pool;
  if (pr > 0.5) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(1, 0.26);
    ctx.globalAlpha = alpha;
    ctx.drawImage(s.portal, -pr, -pr, pr * 2, pr * 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * (0.55 + 0.25 * Math.sin(t * 4 + o.phase)) * (1 - close * 0.7);
    ctx.drawImage(s.glow, -pr * 1.3, -pr * 1.3, pr * 2.6, pr * 2.6);
    // ripple ring when the pool first opens
    if (age < 1) {
      ctx.globalAlpha = (1 - age) * 0.8 * alpha;
      ctx.strokeStyle = '#b98cff';
      ctx.lineWidth = 2 / 0.26;
      ctx.beginPath();
      ctx.arc(0, 0, pr * (1 + age * 1.6), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
  const hgt = (o.variant === 2 ? 200 : 165) * size;
  // a column of violet light while the pool is summoning
  const column = pool * (1 - rise) * alpha;
  if (column > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, column * 0.7);
    ctx.drawImage(s.glow, o.x - pr * 0.9, o.y - hgt * 1.1, pr * 1.8, hgt * 1.2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  if (rise <= 0.001) return;

  const bob = Math.sin(t * 1.4 + o.phase) * 0.8 * size * rise;
  ctx.save();
  if (rise < 0.999) {
    ctx.beginPath();
    ctx.rect(o.x - 120 * size, o.y - hgt - 40 * size, 240 * size, hgt + 40 * size);
    ctx.clip();
  }
  ctx.translate(o.x, o.y + (1 - rise) * hgt + bob);
  ctx.scale(size * o.face, size);
  ctx.globalAlpha = alpha;
  // backlit outline, then the body
  silhouette(ctx, s.pen, TRACE[o.variant], 'rgba(176,120,255,0.75)', 2.6, '#0a0614');

  // eyes ignite near the top of the climb, blink now and then
  const eyeK = clamp((rise - 0.75) / 0.25, 0, 1) * alpha;
  if (eyeK > 0.02) {
    const [ex, ey] = EYE_SOLDIER[o.variant];
    const open = 1 - o.blink;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = eyeK * (0.55 + 0.25 * Math.sin(t * 3 + o.phase)) * open;
    ctx.drawImage(s.glow, -ex - 12, ey - 12, 24, 24);
    ctx.drawImage(s.glow, ex - 12, ey - 12, 24, 24);
    ctx.globalAlpha = eyeK;
    ctx.fillStyle = '#efe0ff';
    const eh = Math.max(0.3, 2.2 * open);
    ctx.fillRect(-ex - 2, ey - eh / 2, 3.2, eh);
    ctx.fillRect(ex - 1.2, ey - eh / 2, 3.2, eh);
  }
  ctx.restore();
}

function drawMonarch(ctx: CanvasRenderingContext2D, s: State, t: number) {
  const u = s.s;
  const sway = Math.sin(t * 1.3) * 4 + Math.sin(t * 2.9) * 1.5;
  const x = s.cx;
  const y = s.my;
  // aura glow behind him
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.55 + 0.15 * Math.sin(t * 2.2) + s.boom * 0.4;
  ctx.globalAlpha = Math.min(1, pulse);
  const ar = 170 * u;
  ctx.drawImage(s.glow, x - ar, y - 120 * u - ar * 1.1, ar * 2, ar * 2.2);
  // rising aura rings at his feet
  for (let i = 0; i < 4; i++) {
    const p = (t * 0.35 + i / 4) % 1;
    ctx.globalAlpha = (1 - p) * 0.35;
    ctx.strokeStyle = '#9b5cff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y - p * 60 * u, (40 + p * 70) * u, (9 + p * 16) * u, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(u, u);
  s.sway = sway;
  silhouette(ctx, s.pen, s.monarch, 'rgba(200,160,255,0.85)', 3, '#07040f');

  // daggers with a violet edge
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.strokeStyle = '#1a1030';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(side * 41, -104);
    ctx.lineTo(side * 50, -56);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,160,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(side * 42.5, -100);
    ctx.lineTo(side * 50.5, -58);
    ctx.stroke();
  }

  // eyes: cold blue, flaring with each summon
  ctx.globalCompositeOperation = 'lighter';
  const flare = 1 + s.boom * 1.6;
  ctx.globalAlpha = Math.min(1, 0.75 + 0.2 * Math.sin(t * 3.1));
  const er = 11 * flare;
  ctx.drawImage(s.cyan, -5 - er, -213 - er, er * 2, er * 2);
  ctx.drawImage(s.cyan, 5 - er, -213 - er, er * 2, er * 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e8fdff';
  ctx.fillRect(-7.5, -214, 4, 2);
  ctx.fillRect(3.5, -214, 4, 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'crosshair',
    posterTime: 2.6,
    init: (env) => ({
      pen: solidPen(env.ctx),
      sway: 0,
      monarch: () => undefined,
      soldiers: [],
      parts: Array.from({ length: MAX_PARTS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, r: 1, life: 0, max: 1, kind: 0 })),
      nextPart: 0,
      now: 0,
      auraAcc: 0,
      autoIn: 4,
      idle: 0,
      boom: 0,
      s: 1,
      cx: 0,
      hy: 0,
      my: 0,
      bg: null,
      glow: sprite(64, [
        [0, 'rgba(230,200,255,1)'],
        [0.25, 'rgba(160,90,255,0.6)'],
        [0.6, 'rgba(110,40,220,0.18)'],
        [1, 'rgba(80,20,180,0)'],
      ]),
      cyan: sprite(64, [
        [0, 'rgba(240,255,255,1)'],
        [0.2, 'rgba(120,230,255,0.7)'],
        [0.55, 'rgba(60,160,255,0.2)'],
        [1, 'rgba(40,120,255,0)'],
      ]),
      smoke: sprite(64, [
        [0, 'rgba(40,20,70,0.9)'],
        [0.5, 'rgba(30,14,55,0.45)'],
        [1, 'rgba(20,10,40,0)'],
      ]),
      portal: sprite(128, [
        [0, 'rgba(0,0,0,1)'],
        [0.55, 'rgba(8,2,20,0.97)'],
        [0.74, 'rgba(120,60,230,0.85)'],
        [0.84, 'rgba(80,30,190,0.35)'],
        [1, 'rgba(40,10,120,0)'],
      ]),
    }),
    resize: (s, env) => {
      const { w, h } = env;
      s.monarch = (c) => traceMonarch(c, s.sway);
      const prevS = s.s;
      const prevCx = s.cx;
      const prevHy = s.hy;
      const prevH = prevHy ? (s.my - prevHy) / 0.3 + prevHy : 0;
      s.s = Math.min(w / 520, h / 520);
      s.cx = w / 2;
      s.hy = h * 0.6;
      s.my = s.hy + (h - s.hy) * 0.3;
      if (!s.soldiers.length && !prevCx) {
        // opening formation, staggered so they climb out one after another
        const f: [number, number][] = [
          [-115, 0.32],
          [120, 0.38],
          [-210, 0.72],
          [215, 0.78],
          [150, 1],
        ];
        f.forEach(([dx, k], i) =>
          raise(s, env, s.cx + dx * s.s, s.hy + (h - s.hy) * k, 0, 0.05 + i * 0.16, true)
        );
      } else if (prevS && prevH) {
        // keep soldiers where they stood relative to the layout
        for (const o of s.soldiers) {
          o.x = s.cx + ((o.x - prevCx) / prevS) * s.s;
          o.y = s.hy + o.k * (h - s.hy);
        }
      }
      paintBackdrop(s, env);
    },
    update: (s, env, dt) => {
      s.now += dt;
      const now = s.now;
      const u = s.s;
      s.boom = Math.max(0, s.boom - dt * 1.4);

      // ambient aura flames around the monarch
      s.auraAcc += dt * 36;
      while (s.auraAcc > 1) {
        s.auraAcc -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        const hgt = rand(0, 190);
        const spread = 30 + (hgt < 100 ? 20 + (100 - hgt) * 0.25 : 0);
        addPart(
          s,
          Math.random() < 0.85 ? 1 : 2,
          s.cx + side * rand(spread * 0.6, spread + 10) * u,
          s.my - hgt * u,
          rand(-6, 6) * u,
          -rand(30, 70) * u,
          rand(16, 30) * u,
          rand(0.5, 1)
        );
      }

      // soldiers: blinking, smoke while climbing, wisps once standing
      for (let i = s.soldiers.length - 1; i >= 0; i--) {
        const o = s.soldiers[i];
        const age = now - o.born;
        if (o.dying >= 0 && now - o.dying > SINK_DUR) {
          s.soldiers.splice(i, 1);
          continue;
        }
        if (age < 0) continue;
        const size = u * scaleAt(o.k);
        o.blinkIn -= dt;
        if (o.blinkIn <= 0) {
          o.blink = 1;
          o.blinkIn = rand(2, 6);
        }
        o.blink = Math.max(0, o.blink - dt * 7);
        const climbing = age < RISE_AT + RISE_DUR || o.dying >= 0;
        o.wisp += dt * (climbing ? 34 : 1.4);
        while (o.wisp > 1) {
          o.wisp -= 1;
          if (climbing) {
            const a = rand(0, TAU);
            const px = o.x + Math.cos(a) * 36 * size;
            const py = o.y + Math.sin(a) * 9 * size;
            if (Math.random() < 0.5) addPart(s, 0, px, py, rand(-10, 10) * size, -rand(20, 50) * size, rand(14, 26) * size, rand(0.8, 1.4));
            else addPart(s, 1, px, py, rand(-6, 6) * size, -rand(50, 120) * size, rand(24, 40) * size, rand(0.4, 0.8));
          } else {
            addPart(s, 0, o.x + rand(-20, 20) * size, o.y - rand(60, 120) * size, rand(-4, 4) * size, -rand(10, 25) * size, rand(8, 14) * size, rand(1, 1.6));
          }
        }
      }

      for (const p of s.parts) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 0) p.r += 10 * u * dt;
      }

      // left alone, the monarch keeps summoning (live motion only)
      if (!env.reducedMotion) {
        s.idle += dt;
        s.autoIn -= dt;
        const alive = s.soldiers.reduce((n, o) => n + (o.dying < 0 ? 1 : 0), 0);
        if (s.idle > 5 && s.autoIn <= 0 && alive < 9) {
          s.autoIn = rand(2, 3.5);
          let x = rand(env.w * 0.08, env.w * 0.92);
          if (Math.abs(x - s.cx) < 60 * u) x += (x < s.cx ? -1 : 1) * 80 * u;
          raise(s, env, x, s.hy + (env.h - s.hy) * rand(0.3, 0.95), now, 0, true);
          s.boom = Math.max(s.boom, 0.5);
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const now = s.now;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (s.bg) ctx.drawImage(s.bg, 0, 0, w, h);
      else {
        ctx.fillStyle = '#07060f';
        ctx.fillRect(0, 0, w, h);
      }

      // summon pulse tints the sky
      if (s.boom > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(110,50,220,${(s.boom * s.boom * 0.16).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }

      // back smoke first, so figures sit in it
      for (const p of s.parts) {
        if (p.life <= 0 || p.kind !== 0) continue;
        const k = p.life / p.max;
        ctx.globalAlpha = 0.55 * k * Math.min(1, (1 - k) * 5);
        ctx.drawImage(s.smoke, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      ctx.globalAlpha = 1;

      s.soldiers.sort((a, b) => a.y - b.y);
      let monarchDrawn = false;
      for (const o of s.soldiers) {
        if (!monarchDrawn && o.y > s.my) {
          drawMonarch(ctx, s, t);
          monarchDrawn = true;
        }
        drawSoldier(ctx, s, o, now, t);
      }
      if (!monarchDrawn) drawMonarch(ctx, s, t);

      // purple flame and embers on top
      ctx.globalCompositeOperation = 'lighter';
      for (const p of s.parts) {
        if (p.life <= 0 || p.kind === 0) continue;
        const k = p.life / p.max;
        if (p.kind === 1) {
          const r = p.r * (0.4 + k * 0.6);
          ctx.globalAlpha = 0.75 * k;
          ctx.drawImage(s.glow, p.x - r, p.y - r * 1.4, r * 2, r * 2.8);
        } else {
          ctx.globalAlpha = k;
          ctx.fillStyle = '#e2c8ff';
          ctx.fillRect(p.x, p.y, 1.6, 1.6);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // low vignette
      const v = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env, x, y) => {
      s.idle = 0;
      raise(s, env, x, y, s.now);
      env.wake(2600);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) {
        s.idle = 0;
        let x = rand(env.w * 0.1, env.w * 0.9);
        if (Math.abs(x - s.cx) < 60 * s.s) x += (x < s.cx ? -1 : 1) * 80 * s.s;
        raise(s, env, x, s.hy + (env.h - s.hy) * rand(0.3, 0.95), s.now);
        env.wake(2600);
      }
      return true;
    },
    dispose: (s) => {
      if (s.bg) s.bg.width = s.bg.height = 0;
      for (const c of [s.glow, s.cyan, s.smoke, s.portal]) c.width = c.height = 0;
      s.bg = null;
    },
  });
