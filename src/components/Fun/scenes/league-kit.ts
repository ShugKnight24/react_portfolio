import { lerp, TAU } from './runtime';
import { mulberry } from './heroes-kit';

/**
 * Shared pieces for the League champion scenes (Darius, Garen, Lux, Zed, Talon, Tryndamere,
 * Yasuo, Yone): a two tone limb, lane minions for either team, a Summoner's Rift turret, jungle
 * canopy strips and grass, a river crossing, a depth sort, Darius himself, who appears as the
 * player in one scene and as Garen's rival in another, and the two brothers Yasuo and Yone, who
 * each watch the other's scene from across the river.
 * Figures are drawn facing right with their feet at the origin in unscaled units.
 */

type C = CanvasRenderingContext2D;

export function limb(c: C, x0: number, y0: number, x1: number, y1: number, wd: number, cols: string[], flat: string | null) {
  c.lineCap = 'round';
  c.strokeStyle = flat ?? cols[0];
  c.lineWidth = wd;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
  if (flat) return;
  c.strokeStyle = cols[1];
  c.lineWidth = wd * 0.58;
  c.beginPath();
  c.moveTo(x0 - wd * 0.12, y0 - wd * 0.16);
  c.lineTo(x1 - wd * 0.12, y1 - wd * 0.16);
  c.stroke();
  if (cols[2]) {
    c.strokeStyle = cols[2];
    c.lineWidth = wd * 0.18;
    c.beginPath();
    c.moveTo(x0 - wd * 0.22, y0 - wd * 0.3);
    c.lineTo(lerp(x0, x1, 0.7) - wd * 0.22, lerp(y0, y1, 0.7) - wd * 0.3);
    c.stroke();
  }
}

/* ---------- minions ---------- */

export interface Minion {
  x: number;
  y: number;
  hp: number;
  flash: number;
  step: number;
  alive: boolean;
  respawn: number;
  caster: boolean;
  /** stacks, marks, knockback: scene defined */
  tag: number;
  vx: number;
}

export function makeMinion(): Minion {
  return { x: 0, y: 0, hp: 3, flash: 0, step: 0, alive: true, respawn: 0, caster: false, tag: 0, vx: 0 };
}

const TEAM = {
  red: ['#4a151b', '#6e1f25', '#a8323a', '#ff7a6a'],
  blue: ['#152a4a', '#1f416e', '#3264a8', '#7ac0ff'],
};

/** A lane minion facing left (red) or right (blue), feet at the origin */
export function drawMinion(c: C, m: Minion, t: number, team: 'red' | 'blue') {
  const col = TEAM[team];
  const bob = Math.abs(Math.sin(m.step)) * 2;
  const st = Math.sin(m.step);
  const hit = m.flash > 0;
  c.lineCap = 'round';
  c.strokeStyle = '#1e1618';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(-3, -16 - bob);
  c.lineTo(-5 + st * 5, 0);
  c.moveTo(3, -16 - bob);
  c.lineTo(5 - st * 5, 0);
  c.stroke();
  c.fillStyle = hit ? '#fff0e8' : col[1];
  c.beginPath();
  c.moveTo(-11, -16 - bob);
  c.lineTo(11, -16 - bob);
  c.lineTo(13, -34 - bob);
  c.lineTo(-13, -34 - bob);
  c.closePath();
  c.fill();
  c.fillStyle = hit ? '#fff' : col[2];
  c.fillRect(-12, -34 - bob, 24, 5);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(2, -29 - bob, 10, 13);
  c.fillStyle = '#d4a24a';
  c.fillRect(-2, -30 - bob, 4, 12);
  c.fillStyle = hit ? '#fff' : col[0];
  c.beginPath();
  c.arc(0, -41 - bob, 9, 0, TAU);
  c.fill();
  c.beginPath();
  c.moveTo(-3, -48 - bob);
  c.lineTo(6, -60 - bob);
  c.lineTo(5, -47 - bob);
  c.fill();
  c.fillStyle = '#0c0608';
  c.fillRect(-9, -43 - bob, 9, 4);
  c.fillStyle = col[3];
  c.fillRect(-8, -42 - bob, 3, 2);
  if (m.caster) {
    c.strokeStyle = '#3b2a20';
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(-10, -12 - bob);
    c.lineTo(-16, -44 - bob);
    c.stroke();
    c.fillStyle = col[3];
    c.beginPath();
    c.arc(-16, -46 - bob, 3 + Math.sin(t * 6 + m.x * 20) * 0.6, 0, TAU);
    c.fill();
  } else {
    c.strokeStyle = '#c9ced8';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-10, -24 - bob);
    c.lineTo(-24, -34 - bob + st * 3);
    c.stroke();
  }
}

/** Little health bar above a unit */
export function healthBar(c: C, x: number, y: number, wd: number, k: number, frac: number, col: string) {
  c.fillStyle = 'rgba(8,6,10,0.85)';
  c.fillRect(x - wd / 2 - 1, y - 1, wd + 2, 5 * k + 2);
  c.fillStyle = col;
  c.fillRect(x - wd / 2, y, wd * Math.max(0, Math.min(1, frac)), 5 * k);
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(x - wd / 2, y, wd * Math.max(0, Math.min(1, frac)), 1.5 * k);
}

/* ---------- terrain pieces ---------- */

/** A bumpy canopy or cliff band from base up by amp, filled to the bottom */
export function canopy(c: C, w: number, h: number, u: number, base: number, amp: number, col: string, seed: number) {
  const r = mulberry(seed);
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(-40 * u, h);
  let x = -40 * u;
  c.lineTo(x, base);
  while (x < w + 40 * u) {
    const bw = (30 + r() * 50) * u;
    c.quadraticCurveTo(x + bw / 2, base - amp * (0.5 + r()) * u, x + bw, base + r() * 8 * u);
    x += bw;
  }
  c.lineTo(w + 40 * u, h);
  c.closePath();
  c.fill();
}

/** Grass tufts scattered over a band, skipping the lane rows */
export function tufts(c: C, w: number, u: number, y0: number, y1: number, n: number, col: string, seed: number, skip0 = 0, skip1 = 0) {
  const r = mulberry(seed);
  c.strokeStyle = col;
  c.lineWidth = Math.max(1, u);
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = y0 + r() * (y1 - y0);
    if (y > skip0 && y < skip1) continue;
    const k = 0.6 + (y - y0) / Math.max(1, y1 - y0);
    for (let b = -1; b <= 1; b++) {
      c.moveTo(x + b * 2 * u, y);
      c.lineTo(x + b * 4 * u * k, y - (6 + r() * 6) * u * k);
    }
  }
  c.stroke();
}

/** A Rift turret: stone base, tapering pillar, open crown; the crystal is drawn live */
export function turret(c: C, x: number, base: number, u: number, team: 'red' | 'blue') {
  const stone = team === 'red' ? ['#2a1a1e', '#3c2428', '#5a3a36'] : ['#1c2436', '#2a3552', '#4a5a7e'];
  c.fillStyle = stone[0];
  c.beginPath();
  c.moveTo(x - 30 * u, base);
  c.lineTo(x - 16 * u, base - 150 * u);
  c.lineTo(x + 16 * u, base - 150 * u);
  c.lineTo(x + 30 * u, base);
  c.closePath();
  c.fill();
  c.fillStyle = stone[1];
  c.beginPath();
  c.moveTo(x - 30 * u, base);
  c.lineTo(x - 16 * u, base - 150 * u);
  c.lineTo(x - 4 * u, base - 150 * u);
  c.lineTo(x - 10 * u, base);
  c.closePath();
  c.fill();
  c.fillStyle = stone[2];
  c.fillRect(x - 24 * u, base - 160 * u, 48 * u, 11 * u);
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(x + s * 24 * u, base - 160 * u);
    c.lineTo(x + s * 30 * u, base - 196 * u);
    c.lineTo(x + s * 16 * u, base - 160 * u);
    c.fill();
  }
  c.fillStyle = team === 'red' ? 'rgba(255,120,90,0.2)' : 'rgba(140,190,255,0.22)';
  c.fillRect(x + 6 * u, base - 146 * u, 3 * u, 140 * u);
}

/* ---------- Darius ---------- */

const D_SKIN = ['#6e4432', '#a06a4e', '#c89070'];
const D_STEEL = ['#15151a', '#2c2c34', '#4c4c58', '#9a9aa8'];
const D_RED = ['#3a0a0e', '#6e141a', '#a82028', '#e8504a'];
const D_ARM = ['#1a1a20', '#3a3a46', '#7a7a8a'];

