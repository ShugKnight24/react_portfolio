import type { Hum } from './heroes-kit';
import {
  freeCanvas,
  glow,
  glowSprite,
  layer,
  mulberry,
  setHum,
  shakeX,
  shakeY,
  startHum,
  stopHum,
} from './heroes-kit';
import type { Cape } from './nolan-kit';
import {
  dampPose,
  grad,
  hangCape,
  kickCape,
  limb,
  makeCape,
  pinShoulders,
  poly,
  stepCape,
  traceBat,
  traceCape,
  traceCowlProfile,
} from './nolan-kit';
import type { AudioBus, SceneEnv } from './runtime';
import { clamp, damp, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';

/**
 * The second beat of the Batman Begins scene: Gotham's docks at night in the rain. Sodium
 * lamps over stacked shipping containers, gantry cranes against the glow, the river beyond.
 * A cowled figure drops in from above among a gang of thugs and takes them down one by one:
 * each tap sends him at the next man with a punch, a kick or a hook, every fourth hit of a
 * quick combo throws a batarang at the farthest one instead. Hits freeze the frame, shake the
 * camera, swirl the cape (a verlet cloth) and spray the rain; the last man goes down in slow
 * motion. The yard is baked once per resize; the figures are jointed rigs posed from key
 * poses, the same layout as the duel on the lake.
 */

type C = CanvasRenderingContext2D;

/*
 * Pose layout (figure units, facing right, feet on y = 0, up negative):
 * 0 hip, 2 neck, 4 head, 6 near knee, 8 near foot, 10 far knee, 12 far foot,
 * 14 near elbow, 16 near hand, 18 far elbow, 20 far hand
 */
const B_STAND = [
  0, -96, 4, -152, 8, -170, 12, -50, 18, 0, -12, -50, -18, 0, 10, -122, 14, -96, -12, -122, -10,
  -96,
];
const B_GUARD = [
  -4, -90, 4, -146, 10, -164, 20, -48, 34, 0, -20, -46, -32, 0, 24, -122, 36, -140, 12, -118, 30,
  -130,
];
const B_PUNCH = [
  10, -90, 26, -146, 34, -162, 32, -48, 50, 0, -16, -44, -34, 0, 52, -140, 82, -144, 6, -122, 20,
  -128,
];
const B_HOOK = [
  6, -88, 20, -144, 28, -160, 30, -48, 46, 0, -18, -44, -34, 0, 44, -118, 68, -150, 2, -124, 18,
  -132,
];
const B_KICK = [
  -8, -98, -6, -152, -4, -170, 40, -112, 84, -118, -10, -50, -14, 0, 14, -128, 26, -142, -16, -124,
  -28, -110,
];
const B_THROW = [
  2, -94, 12, -148, 18, -166, 22, -48, 36, 0, -16, -46, -30, 0, 36, -142, 66, -150, -14, -130, -30,
  -118,
];
const B_CROUCH = [
  0, -56, 12, -106, 20, -122, 30, -40, 36, 0, -24, -34, -26, 0, 30, -78, 40, -26, -14, -82, -30,
  -40,
];
const B_DROP = [
  0, -98, 2, -154, 6, -172, 14, -58, 12, -10, -12, -60, -16, -12, 24, -156, 30, -184, -20, -156,
  -26, -182,
];

const T_IDLE = [
  0, -90, 4, -142, 8, -158, 12, -46, 18, 0, -12, -46, -18, 0, 18, -112, 28, -126, 4, -114, 18, -128,
];
const T_WIND = [
  -6, -90, -4, -142, 0, -158, 14, -46, 22, 0, -14, -46, -22, 0, -16, -120, -26, -140, 10, -116, 22,
  -128,
];
const T_HIT = [
  -12, -86, -28, -132, -38, -146, 6, -46, 14, 0, -22, -44, -30, 0, -8, -112, 8, -96, -38, -114, -44,
  -138,
];
const T_DOWN = [
  0, -12, -44, -14, -62, -16, 26, -12, 52, -4, 22, -8, 48, -2, -28, -8, -10, -2, -40, -22, -30, -34,
];
const T_WALK = [
  0, -92, 6, -144, 10, -160, 18, -48, 22, 0, -10, -48, -22, 0, 6, -118, 10, -94, -6, -118, -4, -94,
];

const MELEE = [B_PUNCH, B_KICK, B_HOOK];

interface Thug {
  P: number[];
  T: readonly number[];
  rate: number;
  x: number;
  vx: number;
  /** where he means to stand */
  home: number;
  dir: number;
  /** 0 walking in, 1 squaring up, 2 hit and falling, 3 down */
  st: number;
  hp: number;
  t: number;
  style: number;
  ph: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  kind: number;
}

export interface Docks {
  B: number[];
  BT: readonly number[];
  brate: number;
  bx: number;
  by: number;
  vy: number;
  dir: number;
  /** 'drop', 'fight', 'clear' */
  phase: string;
  pt: number;
  move: number;
  moveT: number;
  target: number;
  dashFrom: number;
  dashTo: number;
  hitDone: boolean;
  combo: number;
  comboT: number;
  hits: number;
  queued: number;
  thugs: Thug[];
  wave: number;
  rang: {
    on: boolean;
    x: number;
    y: number;
    x0: number;
    y0: number;
    t: number;
    dur: number;
    target: number;
  };
  cape: Cape;
  rain: Float32Array;
  drops: Drop[];
  bats: number[];
  stop: number;
  slow: number;
  shake: number;
  flash: number;
  fx: number;
  fy: number;
  gust: number;
  idle: number;
  hum: Hum | null;
  // layout
  u: number;
  F: number;
  gy: number;
  lamps: number[];
  bg: HTMLCanvasElement | null;
  sodium: HTMLCanvasElement;
  white: HTMLCanvasElement;
  mist: HTMLCanvasElement;
}

const RAIN = 340;
const SUIT = '#0b0a0b';
const RIM = 'rgba(255,176,90,0.9)';
const COOL = 'rgba(90,110,140,0.55)';
const THUGS = [
  { coat: '#2a2622', pants: '#1c1c20', skin: '#8a6a56', cap: '#3a2c22' },
  { coat: '#24282e', pants: '#18181c', skin: '#a07a62', cap: '#222630' },
  { coat: '#3a2a20', pants: '#1e1a18', skin: '#7a5a48', cap: '' },
  { coat: '#2e2e26', pants: '#202024', skin: '#94705a', cap: '#4a3a24' },
  { coat: '#302624', pants: '#1a1a1e', skin: '#86644e', cap: '' },
];

export function makeDocks(): Docks {
  return {
    B: B_DROP.slice(),
    BT: B_DROP,
    brate: 8,
    bx: 0,
    by: 0,
    vy: 0,
    dir: 1,
    phase: 'drop',
    pt: 0,
    move: -1,
    moveT: 0,
    target: -1,
    dashFrom: 0,
    dashTo: 0,
    hitDone: false,
    combo: 0,
    comboT: 0,
    hits: 0,
    queued: 0,
    thugs: [],
    wave: 0,
    rang: { on: false, x: 0, y: 0, x0: 0, y0: 0, t: 0, dur: 0.3, target: -1 },
    cape: makeCape(6, 9),
    rain: new Float32Array(RAIN * 3),
    drops: Array.from({ length: 160 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, kind: 0 })),
    bats: [],
    stop: 0,
    slow: 0,
    shake: 0,
    flash: 0,
    fx: 0,
    fy: 0,
    gust: 0.5,
    idle: 0,
    hum: null,
    u: 1,
    F: 1,
    gy: 0,
    lamps: [],
    bg: null,
    sodium: glowSprite(64, [
      [0, 'rgba(255,214,150,1)'],
      [0.3, 'rgba(255,160,70,0.45)'],
      [1, 'rgba(255,120,40,0)'],
    ]),
    white: glowSprite(64, [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(255,236,210,0.5)'],
      [1, 'rgba(255,220,180,0)'],
    ]),
    mist: glowSprite(64, [
      [0, 'rgba(190,140,100,0.8)'],
      [0.6, 'rgba(160,120,90,0.3)'],
      [1, 'rgba(150,110,80,0)'],
    ]),
  };
}

