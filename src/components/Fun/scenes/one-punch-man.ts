import { clamp, createCanvasScene, damp, easeInOutCubic, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { burst, emit, freeCanvas, glow, glowSprite, layer, makePool, mulberry, setHum, shakeX, shakeY, startHum, stepPool, stopHum } from './heroes-kit';
import type { Hum, Pool } from './heroes-kit';
import { capsule, cel, elbow, inked, makePress, pressDown, smooth, stepPress, within } from './anime-more-kit';
import type { C, Press } from './anime-more-kit';

/**
 * One Punch: Saitama, bored as ever, facing a towering one eyed alien warlord over a ruined
 * city under heavy cloud. Tap for ordinary punches (the giant barely notices). Hold for Serious
 * Series: his face hardens, the ground lifts, and on release the Serious Punch vaporises the
 * monster and splits the clouds clean across the sky. The monster pulls itself back together.
 */

const INK = '#1b1410';
const SUIT = '#f7d43e';
const SUIT_SH = '#d39d1c';
const RED = '#e0282e';
const RED_SH = '#9f1418';
const CAPE = '#fbfbf7';
const CAPE_SH = '#c9cbd3';
const SKIN = '#ffe2c6';
const SKIN_SH = '#e8b48f';

const M_SKIN = '#7f8fd6';
const M_SKIN_SH = '#5363ae';
const M_ARMOR = '#f2f0ea';
const M_ARMOR_SH = '#b9b6c4';
const GOLD = '#e8b443';
const GOLD_SH = '#a7741c';
const M_HAIR = '#1d3a7a';
const M_HAIR_SH = '#10214d';

const DUST = 0;
const CHUNK = 1;
const SPARKLE = 2;
const ROCK = 3;

/** Saitama's pose, figure units (feet at y 0, head top near y -200), facing right */
interface Pose {
  hipX: number;
  hipY: number;
  lean: number;
  nHx: number;
  nHy: number;
  fHx: number;
  fHy: number;
  nFx: number;
  fFx: number;
}
const IDLE: Pose = { hipX: 0, hipY: -92, lean: 0, nHx: 12, nHy: -90, fHx: -12, fHy: -92, nFx: 12, fFx: -14 };
const JAB_N: Pose = { hipX: 6, hipY: -90, lean: 0.1, nHx: 74, nHy: -146, fHx: 4, fHy: -128, nFx: 18, fFx: -18 };
const JAB_F: Pose = { hipX: 6, hipY: -90, lean: 0.12, nHx: 18, nHy: -126, fHx: 68, fHy: -150, nFx: 18, fFx: -18 };
const WIND: Pose = { hipX: -8, hipY: -78, lean: -0.12, nHx: -40, nHy: -118, fHx: 30, fHy: -136, nFx: 26, fFx: -30 };
const SERIOUS: Pose = { hipX: 16, hipY: -82, lean: 0.24, nHx: 92, nHy: -164, fHx: -30, fHy: -112, nFx: 34, fFx: -40 };

const POSE_KEYS: (keyof Pose)[] = ['hipX', 'hipY', 'lean', 'nHx', 'nHy', 'fHx', 'fHy', 'nFx', 'fFx'];

interface Hit {
  x: number;
  y: number;
  t: number;
  big: boolean;
}

interface State {
  press: Press;
  /** 0 idle, 1 jab, 2 winding up, 3 serious punch */
  mode: number;
  modeT: number;
  jabSide: number;
  jabs: number;
  serious: number;
  charge: number;
  fireC: number;
  shrug: number;
  annoy: number;
  dead: boolean;
  deadT: number;
  monsterA: number;
  split: number;
  splitAng: number;
  splitX: number;
  splitY: number;
  flash: number;
  kick: number;
  hits: Hit[];
  pose: Pose;
  from: Pose;
  demoT: number;
  t: number;
  pool: Pool;
  hum: Hum | null;
  // layout
  portrait: boolean;
  k: number;
  sx: number;
  gy: number;
  m: number;
  mx: number;
  my: number;
  horizon: number;
  fistX: number;
  fistY: number;
  sky: HTMLCanvasElement | null;
  clouds: HTMLCanvasElement | null;
  ruins: HTMLCanvasElement | null;
  sprites: { white: HTMLCanvasElement; sun: HTMLCanvasElement; dust: HTMLCanvasElement };
}

/* ---------- backdrop ---------- */

function paintSky(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  const a = layer(s.sky, w, h, dpr);
  s.sky = a.cv;
  const c = a.c;
  if (c) {
    // the clear sky waiting behind the clouds
    const g = c.createLinearGradient(0, 0, 0, s.horizon);
    g.addColorStop(0, '#2f7fe0');
    g.addColorStop(0.6, '#79bdf5');
    g.addColorStop(1, '#d9eefc');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  const b = layer(s.clouds, w, h, dpr);
  s.clouds = b.cv;
  const cc = b.c;
  if (cc) {
    cc.clearRect(0, 0, w, h);
    const base = cc.createLinearGradient(0, 0, 0, s.horizon);
    base.addColorStop(0, '#5d6070');
    base.addColorStop(0.7, '#8d8f9b');
    base.addColorStop(1, '#b9b6b2');
    cc.fillStyle = base;
    cc.fillRect(0, 0, w, s.horizon + 30);
    // puffy banks of cloud with lit tops and dark bellies
    const rnd = mulberry(5);
    const u = Math.min(w, h) / 600;
    for (let row = 0; row < 9; row++) {
      const y = (row / 8) * (s.horizon + 20) - 20 * u;
      const tone = 0.35 + (row / 8) * 0.5;
      let x = -60 * u + rnd() * 40 * u;
      while (x < w + 60 * u) {
        const r = (30 + rnd() * 45) * u * (0.7 + row * 0.08);
        const lit = Math.round(150 + tone * 80);
        const dark = Math.round(70 + tone * 70);
        cc.fillStyle = `rgb(${dark},${dark + 2},${dark + 12})`;
        cc.beginPath();
        cc.ellipse(x, y + r * 0.35, r * 1.3, r * 0.75, 0, 0, TAU);
        cc.fill();
        cc.fillStyle = `rgb(${lit},${lit},${lit + 6})`;
        cc.beginPath();
        cc.ellipse(x - r * 0.15, y - r * 0.05, r * 1.1, r * 0.62, 0, 0, TAU);
        cc.fill();
        cc.fillStyle = `rgb(${dark + 20},${dark + 22},${dark + 34})`;
        cc.beginPath();
        cc.ellipse(x + r * 0.1, y + r * 0.42, r * 1.05, r * 0.3, 0, 0, TAU);
        cc.fill();
        x += r * (1.2 + rnd() * 0.6);
      }
    }
  }
  const r = layer(s.ruins, w, h, dpr);
  s.ruins = r.cv;
  const rc = r.c;
  if (rc) {
    rc.clearRect(0, 0, w, h);
    const rnd = mulberry(31);
    const hz = s.horizon;
    const u = Math.min(w, h) / 600;
    // broken towers along the horizon
    for (const [col, k, base] of [
      ['#77746f', 0.8, hz],
      ['#57534f', 1, hz + 10 * u],
    ] as const) {
      let x = -10;
      while (x < w + 10) {
        const bw = (30 + rnd() * 60) * u;
        const bh = (20 + rnd() * 90 * k) * u;
        rc.fillStyle = col;
        rc.beginPath();
        rc.moveTo(x, base + 40 * u);
        rc.lineTo(x, base - bh);
        // jagged broken tops
        const n = 3 + Math.floor(rnd() * 3);
        for (let i = 1; i <= n; i++) rc.lineTo(x + (bw * i) / n, base - bh + (rnd() - 0.3) * 26 * u);
        rc.lineTo(x + bw, base + 40 * u);
        rc.closePath();
        rc.fill();
        rc.fillStyle = 'rgba(20,18,22,0.55)';
        for (let yy = base - bh + 12 * u; yy < base; yy += 12 * u)
          for (let xx = x + 5 * u; xx < x + bw - 8 * u; xx += 10 * u) if (rnd() < 0.5) rc.fillRect(xx, yy, 4 * u, 6 * u);
        x += bw + rnd() * 8 * u;
      }
    }
    // cracked ground
    const g = rc.createLinearGradient(0, hz + 20 * u, 0, h);
    g.addColorStop(0, '#6f6658');
    g.addColorStop(1, '#3b342c');
    rc.fillStyle = g;
    rc.fillRect(0, hz + 20 * u, w, h);
    rc.strokeStyle = 'rgba(30,24,20,0.55)';
    rc.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      let x = rnd() * w;
      let y = hz + 30 * u + rnd() * (h - hz);
      rc.beginPath();
      rc.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (rnd() - 0.5) * 60 * u;
        y += (rnd() - 0.3) * 14 * u;
        rc.lineTo(x, y);
      }
      rc.stroke();
    }
    // scattered rubble
    for (let i = 0; i < 60; i++) {
      const x = rnd() * w;
      const y = hz + 26 * u + Math.pow(rnd(), 0.7) * (h - hz);
      const sz = (3 + rnd() * 12) * u * (0.5 + (y - hz) / (h - hz));
      rc.fillStyle = rnd() < 0.5 ? '#8a8174' : '#4c443b';
      rc.beginPath();
      rc.moveTo(x - sz, y);
      rc.lineTo(x - sz * 0.4, y - sz * 0.8);
      rc.lineTo(x + sz * 0.6, y - sz * 0.6);
      rc.lineTo(x + sz, y);
      rc.closePath();
      rc.fill();
    }
  }
}