export interface DariusPose {
  /** angle of the hands around the shoulder */
  hand: number;
  /** direction the haft points from the hands */
  haft: number;
  crouch: number;
  /** cape lift */
  cape: number;
  /** 0 standing, 1 legs tucked in the air */
  tuck: number;
}

/** The axe alone, grip at the origin pointing along +x, edge facing +y */
export function dariusAxe(c: C, len: number, flat: string | null, hot: number) {
  // haft
  c.lineCap = 'round';
  c.strokeStyle = flat ?? '#2a1a14';
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(-30, 0);
  c.lineTo(len, 0);
  c.stroke();
  if (!flat) {
    c.strokeStyle = '#5a3a28';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-28, -1.5);
    c.lineTo(len - 4, -1.5);
    c.stroke();
    // red wraps
    c.strokeStyle = D_RED[2];
    c.lineWidth = 7;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(len * 0.25 + i * 7, 0);
      c.lineTo(len * 0.25 + i * 7 + 3, 0);
      c.stroke();
    }
  }
  // the crescent blade, edge down, back spike up
  const bx = len - 6;
  c.fillStyle = flat ?? D_STEEL[1];
  c.beginPath();
  c.moveTo(bx - 26, -4);
  c.lineTo(bx - 34, 4);
  c.bezierCurveTo(bx - 50, 30, bx - 32, 62, bx - 6, 70);
  c.bezierCurveTo(bx + 10, 58, bx + 26, 40, bx + 30, 18);
  c.bezierCurveTo(bx + 20, 20, bx + 10, 12, bx + 8, -4);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(bx - 10, -4);
  c.lineTo(bx - 4, -34);
  c.lineTo(bx + 6, -4);
  c.closePath();
  c.fill();
  if (flat) return;
  // bevel and cold edge highlight, then the Noxian red inlay
  c.fillStyle = D_STEEL[2];
  c.beginPath();
  c.moveTo(bx - 30, 8);
  c.bezierCurveTo(bx - 42, 30, bx - 28, 54, bx - 6, 62);
  c.bezierCurveTo(bx - 14, 46, bx - 20, 26, bx - 14, 6);
  c.closePath();
  c.fill();
  c.strokeStyle = hot > 0 ? `rgba(255,${Math.round(200 - hot * 120)},${Math.round(180 - hot * 150)},1)` : D_STEEL[3];
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(bx - 36, 8);
  c.bezierCurveTo(bx - 50, 32, bx - 32, 62, bx - 6, 70);
  c.bezierCurveTo(bx + 10, 58, bx + 26, 40, bx + 30, 18);
  c.stroke();
  c.fillStyle = D_RED[2];
  c.beginPath();
  c.moveTo(bx - 14, 10);
  c.lineTo(bx - 4, 36);
  c.lineTo(bx + 8, 14);
  c.lineTo(bx - 3, 20);
  c.closePath();
  c.fill();
}

/** Darius facing right, feet at the origin */
export function darius(c: C, t: number, p: DariusPose, flat: string | null, hot = 0) {
  const cr = p.crouch;
  const tk = p.tuck;
  const hipY = -70 + cr * 14 + tk * 10;
  const chX = 6 + cr * 6;
  const chY = -122 + cr * 18 + tk * 6;
  const hdX = chX + 6 + cr * 4;
  const hdY = chY - 26;
  const sway = Math.sin(t * 1.3);

  // cape, blood red and ragged, streaming back
  c.fillStyle = flat ?? D_RED[0];
  c.beginPath();
  c.moveTo(chX - 22, chY - 4);
  c.bezierCurveTo(chX - 44 - p.cape * 20, chY + 20, chX - 50 - p.cape * 40, hipY + 20 - p.cape * 30, chX - 58 - p.cape * 50 + sway * 3, hipY + 58 - p.cape * 60);
  c.lineTo(chX - 44 - p.cape * 42, hipY + 50 - p.cape * 52);
  c.lineTo(chX - 36 - p.cape * 36, hipY + 62 - p.cape * 56);
  c.lineTo(chX - 24 - p.cape * 26, hipY + 46 - p.cape * 44);
  c.bezierCurveTo(chX - 16, hipY, chX - 10, chY + 20, chX + 4, chY);
  c.closePath();
  c.fill();
  if (!flat) {
    c.fillStyle = D_RED[1];
    c.beginPath();
    c.moveTo(chX - 18, chY);
    c.bezierCurveTo(chX - 34 - p.cape * 14, chY + 22, chX - 36 - p.cape * 26, hipY + 10 - p.cape * 20, chX - 40 - p.cape * 32, hipY + 40 - p.cape * 44);
    c.lineTo(chX - 28 - p.cape * 24, hipY + 36 - p.cape * 36);
    c.bezierCurveTo(chX - 20, hipY, chX - 10, chY + 20, chX - 4, chY + 2);
    c.closePath();
    c.fill();
  }

  // legs: heavy greaves, wide stance or tucked
  const legs = (s: number, front: boolean) => {
    const hx = s * 9;
    const kx = s * 16 + tk * 16 + cr * 10 * s;
    const ky = hipY + 34 - tk * 16 - cr * 6;
    const fx = s * 24 + tk * (s > 0 ? 10 : -4);
    const fy = -tk * 34;
    const sh = front ? D_STEEL : [D_STEEL[0], D_STEEL[1], ''];
    limb(c, hx, hipY, kx, ky, 17, sh, flat);
    limb(c, kx, ky, fx, fy - 3, 15, sh, flat);
    c.fillStyle = flat ?? D_STEEL[1];
    c.beginPath();
    c.moveTo(fx - 9, fy);
    c.lineTo(fx + 14 * (s > 0 ? 1 : 0.6), fy);
    c.lineTo(fx + 8, fy - 9);
    c.lineTo(fx - 8, fy - 10);
    c.closePath();
    c.fill();
    if (!flat) {
      c.fillStyle = D_RED[2];
      c.beginPath();
      c.moveTo(kx - 8, ky - 4);
      c.lineTo(kx + 6, ky - 12);
      c.lineTo(kx + 8, ky + 2);
      c.closePath();
      c.fill();
    }
  };
  legs(-1, false);

  // back arm to the grip
  const shX = chX - 10;
  const shY = chY + 4;
  const hx = chX + 8 + Math.cos(p.hand) * 36;
  const hy = chY + 10 + Math.sin(p.hand) * 36;
  const hx2 = hx - Math.cos(p.haft) * 22;
  const hy2 = hy - Math.sin(p.haft) * 22;
  limb(c, shX, shY, lerp(shX, hx2, 0.5) - 6, lerp(shY, hy2, 0.5) + 10, 12, D_ARM, flat);
  limb(c, lerp(shX, hx2, 0.5) - 6, lerp(shY, hy2, 0.5) + 10, hx2, hy2, 11, D_ARM, flat);

  // tassets and torso
  c.fillStyle = flat ?? D_STEEL[0];
  c.beginPath();
  c.moveTo(-20, hipY - 6);
  c.lineTo(24, hipY - 6);
  c.lineTo(30, hipY + 26);
  c.lineTo(8, hipY + 20);
  c.lineTo(0, hipY + 32);
  c.lineTo(-10, hipY + 20);
  c.lineTo(-28, hipY + 26);
  c.closePath();
  c.fill();
  if (!flat) {
    c.fillStyle = D_RED[1];
    c.fillRect(-4, hipY - 4, 10, 30);
  }
  c.fillStyle = flat ?? D_STEEL[1];
  c.beginPath();
  c.moveTo(chX - 26, chY - 2);
  c.quadraticCurveTo(chX, chY - 10, chX + 26, chY - 2);
  c.lineTo(chX + 20, hipY - 2);
  c.lineTo(chX - 24, hipY - 2);
  c.closePath();
  c.fill();
  if (!flat) {
    const g = c.createLinearGradient(chX + 24, chY, chX - 24, hipY);
    g.addColorStop(0, D_STEEL[3]);
    g.addColorStop(0.18, D_STEEL[2]);
    g.addColorStop(0.6, D_STEEL[1]);
    g.addColorStop(1, D_STEEL[0]);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(chX - 20, chY + 2);
    c.quadraticCurveTo(chX, chY - 6, chX + 22, chY + 2);
    c.lineTo(chX + 16, hipY - 8);
    c.lineTo(chX - 20, hipY - 8);
    c.closePath();
    c.fill();
    // Noxian chevrons on the breastplate
    c.strokeStyle = D_RED[2];
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(chX - 12, chY + 14);
    c.lineTo(chX, chY + 24);
    c.lineTo(chX + 12, chY + 14);
    c.moveTo(chX - 10, chY + 26);
    c.lineTo(chX, chY + 34);
    c.lineTo(chX + 10, chY + 26);
    c.stroke();
    c.fillStyle = '#3a2418';
    c.fillRect(chX - 22, hipY - 12, 40, 6);
    c.fillStyle = '#b08a3a';
    c.fillRect(chX - 4, hipY - 13, 8, 8);
  }

  // head: dark swept hair, beard, heavy brow
  limb(c, chX + 2, chY - 4, hdX, hdY + 10, 13, D_SKIN, flat);
  c.fillStyle = flat ?? D_SKIN[1];
  c.beginPath();
  c.ellipse(hdX + 1, hdY, 10, 12, 0.08, 0, TAU);
  c.fill();
  c.fillStyle = flat ?? '#16100e';
  c.beginPath();
  c.moveTo(hdX - 11, hdY + 2);
  c.bezierCurveTo(hdX - 12, hdY - 14, hdX + 2, hdY - 16, hdX + 10, hdY - 9);
  c.lineTo(hdX + 4, hdY - 8);
  c.bezierCurveTo(hdX - 4, hdY - 8, hdX - 6, hdY - 2, hdX - 6, hdY + 4);
  c.closePath();
  c.fill();
  // swept back hair tail
  c.beginPath();
  c.moveTo(hdX - 8, hdY - 8);
  c.quadraticCurveTo(hdX - 20 - p.cape * 8, hdY - 6, hdX - 24 - p.cape * 12, hdY + 6 - p.cape * 6);
  c.quadraticCurveTo(hdX - 16, hdY, hdX - 9, hdY + 1);
  c.fill();
  if (!flat) {
    c.fillStyle = D_SKIN[2];
    c.beginPath();
    c.ellipse(hdX + 6, hdY - 2, 3.5, 5, 0.2, 0, TAU);
    c.fill();
    c.fillStyle = '#16100e';
    c.beginPath();
    c.moveTo(hdX - 2, hdY + 4);
    c.quadraticCurveTo(hdX + 4, hdY + 16, hdX + 10, hdY + 6);
    c.lineTo(hdX + 11, hdY + 2);
    c.quadraticCurveTo(hdX + 4, hdY + 6, hdX - 2, hdY + 2);
    c.closePath();
    c.fill();
    c.strokeStyle = '#0a0606';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(hdX + 2, hdY - 4);
    c.lineTo(hdX + 11, hdY - 2);
    c.stroke();
    c.fillStyle = hot > 0.3 ? '#ff6a4a' : '#e8d8c8';
    c.fillRect(hdX + 6, hdY - 3, 3, 1.6);
  }

  // spiked pauldrons, the Noxian silhouette
  const pauldron = (px: number, py: number, sc: number, front: boolean) => {
    c.fillStyle = flat ?? (front ? D_STEEL[2] : D_STEEL[1]);
    c.beginPath();
    c.moveTo(px - 18 * sc, py + 10 * sc);
    c.quadraticCurveTo(px - 20 * sc, py - 12 * sc, px, py - 14 * sc);
    c.quadraticCurveTo(px + 20 * sc, py - 12 * sc, px + 18 * sc, py + 10 * sc);
    c.closePath();
    c.fill();
    c.fillStyle = flat ?? D_STEEL[0];
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(px + i * 11 * sc - 5 * sc, py - 10 * sc);
      c.lineTo(px + i * 16 * sc, py - (30 - Math.abs(i) * 6) * sc);
      c.lineTo(px + i * 11 * sc + 5 * sc, py - 12 * sc);
      c.closePath();
      c.fill();
    }
    if (!flat && front) {
      c.fillStyle = D_RED[2];
      c.beginPath();
      c.ellipse(px, py - 2 * sc, 8 * sc, 5 * sc, 0, 0, TAU);
      c.fill();
      c.strokeStyle = D_STEEL[3];
      c.lineWidth = 1.6;
      c.beginPath();
      c.arc(px, py + 4 * sc, 16 * sc, -2.6, -0.6);
      c.stroke();
    }
  };
  pauldron(chX - 20, chY - 2, 1, false);

  // the axe
  c.save();
  c.translate(hx, hy);
  c.rotate(p.haft);
  dariusAxe(c, 110, flat, hot);
  c.restore();

  legs(1, true);
  // front arm
  const fsX = chX + 18;
  const fsY = chY + 2;
  const ex = lerp(fsX, hx, 0.5) + 4;
  const ey = lerp(fsY, hy, 0.5) + 10;
  limb(c, fsX, fsY, ex, ey, 13, D_SKIN, flat);
  limb(c, ex, ey, hx, hy, 12, D_ARM, flat);
  c.fillStyle = flat ?? D_STEEL[1];
  c.beginPath();
  c.arc(hx, hy, 7, 0, TAU);
  c.fill();
  if (!flat) {
    c.strokeStyle = D_STEEL[0];
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(ex, ey);
    c.lineTo(lerp(ex, hx, 0.75), lerp(ey, hy, 0.75));
    c.stroke();
  }
  pauldron(chX + 20, chY - 2, 1.12, true);
}