/* ---------- the yard ---------- */

function paintYard(d: Docks, env: SceneEnv) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(d.bg, w, h, dpr);
  d.bg = cv;
  if (!c) return;
  const u = d.u;
  const hz = h * 0.47;
  const rnd = mulberry(2005);
  c.fillStyle = grad(c, 0, 0, 0, hz, ['#060405', '#120a08', '#2e1a10', '#5e3418']);
  c.fillRect(0, 0, w, h);
  // the city across the river
  let x = -10;
  while (x < w + 10) {
    const bw = (10 + rnd() * 30) * u;
    const bh = (10 + Math.pow(rnd(), 2) * 90) * u;
    c.fillStyle = '#1e140f';
    c.fillRect(x, hz - bh, bw + 0.5, bh + 1);
    c.fillStyle = 'rgba(255,190,110,0.55)';
    for (let wy = hz - bh + 3 * u; wy < hz - 2 * u; wy += 4 * u)
      for (let wx = x + 2 * u; wx < x + bw - 2 * u; wx += 3.5 * u)
        if (rnd() < 0.15) c.fillRect(wx, wy, 1.2 * u, 1.6 * u);
    x += bw;
  }
  // the river, with the far lights smeared down it
  c.fillStyle = grad(c, 0, hz, 0, h * 0.6, ['#2a1810', '#140c09']);
  c.fillRect(0, hz, w, h * 0.6 - hz);
  for (let i = 0; i < 90; i++) {
    const rx = rnd() * w;
    c.fillStyle = `rgba(255,170,90,${(0.05 + rnd() * 0.15).toFixed(3)})`;
    c.fillRect(rx, hz + rnd() * 6 * u, (1 + rnd() * 3) * u, (6 + rnd() * 30) * u);
  }
  // a freighter moored out on the water
  c.fillStyle = '#0d0907';
  poly(c, [
    w * 0.04,
    hz + 4 * u,
    w * 0.46,
    hz + 4 * u,
    w * 0.48,
    hz - 18 * u,
    w * 0.02,
    hz - 14 * u,
  ]);
  c.fill();
  c.fillRect(w * 0.08, hz - 40 * u, 40 * u, 26 * u);
  c.fillRect(w * 0.1, hz - 52 * u, 12 * u, 14 * u);
  c.fillStyle = 'rgba(255,200,130,0.7)';
  for (let i = 0; i < 6; i++) c.fillRect(w * 0.08 + (4 + i * 6) * u, hz - 34 * u, 2.4 * u, 2 * u);
  // gantry cranes
  for (const [cx, k] of [
    [w * 0.66, 1],
    [w * 0.9, 0.8],
  ]) {
    const top = hz - 190 * u * k;
    c.strokeStyle = '#140d0a';
    c.lineWidth = 5 * u * k;
    c.beginPath();
    c.moveTo(cx - 30 * u * k, h * 0.6);
    c.lineTo(cx - 14 * u * k, top);
    c.moveTo(cx + 30 * u * k, h * 0.6);
    c.lineTo(cx + 14 * u * k, top);
    c.moveTo(cx - 120 * u * k, top);
    c.lineTo(cx + 70 * u * k, top);
    c.stroke();
    c.lineWidth = 1.2 * u * k;
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      const y0 = h * 0.6 - i * ((h * 0.6 - top) / 9);
      const y1 = y0 - (h * 0.6 - top) / 9;
      c.moveTo(cx - 28 * u * k + i * 1.7 * u * k, y0);
      c.lineTo(cx + 26 * u * k - i * 1.7 * u * k, y1);
    }
    c.moveTo(cx - 120 * u * k, top);
    c.lineTo(cx, top - 30 * u * k);
    c.lineTo(cx + 70 * u * k, top);
    c.stroke();
    c.fillStyle = 'rgba(255,60,40,0.8)';
    c.fillRect(cx - 1.5 * u, top - 32 * u * k, 3 * u, 3 * u);
  }
  // stacks of containers on the quay
  const cols = ['#5a2a1c', '#1f3a3a', '#5a4a20', '#26303e', '#4a1e1a', '#2e3a24'];
  const base = h * 0.66;
  x = -20 * u;
  while (x < w) {
    const cw = (90 + rnd() * 40) * u;
    const levels = 1 + Math.floor(rnd() * 3);
    if (rnd() < 0.18) {
      x += cw * 0.6;
      continue;
    }
    for (let l = 0; l < levels; l++) {
      const ch = 34 * u;
      const y = base - (l + 1) * ch;
      const col = cols[Math.floor(rnd() * cols.length)];
      c.fillStyle = col;
      c.fillRect(x, y, cw, ch - 1 * u);
      // corrugation and the sodium light catching the top edge
      c.fillStyle = 'rgba(0,0,0,0.28)';
      for (let rx = x + 3 * u; rx < x + cw; rx += 4 * u)
        c.fillRect(rx, y + 2 * u, 1.2 * u, ch - 5 * u);
      c.fillStyle = 'rgba(255,170,90,0.28)';
      c.fillRect(x, y, cw, 1.4 * u);
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(x + cw - 6 * u, y, 6 * u, ch - 1 * u);
      c.fillRect(x, y + ch * 0.5, cw, ch * 0.5 - 1 * u);
    }
    x += cw + rnd() * 10 * u;
  }
  // the wet concrete apron
  c.fillStyle = grad(c, 0, base, 0, h, ['#21160f', '#120c09', '#0a0706']);
  c.fillRect(0, base, w, h - base);
  c.strokeStyle = 'rgba(0,0,0,0.4)';
  c.lineWidth = 1 * u;
  c.beginPath();
  for (let i = 1; i < 6; i++) {
    const y = lerp(base, h, Math.pow(i / 6, 1.6));
    c.moveTo(0, y);
    c.lineTo(w, y);
  }
  c.stroke();
  // lamp posts, and their light smeared across the wet ground
  d.lamps = [w * 0.16, w * 0.5, w * 0.84];
  for (const lx of d.lamps) {
    const top = h * 0.2;
    c.fillStyle = '#0c0807';
    c.fillRect(lx - 2.5 * u, top, 5 * u, base - top + 10 * u);
    c.fillRect(lx - 2 * u, top - 2 * u, 24 * u, 4 * u);
    c.fillStyle = '#2a1c12';
    c.fillRect(lx + 14 * u, top, 14 * u, 5 * u);
    const g = c.createLinearGradient(0, d.gy - 10 * u, 0, h);
    g.addColorStop(0, 'rgba(255,170,80,0.32)');
    g.addColorStop(1, 'rgba(255,140,60,0)');
    c.fillStyle = g;
    c.fillRect(lx + 12 * u, d.gy - 6 * u, 18 * u, h - d.gy);
  }
}

