import { createCanvasScene, clamp, damp, easeInOutCubic, easeOutBack, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { freeCanvas, glow, glowSprite, layer, mulberry, setHum, startHum, stopHum } from './heroes-kit';
import type { Hum } from './heroes-kit';

/**
 * Middle-out, at the hacker house. A whiteboard full of diagrams, a humming server rack with
 * blinking lights, a laptop scrolling code, and in the middle a compression rig under a big
 * score dial. Drag data blocks from the crate into the rig's glass chamber (they fill from
 * the middle out). Hold to compress: the middle block squeezes first and the squeeze ripples
 * outward, then the row collapses into one glowing packet that zips off into the rack. The
 * dial swings to the score; a new record pops the dial's glass in a burst of confetti, the
 * rack lights ripple green and the whiteboard earns a star. The room is baked per resize.
 */

type Phase = 'load' | 'merge' | 'launch' | 'score';

interface Block {
  x: number;
  y: number;
  tx: number;
  ty: number;
  state: 'tray' | 'drag' | 'fly' | 'slot';
  slot: number;
  col: number;
  seed: number;
  rot: number;
  pop: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  col: string;
  w: number;
  h: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface State {
  phase: Phase;
  pt: number;
  blocks: Block[];
  drag: Block | null;
  dragDX: number;
  dragDY: number;
  holding: boolean;
  prog: number;
  needle: number;
  needleV: number;
  target: number;
  record: number;
  stars: number;
  popped: number;
  bits: Bit[];
  ledWave: number;
  packetX: number;
  packetY: number;
  flash: number;
  shake: number;
  idle: number;
  touched: boolean;
  autoT: number;
  autoHold: boolean;
  hum: Hum | null;
  press: Hum | null;
  // layout
  u: number;
  portrait: boolean;
  fy: number;
  board: Box;
  rack: Box;
  desk: Box;
  tray: Box;
  win: Box;
  cx: number;
  cy: number;
  cw: number;
  bs: number;
  gx: number;
  gy: number;
  gR: number;
  room: HTMLCanvasElement | null;
  greenGlow: HTMLCanvasElement;
  warm: HTMLCanvasElement;
}

const SLOTS = 7;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const COLS = ['#2fb3a5', '#7d5bd6', '#f08a3c', '#e8578f', '#f2c94c', '#4f8ff0'];
const GREEN = '#2e9e57';
const INK = '#23262c';
const CONFETTI = ['#2e9e57', '#f2c94c', '#e8578f', '#4f8ff0', '#ffffff', '#f08a3c'];

const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + q, y);
  c.arcTo(x + w, y, x + w, y + h, q);
  c.arcTo(x + w, y + h, x, y + h, q);
  c.arcTo(x, y + h, x, y, q);
  c.arcTo(x, y, x + w, y, q);
  c.closePath();
}

/* ---------- the room (baked) ---------- */