/* ---------- depth sort ---------- */

/** Insertion sort of order by depth, back to front; both arrays are reused frame to frame */
export function depthSort(order: number[], depth: number[]) {
  for (let i = 1; i < order.length; i++) {
    for (let j = i; j > 0 && depth[j - 1] > depth[j]; j--) {
      const a = order[j];
      order[j] = order[j - 1];
      order[j - 1] = a;
      const b = depth[j];
      depth[j] = depth[j - 1];
      depth[j - 1] = b;
    }
  }
}

/* ---------- river crossing ---------- */

export interface RiverPalette {
  sky: [string, string, string];
  /** treeline bands, back to front */
  trees: [string, string, string];
  /** far bank top and its cut face */
  bank: [string, string];
  water: [string, string, string];
  /** ripples and wet highlights */
  shine: string;
  brush: [string, string];
}

/** The Rift river: sky, treeline, the far bank along top and shallow water down to the bottom */
export function paintRiver(c: C, w: number, h: number, u: number, top: number, pal: RiverPalette, seed: number) {
  const r = mulberry(seed);
  const sky = c.createLinearGradient(0, 0, 0, top);
  sky.addColorStop(0, pal.sky[0]);
  sky.addColorStop(0.6, pal.sky[1]);
  sky.addColorStop(1, pal.sky[2]);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  canopy(c, w, h, u, top - 120 * u, 60, pal.trees[0], seed + 1);
  canopy(c, w, h, u, top - 74 * u, 50, pal.trees[1], seed + 2);
  canopy(c, w, h, u, top - 40 * u, 34, pal.trees[2], seed + 3);
  // shallow water, brighter where the sky reflects near the far bank
  const water = c.createLinearGradient(0, top, 0, h);
  water.addColorStop(0, pal.water[0]);
  water.addColorStop(0.35, pal.water[1]);
  water.addColorStop(1, pal.water[2]);
  c.fillStyle = water;
  c.fillRect(0, top, w, h - top);
  // far bank: grassy lip over a darker cut face
  c.fillStyle = pal.bank[1];
  c.beginPath();
  c.moveTo(-40 * u, top - 24 * u);
  for (let x = -40 * u; x <= w + 40 * u; x += 40 * u) c.lineTo(x, top - 24 * u + Math.sin(x * 0.013 + seed) * 6 * u);
  for (let x = w + 40 * u; x >= -40 * u; x -= 40 * u) c.lineTo(x, top + 14 * u + Math.sin(x * 0.021 + seed) * 5 * u + r() * 4 * u);
  c.closePath();
  c.fill();
  c.fillStyle = pal.bank[0];
  c.beginPath();
  c.moveTo(-40 * u, top - 24 * u);
  for (let x = -40 * u; x <= w + 40 * u; x += 40 * u) c.lineTo(x, top - 24 * u + Math.sin(x * 0.013 + seed) * 6 * u);
  for (let x = w + 40 * u; x >= -40 * u; x -= 40 * u) c.lineTo(x, top + 2 * u + Math.sin(x * 0.017 + seed) * 4 * u);
  c.closePath();
  c.fill();
  tufts(c, w, u, top - 26 * u, top + 2 * u, 90, pal.brush[1], seed + 4);
  // stones breaking the surface, each with a wet top light and a ring of foam
  for (let i = 0; i < 9; i++) {
    const y = lerp(top + 30 * u, h, r());
    const x = r() * w;
    const k = lerp(0.6, 1.3, (y - top) / Math.max(1, h - top));
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(x, y + 2 * u * k, 20 * u * k, 5 * u * k, 0, 0, TAU);
    c.fill();
    c.fillStyle = pal.bank[1];
    c.beginPath();
    c.ellipse(x, y, 16 * u * k, 7 * u * k, 0, Math.PI, TAU);
    c.fill();
    c.fillStyle = pal.shine;
    c.fillRect(x - 8 * u * k, y - 6 * u * k, 10 * u * k, 1.5 * u);
  }
  // ripples: longer and wider apart toward the viewer
  c.strokeStyle = pal.shine;
  c.lineWidth = Math.max(1, u);
  c.beginPath();
  for (let i = 0; i < 120; i++) {
    const q = r();
    const y = lerp(top + 12 * u, h, q * q);
    const x = r() * w;
    const len = (8 + r() * 24) * u * (0.5 + q);
    c.moveTo(x, y);
    c.lineTo(x + len, y);
  }
  c.stroke();
  // near brush in the corners, the tall grass of the Rift
  const brush = (x: number, y: number, sc: number) => {
    for (let i = 0; i < 16; i++) {
      const bx = x + (r() - 0.5) * 110 * sc;
      const bh = (40 + r() * 46) * sc;
      c.fillStyle = i % 3 ? pal.brush[0] : pal.brush[1];
      c.beginPath();
      c.moveTo(bx - 7 * sc, y);
      c.quadraticCurveTo(bx - 2 * sc, y - bh * 0.6, bx + (r() - 0.5) * 22 * sc, y - bh);
      c.quadraticCurveTo(bx + 2 * sc, y - bh * 0.5, bx + 7 * sc, y);
      c.closePath();
      c.fill();
    }
  };
  brush(w * 0.03, h + 12 * u, u * 1.3);
  brush(w * 0.98, h + 16 * u, u * 1.2);
}