/* ---------- figures ---------- */

function fillBody(c: C, P: readonly number[], col: string, thug: boolean) {
  c.fillStyle = col;
  limb(c, P[2] - 2, P[3] + 6, P[18], P[19], 8.5, 7);
  limb(c, P[18], P[19], P[20], P[21], 7, 6);
  c.beginPath();
  c.arc(P[20], P[21], 6, 0, TAU);
  c.fill();
  limb(c, P[0] - 3, P[1], P[10], P[11], 11, 9);
  limb(c, P[10], P[11], P[12], P[13] - 5, 9, 7.5);
  poly(c, [P[12] - 8, P[13], P[12] - 8, P[13] - 12, P[12] + 8, P[13] - 11, P[12] + 14, P[13]]);
  c.fill();
  // torso
  const ax = P[2] - P[0];
  const ay = P[3] - P[1];
  const al = Math.hypot(ax, ay) || 1;
  const nx = -ay / al;
  const ny = ax / al;
  const chest = thug ? 18 : 21;
  c.beginPath();
  c.moveTo(P[2] + nx * chest, P[3] + ny * chest + 4);
  c.lineTo(P[0] + nx * 14, P[1] + ny * 14);
  c.lineTo(P[0] - nx * 14, P[1] - ny * 14);
  c.lineTo(P[2] - nx * chest, P[3] - ny * chest + 4);
  c.closePath();
  c.fill();
  c.beginPath();
  c.ellipse(
    P[2],
    P[3] + 6,
    thug ? 17 : 20,
    thug ? 10 : 12,
    Math.atan2(ay, ax) + Math.PI / 2,
    0,
    TAU
  );
  c.fill();
  limb(c, P[0] + 3, P[1], P[6], P[7], 12, 9.5);
  limb(c, P[6], P[7], P[8], P[9] - 5, 9.5, 8);
  poly(c, [P[8] - 9, P[9], P[8] - 9, P[9] - 13, P[8] + 8, P[9] - 12, P[8] + 15, P[9]]);
  c.fill();
  limb(c, P[2], P[3] + 2, P[4] - 2, P[5] + 10, 7, 6.5);
  c.save();
  c.translate(P[4], P[5]);
  c.rotate((P[4] - P[2]) * 0.012);
  if (thug) {
    c.beginPath();
    c.arc(0, 0, 13, 0, TAU);
    c.fill();
  } else {
    c.scale(1.12, 1.12);
    c.beginPath();
    traceCowlProfile(c);
    c.fill();
  }
  c.restore();
  limb(c, P[2] + 2, P[3] + 6, P[14], P[15], 9, 7.5);
  limb(c, P[14], P[15], P[16], P[17], 8, 7);
  c.beginPath();
  c.arc(P[16], P[17], 6.5, 0, TAU);
  c.fill();
  if (!thug) {
    // gauntlet fins on the near forearm
    const fa = Math.atan2(P[17] - P[15], P[16] - P[14]);
    const ox = Math.sin(fa);
    const oy = -Math.cos(fa);
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const q = 0.3 + i * 0.2;
      const x = lerp(P[14], P[16], q) + ox * 6;
      const y = lerp(P[15], P[17], q) + oy * 6;
      c.moveTo(x, y);
      c.lineTo(x + ox * 7 - Math.cos(fa) * 4, y + oy * 7 - Math.sin(fa) * 4);
      c.lineTo(x + Math.cos(fa) * 5, y + Math.sin(fa) * 5);
    }
    c.fill();
  }
}