function bakeRoom(s: State, w: number, h: number, dpr: number) {
  const { cv, c } = layer(null, w, h, dpr);
  if (!c) return cv;
  const u = s.u;
  const fy = s.fy;
  // warm wall with a soft light falloff, a skirting board, plank floor
  const wall = c.createLinearGradient(0, 0, 0, fy);
  wall.addColorStop(0, '#efe3cc');
  wall.addColorStop(1, '#e2d1b2');
  c.fillStyle = wall;
  c.fillRect(0, 0, w, fy);
  const floor = c.createLinearGradient(0, fy, 0, h);
  floor.addColorStop(0, '#a87a4c');
  floor.addColorStop(1, '#8c6239');
  c.fillStyle = floor;
  c.fillRect(0, fy, w, h - fy);
  c.strokeStyle = 'rgba(70,40,15,0.25)';
  c.lineWidth = 1.5 * u;
  const rnd = mulberry(7);
  for (let y = fy + 18 * u, i = 0; y < h; y += 22 * u + i * 3 * u, i++) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
    for (let x = rnd() * 120 * u; x < w; x += (140 + rnd() * 120) * u) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 22 * u + i * 3 * u);
      c.stroke();
    }
  }
  c.fillStyle = '#f7f0e2';
  c.fillRect(0, fy - 12 * u, w, 12 * u);
  c.fillStyle = 'rgba(0,0,0,0.08)';
  c.fillRect(0, fy, w, 6 * u);

  // window onto the trees
  const wn = s.win;
  if (wn.w > 0) {
    c.fillStyle = '#f7f0e2';
    rr(c, wn.x - 8 * u, wn.y - 8 * u, wn.w + 16 * u, wn.h + 16 * u, 4 * u);
    c.fill();
    const sky = c.createLinearGradient(0, wn.y, 0, wn.y + wn.h);
    sky.addColorStop(0, '#9fd3f2');
    sky.addColorStop(1, '#d9eef7');
    c.fillStyle = sky;
    c.fillRect(wn.x, wn.y, wn.w, wn.h);
    c.save();
    c.beginPath();
    c.rect(wn.x, wn.y, wn.w, wn.h);
    c.clip();
    for (let i = 0; i < 7; i++) {
      const tx = wn.x + (i / 6) * wn.w + (rnd() - 0.5) * 20 * u;
      const ty = wn.y + wn.h * (0.55 + rnd() * 0.25);
      const tr = (26 + rnd() * 30) * u;
      c.fillStyle = i % 2 ? '#5f9e5a' : '#4d8a4c';
      c.beginPath();
      c.arc(tx, ty, tr, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#b8a789';
    c.fillRect(wn.x, wn.y + wn.h * 0.86, wn.w, wn.h * 0.14);
    c.restore();
    c.fillStyle = '#f7f0e2';
    c.fillRect(wn.x + wn.w / 2 - 3 * u, wn.y, 6 * u, wn.h);
    c.fillRect(wn.x, wn.y + wn.h * 0.45, wn.w, 5 * u);
  }

  // whiteboard: diagrams, arrows and scribbled notes (no lettering)
  const b = s.board;
  c.fillStyle = 'rgba(0,0,0,0.12)';
  rr(c, b.x + 5 * u, b.y + 7 * u, b.w, b.h, 6 * u);
  c.fill();
  c.fillStyle = '#b9bec4';
  rr(c, b.x - 6 * u, b.y - 6 * u, b.w + 12 * u, b.h + 12 * u, 7 * u);
  c.fill();
  c.fillStyle = '#fbfcfd';
  c.fillRect(b.x, b.y, b.w, b.h);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const pen = (col: string, lw: number) => {
    c.strokeStyle = col;
    c.lineWidth = lw * u;
  };
  // the middle-out sketch: a long box, a split in the middle, arrows running outward
  const mx = b.x + b.w * 0.08;
  const my = b.y + b.h * 0.14;
  const mw = b.w * 0.5;
  const mh = b.h * 0.2;
  pen('#2a62c9', 2.4);
  c.strokeRect(mx, my, mw, mh);
  c.beginPath();
  for (let i = 1; i < 6; i++) {
    c.moveTo(mx + (mw * i) / 6, my);
    c.lineTo(mx + (mw * i) / 6, my + mh);
  }
  c.stroke();
  pen('#d23c3c', 3);
  c.beginPath();
  c.moveTo(mx + mw / 2, my - 8 * u);
  c.lineTo(mx + mw / 2, my + mh + 8 * u);
  c.stroke();
  const arrow = (x0: number, y0: number, x1: number, y1: number) => {
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    const a = Math.atan2(y1 - y0, x1 - x0);
    c.moveTo(x1, y1);
    c.lineTo(x1 - Math.cos(a - 0.5) * 8 * u, y1 - Math.sin(a - 0.5) * 8 * u);
    c.moveTo(x1, y1);
    c.lineTo(x1 - Math.cos(a + 0.5) * 8 * u, y1 - Math.sin(a + 0.5) * 8 * u);
    c.stroke();
  };
  pen('#d23c3c', 2.2);
  arrow(mx + mw / 2, my + mh + 16 * u, mx + mw * 0.1, my + mh + 16 * u);
  arrow(mx + mw / 2, my + mh + 16 * u, mx + mw * 0.9, my + mh + 16 * u);
  // a falling curve on axes
  const gx0 = b.x + b.w * 0.66;
  const gy0 = b.y + b.h * 0.12;
  const gw = b.w * 0.28;
  const gh = b.h * 0.34;
  pen('#30343a', 2);
  c.beginPath();
  c.moveTo(gx0, gy0);
  c.lineTo(gx0, gy0 + gh);
  c.lineTo(gx0 + gw, gy0 + gh);
  c.stroke();
  pen('#2e9e57', 2.6);
  c.beginPath();
  c.moveTo(gx0 + 4 * u, gy0 + gh * 0.1);
  c.bezierCurveTo(gx0 + gw * 0.3, gy0 + gh * 0.8, gx0 + gw * 0.6, gy0 + gh * 0.85, gx0 + gw, gy0 + gh * 0.9);
  c.stroke();
  // boxes and arrows
  pen('#30343a', 2);
  const bx = b.x + b.w * 0.1;
  const by = b.y + b.h * 0.6;
  const bw2 = b.w * 0.16;
  const bh2 = b.h * 0.16;
  for (let i = 0; i < 3; i++) {
    c.strokeRect(bx + i * bw2 * 1.6, by, bw2, bh2);
    if (i < 2) arrow(bx + i * bw2 * 1.6 + bw2 + 3 * u, by + bh2 / 2, bx + (i + 1) * bw2 * 1.6 - 3 * u, by + bh2 / 2);
  }
  // scribbled notes: wavy lines that read as handwriting from across the room
  const note = (x: number, y: number, len: number, col: string) => {
    pen(col, 1.6);
    c.beginPath();
    c.moveTo(x, y);
    for (let t = 0; t <= len; t += 3 * u) c.lineTo(x + t, y + Math.sin(t * 0.55 / u + x) * 2.2 * u + Math.sin(t * 0.21 / u) * 1.2 * u);
    c.stroke();
  };
  for (let i = 0; i < 3; i++) note(b.x + b.w * 0.62, b.y + b.h * (0.6 + i * 0.1), b.w * (0.22 + (i % 2) * 0.1), i === 1 ? '#2a62c9' : '#30343a');
  note(b.x + b.w * 0.1, b.y + b.h * 0.86, b.w * 0.42, '#30343a');
  // marker tray
  c.fillStyle = '#9aa1a8';
  c.fillRect(b.x + b.w * 0.2, b.y + b.h + 6 * u, b.w * 0.6, 6 * u);
  for (const [i, col] of ['#d23c3c', '#2a62c9', '#30343a'].entries()) {
    c.fillStyle = col;
    c.fillRect(b.x + b.w * (0.3 + i * 0.1), b.y + b.h + 2 * u, 18 * u, 5 * u);
  }

  // the rack: black cabinet, rows of units, vents and cables
  const r = s.rack;
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath();
  c.ellipse(r.x + r.w / 2, r.y + r.h, r.w * 0.7, 10 * u, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#1b1d22';
  rr(c, r.x, r.y, r.w, r.h, 5 * u);
  c.fill();
  c.fillStyle = '#2a2d34';
  rr(c, r.x + 6 * u, r.y + 8 * u, r.w - 12 * u, r.h - 16 * u, 3 * u);
  c.fill();
  const units = 9;
  const uh = (r.h - 24 * u) / units;
  for (let i = 0; i < units; i++) {
    const y = r.y + 12 * u + i * uh;
    c.fillStyle = i % 3 === 0 ? '#3a3e47' : '#30333b';
    c.fillRect(r.x + 10 * u, y + 2 * u, r.w - 20 * u, uh - 4 * u);
    c.fillStyle = '#1c1e23';
    for (let v = 0; v < 6; v++) c.fillRect(r.x + r.w * 0.5 + v * 5 * u, y + uh * 0.3, 2.5 * u, uh * 0.4);
  }
  c.strokeStyle = '#2e9e57';
  c.lineWidth = 2.5 * u;
  c.beginPath();
  c.moveTo(r.x + r.w - 8 * u, r.y + r.h * 0.3);
  c.bezierCurveTo(r.x + r.w + 18 * u, r.y + r.h * 0.5, r.x + r.w - 4 * u, r.y + r.h * 0.8, r.x + r.w + 10 * u, fy + 6 * u);
  c.strokeStyle = '#4f8ff0';
  c.stroke();

  // desk
  const d = s.desk;
  c.fillStyle = 'rgba(0,0,0,0.15)';
  c.beginPath();
  c.ellipse(d.x + d.w / 2, d.y + d.h, d.w * 0.55, 8 * u, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#6b4a2e';
  c.fillRect(d.x + 8 * u, d.y + 12 * u, 8 * u, d.h - 12 * u);
  c.fillRect(d.x + d.w - 16 * u, d.y + 12 * u, 8 * u, d.h - 12 * u);
  c.fillStyle = '#8a6240';
  rr(c, d.x, d.y, d.w, 14 * u, 3 * u);
  c.fill();
  // a mug next to the laptop
  c.fillStyle = '#f4f4f4';
  rr(c, d.x + d.w * 0.82, d.y - 22 * u, 16 * u, 22 * u, 3 * u);
  c.fill();
  c.strokeStyle = '#f4f4f4';
  c.lineWidth = 3 * u;
  c.beginPath();
  c.arc(d.x + d.w * 0.82 + 18 * u, d.y - 12 * u, 5 * u, -1.2, 1.2);
  c.stroke();
  c.fillStyle = GREEN;
  c.fillRect(d.x + d.w * 0.82 + 3 * u, d.y - 15 * u, 10 * u, 6 * u);

  // the crate the blocks come from
  const t = s.tray;
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath();
  c.ellipse(t.x + t.w / 2, t.y + t.h, t.w * 0.56, 9 * u, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#c8935a';
  rr(c, t.x, t.y + t.h * 0.22, t.w, t.h * 0.78, 5 * u);
  c.fill();
  c.fillStyle = '#8f6136';
  rr(c, t.x + 8 * u, t.y + t.h * 0.28, t.w - 16 * u, t.h * 0.5, 3 * u);
  c.fill();
  return cv;
}

/* ---------- live pieces ---------- */

function drawBlock(c: CanvasRenderingContext2D, s: State, b: Block, squash: number, glowK: number) {
  const z = s.bs * (b.state === 'drag' ? 1.08 : 1) * (0.6 + 0.4 * easeOutBack(clamp(b.pop, 0, 1)));
  const wq = z * lerp(1, 0.14, squash);
  c.save();
  c.translate(b.x, b.y);
  c.rotate(b.rot);
  if (b.state === 'drag') {
    c.fillStyle = 'rgba(0,0,0,0.18)';
    rr(c, -wq / 2 + 6 * s.u, -z / 2 + 10 * s.u, wq, z, 6 * s.u);
    c.fill();
  }
  const col = COLS[b.col];
  c.fillStyle = col;
  rr(c, -wq / 2, -z / 2, wq, z, Math.min(6 * s.u, wq / 2));
  c.fill();
  // top light and a dark base for a little volume
  c.fillStyle = 'rgba(255,255,255,0.25)';
  rr(c, -wq / 2, -z / 2, wq, z * 0.3, Math.min(6 * s.u, wq / 2));
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.14)';
  c.fillRect(-wq / 2, z * 0.32, wq, z * 0.18);
  // a little pixel glyph standing for the data inside
  if (squash < 0.4) {
    const rnd = mulberry(b.seed);
    const g = z * 0.13;
    c.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 9; i++) {
      if (rnd() < 0.45) continue;
      const gx = (i % 3) - 1;
      const gy = Math.floor(i / 3) - 1;
      c.fillRect(gx * g * 1.2 * (1 - squash) - g / 2, gy * g * 1.2 - g / 2, g * (1 - squash * 2), g);
    }
  }
  if (glowK > 0) {
    c.fillStyle = `rgba(220,255,230,${glowK * 0.8})`;
    rr(c, -wq / 2, -z / 2, wq, z, Math.min(6 * s.u, wq / 2));
    c.fill();
  }
  c.restore();
}

function slotPos(s: State, i: number) {
  return { x: s.cx + (i - (SLOTS - 1) / 2) * (s.cw / SLOTS), y: s.cy };
}

function drawRig(c: CanvasRenderingContext2D, s: State, t: number) {
  const u = s.u;
  const cw = s.cw + 40 * u;
  const ch = s.bs + 28 * u;
  const x = s.cx - cw / 2;
  const y = s.cy - ch / 2;
  // base and legs
  c.fillStyle = 'rgba(0,0,0,0.16)';
  c.beginPath();
  c.ellipse(s.cx, s.fy + 4 * u, cw * 0.55, 10 * u, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#3b3f46';
  c.fillRect(x + 24 * u, y + ch, 12 * u, s.fy - y - ch);
  c.fillRect(x + cw - 36 * u, y + ch, 12 * u, s.fy - y - ch);
  const body = c.createLinearGradient(0, y + ch, 0, y + ch + 56 * u);
  body.addColorStop(0, '#f2f4f5');
  body.addColorStop(1, '#c9ced3');
  c.fillStyle = body;
  rr(c, x - 10 * u, y + ch - 6 * u, cw + 20 * u, 56 * u, 8 * u);
  c.fill();
  c.fillStyle = GREEN;
  c.fillRect(x - 10 * u, y + ch + 8 * u, cw + 20 * u, 5 * u);
  // a small display with a live waveform
  const dw = 90 * u;
  const dx = s.cx - dw / 2;
  const dy = y + ch + 20 * u;
  c.fillStyle = '#16191e';
  rr(c, dx, dy, dw, 22 * u, 4 * u);
  c.fill();
  c.strokeStyle = s.holding ? '#7dffa8' : '#3ccf78';
  c.lineWidth = 1.6 * u;
  c.beginPath();
  for (let i = 0; i <= 30; i++) {
    const px = dx + 6 * u + (i / 30) * (dw - 12 * u);
    const amp = (s.holding ? 7 : 3) * u * (1 - Math.abs(i / 30 - 0.5) * 1.2);
    const py = dy + 11 * u + Math.sin(i * 0.9 + t * (s.holding ? 18 : 5)) * amp;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.stroke();
  // end clamps
  c.fillStyle = '#5b616a';
  rr(c, x - 14 * u, y - 4 * u, 22 * u, ch + 8 * u, 5 * u);
  c.fill();
  rr(c, x + cw - 8 * u, y - 4 * u, 22 * u, ch + 8 * u, 5 * u);
  c.fill();
  // glass chamber back
  c.fillStyle = 'rgba(190,230,255,0.25)';
  rr(c, x + 8 * u, y, cw - 16 * u, ch, 10 * u);
  c.fill();
  // slot marks
  c.fillStyle = 'rgba(40,60,80,0.18)';
  for (let i = 0; i < SLOTS; i++) {
    const p = slotPos(s, i);
    c.fillRect(p.x - s.bs * 0.45, y + ch - 8 * u, s.bs * 0.9, 3 * u);
  }
  // the middle seam glows while compressing
  if (s.holding || (s.phase === 'load' && s.prog > 0) || s.phase === 'merge') {
    c.globalCompositeOperation = 'lighter';
    glow(c, s.greenGlow, s.cx, s.cy, (40 + 60 * s.prog) * u, 0.4 + 0.5 * (s.holding ? 1 : 0.3));
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
}

function drawRigGlass(c: CanvasRenderingContext2D, s: State) {
  const u = s.u;
  const cw = s.cw + 40 * u;
  const ch = s.bs + 28 * u;
  const x = s.cx - cw / 2 + 8 * u;
  const y = s.cy - ch / 2;
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = 2 * u;
  rr(c, x, y, cw - 16 * u, ch, 10 * u);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillRect(x + 10 * u, y + 5 * u, cw - 36 * u, 5 * u);
}

function drawGauge(c: CanvasRenderingContext2D, s: State, t: number) {
  const { gx, gy, gR: R, u } = s;
  // housing
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.beginPath();
  c.arc(gx + 4 * u, gy + 6 * u, R * 1.12, Math.PI, TAU);
  c.lineTo(gx + R * 1.12 + 4 * u, gy + R * 0.3 + 6 * u);
  c.lineTo(gx - R * 1.12 + 4 * u, gy + R * 0.3 + 6 * u);
  c.fill();
  c.fillStyle = '#2f343b';
  c.beginPath();
  c.arc(gx, gy, R * 1.12, Math.PI, TAU);
  c.lineTo(gx + R * 1.12, gy + R * 0.3);
  c.lineTo(gx - R * 1.12, gy + R * 0.3);
  c.closePath();
  c.fill();
  c.fillStyle = '#fbf8f1';
  c.beginPath();
  c.arc(gx, gy, R, Math.PI, TAU);
  c.lineTo(gx + R, gy + R * 0.18);
  c.lineTo(gx - R, gy + R * 0.18);
  c.closePath();
  c.fill();
  // zones
  const zone = (a: number, b: number, col: string) => {
    c.strokeStyle = col;
    c.lineWidth = R * 0.12;
    c.beginPath();
    c.arc(gx, gy, R * 0.82, Math.PI + a * Math.PI, Math.PI + b * Math.PI);
    c.stroke();
  };
  zone(0, 0.6, '#9fd8b0');
  zone(0.6, 0.85, '#f2d36b');
  zone(0.85, 1, '#ef7d6b');
  // ticks
  c.strokeStyle = INK;
  c.lineCap = 'round';
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI + (i / 20) * Math.PI;
    const r0 = R * (i % 5 === 0 ? 0.62 : 0.68);
    c.lineWidth = (i % 5 === 0 ? 2.4 : 1.2) * u;
    c.beginPath();
    c.moveTo(gx + Math.cos(a) * r0, gy + Math.sin(a) * r0);
    c.lineTo(gx + Math.cos(a) * R * 0.74, gy + Math.sin(a) * R * 0.74);
    c.stroke();
  }
  // record marker: a gold flag on the rim
  const ra = Math.PI + s.record * Math.PI;
  c.fillStyle = '#e0a42a';
  c.strokeStyle = INK;
  c.lineWidth = 1.4 * u;
  c.beginPath();
  c.moveTo(gx + Math.cos(ra) * R * 0.93, gy + Math.sin(ra) * R * 0.93);
  c.lineTo(gx + Math.cos(ra - 0.07) * R * 1.07, gy + Math.sin(ra - 0.07) * R * 1.07);
  c.lineTo(gx + Math.cos(ra + 0.07) * R * 1.07, gy + Math.sin(ra + 0.07) * R * 1.07);
  c.closePath();
  c.fill();
  c.stroke();
  // needle
  const na = Math.PI + clamp(s.needle, -0.02, 1.03) * Math.PI;
  c.strokeStyle = '#d23c3c';
  c.lineWidth = 3.2 * u;
  c.beginPath();
  c.moveTo(gx - Math.cos(na) * R * 0.12, gy - Math.sin(na) * R * 0.12);
  c.lineTo(gx + Math.cos(na) * R * 0.86, gy + Math.sin(na) * R * 0.86);
  c.stroke();
  c.fillStyle = INK;
  c.beginPath();
  c.arc(gx, gy, R * 0.07, 0, TAU);
  c.fill();
  // glass, unless it just popped
  if (s.popped <= 0) {
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.arc(gx, gy, R, Math.PI, TAU);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 3 * u;
    c.beginPath();
    c.arc(gx, gy, R * 0.9, Math.PI * 1.15, Math.PI * 1.4);
    c.stroke();
  } else {
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1.5 * u;
    c.beginPath();
    c.moveTo(gx - R * 0.95, gy - R * 0.1);
    c.lineTo(gx - R * 0.8, gy - R * 0.35);
    c.moveTo(gx + R * 0.95, gy - R * 0.12);
    c.lineTo(gx + R * 0.78, gy - R * 0.3);
    c.stroke();
  }
  // a pulsing lamp on top that lights on a record
  const lampOn = s.popped > 0 ? 0.6 + 0.4 * Math.sin(t * 16) : 0.15;
  c.fillStyle = `rgba(46,158,87,${0.35 + lampOn * 0.65})`;
  c.beginPath();
  c.arc(gx, gy - R * 1.12 - 6 * u, 7 * u, 0, TAU);
  c.fill();
  if (lampOn > 0.3) {
    c.globalCompositeOperation = 'lighter';
    glow(c, s.greenGlow, gx, gy - R * 1.12 - 6 * u, 40 * u * lampOn, 0.8);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
}

function drawRackLights(c: CanvasRenderingContext2D, s: State, t: number) {
  const r = s.rack;
  const u = s.u;
  const units = 9;
  const uh = (r.h - 24 * u) / units;
  for (let i = 0; i < units; i++) {
    const y = r.y + 12 * u + i * uh + uh / 2;
    for (let k = 0; k < 4; k++) {
      const seed = i * 7 + k * 13;
      const blink = Math.sin(t * (3 + (seed % 5)) + seed) > (k === 0 ? -0.6 : 0.2);
      const wave = s.ledWave > 0 ? Math.max(0, 1 - Math.abs(s.ledWave * (units + 3) - i - 1.5) / 1.5) : 0;
      let col = k === 3 ? '#f2b84b' : '#47e07a';
      if (!blink) col = '#1f3b2a';
      if (wave > 0.1) col = '#b8ffcf';
      c.fillStyle = col;
      c.fillRect(r.x + 16 * u + k * 7 * u, y - 2 * u, 4 * u, 4 * u);
    }
  }
  // fan at the bottom spins
  const fx = r.x + r.w / 2;
  const fyy = r.y + r.h - 34 * u;
  const fr = Math.min(r.w * 0.28, 22 * u);
  c.fillStyle = '#14161a';
  c.beginPath();
  c.arc(fx, fyy, fr, 0, TAU);
  c.fill();
  c.fillStyle = '#4a4f58';
  for (let k = 0; k < 5; k++) {
    const a = t * 14 + (k * TAU) / 5;
    c.beginPath();
    c.moveTo(fx, fyy);
    c.arc(fx, fyy, fr * 0.85, a, a + 0.6);
    c.closePath();
    c.fill();
  }
}

function drawLaptop(c: CanvasRenderingContext2D, s: State, t: number) {
  const d = s.desk;
  const u = s.u;
  const lw = Math.min(d.w * 0.6, 150 * u);
  const lh = lw * 0.62;
  const lx = d.x + d.w * 0.12;
  const ly = d.y - lh - 4 * u;
  // lid
  c.fillStyle = '#c9ced4';
  rr(c, lx, ly, lw, lh, 6 * u);
  c.fill();
  c.fillStyle = '#121418';
  rr(c, lx + 6 * u, ly + 6 * u, lw - 12 * u, lh - 12 * u, 3 * u);
  c.fill();
  // code scrolling up the screen as coloured bars
  c.save();
  c.beginPath();
  c.rect(lx + 6 * u, ly + 6 * u, lw - 12 * u, lh - 12 * u);
  c.clip();
  const lineH = 6 * u;
  const scroll = (t * 14 * u) % lineH;
  const cols = ['#c678dd', '#61afef', '#98c379', '#e5c07b', '#e06c75', '#abb2bf'];
  const n = Math.ceil((lh - 12 * u) / lineH) + 1;
  const base = Math.floor((t * 14 * u) / lineH);
  for (let i = 0; i < n; i++) {
    const rnd = mulberry((base + i) * 31);
    const y = ly + 10 * u + i * lineH - scroll;
    let x = lx + 12 * u + Math.floor(rnd() * 3) * 8 * u;
    const parts = 1 + Math.floor(rnd() * 3);
    for (let p = 0; p < parts; p++) {
      const len = (8 + rnd() * 30) * u;
      if (x + len > lx + lw - 10 * u) break;
      c.fillStyle = cols[Math.floor(rnd() * cols.length)];
      c.fillRect(x, y, len, 2.6 * u);
      x += len + 4 * u;
    }
  }
  c.restore();
  // base
  c.fillStyle = '#b3b9c0';
  c.beginPath();
  c.moveTo(lx - 10 * u, d.y);
  c.lineTo(lx + lw + 10 * u, d.y);
  c.lineTo(lx + lw, d.y - 5 * u);
  c.lineTo(lx, d.y - 5 * u);
  c.closePath();
  c.fill();
}

/* ---------- logic ---------- */

function trayPos(s: State, i: number) {
  const t = s.tray;
  const per = 4;
  const row = Math.floor(i / per);
  const col = i % per;
  const gap = t.w / per;
  return { x: t.x + gap * (col + 0.5) + (row ? gap * 0.25 : 0), y: t.y + t.h * 0.56 - row * s.bs * 0.55 };
}

function refill(s: State) {
  const inTray = s.blocks.filter((b) => b.state === 'tray');
  const used = new Set(inTray.map((b) => Math.round(b.tx * 10) + Math.round(b.ty * 1000)));
  for (let i = 0; i < 8 && inTray.length < 8; i++) {
    const p = trayPos(s, i);
    const key = Math.round(p.x * 10) + Math.round(p.y * 1000);
    if (used.has(key)) continue;
    const b: Block = {
      x: p.x,
      y: p.y,
      tx: p.x,
      ty: p.y,
      state: 'tray',
      slot: -1,
      col: Math.floor(Math.random() * COLS.length),
      seed: Math.floor(Math.random() * 1e6),
      rot: rand(-0.08, 0.08),
      pop: 0,
    };
    s.blocks.push(b);
    inTray.push(b);
    used.add(key);
  }
}

function freeSlot(s: State) {
  const taken = new Set(s.blocks.filter((b) => b.slot >= 0).map((b) => b.slot));
  for (const i of ORDER) if (!taken.has(i)) return i;
  return -1;
}

function loaded(s: State) {
  return s.blocks.filter((b) => b.slot >= 0 && (b.state === 'slot' || b.state === 'fly'));
}

function sendToSlot(s: State, env: SceneEnv, b: Block) {
  const slot = freeSlot(s);
  if (slot < 0 || s.phase !== 'load') {
    b.state = 'fly';
    b.slot = -1;
    const p = trayPos(s, s.blocks.filter((x) => x.state === 'tray').length % 8);
    b.tx = p.x;
    b.ty = p.y;
    return false;
  }
  b.state = 'fly';
  b.slot = slot;
  const p = slotPos(s, slot);
  b.tx = p.x;
  b.ty = p.y;
  b.rot = 0;
  if (s.blocks.filter((x) => x.state === 'tray').length < 3) refill(s);
  const bus = env.audio();
  if (bus) {
    tone(bus, 520 + slot * 30, { type: 'triangle', attack: 0.003, decay: 0.12, gain: 0.06 });
    noise(bus, { duration: 0.06, gain: 0.05, freq: 900, q: 1.2, type: 'bandpass' });
  }
  return true;
}

function finish(s: State, env: SceneEnv) {
  const n = loaded(s).length;
  s.phase = 'merge';
  s.pt = 0;
  s.holding = false;
  const q = n / SLOTS;
  s.target = clamp(0.1 + 0.82 * Math.pow(q, 0.9) + rand(-0.02, 0.09), 0.05, 0.995);
  const bus = env.audio();
  if (bus) tone(bus, 300, { type: 'sine', attack: 0.01, decay: 0.3, gain: 0.08, glideTo: 900 });
}

function popRecord(s: State, env: SceneEnv) {
  s.record = s.target;
  s.popped = 3.2;
  s.stars = Math.min(5, s.stars + 1);
  s.ledWave = 0.001;
  s.flash = 1;
  s.shake = 1;
  const { gx, gy, gR } = s;
  for (let i = 0; i < 70; i++) {
    const a = rand(Math.PI * 1.05, Math.PI * 1.95);
    const v = rand(180, 520) * s.u;
    s.bits.push({
      x: gx + rand(-gR, gR) * 0.6,
      y: gy - rand(0, gR) * 0.6,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      rot: rand(0, TAU),
      vr: rand(-12, 12),
      life: rand(1.4, 2.6),
      col: i < 14 ? 'rgba(220,240,255,0.9)' : CONFETTI[i % CONFETTI.length],
      w: (i < 14 ? rand(6, 12) : rand(4, 8)) * s.u,
      h: (i < 14 ? rand(3, 6) : rand(7, 12)) * s.u,
    });
  }
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.25, gain: 0.16, freq: 3600, q: 0.8, type: 'highpass' });
    noise(bus, { duration: 0.12, gain: 0.12, freq: 300, q: 1, type: 'lowpass' });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(bus, f, { type: 'triangle', attack: 0.004, decay: 0.3, gain: 0.07, delay: 0.08 + i * 0.09 })
    );
    tone(bus, 1318.5, { type: 'sine', attack: 0.004, decay: 0.6, gain: 0.05, delay: 0.46 });
  }
}

function hitBlock(s: State, x: number, y: number) {
  for (let i = s.blocks.length - 1; i >= 0; i--) {
    const b = s.blocks[i];
    if (b.state !== 'tray') continue;
    if (Math.abs(x - b.x) < s.bs * 0.6 && Math.abs(y - b.y) < s.bs * 0.6) return b;
  }
  return null;
}

function startHold(s: State, env: SceneEnv) {
  if (s.phase !== 'load') return;
  if (!loaded(s).length) {
    const bus = env.audio();
    if (bus) tone(bus, 150, { type: 'square', attack: 0.004, decay: 0.12, gain: 0.03 });
    return;
  }
  s.holding = true;
  const bus = env.audio();
  if (bus && !s.press) s.press = startHum(bus, { type: 'sawtooth', freq: 70, cutoff: 300, noiseAmt: 0.2 });
}

function layout(s: State, env: SceneEnv) {
  const { w, h, dpr } = env;
  s.portrait = h > w * 1.1;
  const m = Math.min(w, h);
  s.u = clamp(m / 720, 0.45, 1.6);
  const u = s.u;
  if (s.portrait) {
    s.fy = h * 0.66;
    s.board = { x: w * 0.06, y: h * 0.04, w: w * 0.6, h: h * 0.17 };
    s.rack = { x: w * 0.74, y: h * 0.06, w: w * 0.22, h: s.fy - h * 0.06 };
    s.win = { x: 0, y: 0, w: 0, h: 0 };
    s.gx = w * 0.42;
    s.gy = h * 0.37;
    s.gR = w * 0.22;
    s.cx = w * 0.5;
    s.cy = h * 0.53;
    s.cw = w * 0.74;
    s.tray = { x: w * 0.05, y: h * 0.71, w: w * 0.56, h: h * 0.2 };
    s.desk = { x: w * 0.64, y: h * 0.84, w: w * 0.34, h: h * 0.14 };
  } else {
    s.fy = h * 0.74;
    s.board = { x: w * 0.04, y: h * 0.08, w: w * 0.27, h: h * 0.36 };
    s.rack = { x: w * 0.85, y: h * 0.14, w: w * 0.12, h: s.fy - h * 0.14 };
    s.win = { x: w * 0.62, y: h * 0.1, w: w * 0.18, h: h * 0.3 };
    s.gx = w * 0.47;
    s.gy = h * 0.34;
    s.gR = Math.min(h * 0.17, w * 0.1);
    s.cx = w * 0.47;
    s.cy = h * 0.56;
    s.cw = Math.min(w * 0.31, 480 * u);
    s.tray = { x: w * 0.04, y: h * 0.6, w: w * 0.25, h: h * 0.28 };
    s.desk = { x: w * 0.67, y: h * 0.6, w: w * 0.16, h: s.fy - h * 0.6 + 6 * u };
  }
  s.bs = Math.min((s.cw / SLOTS) * 0.82, s.portrait ? (s.tray.w / 4) * 0.8 : 54 * u);
  freeCanvas(s.room);
  s.room = bakeRoom(s, w, h, dpr);
  // re-seat the blocks for the new layout
  const tray = s.blocks.filter((b) => b.state === 'tray' || b.state === 'drag');
  tray.forEach((b, i) => {
    const p = trayPos(s, i % 8);
    b.tx = b.x = p.x;
    b.ty = b.y = p.y;
    b.state = 'tray';
  });
  for (const b of s.blocks)
    if (b.slot >= 0) {
      const p = slotPos(s, b.slot);
      b.tx = b.x = p.x;
      b.ty = b.y = p.y;
      b.state = 'slot';
    }
  s.drag = null;
  refill(s);
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'grab',
    touchAction: 'none',
    posterTime: 4.2,
    init: () => ({
      phase: 'load',
      pt: 0,
      blocks: [],
      drag: null,
      dragDX: 0,
      dragDY: 0,
      holding: false,
      prog: 0,
      needle: 0,
      needleV: 0,
      target: 0,
      record: 0.62,
      stars: 0,
      popped: 0,
      bits: [],
      ledWave: 0,
      packetX: 0,
      packetY: 0,
      flash: 0,
      shake: 0,
      idle: 0,
      touched: false,
      autoT: 0.5,
      autoHold: false,
      hum: null,
      press: null,
      u: 1,
      portrait: false,
      fy: 0,
      board: { x: 0, y: 0, w: 0, h: 0 },
      rack: { x: 0, y: 0, w: 0, h: 0 },
      desk: { x: 0, y: 0, w: 0, h: 0 },
      tray: { x: 0, y: 0, w: 0, h: 0 },
      win: { x: 0, y: 0, w: 0, h: 0 },
      cx: 0,
      cy: 0,
      cw: 100,
      bs: 40,
      gx: 0,
      gy: 0,
      gR: 60,
      room: null,
      greenGlow: glowSprite(96, [
        [0, 'rgba(140,255,180,0.8)'],
        [0.4, 'rgba(60,220,120,0.25)'],
        [1, 'rgba(40,200,100,0)'],
      ]),
      warm: glowSprite(96, [
        [0, 'rgba(255,240,200,0.6)'],
        [1, 'rgba(255,220,160,0)'],
      ]),
    }),
    resize: (s, env) => layout(s, env),
    update: (s, env, dt, t) => {
      s.pt += dt;
      s.idle += dt;
      const auto = !env.interactive || s.idle > (s.touched ? 8 : 2);

      // the autopilot loads a few blocks and then holds the press
      if (auto && !s.drag && s.phase === 'load') {
        s.autoT -= dt;
        const n = loaded(s).length;
        if (s.autoT <= 0 && !s.autoHold) {
          const want = 5 + Math.floor((t * 0.37) % 3);
          if (n < want) {
            const b = s.blocks.find((x) => x.state === 'tray');
            if (b) sendToSlot(s, env, b);
            s.autoT = 0.45;
          } else {
            s.autoHold = true;
            startHold(s, env);
          }
        }
      }

      // blocks fly to where they are going
      for (const b of s.blocks) {
        b.pop = Math.min(1, b.pop + dt * 3);
        if (b.state === 'fly') {
          b.x = damp(b.x, b.tx, 12, dt);
          b.y = damp(b.y, b.ty, 12, dt);
          if (Math.hypot(b.x - b.tx, b.y - b.ty) < 1) {
            b.x = b.tx;
            b.y = b.ty;
            b.state = b.slot >= 0 ? 'slot' : 'tray';
          }
        } else if (b.state === 'tray') {
          b.x = damp(b.x, b.tx, 10, dt);
          b.y = damp(b.y, b.ty, 10, dt);
        }
      }

      const bus = env.audio();
      if (bus && !s.hum) s.hum = startHum(bus, { type: 'sine', freq: 55, cutoff: 400, noiseAmt: 0.5 });
      if (s.hum) setHum(s.hum, 55, 0.02 + (s.ledWave > 0 ? 0.02 : 0), 380);

      switch (s.phase) {
        case 'load':
          if (s.holding) {
            s.prog = Math.min(1, s.prog + dt * 0.62);
            if (s.press) setHum(s.press, 60 + s.prog * 120, 0.05, 300 + s.prog * 1800);
            if (s.prog >= 1) finish(s, env);
          } else if (s.press) setHum(s.press, 50, 0.0001, 200);
          break;
        case 'merge': {
          if (s.press) {
            stopHum(s.press);
            s.press = null;
          }
          const k = easeInOutCubic(clamp(s.pt / 0.5, 0, 1));
          for (const b of loaded(s)) b.x = lerp(slotPos(s, b.slot).x, s.cx, k);
          if (s.pt >= 0.55) {
            s.blocks = s.blocks.filter((b) => b.slot < 0);
            s.phase = 'launch';
            s.pt = 0;
            s.packetX = s.cx;
            s.packetY = s.cy;
            if (bus) noise(bus, { duration: 0.4, gain: 0.08, freq: 1500, q: 0.7, type: 'bandpass' });
          }
          break;
        }
        case 'launch': {
          const k = clamp(s.pt / 0.7, 0, 1);
          const tx = s.rack.x + s.rack.w / 2;
          const ty = s.rack.y + s.rack.h * 0.35;
          s.packetX = lerp(s.cx, tx, easeInOutCubic(k));
          s.packetY = lerp(s.cy, ty, easeInOutCubic(k)) - Math.sin(k * Math.PI) * 120 * s.u;
          if (k >= 1) {
            s.phase = 'score';
            s.pt = 0;
            s.ledWave = Math.max(s.ledWave, 0.001);
            if (bus) tone(bus, 880, { type: 'sine', attack: 0.003, decay: 0.1, gain: 0.05 });
          }
          break;
        }
        case 'score':
          if (s.pt > 1.25 && s.popped <= 0 && s.target > s.record) popRecord(s, env);
          if (s.pt > 3.4) {
            s.phase = 'load';
            s.pt = 0;
            s.prog = 0;
            s.autoHold = false;
            s.autoT = 1;
            refill(s);
          }
          break;
      }

      // the needle springs toward its target
      const want = s.phase === 'score' ? s.target : s.phase === 'load' ? s.prog * 0.35 * (loaded(s).length / SLOTS) : s.needle;
      const kSpring = s.phase === 'score' ? 26 : 40;
      s.needleV += ((want - s.needle) * kSpring - s.needleV * (s.phase === 'score' ? 3.2 : 9)) * dt;
      s.needle += s.needleV * dt;
      if (s.holding) s.needle += Math.sin(t * 60) * 0.002;

      for (const p of s.bits) {
        p.life -= dt;
        p.vy += 700 * s.u * dt;
        p.vx *= Math.exp(-1.2 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      s.bits = s.bits.filter((p) => p.life > 0 && p.y < env.h + 40);
      s.popped = Math.max(0, s.popped - dt);
      if (s.ledWave > 0) {
        s.ledWave += dt * 1.1;
        if (s.ledWave > 1.2) s.ledWave = 0;
      }
      s.flash = Math.max(0, s.flash - dt * 3);
      s.shake = Math.max(0, s.shake - dt * 3);
      if (env.reducedMotion && (s.holding || s.drag || s.phase !== 'load' || s.blocks.some((b) => b.state === 'fly'))) env.wake(300);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      ctx.save();
      if (s.shake > 0.02 && !env.reducedMotion) {
        const a = s.shake * s.shake * 6 * s.u;
        ctx.translate(Math.sin(t * 61) * a, Math.cos(t * 47) * a);
      }
      if (s.room) ctx.drawImage(s.room, 0, 0, w, h);
      // stars the whiteboard has earned
      for (let i = 0; i < s.stars; i++) {
        const x = s.board.x + s.board.w * (0.36 + i * 0.07);
        const y = s.board.y + s.board.h * 0.5;
        const r = 9 * s.u;
        ctx.strokeStyle = '#e0a42a';
        ctx.lineWidth = 2.2 * s.u;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const rr2 = k % 2 ? r * 0.45 : r;
          if (k === 0) ctx.moveTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
          else ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
        }
        ctx.closePath();
        ctx.stroke();
      }
      drawRackLights(ctx, s, t);
      drawLaptop(ctx, s, t);
      drawGauge(ctx, s, t);
      drawRig(ctx, s, t);

      // blocks in the chamber squeeze from the middle out
      const inRig = loaded(s);
      const n = inRig.length;
      const sorted = inRig.slice().sort((a, b) => Math.abs(a.slot - 3) - Math.abs(b.slot - 3) || a.slot - b.slot);
      sorted.forEach((b, j) => {
        const start = (j / Math.max(1, n)) * 0.72;
        const sq = s.phase === 'merge' ? 1 : smoothstep(start, start + 0.28, s.prog);
        const glowK = sq > 0 && sq < 1 ? 0.6 : sq >= 1 ? 0.3 + 0.2 * Math.sin(t * 20 + j) : 0;
        drawBlock(ctx, s, b, sq, glowK);
      });
      drawRigGlass(ctx, s);

      // the crate's blocks and the one being dragged
      for (const b of s.blocks.filter((x) => x.state === 'tray').sort((a, b2) => a.ty - b2.ty)) drawBlock(ctx, s, b, 0, 0);
      for (const b of s.blocks) if (b.state === 'fly' && b.slot < 0) drawBlock(ctx, s, b, 0, 0);
      // crate front lip in front of the blocks
      const tr = s.tray;
      ctx.fillStyle = '#b98450';
      rr(ctx, tr.x - 4 * s.u, tr.y + tr.h * 0.62, tr.w + 8 * s.u, tr.h * 0.38, 5 * s.u);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,45,15,0.35)';
      ctx.lineWidth = 2 * s.u;
      ctx.beginPath();
      ctx.moveTo(tr.x + 8 * s.u, tr.y + tr.h * 0.74);
      ctx.lineTo(tr.x + tr.w - 8 * s.u, tr.y + tr.h * 0.74);
      ctx.stroke();
      ctx.fillStyle = GREEN;
      ctx.beginPath();
      ctx.arc(tr.x + tr.w / 2, tr.y + tr.h * 0.81, 9 * s.u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f2f4f5';
      ctx.beginPath();
      ctx.moveTo(tr.x + tr.w / 2 - 3 * s.u, tr.y + tr.h * 0.81 - 5 * s.u);
      ctx.lineTo(tr.x + tr.w / 2 + 5 * s.u, tr.y + tr.h * 0.81);
      ctx.lineTo(tr.x + tr.w / 2 - 3 * s.u, tr.y + tr.h * 0.81 + 5 * s.u);
      ctx.closePath();
      ctx.fill();
      if (s.drag) drawBlock(ctx, s, s.drag, 0, 0);

      // the packet on its way to the rack
      if (s.phase === 'launch') {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.greenGlow, s.packetX, s.packetY, 46 * s.u, 1);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#eafff1';
        rr(ctx, s.packetX - 9 * s.u, s.packetY - 9 * s.u, 18 * s.u, 18 * s.u, 4 * s.u);
        ctx.fill();
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 2.5 * s.u;
        ctx.stroke();
      }
      // middle-out shock ring while pressing
      if (s.holding) {
        const k = (t * 2.2) % 1;
        ctx.strokeStyle = `rgba(80,230,140,${(1 - k) * 0.6})`;
        ctx.lineWidth = 3 * s.u;
        ctx.beginPath();
        ctx.ellipse(s.cx, s.cy, s.cw * 0.55 * k, s.bs * 0.7 * (0.4 + k * 0.6), 0, 0, TAU);
        ctx.stroke();
      }
      // glass and confetti
      for (const p of s.bits) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = clamp(p.life, 0, 1);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (s.flash > 0.02) {
        ctx.fillStyle = `rgba(255,255,240,${(s.flash * 0.3).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env, x, y) => {
      s.touched = true;
      s.idle = 0;
      s.autoHold = false;
      const b = hitBlock(s, x, y);
      if (b) {
        s.drag = b;
        b.state = 'drag';
        s.dragDX = b.x - x;
        s.dragDY = b.y - y;
        b.rot = 0;
        const bus = env.audio();
        if (bus) tone(bus, 400, { type: 'sine', attack: 0.003, decay: 0.06, gain: 0.04 });
        return;
      }
      startHold(s, env);
    },
    onPointerMove: (s, _env, x, y) => {
      const b = s.drag;
      if (!b) return;
      s.idle = 0;
      b.x = x + s.dragDX;
      b.y = y + s.dragDY;
    },
    onPointerUp: (s, env) => {
      const b = s.drag;
      if (b) {
        s.drag = null;
        const nearRig = Math.abs(b.x - s.cx) < s.cw * 0.6 + 30 * s.u && Math.abs(b.y - s.cy) < s.bs * 1.6 + 40 * s.u;
        if (nearRig) sendToSlot(s, env, b);
        else {
          b.state = 'fly';
          b.slot = -1;
          // find its old place in the crate
          const taken = new Set(s.blocks.filter((x) => x !== b && x.state === 'tray').map((x) => Math.round(x.tx) * 10000 + Math.round(x.ty)));
          for (let i = 0; i < 8; i++) {
            const p = trayPos(s, i);
            if (!taken.has(Math.round(p.x) * 10000 + Math.round(p.y))) {
              b.tx = p.x;
              b.ty = p.y;
              break;
            }
          }
        }
        if (s.blocks.filter((x) => x.state === 'tray').length < 3) refill(s);
        return;
      }
      s.holding = false;
    },
    onKey: (s, env, e, down) => {
      if (e.key === 'Enter') {
        if (down && !e.repeat) {
          s.touched = true;
          s.idle = 0;
          const b = s.blocks.find((x) => x.state === 'tray');
          if (b) sendToSlot(s, env, b);
          if (s.blocks.filter((x) => x.state === 'tray').length < 3) refill(s);
        }
        return true;
      }
      if (e.key !== ' ') return false;
      s.touched = true;
      s.idle = 0;
      if (down) {
        if (!e.repeat) startHold(s, env);
      } else s.holding = false;
      return true;
    },
    dispose: (s) => {
      stopHum(s.hum);
      stopHum(s.press);
      s.hum = s.press = null;
      freeCanvas(s.room, s.greenGlow, s.warm);
      s.room = null;
    },
  });