/* ---------- the brothers: Yasuo and Yone ---------- */

export interface SwordPose {
  /** front hand around the shoulder: 0 forward, negative raised */
  arm: number;
  /** direction of the front blade from the hand */
  blade: number;
  /** back hand and blade; Yone carries a second sword there */
  arm2: number;
  blade2: number;
  crouch: number;
  /** 0 stance, 1 full lunge */
  lunge: number;
  /** how hard the wind lifts hair and cloth */
  wind: number;
  /** walk cycle phase in radians; mixSword leaves it alone */
  walk?: number;
  /** 0 standing, 1 full stride */
  stride?: number;
}

export function mixSword(o: SwordPose, a: SwordPose, b: SwordPose, k: number) {
  o.arm = lerp(a.arm, b.arm, k);
  o.blade = lerp(a.blade, b.blade, k);
  o.arm2 = lerp(a.arm2, b.arm2, k);
  o.blade2 = lerp(a.blade2, b.blade2, k);
  o.crouch = lerp(a.crouch, b.crouch, k);
  o.lunge = lerp(a.lunge, b.lunge, k);
  o.wind = lerp(a.wind, b.wind, k);
}

/** A katana with the grip at the origin, pointing along +x, edge toward +y; sheen runs along the flat */
export function katana(c: C, len: number, flat: string | null, steel: string, edge: string, sheen: string | null = null, guard = '#b08a3a') {
  c.lineCap = 'round';
  c.strokeStyle = flat ?? '#16110f';
  c.lineWidth = 4.2;
  c.beginPath();
  c.moveTo(-18, 0);
  c.lineTo(0, 0);
  c.stroke();
  if (!flat) {
    c.strokeStyle = '#8a7658';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      c.moveTo(-16 + i * 4, -1.8);
      c.lineTo(-14 + i * 4, 1.8);
    }
    c.stroke();
  }
  // tsuba: a rounded square guard, then the blade
  c.fillStyle = flat ?? guard;
  c.beginPath();
  c.moveTo(0, -5.5);
  c.lineTo(3, -5);
  c.lineTo(3, 5);
  c.lineTo(0, 5.5);
  c.closePath();
  c.fill();
  c.fillStyle = flat ?? steel;
  c.beginPath();
  c.moveTo(3, -2.1);
  c.quadraticCurveTo(len * 0.55, -2.4 - len * 0.035, len, -len * 0.075);
  c.quadraticCurveTo(len * 0.9, -len * 0.035, len * 0.55, 2.4 - len * 0.03);
  c.lineTo(3, 2.3);
  c.closePath();
  c.fill();
  if (flat) return;
  if (sheen) {
    // the coloured sheen along the flat of the blade, fading toward the tip
    c.fillStyle = sheen;
    c.beginPath();
    c.moveTo(7, -1.2);
    c.quadraticCurveTo(len * 0.55, -1.5 - len * 0.035, len * 0.93, -len * 0.07);
    c.quadraticCurveTo(len * 0.55, 0.4 - len * 0.032, 7, 0.6);
    c.closePath();
    c.fill();
  }
  // habaki collar
  c.fillStyle = guard;
  c.fillRect(3, -2.3, 3.2, 4.6);
  c.strokeStyle = edge;
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(6, 1.8);
  c.quadraticCurveTo(len * 0.55, 2 - len * 0.03, len * 0.985, -len * 0.072);
  c.stroke();
}

interface BrotherLook {
  skin: string[];
  top: string[];
  pants: string[];
  sash: string[];
  hair: string[];
  steel: [string, string, string];
  steel2: [string, string, string] | null;
  yone: boolean;
}

const YASUO: BrotherLook = {
  skin: ['#7a4a34', '#b57c5c', '#d8a07c'],
  top: ['#122a4c', '#1f4678', '#3470b0', '#86bcf0'],
  pants: ['#5e4a32', '#8c7050', '#bc9c70'],
  sash: ['#6a4a28', '#b08a52'],
  hair: ['#120e0c', '#2c2119', '#4e3c2c'],
  steel: ['#b8c6d6', '#f4faff', '#6fb4ff'],
  steel2: null,
  yone: false,
};

const YONE: BrotherLook = {
  skin: ['#6e4432', '#a87052', '#cc9474'],
  top: ['#8a8278', '#cfc6b8', '#ece6dc', '#ffffff'],
  pants: ['#141218', '#24222c', '#3c3a48'],
  sash: ['#7a121c', '#c02430'],
  hair: ['#0e0c10', '#221e26', '#3a3440'],
  steel: ['#5fb6ff', '#effaff', '#b8e6ff'],
  steel2: ['#7a0c18', '#ff6a6a', '#d02434'],
  yone: true,
};