function detailThug(c: C, P: readonly number[], style: number) {
  const st = THUGS[style % THUGS.length];
  // jacket over the dark body, a face, a cap
  c.fillStyle = st.coat;
  const ax = P[2] - P[0];
  const ay = P[3] - P[1];
  const al = Math.hypot(ax, ay) || 1;
  const nx = (-ay / al) * 16;
  const ny = (ax / al) * 16;
  c.beginPath();
  c.moveTo(P[2] + nx, P[3] + ny + 4);
  c.lineTo(P[0] + nx * 0.9, P[1] + ny * 0.9 + 4);
  c.lineTo(P[0] - nx * 0.9, P[1] - ny * 0.9 + 4);
  c.lineTo(P[2] - nx, P[3] - ny + 4);
  c.closePath();
  c.fill();
  limb(c, P[2] + 2, P[3] + 6, P[14], P[15], 8, 6.5);
  limb(c, P[14], P[15], P[16], P[17], 6.5, 5.5);
  c.save();
  c.translate(P[4], P[5]);
  c.fillStyle = st.skin;
  c.beginPath();
  c.arc(3, 2, 10, -1.2, 1.6);
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.fillRect(6, -2, 3, 1.6);
  if (st.cap) {
    c.fillStyle = st.cap;
    c.beginPath();
    c.arc(0, -2, 13.5, Math.PI, TAU);
    c.fill();
    c.fillRect(-13.5, -3, 27, 3);
  }
  c.restore();
  c.fillStyle = st.skin;
  c.beginPath();
  c.arc(P[16], P[17], 5.5, 0, TAU);
  c.fill();
}

function drawBatman(c: C, d: Docks) {
  const F = d.F;
  c.save();
  c.translate(d.bx, d.by);
  c.scale(F * d.dir, F);
  c.save();
  c.translate(-1.2, -1.6);
  fillBody(c, d.B, RIM, false);
  c.restore();
  c.save();
  c.translate(1.2, 1);
  fillBody(c, d.B, COOL, false);
  c.restore();
  fillBody(c, d.B, SUIT, false);
  // the belt and the bare jaw under the cowl
  const P = d.B;
  c.save();
  c.translate(lerp(P[0], P[2], 0.12), lerp(P[1], P[3], 0.12));
  c.rotate(Math.atan2(P[3] - P[1], P[2] - P[0]) + Math.PI / 2);
  c.fillStyle = '#7a5a2a';
  c.fillRect(-15, -3.5, 30, 7);
  c.restore();
  c.save();
  c.translate(P[4], P[5]);
  c.rotate((P[4] - P[2]) * 0.012);
  c.scale(1.12, 1.12);
  c.fillStyle = '#8a6450';
  poly(c, [6, 2, 14.6, 4.6, 14.4, 9.4, 9.5, 13.2, 3, 13.4, 3, 6]);
  c.fill();
  c.fillStyle = 'rgba(255,190,120,0.7)';
  c.fillRect(9, -4, 3, 1);
  c.restore();
  c.restore();
}

function drawCapeD(c: C, d: Docks) {
  const F = d.F;
  c.fillStyle = RIM;
  traceCape(c, d.cape, 6 * F, 0, -1.6 * F);
  c.fill();
  c.fillStyle = '#080707';
  traceCape(c, d.cape, 6 * F);
  c.fill();
}

function drawThug(c: C, d: Docks, th: Thug) {
  const F = d.F;
  c.save();
  c.translate(th.x, d.gy);
  c.scale(F * th.dir, F);
  c.save();
  c.translate(-1, -1.6);
  fillBody(c, th.P, RIM, true);
  c.restore();
  const st = THUGS[th.style % THUGS.length];
  fillBody(c, th.P, st.pants, true);
  detailThug(c, th.P, th.style);
  c.restore();
}

/* ---------- sound ---------- */

function sfxHit(bus: AudioBus, big: boolean) {
  noise(bus, {
    duration: big ? 0.3 : 0.18,
    gain: big ? 0.4 : 0.28,
    freq: 300,
    q: 0.6,
    type: 'lowpass',
  });
  noise(bus, { duration: 0.08, gain: 0.12, freq: 2400, q: 0.7, type: 'bandpass' });
  tone(bus, big ? 80 : 110, {
    type: 'sine',
    attack: 0.002,
    decay: big ? 0.5 : 0.25,
    gain: big ? 0.3 : 0.2,
    glideTo: 40,
  });
}