/* ---------- the monster ---------- */

function drawMonster(c: C, s: State, t: number) {
  if (s.monsterA <= 0.01) return;
  const m = s.m;
  const sh = easeOutCubic(s.shrug) * 26;
  const breathe = Math.sin(t * 1.1) * 5;
  c.save();
  c.globalAlpha = s.monsterA;
  c.translate(s.mx, s.my);
  c.scale(m, m);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const lw = 4;

  // long hair streaming behind
  const sway = Math.sin(t * 0.9) * 10;
  inked(
    c,
    (g) => {
      g.moveTo(-60, -520);
      g.bezierCurveTo(-180, -500, -230 + sway, -300, -250 + sway, -40);
      g.lineTo(-170 + sway, -120);
      g.lineTo(-200 + sway, 20);
      g.bezierCurveTo(-120, -200, -90, -380, -40, -440);
      g.lineTo(60, -440);
      g.bezierCurveTo(90, -380, 120, -200, 200 - sway, 20);
      g.lineTo(170 - sway, -120);
      g.lineTo(250 - sway, -40);
      g.bezierCurveTo(230 - sway, -300, 180, -500, 60, -520);
      g.closePath();
    },
    M_HAIR,
    INK,
    lw
  );

  // arms hanging at his sides
  for (const side of [-1, 1]) {
    cel(c, (g) => capsule(g, side * 150, -330 - sh, 58, side * 200, -120, 48), M_SKIN, M_SKIN_SH, -side * 10, -8, INK, lw);
    cel(c, (g) => capsule(g, side * 200, -120, 48, side * 196, 60, 44), M_SKIN, M_SKIN_SH, -side * 10, -8, INK, lw);
    // armoured bracer
    cel(c, (g) => capsule(g, side * 202, -70, 52, side * 198, 10, 50), M_ARMOR, M_ARMOR_SH, -side * 8, -6, INK, lw);
    inked(c, (g) => g.rect(side * 202 - 50, -30, 100, 10), GOLD, INK, 2.5);
  }

  // torso: broad chest, armour belt
  const torso = (g: C) => {
    g.moveTo(-150, -350 - sh);
    g.bezierCurveTo(-170, -260, -120, -150, -100, 40);
    g.lineTo(100, 40);
    g.bezierCurveTo(120, -150, 170, -260, 150, -350 - sh);
    g.quadraticCurveTo(0, -390 - sh * 0.5, -150, -350 - sh);
    g.closePath();
  };
  cel(c, torso, M_SKIN, M_SKIN_SH, -14, -10, INK, lw);
  c.strokeStyle = M_SKIN_SH;
  c.lineWidth = 5;
  c.beginPath();
  // pectorals and abs
  c.moveTo(-100, -270);
  c.quadraticCurveTo(-40, -240, 0, -280);
  c.quadraticCurveTo(40, -240, 100, -270);
  c.moveTo(0, -280);
  c.lineTo(0, -60);
  for (const yy of [-200, -150, -100]) {
    c.moveTo(-50, yy);
    c.quadraticCurveTo(-25, yy + 10, -6, yy);
    c.moveTo(6, yy);
    c.quadraticCurveTo(25, yy + 10, 50, yy);
  }
  c.stroke();
  // chest gem
  inked(c, (g) => g.ellipse(0, -320 - sh * 0.6, 24, 18, 0, 0, TAU), '#4de0d0', INK, 3);
  inked(c, (g) => g.ellipse(-6, -326 - sh * 0.6, 8, 5, 0, 0, TAU), '#c9fff7', null, 0);
  // armour skirt
  inked(
    c,
    (g) => {
      g.moveTo(-110, -40);
      g.lineTo(110, -40);
      g.lineTo(130, 60);
      g.lineTo(-130, 60);
      g.closePath();
    },
    M_ARMOR,
    INK,
    lw
  );
  inked(c, (g) => g.rect(-112, -46, 224, 18), GOLD, INK, 3);

  // great pauldrons with gold spikes, lifted by the shrug
  for (const side of [-1, 1]) {
    c.save();
    c.translate(side * 150, -350 - sh);
    c.scale(side, 1);
    inked(
      c,
      (g) => {
        g.moveTo(-10, 30);
        g.lineTo(30, -110);
        g.lineTo(48, -40);
        g.lineTo(80, -150);
        g.lineTo(96, -30);
        g.lineTo(120, -80);
        g.lineTo(118, 30);
        g.closePath();
      },
      GOLD,
      INK,
      lw
    );
    cel(
      c,
      (g) => {
        g.moveTo(-60, 10);
        g.bezierCurveTo(-40, -70, 90, -80, 120, 20);
        g.bezierCurveTo(110, 80, 40, 100, -20, 70);
        g.closePath();
      },
      M_ARMOR,
      M_ARMOR_SH,
      -8,
      -10,
      INK,
      lw
    );
    c.strokeStyle = GOLD_SH;
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(-40, 30);
    c.bezierCurveTo(-20, -30, 80, -40, 108, 30);
    c.stroke();
    c.restore();
  }

  // head: small, crested, with one huge eye
  const hy = -440 - sh * 0.7;
  cel(c, (g) => capsule(g, 0, hy + 70, 46, 0, hy + 10, 40), M_SKIN, M_SKIN_SH, -6, -6, INK, lw);
  const head = (g: C) => {
    g.moveTo(-64, hy - 20);
    g.bezierCurveTo(-70, hy - 110, 70, hy - 110, 64, hy - 20);
    g.bezierCurveTo(60, hy + 30, 30, hy + 64, 0, hy + 70);
    g.bezierCurveTo(-30, hy + 64, -60, hy + 30, -64, hy - 20);
    g.closePath();
  };
  cel(c, head, M_SKIN, M_SKIN_SH, -10, -8, INK, lw);
  // crest of horns
  inked(
    c,
    (g) => {
      g.moveTo(-50, hy - 70);
      g.lineTo(-90, hy - 160);
      g.lineTo(-24, hy - 92);
      g.lineTo(0, hy - 190);
      g.lineTo(24, hy - 92);
      g.lineTo(90, hy - 160);
      g.lineTo(50, hy - 70);
      g.quadraticCurveTo(0, hy - 100, -50, hy - 70);
      g.closePath();
    },
    GOLD,
    INK,
    lw
  );
  // the eye: narrows when annoyed
  const lid = clamp(0.25 + s.annoy * 0.45, 0, 0.8);
  const eye = (g: C) => g.ellipse(0, hy - 18, 42, 30, 0, 0, TAU);
  inked(c, eye, '#fff8e8', INK, lw);
  within(c, eye, () => {
    const lookX = Math.sin(t * 0.7) * 6;
    const ir = c.createRadialGradient(lookX - 6, hy - 24, 2, lookX, hy - 18, 22);
    ir.addColorStop(0, '#ffe9a0');
    ir.addColorStop(0.5, '#ff7a1a');
    ir.addColorStop(1, '#a3150c');
    c.fillStyle = ir;
    c.beginPath();
    c.arc(lookX, hy - 18, 22, 0, TAU);
    c.fill();
    c.fillStyle = '#1a0606';
    c.beginPath();
    c.ellipse(lookX, hy - 18, 5, 15, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(lookX - 8, hy - 28, 5, 0, TAU);
    c.fill();
    // heavy upper lid
    c.fillStyle = M_SKIN_SH;
    c.fillRect(-50, hy - 60, 100, 30 + lid * 40);
  });
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(-44, hy - 30 + lid * 40 - 4);
  c.quadraticCurveTo(0, hy - 30 + lid * 40 + 6, 44, hy - 30 + lid * 40 - 4);
  c.stroke();
  // mouth: a flat unimpressed line
  c.beginPath();
  c.moveTo(-18, hy + 40);
  c.quadraticCurveTo(0, hy + 36 + s.annoy * 6, 18, hy + 40);
  c.stroke();
  c.restore();
  c.globalAlpha = 1;
}

/* ---------- Saitama ---------- */

const J = [0, 0, 0, 0];

function drawSaitama(c: C, s: State, t: number) {
  const p = s.pose;
  const k = s.k;
  c.save();
  c.translate(s.sx, s.gy);
  c.scale(k, k);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const lw = 2.2;
  const neckX = p.hipX + Math.sin(p.lean) * 58;
  const neckY = p.hipY - Math.cos(p.lean) * 58;
  const nSx = neckX + 4;
  const nSy = neckY + 6;
  const fSx = neckX - 10;
  const fSy = neckY + 5;
  const wind = 0.3 + s.serious * 0.9;

  // cape streaming behind
  const cape = (g: C) => {
    const ph = t * (3 + wind * 5);
    const pts: number[] = [nSx - 2, nSy - 4, fSx - 8, fSy - 2];
    const tipX = fSx - 46 - wind * 46;
    const tipY = p.hipY + 40 - wind * 30;
    for (let i = 0; i <= 5; i++) {
      const q = i / 5;
      pts.push(lerp(fSx - 20, tipX, q) - Math.sin(ph + q * 3) * 4 * wind, lerp(p.hipY + 58, tipY, q) + Math.sin(ph * 1.3 + q * 5) * 8 * wind);
    }
    pts.push(tipX - 10 - Math.sin(ph) * 8, tipY - 46 - wind * 10);
    pts.push(fSx - 30 - wind * 26, fSy - 8 - wind * 6);
    smooth(g, pts);
  };
  cel(c, cape, CAPE, CAPE_SH, 3, -4, INK, lw);

  // legs
  const leg = (hx: number, hy: number, fx: number, near: boolean) => {
    elbow(J, hx, hy, fx, -6, 46, 46, -1);
    const kx = J[0];
    const ky = J[1];
    const base = near ? SUIT : SUIT_SH;
    cel(c, (g) => capsule(g, hx, hy, 11, kx, ky, 9), base, SUIT_SH, -2, -2, INK, lw);
    cel(c, (g) => capsule(g, kx, ky, 9, fx, -6, 7.5), base, SUIT_SH, -2, -2, INK, lw);
    // red boot
    const bx = lerp(kx, fx, 0.45);
    const by = lerp(ky, -6, 0.45);
    cel(c, (g) => capsule(g, bx, by, 8.6, fx, -6, 8), RED, RED_SH, -2, -2, INK, lw);
    cel(
      c,
      (g) => {
        g.moveTo(fx - 9, -12);
        g.quadraticCurveTo(fx + 4, -16, fx + 16, -6);
        g.quadraticCurveTo(fx + 18, 0, fx + 12, 1);
        g.lineTo(fx - 9, 1);
        g.closePath();
      },
      RED,
      RED_SH,
      -1,
      -2,
      INK,
      lw
    );
  };
  leg(p.hipX - 6, p.hipY, p.fFx, false);

  // far arm behind the body
  const arm = (sx: number, sy: number, hx: number, hy: number, near: boolean) => {
    elbow(J, sx, sy, hx, hy, 30, 30, near ? 1 : 1);
    const ex = J[0];
    const ey = J[1];
    const wx = J[2];
    const wy = J[3];
    const base = near ? SUIT : SUIT_SH;
    cel(c, (g) => capsule(g, sx, sy, 7.5, ex, ey, 6.5), base, SUIT_SH, -1.5, -2, INK, lw);
    cel(c, (g) => capsule(g, ex, ey, 6.5, lerp(ex, wx, 0.45), lerp(ey, wy, 0.45), 6), base, SUIT_SH, -1.5, -2, INK, lw);
    // red glove up to the forearm, with a fist
    cel(c, (g) => capsule(g, lerp(ex, wx, 0.4), lerp(ey, wy, 0.4), 7.4, wx, wy, 6.8), RED, RED_SH, -1.5, -2, INK, lw);
    const a = Math.atan2(wy - ey, wx - ex);
    c.save();
    c.translate(wx + Math.cos(a) * 5, wy + Math.sin(a) * 5);
    c.rotate(a);
    cel(c, (g) => g.ellipse(2, 0, 9, 8, 0, 0, TAU), RED, RED_SH, -1.5, -2, INK, lw);
    c.strokeStyle = RED_SH;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(7, -5);
    c.lineTo(10, -5);
    c.moveTo(8, 0);
    c.lineTo(11, 0);
    c.moveTo(7, 5);
    c.lineTo(10, 5);
    c.stroke();
    c.restore();
    return { x: wx + Math.cos(a) * 12, y: wy + Math.sin(a) * 12 };
  };
  arm(fSx, fSy, p.fHx, p.fHy, false);

  // torso: zip up suit, black belt
  const torso = (g: C) => {
    g.moveTo(neckX - 15, neckY + 2);
    g.quadraticCurveTo(neckX + 2, neckY - 3, neckX + 15, neckY + 3);
    g.quadraticCurveTo(neckX + 18, neckY + 24, p.hipX + 13, p.hipY - 2);
    g.lineTo(p.hipX + 14, p.hipY + 10);
    g.lineTo(p.hipX - 15, p.hipY + 10);
    g.lineTo(p.hipX - 14, p.hipY - 2);
    g.quadraticCurveTo(neckX - 20, neckY + 26, neckX - 15, neckY + 2);
    g.closePath();
  };
  cel(c, torso, SUIT, SUIT_SH, 3, -3, INK, lw);
  c.strokeStyle = SUIT_SH;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(neckX + 3, neckY + 2);
  c.lineTo(p.hipX + 4, p.hipY - 4);
  c.stroke();
  c.save();
  c.translate(p.hipX, p.hipY);
  c.rotate(p.lean * 0.5);
  inked(c, (g) => g.rect(-15, -5, 30, 8), '#1d1b1f', INK, 1.6);
  inked(c, (g) => g.rect(-3, -5, 8, 8), '#b8a361', INK, 1.2);
  c.restore();
  leg(p.hipX + 6, p.hipY + 4, p.nFx, true);

  // cape collar and its round black buttons
  inked(
    c,
    (g) => {
      g.moveTo(neckX - 17, neckY + 2);
      g.quadraticCurveTo(neckX, neckY + 10, neckX + 16, neckY + 2);
      g.lineTo(neckX + 14, neckY - 4);
      g.quadraticCurveTo(neckX, neckY + 2, neckX - 16, neckY - 4);
      g.closePath();
    },
    CAPE,
    INK,
    lw
  );
  for (const bx of [-12, 12]) inked(c, (g) => g.arc(neckX + bx, neckY + 1, 3.6, 0, TAU), '#111', INK, 1);

  // head: a shining egg
  const hx = neckX + 3 + Math.sin(p.lean) * 6;
  const hy = neckY - 24;
  cel(c, (g) => capsule(g, neckX, neckY + 2, 6, hx - 2, hy + 10, 6), SKIN, SKIN_SH, -1, -1, INK, lw);
  const head = (g: C) => g.ellipse(hx, hy, 17, 21, 0.08, 0, TAU);
  cel(c, head, SKIN, SKIN_SH, 3, -2, INK, lw);
  inked(c, (g) => g.ellipse(hx - 10, hy + 1, 3.6, 5.5, 0, 0, TAU), SKIN, INK, 1.5);
  // the famous shine
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath();
  c.ellipse(hx - 4, hy - 13, 6, 3, -0.5, 0, TAU);
  c.fill();
  const ser = easeInOutCubic(s.serious);
  c.strokeStyle = INK;
  c.fillStyle = INK;
  if (ser < 0.5) {
    // deadpan: tiny dot eyes under flat lids, a short line mouth
    for (const ex of [hx + 5, hx + 13]) {
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(ex - 3.4, hy - 2);
      c.lineTo(ex + 3.4, hy - 2);
      c.stroke();
      c.beginPath();
      c.arc(ex, hy + 0.3, 1.5, 0, TAU);
      c.fill();
    }
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(hx + 7, hy + 11);
    c.lineTo(hx + 12, hy + 11);
    c.stroke();
  } else {
    // serious: sharp eyes, hard brows, the shadows of a real face
    for (const [ex, sz] of [
      [hx + 4, 1],
      [hx + 13, 0.85],
    ]) {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(ex - 4.5 * sz, hy);
      c.quadraticCurveTo(ex, hy - 3.6, ex + 4.5 * sz, hy - 1.4);
      c.quadraticCurveTo(ex, hy + 2.6, ex - 4.5 * sz, hy);
      c.fill();
      c.fillStyle = '#2b1a12';
      c.beginPath();
      c.arc(ex + 0.6, hy - 0.4, 1.9 * sz, 0, TAU);
      c.fill();
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(ex - 5 * sz, hy - 0.3);
      c.quadraticCurveTo(ex, hy - 4, ex + 5 * sz, hy - 1.6);
      c.stroke();
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(ex - 5 * sz, hy - 7);
      c.lineTo(ex + 5 * sz, hy - 4.4);
      c.stroke();
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(ex - 3 * sz, hy + 4);
      c.lineTo(ex + 2 * sz, hy + 3.6);
      c.stroke();
    }
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(hx + 15, hy + 1);
    c.lineTo(hx + 17, hy + 6);
    c.lineTo(hx + 15, hy + 7);
    c.moveTo(hx + 6, hy + 12);
    c.lineTo(hx + 13, hy + 11.5);
    c.moveTo(hx - 2, hy + 6);
    c.quadraticCurveTo(hx + 1, hy + 13, hx + 6, hy + 17);
    c.stroke();
  }
  const fist = arm(nSx, nSy, p.nHx, p.nHy, true);
  c.restore();
  s.fistX = s.sx + fist.x * k;
  s.fistY = s.gy + fist.y * k;
}

/* ---------- actions ---------- */

function jab(s: State, env: SceneEnv) {
  s.mode = 1;
  s.modeT = 0;
  s.jabSide = -s.jabSide;
  s.jabs++;
  copyPose(s.from, s.pose);
  const hx = s.mx + rand(-60, 60) * s.m;
  const hy = s.my - rand(150, 300) * s.m;
  if (!s.dead) {
    s.hits.push({ x: hx, y: hy, t: 0, big: false });
    if (s.hits.length > 6) s.hits.shift();
    s.shrug = 1;
    s.annoy = Math.min(1, s.annoy + 0.25);
    burst(s.pool, 8, hx, hy, 0, Math.PI, 160 * s.m, 0.5, 6 * s.m, DUST, 3);
  }
  s.kick = Math.max(s.kick, 0.25);
  const bus = s.press.touched ? env.audio() : null;
  if (bus) {
    noise(bus, { duration: 0.12, freq: 900, q: 1.2, gain: 0.18 });
    tone(bus, 120, { type: 'sine', glideTo: 60, decay: 0.15, gain: 0.18 });
  }
}

function seriousPunch(s: State, env: SceneEnv) {
  s.mode = 3;
  s.modeT = 0;
  s.fireC = Math.max(0.35, s.charge);
  copyPose(s.from, s.pose);
  s.flash = env.reducedMotion ? 0.5 : 1;
  s.kick = 1;
  const dx = s.mx - s.fistX;
  const dy = s.my - 330 * s.m - s.fistY;
  s.splitAng = Math.atan2(dy, dx);
  s.splitX = s.fistX;
  s.splitY = s.fistY;
  s.split = 0.0001;
  s.hits.push({ x: s.mx, y: s.my - 280 * s.m, t: 0, big: true });
  if (!s.dead) {
    s.dead = true;
    s.deadT = 0;
    // the monster goes to pieces
    for (let i = 0; i < 90; i++) {
      const x = s.mx + rand(-180, 180) * s.m;
      const y = s.my - rand(0, 560) * s.m;
      const sp = rand(200, 900) * s.m;
      const a = s.splitAng + rand(-0.7, 0.7);
      emit(s.pool, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(1, 2.2), rand(6, 22) * s.m, CHUNK, 0.6, 300 * s.m);
    }
  }
  const bus = s.press.touched ? env.audio() : null;
  if (bus) {
    tone(bus, 70, { type: 'sine', glideTo: 24, decay: 2.2, gain: 0.4 });
    tone(bus, 140, { type: 'sawtooth', glideTo: 40, decay: 0.9, gain: 0.12 });
    noise(bus, { duration: 2.4, freq: 300, type: 'lowpass', gain: 0.45 });
    noise(bus, { duration: 0.6, freq: 2400, q: 0.6, gain: 0.18 });
  }
}

function copyPose(out: Pose, a: Pose) {
  for (const key of POSE_KEYS) out[key] = a[key];
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 2.2,
    init: () => ({
      press: makePress(),
      mode: 0,
      modeT: 0,
      jabSide: 1,
      jabs: 0,
      serious: 0,
      charge: 0,
      fireC: 0,
      shrug: 0,
      annoy: 0,
      dead: false,
      deadT: 0,
      monsterA: 1,
      split: 0,
      splitAng: -1,
      splitX: 0,
      splitY: 0,
      flash: 0,
      kick: 0,
      hits: [],
      pose: { ...IDLE },
      from: { ...IDLE },
      demoT: 0,
      t: 0,
      pool: makePool(380),
      hum: null,
      portrait: false,
      k: 1,
      sx: 0,
      gy: 0,
      m: 1,
      mx: 0,
      my: 0,
      horizon: 0,
      fistX: 0,
      fistY: 0,
      sky: null,
      clouds: null,
      ruins: null,
      sprites: {
        white: glowSprite(128, [
          [0, 'rgba(255,255,255,1)'],
          [0.3, 'rgba(255,250,220,0.6)'],
          [1, 'rgba(255,240,200,0)'],
        ]),
        sun: glowSprite(128, [
          [0, 'rgba(255,255,240,1)'],
          [0.15, 'rgba(255,250,210,0.9)'],
          [0.4, 'rgba(255,240,180,0.3)'],
          [1, 'rgba(255,230,160,0)'],
        ]),
        dust: glowSprite(64, [
          [0, 'rgba(190,180,165,0.8)'],
          [0.6, 'rgba(160,150,135,0.35)'],
          [1, 'rgba(140,130,120,0)'],
        ]),
      },
    }),
    resize: (s, env) => {
      const { w, h } = env;
      s.portrait = h > w * 1.1;
      if (s.portrait) {
        s.horizon = h * 0.62;
        s.gy = h * 0.93;
        s.k = Math.min((h * 0.3) / 200, (w * 0.5) / 120);
        s.sx = w * 0.26;
        s.m = Math.min((w * 0.9) / 520, (h * 0.5) / 600);
        s.mx = w * 0.62;
        s.my = s.horizon + 30 * s.m;
      } else {
        s.horizon = h * 0.7;
        s.gy = h * 0.93;
        s.k = (h * 0.44) / 200;
        s.sx = w * 0.22;
        s.m = (h * 0.66) / 600;
        s.mx = w * 0.68;
        s.my = s.horizon + 40 * s.m;
      }
      paintSky(s, env);
    },
    update: (s, env, dt, t) => {
      s.t = t;
      const rm = env.reducedMotion;
      const p = s.press;
      const demo = !p.touched && (!env.interactive || rm);
      if (demo) {
        // tiles: a couple of bored jabs, then a wind up into the Serious Punch
        s.demoT += dt;
        const ph = s.demoT % 9;
        const wasDemoDown = p.key;
        p.key = (ph > 0.3 && ph < 0.4) || (ph > 1.0 && ph < 1.1) || (ph > 1.6 && ph < 3.4);
        if (p.key && !wasDemoDown) p.began = true;
      }
      const down = stepPress(p, dt, 0.22);
      if (p.tapped && s.mode !== 3) jab(s, env);
      if (p.long && s.mode !== 2 && s.mode !== 3) {
        s.mode = 2;
        s.modeT = 0;
        copyPose(s.from, s.pose);
      }
      if (p.released && s.mode === 2) seriousPunch(s, env);
      if (!down && s.mode === 2) seriousPunch(s, env);
      s.modeT += dt;
      if (rm && p.touched && (s.mode !== 0 || s.split > 0 || s.dead)) env.wake(300);

      // pose
      let target: Pose = IDLE;
      let speed = 6;
      if (s.mode === 1) {
        target = s.modeT < 0.16 ? (s.jabSide > 0 ? JAB_N : JAB_F) : IDLE;
        speed = s.modeT < 0.16 ? 40 : 8;
        if (s.modeT > 0.45) s.mode = 0;
      } else if (s.mode === 2) {
        target = WIND;
        speed = 7;
        s.charge = Math.min(1, s.charge + dt * 0.8);
      } else if (s.mode === 3) {
        target = s.modeT < 1.6 ? SERIOUS : IDLE;
        speed = s.modeT < 1.6 ? 45 : 3;
        if (s.modeT > 2.8) {
          s.mode = 0;
          s.charge = 0;
        }
      }
      for (const key of POSE_KEYS) s.pose[key] = damp(s.pose[key], target[key], speed, dt);
      const breath = Math.sin(t * 1.6) * 0.8;
      s.pose.hipY += breath * dt;
      s.serious = damp(s.serious, s.mode === 2 || (s.mode === 3 && s.modeT < 2.2) ? 1 : 0, s.mode === 2 ? 10 : 3, dt);

      // monster
      s.shrug = Math.max(0, s.shrug - dt * 2.4);
      s.annoy = Math.max(0, s.annoy - dt * 0.15);
      if (s.dead) {
        s.deadT += dt;
        s.monsterA = Math.max(0, 1 - s.deadT * 6);
        if (s.deadT > 6) {
          s.dead = false;
          s.annoy = 0;
        }
      } else {
        s.monsterA = Math.min(1, s.monsterA + dt * 0.8);
      }
      // the cloud split opens fast and closes slowly
      if (s.split > 0) {
        const age = s.mode === 3 ? s.modeT : 99;
        if (age < 1) s.split = Math.min(1, s.split + dt * 3.2);
        else s.split = Math.max(0, s.split - dt * 0.12);
      }
      for (const hit of s.hits) hit.t += dt;
      while (s.hits.length && s.hits[0].t > 1.2) s.hits.shift();
      s.flash = Math.max(0, s.flash - dt * 1.6);
      s.kick = Math.max(0, s.kick - dt * 1.4);

      // winding up: rocks lift off the ground, dust swirls
      if (s.mode === 2 && dt > 0) {
        if (Math.random() < 0.5)
          emit(s.pool, s.sx + rand(-1.2, 1.2) * 100 * s.k, s.gy + rand(-4, 6) * s.k, rand(-10, 10) * s.k, -rand(40, 120) * s.k, rand(0.8, 1.6), rand(2, 5) * s.k, ROCK, 0.5, -10 * s.k);
        if (Math.random() < 0.6) emit(s.pool, s.sx + rand(-1, 1) * 70 * s.k, s.gy, rand(-140, 140) * s.k, -rand(10, 60) * s.k, rand(0.4, 0.9), rand(10, 24) * s.k, DUST, 2);
      }
      if (s.mode === 3 && s.modeT < 0.5 && dt > 0) {
        for (let i = 0; i < 4; i++)
          emit(s.pool, s.sx + rand(-1, 1) * 40 * s.k, s.gy, rand(-500, 200) * s.k, -rand(20, 160) * s.k, rand(0.6, 1.2), rand(14, 34) * s.k, DUST, 1.5);
        if (Math.random() < 0.6) emit(s.pool, rand(0, env.w), rand(0, s.horizon), rand(-40, 40), rand(-40, 40), 0.6, rand(1, 3), SPARKLE, 1);
      }
      stepPool(s.pool, dt);

      // hum through the wind up
      if (s.mode === 2 && !s.hum && p.touched) {
        const bus = env.audio();
        if (bus) s.hum = startHum(bus, { type: 'sawtooth', freq: 45, cutoff: 300, noiseAmt: 0.5 });
      }
      if (s.hum) {
        if (s.mode === 2) setHum(s.hum, 45 + 40 * s.charge, 0.05 + 0.1 * s.charge, 300 + 900 * s.charge);
        else {
          stopHum(s.hum);
          s.hum = null;
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx: c, w, h } = env;
      const rm = env.reducedMotion;
      const amp = rm ? 0 : (s.kick * 14 + (s.mode === 2 ? s.charge * 3 : 0)) * Math.min(w, h) / 600;
      c.save();
      c.translate(shakeX(amp, t), shakeY(amp, t));

      if (s.sky) c.drawImage(s.sky, -20, -20, w + 40, h + 40);
      // clouds, parted along the punch when it lands
      if (s.clouds) {
        const sp = easeOutCubic(s.split);
        if (sp <= 0.001) {
          c.drawImage(s.clouds, -20, -20, w + 40, h + 40);
        } else {
          const gap = sp * Math.hypot(w, h) * (0.08 + 0.12 * s.fireC);
          const dx = Math.cos(s.splitAng);
          const dy = Math.sin(s.splitAng);
          const nx = -dy;
          const ny = dx;
          const L = Math.hypot(w, h) * 2;
          // sun breaking through the gap
          c.globalCompositeOperation = 'lighter';
          glow(c, s.sprites.sun, s.splitX + dx * L * 0.25, s.splitY + dy * L * 0.25, Math.min(w, h) * 0.5, sp);
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 1;
          for (const side of [-1, 1]) {
            c.save();
            c.translate(nx * gap * 0.5 * side, ny * gap * 0.5 * side);
            c.beginPath();
            c.moveTo(s.splitX - dx * L, s.splitY - dy * L);
            c.lineTo(s.splitX + dx * L, s.splitY + dy * L);
            c.lineTo(s.splitX + dx * L + nx * L * side, s.splitY + dy * L + ny * L * side);
            c.lineTo(s.splitX - dx * L + nx * L * side, s.splitY - dy * L + ny * L * side);
            c.closePath();
            c.clip();
            c.drawImage(s.clouds, -20, -20, w + 40, h + 40);
            c.restore();
          }
          // bright edges of the torn clouds
          c.globalCompositeOperation = 'lighter';
          c.strokeStyle = `rgba(255,250,230,${(0.5 * sp).toFixed(3)})`;
          c.lineWidth = 3;
          for (const side of [-1, 1]) {
            c.beginPath();
            c.moveTo(s.splitX + nx * gap * 0.5 * side, s.splitY + ny * gap * 0.5 * side);
            c.lineTo(s.splitX + dx * L + nx * gap * 0.5 * side, s.splitY + dy * L + ny * gap * 0.5 * side);
            c.stroke();
          }
          c.globalCompositeOperation = 'source-over';
        }
      }

      drawMonster(c, s, t);
      if (s.ruins) c.drawImage(s.ruins, 0, 0, w, h);

      // punch hits on the monster: small rings for jabs, a blinding blast for the real one
      c.globalCompositeOperation = 'lighter';
      for (const hit of s.hits) {
        const q = hit.t / (hit.big ? 1.2 : 0.4);
        if (q >= 1) continue;
        const R = (hit.big ? 420 : 50) * s.m * easeOutCubic(q);
        c.strokeStyle = `rgba(255,250,235,${((1 - q) * 0.9).toFixed(3)})`;
        c.lineWidth = (hit.big ? 14 : 3) * (1 - q) + 1;
        c.beginPath();
        c.arc(hit.x, hit.y, R, 0, TAU);
        c.stroke();
        if (!hit.big) {
          c.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + 0.3;
            c.moveTo(hit.x + Math.cos(a) * R * 0.6, hit.y + Math.sin(a) * R * 0.6);
            c.lineTo(hit.x + Math.cos(a) * R * 1.3, hit.y + Math.sin(a) * R * 1.3);
          }
          c.stroke();
        } else glow(c, s.sprites.white, hit.x, hit.y, R * 0.9, (1 - q) * 0.9);
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      // particles behind Saitama
      for (const p of s.pool.items) {
        if (p.life <= 0) continue;
        const q = p.life / p.max;
        if (p.kind === DUST) {
          c.globalAlpha = q * 0.7;
          c.drawImage(s.sprites.dust, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        } else if (p.kind === CHUNK) {
          c.globalAlpha = Math.min(1, q * 2);
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.fillStyle = p.size > 14 * s.m ? M_ARMOR : M_SKIN;
          c.strokeStyle = INK;
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(-p.size, -p.size * 0.4);
          c.lineTo(p.size * 0.2, -p.size * 0.7);
          c.lineTo(p.size, p.size * 0.3);
          c.lineTo(-p.size * 0.3, p.size * 0.6);
          c.closePath();
          c.fill();
          c.stroke();
          c.restore();
        } else if (p.kind === ROCK) {
          c.globalAlpha = Math.min(1, q * 3);
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.fillStyle = '#7a7064';
          c.strokeStyle = INK;
          c.lineWidth = 1;
          c.fillRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
          c.strokeRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
          c.restore();
        }
      }
      c.globalAlpha = 1;

      // serious aura: wind lines around him
      if (s.serious > 0.05) {
        c.strokeStyle = `rgba(255,255,255,${(0.5 * s.serious).toFixed(3)})`;
        c.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          const a = i * 0.63 + t * 4;
          const r0 = (60 + ((t * 120 + i * 37) % 60)) * s.k;
          const cx = s.sx;
          const cy = s.gy - 100 * s.k;
          c.beginPath();
          c.arc(cx, cy, r0, a, a + 0.5);
          c.stroke();
        }
      }

      drawSaitama(c, s, t);

      // the Serious Punch itself: a cone of force from the fist to the sky
      if (s.mode === 3 && s.modeT < 1.2) {
        const q = s.modeT / 1.2;
        const L = Math.hypot(w, h) * 1.2 * easeOutCubic(Math.min(1, q * 3));
        const a = s.splitAng;
        const spread = 0.1 + 0.08 * s.fireC;
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(255,252,235,${(0.85 * (1 - q)).toFixed(3)})`;
        c.beginPath();
        c.moveTo(s.fistX, s.fistY);
        c.lineTo(s.fistX + Math.cos(a - spread) * L, s.fistY + Math.sin(a - spread) * L);
        c.lineTo(s.fistX + Math.cos(a + spread) * L, s.fistY + Math.sin(a + spread) * L);
        c.closePath();
        c.fill();
        c.strokeStyle = `rgba(255,255,255,${(0.9 * (1 - q)).toFixed(3)})`;
        c.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
          const aa = a + rand(-spread * 2, spread * 2);
          const d0 = rand(0.05, 0.5) * L;
          c.beginPath();
          c.moveTo(s.fistX + Math.cos(aa) * d0, s.fistY + Math.sin(aa) * d0);
          c.lineTo(s.fistX + Math.cos(aa) * (d0 + L * 0.3), s.fistY + Math.sin(aa) * (d0 + L * 0.3));
          c.stroke();
        }
        glow(c, s.sprites.white, s.fistX, s.fistY, 90 * s.k * (1 - q * 0.5), 1 - q);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }
      c.restore();

      if (s.flash > 0) {
        c.fillStyle = `rgba(255,255,250,${(s.flash * 0.8).toFixed(3)})`;
        c.fillRect(0, 0, w, h);
      }
      // speed lines frame the wind up
      if (s.mode === 2 && s.charge > 0.2) {
        const cx = s.sx;
        const cy = s.gy - 100 * s.k;
        c.strokeStyle = `rgba(20,16,12,${(0.35 * s.charge).toFixed(3)})`;
        c.lineWidth = 2;
        c.beginPath();
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * TAU + Math.sin(t * 30 + i) * 0.02;
          const r0 = Math.hypot(w, h) * (0.32 + 0.1 * Math.abs(Math.sin(i * 7.1 + t * 20)));
          c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          c.lineTo(cx + Math.cos(a) * r0 * 2, cy + Math.sin(a) * r0 * 2);
        }
        c.stroke();
      }
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
      freeCanvas(s.sky, s.clouds, s.ruins);
    },
  });