function brother(c: C, t: number, p: SwordPose, flat: string | null, L: BrotherLook) {
  const cr = p.crouch;
  const lg = p.lunge;
  const wd = p.wind;
  const wk = p.walk ?? 0;
  const st = p.stride ?? 0;
  const bob = Math.abs(Math.cos(wk)) * st * 4;
  const hipX = lg * 4 + st * 3;
  const hipY = -58 + cr * 12 + lg * 4 - bob;
  const chX = 6 + cr * 5 + lg * 14 + st * 7;
  const chY = -102 + cr * 16 + lg * 8 - bob;
  const hdX = chX + 4 + lg * 4;
  const hdY = chY - 19;
  const sway = Math.sin(t * 2.3);

  // hair behind: Yasuo's topknot tail, Yone's long loose hair
  c.fillStyle = flat ?? L.hair[0];
  c.beginPath();
  if (L.yone) {
    c.moveTo(hdX - 2, hdY - 12);
    c.bezierCurveTo(hdX - 22, hdY - 10, hdX - 20 - wd * 10, hdY + 30, hdX - 30 - wd * 26 + sway * 2, hdY + 58 - wd * 26);
    c.lineTo(hdX - 20 - wd * 18, hdY + 50 - wd * 18);
    c.bezierCurveTo(hdX - 12, hdY + 30, hdX - 6, hdY + 10, hdX + 2, hdY - 2);
  } else {
    c.moveTo(hdX - 4, hdY - 17);
    c.bezierCurveTo(hdX - 22, hdY - 27 - wd * 4, hdX - 40 - wd * 12, hdY - 14 + sway * 3, hdX - 64 - wd * 26, hdY - 2 + sway * 5 - wd * 12);
    c.lineTo(hdX - 44 - wd * 16, hdY + 1 - wd * 5);
    c.lineTo(hdX - 58 - wd * 22, hdY + 12 + sway * 4 - wd * 8);
    c.lineTo(hdX - 34 - wd * 10, hdY + 5 - wd * 2);
    c.lineTo(hdX - 42 - wd * 12, hdY + 18 + sway * 3 - wd * 4);
    c.bezierCurveTo(hdX - 24 - wd * 4, hdY + 6, hdX - 16, hdY - 2, hdX - 8, hdY - 6);
  }
  c.closePath();
  c.fill();
  if (!flat) {
    c.strokeStyle = L.hair[2];
    c.lineWidth = 1.4;
    c.beginPath();
    if (L.yone) {
      c.moveTo(hdX - 6, hdY - 8);
      c.bezierCurveTo(hdX - 18, hdY + 4, hdX - 18 - wd * 8, hdY + 30, hdX - 24 - wd * 20, hdY + 50 - wd * 22);
    } else {
      c.moveTo(hdX - 8, hdY - 18);
      c.bezierCurveTo(hdX - 24, hdY - 24 - wd * 4, hdX - 40 - wd * 12, hdY - 12 + sway * 3, hdX - 58 - wd * 23, hdY - 1 + sway * 5 - wd * 11);
      c.moveTo(hdX - 14, hdY - 8);
      c.bezierCurveTo(hdX - 26, hdY - 6, hdX - 36 - wd * 8, hdY + 2, hdX - 48 - wd * 16, hdY + 9 + sway * 4 - wd * 7);
    }
    c.stroke();
  }

  // cloth tail from the waist, streaming with the wind
  c.fillStyle = flat ?? (L.yone ? L.sash[0] : L.top[0]);
  c.beginPath();
  c.moveTo(hipX - 8, hipY - 6);
  c.bezierCurveTo(hipX - 26, hipY + 4, hipX - 34 - wd * 14, hipY + 26 - wd * 16, hipX - 46 - wd * 24 + sway * 3, hipY + 44 - wd * 34);
  c.lineTo(hipX - 36 - wd * 18, hipY + 44 - wd * 26);
  c.bezierCurveTo(hipX - 24, hipY + 26, hipX - 14, hipY + 10, hipX - 2, hipY);
  c.closePath();
  c.fill();

  // legs: wide hakama over the stance
  const leg = (sd: number, front: boolean) => {
    // walking narrows the stance and swings each foot through on opposite beats
    const ph = sd > 0 ? wk : wk + Math.PI;
    const swing = Math.sin(ph) * st;
    const lift = Math.max(0, -Math.cos(ph)) * st;
    const base = sd > 0 ? 24 + lg * 18 : -22 - lg * 18;
    const fx = lerp(base, sd > 0 ? 8 : -6, st * 0.75) + swing * 30;
    const fy = -lift * 14;
    const kx = lerp(sd > 0 ? 16 + lg * 12 + cr * 6 : -12 - lg * 8 + cr * 2, sd > 0 ? 10 : -2, st * 0.6) + swing * 17 + lift * 7;
    const ky = hipY + 28 - cr * 5 - lift * 7;
    const cols = front ? L.pants : [L.pants[0], L.pants[1], ''];
    limb(c, hipX + sd * 5, hipY, kx, ky, 15, cols, flat);
    c.fillStyle = flat ?? (front ? L.pants[1] : L.pants[0]);
    c.beginPath();
    c.moveTo(kx - 7, ky - 2);
    c.lineTo(kx + 7, ky - 2);
    c.lineTo(fx + 11, fy - 5);
    c.lineTo(fx - 11, fy - 5);
    c.closePath();
    c.fill();
    if (!flat && front) {
      c.fillStyle = L.pants[2];
      c.beginPath();
      c.moveTo(kx + 1, ky);
      c.lineTo(kx + 6, ky);
      c.lineTo(fx + 9, fy - 6);
      c.lineTo(fx + 3, fy - 6);
      c.closePath();
      c.fill();
    }
    if (!L.yone && !flat) {
      // dark shin wraps over the tan trousers
      c.fillStyle = front ? '#2a2220' : '#1c1614';
      c.beginPath();
      c.moveTo(lerp(kx, fx, 0.55) - 6, lerp(ky, fy, 0.55) - 4);
      c.lineTo(lerp(kx, fx, 0.55) + 7, lerp(ky, fy, 0.55) - 4);
      c.lineTo(fx + 8, fy - 6);
      c.lineTo(fx - 6, fy - 6);
      c.closePath();
      c.fill();
    }
    c.fillStyle = flat ?? '#141012';
    c.beginPath();
    c.moveTo(fx - 7, fy);
    c.lineTo(fx + 12, fy);
    c.lineTo(fx + 8, fy - 6);
    c.lineTo(fx - 6, fy - 6);
    c.closePath();
    c.fill();
  };
  leg(-1, false);

  // back arm: Yone's red blade, Yasuo's hand near the scabbard
  const bsX = chX - 6;
  const bsY = chY + 4;
  const bhx = chX - 4 + Math.cos(p.arm2) * 30;
  const bhy = chY + 14 + Math.sin(p.arm2) * 30;
  const bex = lerp(bsX, bhx, 0.5) - 3;
  const bey = lerp(bsY, bhy, 0.5) + 7;
  if (!L.yone) {
    c.strokeStyle = flat ?? '#1a1210';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(hipX + 10, hipY - 8);
    c.lineTo(hipX - 36, hipY + 10);
    c.stroke();
    if (!flat) {
      c.strokeStyle = '#b08a3a';
      c.lineWidth = 5.4;
      c.beginPath();
      c.moveTo(hipX - 33, hipY + 9);
      c.lineTo(hipX - 36, hipY + 10);
      c.stroke();
    }
  }
  limb(c, bsX, bsY, bex, bey, 9, L.yone ? [L.top[0], L.top[1], ''] : [L.skin[0], L.skin[1], ''], flat);
  limb(c, bex, bey, bhx, bhy, 8, L.yone ? [L.pants[0], L.pants[1], ''] : [L.skin[0], L.skin[1], ''], flat);
  if (L.steel2) {
    c.save();
    c.translate(bhx, bhy);
    c.rotate(p.blade2);
    katana(c, 74, flat, L.steel2[0], L.steel2[1], L.steel2[2], '#2a0e12');
    c.restore();
  }

  // torso
  c.fillStyle = flat ?? L.top[1];
  c.beginPath();
  c.moveTo(chX - 13, chY - 2);
  c.quadraticCurveTo(chX + 1, chY - 8, chX + 14, chY);
  c.lineTo(hipX + 13, hipY);
  c.lineTo(hipX - 12, hipY);
  c.closePath();
  c.fill();
  if (!flat) {
    const g = c.createLinearGradient(chX + 14, chY, hipX - 10, hipY);
    g.addColorStop(0, L.top[3]);
    g.addColorStop(0.28, L.top[2]);
    g.addColorStop(0.75, L.top[1]);
    g.addColorStop(1, L.top[0]);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(chX - 9, chY + 1);
    c.quadraticCurveTo(chX + 1, chY - 5, chX + 12, chY + 2);
    c.lineTo(hipX + 10, hipY - 5);
    c.lineTo(hipX - 9, hipY - 5);
    c.closePath();
    c.fill();
    if (L.yone) {
      // red inner collar crossing to the sash
      c.strokeStyle = L.sash[1];
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(chX - 6, chY - 2);
      c.lineTo(chX + 6, chY + 20);
      c.moveTo(chX + 10, chY);
      c.lineTo(chX + 6, chY + 20);
      c.stroke();
    } else {
      // the robe hangs off one shoulder: bare chest and prayer beads
      c.fillStyle = L.skin[1];
      c.beginPath();
      c.moveTo(chX - 1, chY - 3);
      c.lineTo(chX + 14, chY);
      c.lineTo(chX + 10, chY + 22);
      c.closePath();
      c.fill();
      c.fillStyle = L.skin[2];
      c.beginPath();
      c.moveTo(chX + 6, chY - 1);
      c.lineTo(chX + 13, chY + 1);
      c.lineTo(chX + 11, chY + 12);
      c.closePath();
      c.fill();
      // leather strap from the pauldron across the chest to the hip
      c.lineCap = 'butt';
      c.strokeStyle = '#3a2416';
      c.lineWidth = 3.4;
      c.beginPath();
      c.moveTo(chX + 12, chY + 1);
      c.lineTo(hipX - 9, hipY - 8);
      c.stroke();
      c.strokeStyle = '#8a6440';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(chX + 11.5, chY);
      c.lineTo(hipX - 9.5, hipY - 9.2);
      c.stroke();
      c.lineCap = 'round';
      c.fillStyle = '#8a2a1c';
      for (let i = 0; i < 7; i++) {
        const q = i / 6;
        c.beginPath();
        c.arc(lerp(chX - 3, chX + 11, q), chY + 2 + Math.sin(q * Math.PI) * 14, 1.9, 0, TAU);
        c.fill();
      }
    }
    c.fillStyle = L.sash[0];
    c.fillRect(hipX - 12, hipY - 9, 25, 7);
    c.fillStyle = L.sash[1];
    c.fillRect(hipX - 12, hipY - 9, 25, 2.5);
  }

  // head
  limb(c, chX + 2, chY - 3, hdX, hdY + 9, 8, L.skin, flat);
  c.fillStyle = flat ?? L.skin[1];
  c.beginPath();
  c.ellipse(hdX + 1, hdY, 8.5, 10, 0.08, 0, TAU);
  c.fill();
  c.fillStyle = flat ?? L.hair[0];
  c.beginPath();
  c.moveTo(hdX - 9, hdY + 3);
  c.bezierCurveTo(hdX - 10, hdY - 13, hdX + 4, hdY - 15, hdX + 10, hdY - 5);
  c.lineTo(hdX + 5, hdY - 6);
  c.lineTo(hdX + 3, hdY - 2);
  c.bezierCurveTo(hdX - 2, hdY - 6, hdX - 5, hdY - 1, hdX - 5, hdY + 5);
  c.closePath();
  c.fill();
  // a lock of hair falling past the brow
  c.beginPath();
  c.moveTo(hdX + 1, hdY - 12);
  c.quadraticCurveTo(hdX + 8, hdY - 8, hdX + 9, hdY + 3);
  c.quadraticCurveTo(hdX + 5, hdY - 4, hdX - 1, hdY - 7);
  c.closePath();
  c.fill();
  if (!L.yone) {
    // the topknot
    c.beginPath();
    c.ellipse(hdX - 3, hdY - 14, 5.5, 4.2, -0.4, 0, TAU);
    c.fill();
    if (!flat) {
      // tan cord binding the topknot, its ends flicking in the wind
      c.strokeStyle = L.sash[1];
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(hdX - 8, hdY - 15);
      c.lineTo(hdX - 6, hdY - 9);
      c.stroke();
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(hdX - 7, hdY - 12);
      c.quadraticCurveTo(hdX - 14 - wd * 4, hdY - 10 + sway * 2, hdX - 18 - wd * 8, hdY - 4 + sway * 3);
      c.stroke();
    }
  }
  if (L.yone) {
    // bare face: stern brow, a red spirit mark under the eye
    if (!flat) {
      c.fillStyle = L.skin[2];
      c.beginPath();
      c.ellipse(hdX + 5, hdY - 1, 3, 4.5, 0.2, 0, TAU);
      c.fill();
      c.strokeStyle = '#140e0c';
      c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(hdX + 2, hdY - 4.5);
      c.lineTo(hdX + 9.5, hdY - 2.5);
      c.stroke();
      c.fillStyle = '#231812';
      c.fillRect(hdX + 5, hdY - 1.5, 3, 1.4);
      c.strokeStyle = '#d0202c';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(hdX + 6, hdY + 1.5);
      c.lineTo(hdX + 5, hdY + 6);
      c.stroke();
    }
    // the Azakana mask worn on the side of his head, tilted back, two red horns sweeping up
    c.save();
    c.translate(hdX - 7, hdY - 3);
    c.rotate(-0.85);
    c.scale(0.7, 0.7);
    c.fillStyle = flat ?? '#8e1420';
    c.beginPath();
    c.moveTo(-2, -6);
    c.bezierCurveTo(-8, -18, -16, -26, -26 - wd * 4, -30);
    c.bezierCurveTo(-16, -20, -10, -12, -7, -2);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(4, -8);
    c.bezierCurveTo(4, -22, -2, -32, -8 - wd * 3, -40);
    c.bezierCurveTo(2, -28, 2, -16, 0, -6);
    c.closePath();
    c.fill();
    // the face plate: pale with a red brow and a fanged grin
    c.fillStyle = flat ?? '#ece4d6';
    c.beginPath();
    c.ellipse(0, 0, 8, 10.5, 0, 0, TAU);
    c.fill();
    if (!flat) {
      c.fillStyle = '#c01c2a';
      c.beginPath();
      c.moveTo(-8, -3);
      c.quadraticCurveTo(0, -9, 8, -3);
      c.lineTo(8, -6);
      c.quadraticCurveTo(0, -12, -8, -6);
      c.closePath();
      c.fill();
      c.fillStyle = '#16080c';
      c.beginPath();
      c.moveTo(-6, -2);
      c.lineTo(-1.5, 0);
      c.lineTo(-5, 1.5);
      c.closePath();
      c.moveTo(6, -2);
      c.lineTo(1.5, 0);
      c.lineTo(5, 1.5);
      c.closePath();
      c.fill();
      c.fillStyle = '#c01c2a';
      c.beginPath();
      c.moveTo(-5, 4);
      c.quadraticCurveTo(0, 9, 5, 4);
      c.quadraticCurveTo(0, 6, -5, 4);
      c.fill();
      c.fillStyle = '#fff6ea';
      c.fillRect(-3.5, 4.4, 1.4, 2.2);
      c.fillRect(2.1, 4.4, 1.4, 2.2);
      c.strokeStyle = '#ff6a6a';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-3, -7);
      c.bezierCurveTo(-8, -16, -16, -24, -24, -28.5);
      c.stroke();
    }
    c.restore();
    // a cord holding the mask, across the hair
    if (!flat) {
      c.strokeStyle = '#c01c2a';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(hdX - 9, hdY - 1);
      c.quadraticCurveTo(hdX - 2, hdY - 12, hdX + 6, hdY - 9);
      c.stroke();
    }
  } else if (!flat) {
    c.fillStyle = L.skin[2];
    c.beginPath();
    c.ellipse(hdX + 5, hdY - 1, 3, 4.5, 0.2, 0, TAU);
    c.fill();
    c.strokeStyle = '#140e0c';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(hdX + 3, hdY - 3);
    c.lineTo(hdX + 9.5, hdY - 2);
    c.stroke();
    c.fillStyle = '#231812';
    c.fillRect(hdX + 5, hdY - 1.5, 3, 1.4);
  }

  leg(1, true);

  // front arm and the main blade
  const sx = chX + 7;
  const sy = chY + 3;
  const hx = chX + 12 + Math.cos(p.arm) * 32;
  const hy = chY + 12 + Math.sin(p.arm) * 32;
  const ex = lerp(sx, hx, 0.5) + 2;
  const ey = lerp(sy, hy, 0.5) + 8;
  if (L.yone) {
    limb(c, sx, sy, ex, ey, 12, [L.top[1], L.top[2], L.top[3]], flat);
    limb(c, ex, ey, hx, hy, 8, L.pants, flat);
  } else {
    limb(c, sx, sy, ex, ey, 9.5, L.skin, flat);
    limb(c, ex, ey, hx, hy, 8.5, L.skin, flat);
    if (!flat) limb(c, lerp(ex, hx, 0.3), lerp(ey, hy, 0.3), lerp(ex, hx, 0.85), lerp(ey, hy, 0.85), 9.5, ['#5a3e22', '#9a7444', '#c8a070'], null);
  }
  c.save();
  c.translate(hx, hy);
  c.rotate(p.blade);
  katana(c, 80, flat, L.steel[0], L.steel[1], L.steel[2], L.yone ? '#3a4a66' : '#b08a3a');
  c.restore();
  c.fillStyle = flat ?? L.skin[1];
  c.beginPath();
  c.arc(hx, hy, 4, 0, TAU);
  c.fill();
  if (!L.yone) {
    // layered steel guard on the sword shoulder
    const plate = (dy: number, r: number, col: string) => {
      c.fillStyle = flat ?? col;
      c.beginPath();
      c.moveTo(sx - r, sy + dy + 4);
      c.quadraticCurveTo(sx - r * 0.9, sy + dy - r * 0.9, sx + 2, sy + dy - r);
      c.quadraticCurveTo(sx + r * 1.1, sy + dy - r * 0.6, sx + r, sy + dy + 5);
      c.closePath();
      c.fill();
    };
    plate(-4, 15, '#2c3442');
    plate(2, 14, '#5c6878');
    plate(8, 12, '#8d9aae');
    plate(13, 9.5, '#b4c0d2');
    if (!flat) {
      c.strokeStyle = '#1c222c';
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(sx - 12, sy + 10);
      c.quadraticCurveTo(sx + 2, sy, sx + 12, sy + 11);
      c.moveTo(sx - 9, sy + 16);
      c.quadraticCurveTo(sx + 2, sy + 7, sx + 10, sy + 17);
      c.stroke();
      c.strokeStyle = '#eef4fc';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(sx - 11, sy - 11);
      c.quadraticCurveTo(sx + 2, sy - 19, sx + 13, sy - 7);
      c.stroke();
      c.fillStyle = '#d8b25a';
      c.beginPath();
      c.arc(sx + 1, sy - 6, 1.6, 0, TAU);
      c.fill();
    }
  } else {
    c.fillStyle = flat ?? L.sash[1];
    c.fillRect(ex - 6, ey - 2, 12, 3);
  }
}