function sfxSwing(bus: AudioBus) {
  noise(bus, { duration: 0.16, gain: 0.08, freq: 1100, q: 1.2, type: 'bandpass' });
}

function sfxThrow(bus: AudioBus) {
  noise(bus, { duration: 0.35, gain: 0.07, freq: 3000, q: 2, type: 'bandpass' });
  tone(bus, 1400, { type: 'triangle', attack: 0.01, decay: 0.3, gain: 0.03, glideTo: 900 });
}

function sfxLand(bus: AudioBus) {
  tone(bus, 70, { type: 'sine', attack: 0.003, decay: 0.5, gain: 0.3, glideTo: 36 });
  noise(bus, { duration: 0.6, gain: 0.2, freq: 900, q: 0.5, type: 'bandpass' });
}

/* ---------- the fight ---------- */

function newWave(d: Docks, env: SceneEnv, walkIn: boolean) {
  const { w } = env;
  d.wave++;
  const slots = [0.1, 0.24, 0.7, 0.83, 0.95];
  d.thugs = slots.map((k, i) => {
    const home = k * w;
    const dir = home < w * 0.5 ? 1 : -1;
    const x = walkIn ? (dir > 0 ? -60 - i * 40 : w + 60 + i * 30) : home;
    return {
      P: T_IDLE.slice(),
      T: walkIn ? T_WALK : T_IDLE,
      rate: 6,
      x,
      vx: 0,
      home,
      dir,
      st: walkIn ? 0 : 1,
      hp: i === 3 ? 2 : 1,
      t: 0,
      style: (i + d.wave) % THUGS.length,
      ph: rand(0, TAU),
    };
  });
}

export function enterDocks(d: Docks, env: SceneEnv) {
  const { w } = env;
  newWave(d, env, false);
  d.phase = 'drop';
  d.pt = 0;
  d.bx = w * 0.47;
  d.by = -40 * d.F;
  d.vy = 300 * d.u;
  d.dir = 1;
  d.B = B_DROP.slice();
  d.BT = B_DROP;
  d.combo = 0;
  d.hits = 0;
  d.move = -1;
  d.queued = 0;
  d.rang.on = false;
  resetCape(d);
  // a gust of bats comes down with him
  d.bats.length = 0;
  for (let i = 0; i < 40; i++)
    d.bats.push(
      d.bx + rand(-80, 80) * d.u,
      rand(-60, 40) * d.u,
      rand(-500, 500) * d.u,
      rand(-300, 100) * d.u,
      rand(0, TAU),
      rand(5, 10)
    );
}

function resetCape(d: Docks) {
  const F = d.F;
  hangCape(d.cape, d.bx - d.dir * 6 * F, d.by - 148 * F, 24 * F, 70 * F, 128 * F);
}

function pinCape(d: Docks) {
  const F = d.F;
  const P = d.B;
  const sx = d.bx + P[2] * F * d.dir;
  const sy = d.by + (P[3] + 4) * F;
  // the cape hangs off the back of his shoulders
  pinShoulders(d.cape, sx - d.dir * 16 * F, sy + 2 * F, sx + d.dir * 8 * F, sy - 2 * F, 2 * F);
}

function standing(d: Docks) {
  return d.thugs.filter((t) => t.st === 1);
}

/** One tap: go for the nearest man left standing, or a batarang for the farthest on the fourth */
export function strikeDocks(d: Docks, env: SceneEnv) {
  d.idle = 0;
  if (d.phase === 'clear' && d.pt > 1) {
    newWave(d, env, true);
    d.phase = 'fight';
    d.pt = 0;
    return;
  }
  if (d.phase !== 'fight') return;
  if (d.move >= 0) {
    // a tap during a move lines up the next one
    d.queued = 1;
    return;
  }
  const up = standing(d);
  if (!up.length) return;
  const bus = env.audio();
  if (bus && !d.hum) d.hum = startHum(bus, { type: 'sine', freq: 40, cutoff: 1800, noiseAmt: 1.6 });
  const far = (th: Thug) => Math.abs(th.x - d.bx);
  up.sort((a, b) => far(a) - far(b));
  if (d.combo % 4 === 3 && up.length > 1) {
    const tgt = up[up.length - 1];
    d.move = 3;
    d.moveT = 0;
    d.target = d.thugs.indexOf(tgt);
    d.dir = tgt.x > d.bx ? 1 : -1;
    d.BT = B_THROW;
    d.brate = 30;
    d.hitDone = false;
    if (bus) sfxThrow(bus);
    return;
  }
  const tgt = up[0];
  d.target = d.thugs.indexOf(tgt);
  d.dir = tgt.x > d.bx ? 1 : -1;
  d.move = d.hits % 3;
  d.moveT = 0;
  d.dashFrom = d.bx;
  d.dashTo = tgt.x - d.dir * (d.move === 1 ? 92 : 74) * d.F;
  d.BT = MELEE[d.move];
  d.brate = 22;
  d.hitDone = false;
  tgt.T = T_WIND;
  tgt.rate = 10;
  if (bus) sfxSwing(bus);
}

function land(d: Docks, env: SceneEnv, th: Thug, big: boolean, hx: number, hy: number) {
  const u = d.u;
  const last = standing(d).length === 1 && th.hp <= 1;
  th.hp--;
  d.combo = d.comboT > 0 ? d.combo + 1 : 1;
  d.comboT = 1.2;
  d.hits++;
  d.fx = hx;
  d.fy = hy;
  d.flash = big || last ? 1 : 0.7;
  d.stop = last ? 0.16 : big ? 0.1 : 0.07;
  d.slow = last ? 0.9 : 0;
  d.shake = env.reducedMotion ? 0 : last ? 1 : big ? 0.7 : 0.5;
  kickCape(d.cape, -d.dir * 7 * d.F, -4 * d.F, 3 * d.F);
  for (let i = 0; i < 26; i++) {
    const a = rand(0, TAU);
    const v = rand(80, 420) * u;
    spray(d, hx, hy, Math.cos(a) * v + d.dir * 160 * u, Math.sin(a) * v - 80 * u, i % 3 ? 0 : 1);
  }
  if (th.hp > 0) {
    // the big one staggers, and comes back for more
    th.T = T_HIT;
    th.rate = 18;
    th.vx = d.dir * 240 * u;
    th.st = 1;
    th.t = -0.4;
  } else {
    th.st = 2;
    th.T = T_HIT;
    th.rate = 22;
    th.vx = d.dir * (last ? 760 : 560) * u;
    th.dir = -d.dir;
    th.t = 0;
  }
  const bus = env.audio();
  if (bus) sfxHit(bus, big || last);
}

function spray(d: Docks, x: number, y: number, vx: number, vy: number, kind: number) {
  const p = d.drops.find((q) => q.life <= 0) ?? d.drops[0];
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.life = rand(0.4, 0.8);
  p.kind = kind;
}

export function resizeDocks(d: Docks, env: SceneEnv) {
  const { w, h } = env;
  d.u = Math.min(w / 900, h / 560);
  d.F = Math.min(h / 470, w / 620);
  d.gy = h * 0.86;
  for (let i = 0; i < RAIN; i++) {
    d.rain[i * 3] = Math.random() * w;
    d.rain[i * 3 + 1] = Math.random() * h;
    d.rain[i * 3 + 2] = rand(0.5, 1.5);
  }
  paintYard(d, env);
  d.by = Math.min(d.by, d.gy);
  for (const th of d.thugs) th.home = clamp(th.home, 0, w);
  resetCape(d);
}