/** Yasuo, the Unforgiven, facing right with his feet at the origin */
export function yasuo(c: C, t: number, p: SwordPose, flat: string | null) {
  brother(c, t, p, flat, YASUO);
}

/** Yone, the Unforgotten, facing right with his feet at the origin */
export function yone(c: C, t: number, p: SwordPose, flat: string | null) {
  brother(c, t, p, flat, YONE);
}

/** Where the front and back hands sit for a pose, for glows and trails */
export function swordHands(p: SwordPose) {
  const st = p.stride ?? 0;
  const bob = Math.abs(Math.cos(p.walk ?? 0)) * st * 4;
  const chX = 6 + p.crouch * 5 + p.lunge * 14 + st * 7;
  const chY = -102 + p.crouch * 16 + p.lunge * 8 - bob;
  return {
    x: chX + 12 + Math.cos(p.arm) * 32,
    y: chY + 12 + Math.sin(p.arm) * 32,
    x2: chX - 4 + Math.cos(p.arm2) * 30,
    y2: chY + 14 + Math.sin(p.arm2) * 30,
    headX: chX + 4 + p.lunge * 4,
    headY: chY - 19,
  };
}

/* ---------- champion controls: click to move, gestures, keys ---------- */

/** A press shorter than this is a tap: move, attack or a self cast */
export const TAP_TIME = 0.2;
/** Keep holding this long and the hold turns into the ultimate */
export const ULT_HOLD = 0.75;
const DOUBLE_TIME = 0.32;