/** Returns true while something is happening that a reduced motion loop should keep showing */
export function stepDocks(d: Docks, env: SceneEnv, rdt: number, t: number, auto: boolean) {
  const { w, h } = env;
  const u = d.u;
  const F = d.F;
  d.stop = Math.max(0, d.stop - rdt);
  d.slow = Math.max(0, d.slow - rdt);
  const dt = d.stop > 0 ? rdt * 0.03 : d.slow > 0 ? rdt * 0.3 : rdt;
  d.pt += dt;
  d.idle += rdt;
  d.comboT = Math.max(0, d.comboT - dt);
  if (d.comboT <= 0) d.combo = 0;
  d.gust = damp(d.gust, 0.4 + 0.6 * Math.max(0, Math.sin(t * 0.5)), 1, rdt);

  if (d.phase === 'drop') {
    d.vy += 2600 * u * dt;
    d.by += d.vy * dt;
    if (d.by >= d.gy) {
      d.by = d.gy;
      d.phase = 'fight';
      d.pt = 0;
      d.B = B_CROUCH.slice();
      d.BT = B_GUARD;
      d.brate = 3;
      d.shake = env.reducedMotion ? 0 : 0.9;
      d.flash = 0.3;
      d.fx = d.bx;
      d.fy = d.gy;
      d.stop = 0.08;
      kickCape(d.cape, 0, -5 * F, 4 * F);
      for (let i = 0; i < 40; i++)
        spray(d, d.bx + rand(-40, 40) * F, d.gy - 2, rand(-400, 400) * u, -rand(60, 300) * u, 0);
      for (const th of d.thugs) th.vx = (th.x < d.bx ? -1 : 1) * 120 * u;
      const bus = env.audio();
      if (bus) sfxLand(bus);
    }
  } else if (d.phase === 'fight') {
    if (auto && d.move < 0 && d.pt > 0.7 && d.idle > 0.55) strikeDocks(d, env);
    if (d.move >= 0) {
      d.moveT += dt;
      const th = d.thugs[d.target];
      if (d.move === 3) {
        // the batarang: wind up, throw, it spins across and drops the far man
        if (d.moveT > 0.12 && !d.rang.on && !d.hitDone) {
          const P = d.B;
          d.rang.on = true;
          d.rang.x0 = d.bx + P[16] * F * d.dir;
          d.rang.y0 = d.by + P[17] * F;
          d.rang.t = 0;
          d.rang.dur = clamp(Math.abs(th.x - d.rang.x0) / (1300 * u), 0.18, 0.5);
          d.rang.target = d.target;
          d.hitDone = true;
        }
        if (d.moveT > 0.4) {
          d.BT = B_GUARD;
          d.brate = 8;
        }
        if (d.moveT > 0.5) d.move = -1;
      } else {
        const k = easeOutCubic(clamp(d.moveT / 0.13, 0, 1));
        d.bx = clamp(lerp(d.dashFrom, d.dashTo, k), 40 * u, w - 40 * u);
        if (!d.hitDone && d.moveT >= 0.13 && th) {
          d.hitDone = true;
          const P = d.B;
          const hx = d.move === 1 ? d.bx + P[8] * F * d.dir : d.bx + P[16] * F * d.dir;
          const hy = d.by + (d.move === 1 ? P[9] : P[17]) * F;
          land(d, env, th, d.move === 1, hx, hy);
        }
        if (d.moveT > 0.3) {
          d.BT = B_GUARD;
          d.brate = 9;
        }
        if (d.moveT > 0.36) d.move = -1;
      }
      if (d.move < 0 && d.queued) {
        d.queued = 0;
        strikeDocks(d, env);
      }
    }
    if (d.rang.on) {
      const r = d.rang;
      r.t += dt;
      const th = d.thugs[r.target];
      const k = clamp(r.t / r.dur, 0, 1);
      r.x = lerp(r.x0, th.x, k);
      r.y = lerp(r.y0, d.gy - 140 * F, k) - Math.sin(k * Math.PI) * 30 * u;
      if (k >= 1) {
        r.on = false;
        if (th.st === 1) {
          th.hp = 1;
          land(d, env, th, true, r.x, r.y);
          const bus = env.audio();
          if (bus)
            tone(bus, 1900, {
              type: 'triangle',
              attack: 0.002,
              decay: 0.3,
              gain: 0.05,
              glideTo: 1500,
            });
        }
      }
    }
    if (!standing(d).length && d.thugs.every((th) => th.st === 3) && d.move < 0 && !d.rang.on) {
      d.phase = 'clear';
      d.pt = 0;
      d.BT = B_STAND;
      d.brate = 2.5;
    }
  } else {
    // the yard is quiet; he straightens up and the cape settles in the rain
    d.dir = d.bx < w * 0.5 ? 1 : -1;
    d.bx = damp(d.bx, w * 0.47, 0.6, dt);
  }
  dampPose(d.B, d.BT, d.brate, dt);
  pinCape(d);
  stepCape(d.cape, dt, 560 * F, (-d.dir * 60 - 50 * d.gust) * F, 0, 0.35, t, 0.97);

  // thugs
  for (const th of d.thugs) {
    th.t += dt;
    dampPose(th.P, th.T, th.rate, dt);
    th.x += th.vx * dt;
    th.vx *= Math.exp(-dt * (th.st === 2 ? 2.4 : 6));
    if (th.st === 0) {
      th.T = T_WALK;
      const step = Math.sin(t * 7 + th.ph);
      th.P[8] += step * 0.8;
      th.P[12] -= step * 0.8;
      th.x = damp(th.x, th.home, 1.3, dt);
      if (Math.abs(th.x - th.home) < 8 * u) {
        th.st = 1;
        th.T = T_IDLE;
      }
    } else if (th.st === 1) {
      if (th.t > 0 && th.T === T_HIT) {
        th.T = T_IDLE;
        th.rate = 6;
      }
      if (th.T !== T_WIND && th.t > 0) th.T = T_IDLE;
      th.dir = d.bx > th.x ? 1 : -1;
      // they circle in on him, but never too close
      const want = d.bx - th.dir * (130 + (th.style % 3) * 40) * F;
      th.x = damp(th.x, lerp(th.home, want, 0.5), 0.5, dt);
      th.P[1] += Math.sin(t * 3 + th.ph) * 0.3;
    } else if (th.st === 2) {
      if (th.t > 0.12) {
        th.T = T_DOWN;
        th.rate = 7;
      }
      if (th.t > 0.5 && th.t - dt <= 0.5) {
        for (let i = 0; i < 18; i++)
          spray(d, th.x + rand(-60, 60) * F, d.gy - 2, rand(-200, 200) * u, -rand(40, 200) * u, 0);
        const bus = env.audio();
        if (bus) noise(bus, { duration: 0.3, gain: 0.12, freq: 500, q: 0.6, type: 'lowpass' });
      }
      if (th.t > 0.9) th.st = 3;
    }
  }

  // rain, splashes, bats
  const fall = (d.slow > 0 || d.stop > 0 ? 0.15 : 1) * rdt;
  for (let i = 0; i < RAIN; i++) {
    const z = d.rain[i * 3 + 2];
    d.rain[i * 3 + 1] += 900 * u * z * fall;
    d.rain[i * 3] -= 120 * u * z * fall * (0.5 + d.gust);
    if (d.rain[i * 3 + 1] > h) {
      d.rain[i * 3 + 1] -= h + 20;
      d.rain[i * 3] = Math.random() * (w + 100);
      if (Math.random() < 0.3)
        spray(
          d,
          Math.random() * w,
          d.gy + Math.random() * (h - d.gy),
          rand(-20, 20) * u,
          -rand(20, 60) * u,
          2
        );
    }
  }
  for (const p of d.drops) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.vy += 1200 * u * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = 0; i < d.bats.length; i += 6) {
    d.bats[i] += d.bats[i + 2] * dt;
    d.bats[i + 1] += d.bats[i + 3] * dt;
    d.bats[i + 3] -= 300 * u * dt;
    d.bats[i + 4] += dt * 22;
  }
  d.flash = Math.max(0, d.flash - rdt * 3);
  d.shake = Math.max(0, d.shake - rdt * 2.4);
  if (d.hum) setHum(d.hum, 40, 0.03 + d.gust * 0.03, 1400 + d.gust * 1200);
  return d.phase !== 'clear' || d.pt < 2;
}

export function drawDocks(d: Docks, env: SceneEnv, t: number) {
  const { ctx: c, w, h } = env;
  const u = d.u;
  const F = d.F;
  c.save();
  if (d.shake > 0.01) {
    const a = d.shake * d.shake * 9 * u;
    c.translate(shakeX(a, t), shakeY(a, t));
  }
  if (d.bg) c.drawImage(d.bg, -6 * u, -6 * u, w + 12 * u, h + 12 * u);
  // haze drifting between the stacks
  c.globalAlpha = 0.28;
  for (let i = 0; i < 4; i++) {
    const len = 500 * u;
    const x = ((t * 14 * u + i * 300 * u) % (w + len)) - len * 0.5;
    c.drawImage(d.mist, x, h * (0.5 + i * 0.06) - 30 * u, len, 60 * u);
  }
  c.globalAlpha = 1;

  // shadows and reflections on the wet apron
  const figs: [number, number[], boolean][] = [[d.bx, d.B, false]];
  for (const th of d.thugs) figs.push([th.x, th.P, true]);
  c.fillStyle = 'rgba(0,0,0,0.4)';
  for (const [x] of figs) {
    c.beginPath();
    c.ellipse(x, d.gy + 2 * u, 46 * F, 6 * F, 0, 0, TAU);
    c.fill();
  }
  c.save();
  c.globalAlpha = 0.18;
  for (const th of d.thugs) {
    c.save();
    c.translate(th.x, d.gy + 2);
    c.scale(F * th.dir, -F * 0.5);
    fillBody(c, th.P, '#3a2418', true);
    c.restore();
  }
  c.save();
  c.translate(d.bx, d.gy + 2);
  c.scale(F * d.dir, -F * 0.5);
  fillBody(c, d.B, '#3a2418', false);
  c.restore();
  c.restore();

  // thugs down first, then the ones standing, then him
  for (const th of d.thugs) if (th.st >= 2) drawThug(c, d, th);
  for (const th of d.thugs) if (th.st < 2) drawThug(c, d, th);
  drawCapeD(c, d);
  drawBatman(c, d);

  // the batarang
  if (d.rang.on) {
    c.save();
    c.translate(d.rang.x, d.rang.y);
    c.rotate(d.rang.t * 40);
    c.fillStyle = '#16141a';
    c.beginPath();
    traceBat(c, 0, 0, 11 * u, 0.1);
    c.fill();
    c.restore();
    c.globalCompositeOperation = 'lighter';
    glow(c, d.sodium, d.rang.x, d.rang.y, 16 * u, 0.4);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  // bats that came down with him
  c.fillStyle = '#0c0808';
  c.beginPath();
  for (let i = 0; i < d.bats.length; i += 6)
    traceBat(
      c,
      d.bats[i],
      d.bats[i + 1],
      d.bats[i + 5] * u,
      Math.sin(d.bats[i + 4]),
      d.bats[i + 2] > 0 ? 1 : -1
    );
  c.fill();

  // lamp light, with the rain showing up inside the cones
  c.globalCompositeOperation = 'lighter';
  for (const lx of d.lamps) {
    const hx = lx + 21 * u;
    const hy = h * 0.2 + 5 * u;
    glow(c, d.sodium, hx, hy, 40 * u, 0.9);
    const g = c.createRadialGradient(hx, hy, 0, hx, hy, d.gy - hy + 40 * u);
    g.addColorStop(0, 'rgba(255,180,90,0.13)');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    c.fillStyle = g;
    c.globalAlpha = 1;
    c.beginPath();
    c.moveTo(hx - 6 * u, hy);
    c.lineTo(hx + 110 * u, d.gy + 10 * u);
    c.lineTo(hx - 120 * u, d.gy + 10 * u);
    c.closePath();
    c.fill();
  }
  c.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    c.strokeStyle = pass ? 'rgba(255,200,140,0.5)' : 'rgba(200,170,150,0.16)';
    c.lineWidth = pass ? 1.2 * u : 1 * u;
    c.beginPath();
    for (let i = 0; i < RAIN; i++) {
      const x = d.rain[i * 3];
      const y = d.rain[i * 3 + 1];
      const z = d.rain[i * 3 + 2];
      let lit = false;
      for (const lx of d.lamps)
        if (Math.abs(x - lx - 21 * u) < 30 * u + (y - h * 0.2) * 0.45 && y > h * 0.2) lit = true;
      if (lit !== (pass === 1)) continue;
      const len = 14 * u * z;
      c.moveTo(x, y);
      c.lineTo(x + 2 * u * z, y - len);
    }
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  // splashes and spray
  for (const p of d.drops) {
    if (p.life <= 0) continue;
    if (p.kind === 1) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = `rgba(255,220,170,${Math.min(1, p.life * 2).toFixed(3)})`;
      c.fillRect(p.x, p.y, 2 * u, 2 * u);
      c.globalCompositeOperation = 'source-over';
    } else {
      c.fillStyle = `rgba(230,200,170,${Math.min(0.7, p.life).toFixed(3)})`;
      c.fillRect(p.x, p.y, 1.4 * u, p.kind === 2 ? 1.2 * u : 2.6 * u);
    }
  }
  // the hit flash
  if (d.flash > 0.01) {
    c.globalCompositeOperation = 'lighter';
    glow(c, d.white, d.fx, d.fy, (30 + (1 - d.flash) * 70) * u, d.flash);
    c.strokeStyle = `rgba(255,236,210,${(d.flash * 0.7).toFixed(3)})`;
    c.lineWidth = 2 * u;
    c.beginPath();
    c.arc(d.fx, d.fy, (14 + (1 - d.flash) * 80) * u, 0, TAU);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }
  c.restore();
  // the combo, as a row of bat marks along the top
  if (d.combo > 1) {
    c.fillStyle = 'rgba(255,196,120,0.9)';
    c.beginPath();
    for (let i = 0; i < Math.min(8, d.combo); i++)
      traceBat(c, w / 2 + (i - (Math.min(8, d.combo) - 1) / 2) * 30 * u, 34 * u, 11 * u, 0.2);
    c.fill();
  }
}

export function freeDocks(d: Docks) {
  stopHum(d.hum);
  d.hum = null;
  freeCanvas(d.bg, d.sodium, d.white, d.mist);
  d.bg = null;
}