/** What a press or key resolved to; the scene decides what each one means for its champion */
export type Command = 'tap' | 'move' | 'double' | 'q' | 'w' | 'e' | 'r' | 'stop' | null;

export interface Gesture {
  down: boolean;
  /** performance.now() at the press */
  at: number;
  x: number;
  y: number;
  /** 0 pressed, 1 Q fired, 2 ultimate fired, 3 used up (double tap or move only) */
  stage: number;
  lastTap: number;
  lastX: number;
  lastY: number;
  /** button of the last press, written by pointerButtons before the runtime sees it */
  button: number;
  /** last press came from a finger */
  touch: boolean;
}

export function makeGesture(): Gesture {
  return { down: false, at: 0, x: 0, y: 0, stage: 0, lastTap: -1e9, lastX: 0, lastY: 0, button: 0, touch: false };
}

/** Track the pointer button and type ahead of the runtime and keep the context menu off the canvas */
export function pointerButtons(canvas: HTMLCanvasElement, g: Gesture) {
  const ac = new AbortController();
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      g.button = e.button;
      g.touch = e.pointerType === 'touch';
    },
    { signal: ac.signal }
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal: ac.signal });
  return ac;
}

/** Press: right click moves at once, a left click acts at once, a second quick tap near the first is a double; fingers wait to see tap or hold */
export function gestureDown(g: Gesture, x: number, y: number): Command {
  const now = performance.now();
  g.down = true;
  g.at = now;
  g.x = x;
  g.y = y;
  g.stage = 0;
  if (g.button === 2) {
    g.stage = 3;
    return 'move';
  }
  if (now - g.lastTap < DOUBLE_TIME * 1000 && Math.hypot(x - g.lastX, y - g.lastY) < (g.touch ? 70 : 50)) {
    g.stage = 3;
    g.lastTap = -1e9;
    return 'double';
  }
  if (!g.touch) {
    // a mouse click acts on the press, not the release: no waiting to tell a tap from a hold
    g.stage = 3;
    g.lastTap = now;
    g.lastX = x;
    g.lastY = y;
    return 'tap';
  }
  return null;
}

export function gestureMove(g: Gesture, x: number, y: number) {
  if (!g.down) return;
  g.x = x;
  g.y = y;
}

/** While held: Q once the press outlasts a tap, then the ultimate if it is still held */
export function gestureTick(g: Gesture): Command {
  if (!g.down) return null;
  const held = (performance.now() - g.at) / 1000;
  if (g.stage === 0 && held >= TAP_TIME) {
    g.stage = 1;
    return 'q';
  }
  if (g.stage === 1 && held >= ULT_HOLD) {
    g.stage = 2;
    return 'r';
  }
  return null;
}

export function gestureUp(g: Gesture, x: number, y: number): Command {
  if (!g.down) return null;
  g.down = false;
  if (g.stage !== 0) return null;
  g.lastTap = performance.now();
  g.lastX = x;
  g.lastY = y;
  return 'tap';
}

/** League keys by position (Q W E R, S to stop), plus Space for Q and Enter for R */
export function abilityKey(e: KeyboardEvent): Command {
  switch (e.code) {
    case 'KeyQ':
      return 'q';
    case 'KeyW':
      return 'w';
    case 'KeyE':
      return 'e';
    case 'KeyR':
      return 'r';
    case 'KeyS':
      return 'stop';
  }
  const k = e.key.toLowerCase();
  if (k === 'q' || k === 'w' || k === 'e' || k === 'r') return k;
  if (k === 's') return 'stop';
  if (e.key === ' ') return 'q';
  if (e.key === 'Enter') return 'r';
  return null;
}

/* ---------- movement ---------- */

export interface Mover {
  /** position in scene units; the scene maps them to pixels */
  x: number;
  y: number;
  /** velocity in pixels per second */
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  going: boolean;
  /** facing: 1 right, -1 left */
  face: number;
  /** eased facing, -1 to 1, for a quick turn instead of a snap */
  turn: number;
  /** walk cycle phase and how much of a stride is showing */
  gait: number;
  stride: number;
}

export function makeMover(x: number, y: number, face = 1): Mover {
  return { x, y, vx: 0, vy: 0, tx: x, ty: y, going: false, face, turn: face, gait: 0, stride: 0 };
}

export function moveTo(m: Mover, x: number, y: number) {
  m.tx = x;
  m.ty = y;
  m.going = true;
}

export function halt(m: Mover) {
  m.going = false;
}

/** Put the mover somewhere at once (dashes, blinks), keeping the walk state calm */
export function place(m: Mover, x: number, y: number) {
  m.x = x;
  m.y = y;
  m.vx = 0;
  m.vy = 0;
}

/**
 * Accelerate toward the move target and ease into it, sx and sy being pixels per unit.
 * frozen keeps the target but stands still (casting); speed is pixels per second.
 */
export function stepMover(m: Mover, dt: number, sx: number, sy: number, speed: number, accel: number, strideLen: number, frozen = false) {
  let wx = 0;
  let wy = 0;
  if (m.going && !frozen) {
    const dx = (m.tx - m.x) * sx;
    const dy = (m.ty - m.y) * sy;
    const d = Math.hypot(dx, dy);
    if (d < 2) m.going = false;
    else {
      const sp = Math.min(speed, Math.sqrt(2 * accel * 0.7 * d));
      wx = (dx / d) * sp;
      wy = (dy / d) * sp;
    }
  }
  const ex = wx - m.vx;
  const ey = wy - m.vy;
  const e = Math.hypot(ex, ey);
  const step = accel * (frozen ? 3 : 1) * dt;
  if (e <= step) {
    m.vx = wx;
    m.vy = wy;
  } else {
    m.vx += (ex / e) * step;
    m.vy += (ey / e) * step;
  }
  m.x += (m.vx * dt) / Math.max(1, sx);
  m.y += (m.vy * dt) / Math.max(1, sy);
  const v = Math.hypot(m.vx, m.vy);
  // face the order at once rather than waiting for the velocity to swing round
  if (m.going && !frozen && Math.abs(wx) > speed * 0.2) m.face = wx > 0 ? 1 : -1;
  else if (!m.going && Math.abs(m.vx) > speed * 0.15) m.face = m.vx > 0 ? 1 : -1;
  turnToward(m, dt);
  m.stride = lerp(m.stride, Math.min(1, v / Math.max(1, speed)), 1 - Math.exp(-12 * dt));
  m.gait += (v * dt * Math.PI) / Math.max(1, strideLen);
}

export function turnToward(m: Mover, dt: number) {
  const d = m.face - m.turn;
  const step = dt * 26;
  m.turn = Math.abs(d) <= step ? m.face : m.turn + Math.sign(d) * step;
}

/** Horizontal scale for drawing a turning figure: a quick paper flip that never fully vanishes */
export function turnScale(m: Mover) {
  const a = Math.abs(m.turn);
  return (m.turn < 0 ? -1 : 1) * (0.35 + 0.65 * a);
}

/* ---------- crisp drawing ---------- */

/** Round a CSS pixel offset to whole device pixels so bitmaps and lines land on the grid */
export const snap = (v: number, dpr: number) => Math.round(v * dpr) / dpr;

/**
 * Offscreen background with a margin on every side for camera shake. Paint into c in scene
 * coordinates (the margin is already translated away), then blit with drawBackdrop, which
 * copies it 1:1 onto the device pixel grid instead of stretching it.
 */
export function backdropLayer(prev: HTMLCanvasElement | null, w: number, h: number, dpr: number, margin: number) {
  const m = Math.ceil(margin);
  const cv = prev ?? document.createElement('canvas');
  cv.width = Math.max(1, Math.round((w + m * 2) * dpr));
  cv.height = Math.max(1, Math.round((h + m * 2) * dpr));
  const c = cv.getContext('2d');
  if (c) {
    c.setTransform(dpr, 0, 0, dpr, m * dpr, m * dpr);
    c.imageSmoothingEnabled = true;
  }
  return { cv, c, m };
}

export function drawBackdrop(ctx: C, cv: HTMLCanvasElement | null) {
  if (!cv) return;
  const tr = ctx.getTransform();
  ctx.save();
  // copy in device pixels, keeping only the shake translation, snapped to the grid
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const ox = Math.round(tr.e - (cv.width - ctx.canvas.width) / 2);
  const oy = Math.round(tr.f - (cv.height - ctx.canvas.height) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, ox, oy);
  ctx.restore();
}

/**
 * Draw a figure with a crisp ink outline and a coloured rim on its lit side: draw(flat) paints
 * the whole figure in one colour when flat is set. lw is the outline weight in figure units.
 */
export function inked(c: C, draw: (flat: string | null) => void, ink: string, lw: number, rim: string | null, rimX = 1.6, rimY = -1.2) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    c.save();
    c.translate(Math.cos(a) * lw, Math.sin(a) * lw);
    draw(ink);
    c.restore();
  }
  if (rim) {
    c.save();
    c.translate(rimX, rimY);
    draw(rim);
    c.restore();
  }
  draw(null);
}

/* ---------- ability bar ---------- */

export interface AbilitySlot {
  key: string;
  /** seconds left and the full cooldown */
  cd: number;
  max: number;
  /** 'r,g,b' accent */
  col: string;
  /** extra state: stacks charged, recast open, nothing to hit */
  lit?: boolean;
  off?: boolean;
  /** pips under the key, e.g. Yasuo's wind stacks or Ahri's dashes left */
  pips?: number;
  pipMax?: number;
}

/**
 * A compact Q W E R bar: square keys with a clockwise cooldown sweep, a bright edge when
 * the spell is ready and a pop when it comes back. flash[i] counts down after a cast.
 */
export function drawAbilityBar(c: C, cx: number, y: number, k: number, slots: AbilitySlot[], flash: Float32Array) {
  const size = Math.round(30 * k);
  const gap = Math.round(7 * k);
  const total = slots.length * size + (slots.length - 1) * gap;
  let x = Math.round(cx - total / 2);
  const yy = Math.round(y);
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `700 ${Math.max(9, Math.round(12 * k))}px ui-sans-serif, system-ui, sans-serif`;
  for (let i = 0; i < slots.length; i++) {
    const sl = slots[i];
    const ready = sl.cd <= 0 && !sl.off;
    const pop = flash[i] > 0 ? flash[i] / 0.25 : 0;
    const grow = pop * 3 * k;
    // plate
    c.fillStyle = 'rgba(6,8,14,0.82)';
    c.fillRect(x - grow, yy - grow, size + grow * 2, size + grow * 2);
    c.fillStyle = ready ? `rgba(${sl.col},${sl.lit ? 0.55 : 0.28})` : 'rgba(40,44,56,0.6)';
    c.fillRect(x + 2, yy + 2, size - 4, size - 4);
    if (sl.cd > 0 && sl.max > 0) {
      // the cooldown sweep: dark wedge shrinking clockwise from twelve o'clock
      const q = Math.min(1, sl.cd / sl.max);
      c.save();
      c.beginPath();
      c.rect(x + 2, yy + 2, size - 4, size - 4);
      c.clip();
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.beginPath();
      c.moveTo(x + size / 2, yy + size / 2);
      c.arc(x + size / 2, yy + size / 2, size, -Math.PI / 2, -Math.PI / 2 + q * TAU);
      c.closePath();
      c.fill();
      c.restore();
    }
    c.lineWidth = Math.max(1, Math.round(1.5 * k));
    c.strokeStyle = ready ? `rgba(${sl.col},${sl.lit ? 1 : 0.85})` : 'rgba(110,116,130,0.55)';
    c.strokeRect(x + 0.5, yy + 0.5, size - 1, size - 1);
    if (pop > 0) {
      c.strokeStyle = `rgba(255,255,255,${(pop * 0.9).toFixed(3)})`;
      c.strokeRect(x - grow + 0.5, yy - grow + 0.5, size + grow * 2 - 1, size + grow * 2 - 1);
    }
    c.fillStyle = ready ? '#f4f6fb' : 'rgba(170,176,190,0.8)';
    c.fillText(sl.key, x + size / 2, yy + size / 2 + 0.5);
    if (sl.cd > 0.05 && sl.max >= 1) {
      c.font = `600 ${Math.max(8, Math.round(9 * k))}px ui-sans-serif, system-ui, sans-serif`;
      c.fillStyle = 'rgba(230,234,244,0.9)';
      c.fillText(sl.cd.toFixed(sl.cd < 1 ? 1 : 0), x + size / 2, yy + size + 8 * k);
      c.font = `700 ${Math.max(9, Math.round(12 * k))}px ui-sans-serif, system-ui, sans-serif`;
    } else if (sl.pipMax) {
      for (let p = 0; p < sl.pipMax; p++) {
        const px = Math.round(x + size / 2 + (p - (sl.pipMax - 1) / 2) * 7 * k);
        c.fillStyle = p < (sl.pips ?? 0) ? `rgb(${sl.col})` : 'rgba(60,66,80,0.9)';
        c.fillRect(px - Math.round(2 * k), yy + size + Math.round(4 * k), Math.round(4 * k), Math.round(4 * k));
      }
    }
    x += size + gap;
  }
  c.restore();
}

/* ---------- feedback ---------- */

export interface Marker {
  x: number;
  y: number;
  life: number;
  /** 'r,g,b' */
  col: string;
}

export const MARK_LIFE = 0.5;

export function makeMarker(): Marker {
  return { x: 0, y: 0, life: 0, col: '120,240,160' };
}

export function setMarker(mk: Marker, x: number, y: number, col: string) {
  mk.x = x;
  mk.y = y;
  mk.life = MARK_LIFE;
  mk.col = col;
}

/** The click to move marker: a ring on the ground closing in, with four chevrons */
export function drawMarker(c: C, mk: Marker, k: number) {
  if (mk.life <= 0) return;
  const q = 1 - mk.life / MARK_LIFE;
  const a = Math.min(1, (1 - q) * 1.6);
  const r = lerp(30, 12, 1 - Math.pow(1 - q, 3)) * k;
  c.save();
  c.translate(mk.x, mk.y);
  c.scale(1, 0.4);
  c.strokeStyle = `rgba(${mk.col},${(0.85 * a).toFixed(3)})`;
  c.lineWidth = 2.4 * k;
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.stroke();
  c.fillStyle = `rgba(${mk.col},${a.toFixed(3)})`;
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const rr = r + 9 * k;
    c.save();
    c.rotate(ang);
    c.beginPath();
    c.moveTo(rr, 0);
    c.lineTo(rr + 9 * k, -6 * k);
    c.lineTo(rr + 6 * k, 0);
    c.lineTo(rr + 9 * k, 6 * k);
    c.closePath();
    c.fill();
    c.restore();
  }
  c.restore();
}

/** A ring that fills under a held press: the inner arc arms Q, the outer one the ultimate */
export function drawHoldRing(c: C, g: Gesture, k: number, col: string) {
  if (!g.down || g.stage >= 2) return;
  const held = (performance.now() - g.at) / 1000;
  if (held < 0.07) return;
  const q1 = Math.min(1, held / TAP_TIME);
  const q2 = Math.max(0, Math.min(1, (held - TAP_TIME) / (ULT_HOLD - TAP_TIME)));
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(10,10,20,0.45)';
  c.lineWidth = 5 * k;
  c.beginPath();
  c.arc(g.x, g.y, 22 * k, 0, TAU);
  c.stroke();
  c.strokeStyle = `rgba(${col},0.95)`;
  c.lineWidth = 3 * k;
  c.beginPath();
  c.arc(g.x, g.y, 22 * k, -Math.PI / 2, -Math.PI / 2 + q1 * TAU);
  c.stroke();
  if (q2 > 0) {
    c.strokeStyle = `rgba(255,236,190,${(0.5 + q2 * 0.5).toFixed(3)})`;
    c.lineWidth = 2.4 * k;
    c.beginPath();
    c.arc(g.x, g.y, 31 * k, -Math.PI / 2, -Math.PI / 2 + q2 * TAU);
    c.stroke();
  }
}
