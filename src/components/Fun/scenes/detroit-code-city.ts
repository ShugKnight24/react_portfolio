import { createCanvasScene, clamp, damp, easeOutCubic, lerp, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  CODE_GLYPH_COUNT,
  burst,
  drawGlyph,
  emit,
  freeCanvas,
  glow,
  glowSprite,
  hit,
  layer,
  makeGlyphAtlas,
  makePool,
  mulberry,
  stepPool,
} from './theater-kit';
import type { GlyphAtlas, Pool } from './theater-kit';

/**
 * Detroit Code City: the riverfront seen twice. Left of a moving weld seam it is the
 * assembly line city at a smoggy dusk: smokestacks, art deco towers, the Ambassador Bridge
 * in rust and steel, sedan bodies riding the line. Right of the seam it is the city now:
 * the Renaissance Center lit up, the People Mover on its loop, bridge cables strung with
 * light and code climbing out of the Detroit River into the skyline. The same cars ride the
 * belt across the seam and come out the other side as glowing wireframes. Move to drag the
 * seam; click to send fireworks up over the river and a surge of code through the city.
 */

interface Stream {
  x: number;
  y: number;
  v: number;
  len: number;
  g: number[];
  tint: number;
}

interface Car {
  x: number;
  style: number;
  stamp: number;
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  ty: number;
  hue: number;
  live: boolean;
}

interface Plume {
  x: number;
  y: number;
  r: number;
  age: number;
  stack: number;
}

interface State {
  seam: number;
  seamT: number;
  amb: number;
  belt: number;
  mover: number;
  pulse: number;
  touched: boolean;
  idle: number;
  autoT: number;
  cars: Car[];
  streams: Stream[];
  rockets: Rocket[];
  plumes: Plume[];
  parts: Pool;
  sparkT: number;
  // layout
  base: number;
  river: number;
  beltY: number;
  stacks: number[][];
  winB: number[][];
  bridge: number[];
  a: HTMLCanvasElement | null;
  b: HTMLCanvasElement | null;
  atlas: GlyphAtlas;
  hot: HTMLCanvasElement;
  cyan: HTMLCanvasElement;
  amber: HTMLCanvasElement;
  smoke: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const CAR_GAP = 210;
const RENCEN = 0.76;
const FIRE = ['#ff5f6d', '#ffd166', '#5dd8ff', '#b28dff', '#5dffb0'];
const FIRE_RGB = [
  [255, 95, 109],
  [255, 209, 102],
  [93, 216, 255],
  [178, 141, 255],
  [93, 255, 176],
];

/* ---------- skyline ---------- */

interface Tower {
  x: number;
  w: number;
  h: number;
  kind: 'box' | 'deco' | 'stepped' | 'factory' | 'spire' | 'slant';
  era: 0 | 1 | 2; // 0 both, 1 old only, 2 new only
  seed: number;
}

function skyline(w: number, h: number): Tower[] {
  const r = mulberry(1701);
  const list: Tower[] = [];
  const H = h * 0.42;
  // filler blocks across downtown
  for (let x = w * 0.22; x < w * 1.02; ) {
    const tw = lerp(0.025, 0.05, r()) * w;
    list.push({ x, w: tw, h: H * lerp(0.18, 0.42, r()), kind: 'box', era: 0, seed: r() * 1000 });
    x += tw * lerp(0.7, 1.1, r());
  }
  // landmarks that span both eras
  list.push({ x: w * 0.38, w: w * 0.045, h: H * 0.78, kind: 'stepped', era: 0, seed: 11 }); // Penobscot
  list.push({ x: w * 0.47, w: w * 0.05, h: H * 0.62, kind: 'deco', era: 0, seed: 12 }); // Guardian
  list.push({ x: w * 0.9, w: w * 0.04, h: H * 0.5, kind: 'deco', era: 0, seed: 13 });
  // new city glass towers
  list.push({ x: w * 0.55, w: w * 0.05, h: H * 0.74, kind: 'spire', era: 2, seed: 21 });
  list.push({ x: w * 0.63, w: w * 0.045, h: H * 0.6, kind: 'slant', era: 2, seed: 22 });
  list.push({ x: w * 0.96, w: w * 0.045, h: H * 0.56, kind: 'slant', era: 2, seed: 23 });
  // riverfront plants of the old city
  list.push({ x: w * 0.26, w: w * 0.12, h: H * 0.2, kind: 'factory', era: 1, seed: 31 });
  list.push({ x: w * 0.56, w: w * 0.16, h: H * 0.17, kind: 'factory', era: 1, seed: 32 });
  list.push({ x: w * 0.84, w: w * 0.14, h: H * 0.19, kind: 'factory', era: 1, seed: 33 });
  return list.sort((a, b) => b.h - a.h + (a.kind === 'factory' ? 1000 : 0) - (b.kind === 'factory' ? 1000 : 0));
}

function paintTower(c: CanvasRenderingContext2D, t: Tower, base: number, era: number, out: number[][] | null) {
  const r = mulberry(Math.floor(t.seed * 97) + 3);
  const x = t.x - t.w / 2;
  const top = base - t.h;
  const old = era === 1;
  const body = c.createLinearGradient(x, 0, x + t.w, 0);
  if (old) {
    body.addColorStop(0, '#2a1a12');
    body.addColorStop(0.5, '#3e271a');
    body.addColorStop(1, '#22150e');
  } else {
    body.addColorStop(0, '#0b1124');
    body.addColorStop(0.5, '#16203d');
    body.addColorStop(1, '#090e1d');
  }
  c.fillStyle = body;
  c.beginPath();
  if (t.kind === 'stepped') {
    // setbacks and a light mast on top
    const s1 = t.w * 0.18;
    c.moveTo(x, base);
    c.lineTo(x, top + t.h * 0.22);
    c.lineTo(x + s1, top + t.h * 0.22);
    c.lineTo(x + s1, top + t.h * 0.1);
    c.lineTo(x + s1 * 2, top + t.h * 0.1);
    c.lineTo(x + s1 * 2, top);
    c.lineTo(x + t.w - s1 * 2, top);
    c.lineTo(x + t.w - s1 * 2, top + t.h * 0.1);
    c.lineTo(x + t.w - s1, top + t.h * 0.1);
    c.lineTo(x + t.w - s1, top + t.h * 0.22);
    c.lineTo(x + t.w, top + t.h * 0.22);
    c.lineTo(x + t.w, base);
    c.closePath();
    c.fill();
    c.fillRect(t.x - 1, top - t.h * 0.12, 2, t.h * 0.12);
    if (out) out.push([t.x, top - t.h * 0.12, old ? 0 : 1]);
  } else if (t.kind === 'deco') {
    // art deco crown with twin pinnacles
    c.moveTo(x, base);
    c.lineTo(x, top + t.h * 0.12);
    c.lineTo(x + t.w * 0.18, top + t.h * 0.12);
    c.lineTo(x + t.w * 0.2, top);
    c.lineTo(x + t.w * 0.3, top);
    c.lineTo(x + t.w * 0.32, top + t.h * 0.12);
    c.lineTo(x + t.w * 0.68, top + t.h * 0.12);
    c.lineTo(x + t.w * 0.7, top);
    c.lineTo(x + t.w * 0.8, top);
    c.lineTo(x + t.w * 0.82, top + t.h * 0.12);
    c.lineTo(x + t.w, top + t.h * 0.12);
    c.lineTo(x + t.w, base);
    c.closePath();
    c.fill();
    if (old) {
      c.fillStyle = 'rgba(190,90,40,0.25)';
      c.fill();
    }
  } else if (t.kind === 'factory') {
    // sawtooth roof and stacks
    const teeth = 6;
    c.moveTo(x, base);
    c.lineTo(x, top + t.h * 0.35);
    for (let i = 0; i < teeth; i++) {
      const tx = x + (t.w * i) / teeth;
      c.lineTo(tx + t.w / teeth, top + t.h * 0.35);
      c.lineTo(tx + t.w / teeth, top + t.h * 0.1);
    }
    c.lineTo(x + t.w, base);
    c.closePath();
    c.fillStyle = '#1f140e';
    c.fill();
    for (let i = 0; i < 3; i++) {
      const sx = x + t.w * (0.2 + i * 0.3);
      const sh = t.h * lerp(1.4, 2.2, r());
      c.fillStyle = '#1a110b';
      c.fillRect(sx - 3, base - sh, 6, sh);
      c.fillStyle = 'rgba(255,120,50,0.5)';
      c.fillRect(sx - 3, base - sh + 6, 6, 2);
      if (out) out.push([sx, base - sh]);
    }
    // furnace glow windows
    c.fillStyle = 'rgba(255,140,60,0.55)';
    for (let i = 0; i < teeth; i++) c.fillRect(x + (t.w * (i + 0.2)) / teeth, top + t.h * 0.45, (t.w / teeth) * 0.5, t.h * 0.18);
    return;
  } else if (t.kind === 'spire') {
    // twin pyramid crowns
    c.moveTo(x, base);
    c.lineTo(x, top + t.h * 0.1);
    c.lineTo(x + t.w * 0.25, top);
    c.lineTo(x + t.w * 0.5, top + t.h * 0.1);
    c.lineTo(x + t.w * 0.75, top - t.h * 0.04);
    c.lineTo(x + t.w, top + t.h * 0.1);
    c.lineTo(x + t.w, base);
    c.closePath();
    c.fill();
    if (out) {
      out.push([x + t.w * 0.25, top, 2]);
      out.push([x + t.w * 0.75, top - t.h * 0.04, 2]);
    }
  } else if (t.kind === 'slant') {
    c.moveTo(x, base);
    c.lineTo(x, top + t.h * 0.08);
    c.lineTo(x + t.w, top);
    c.lineTo(x + t.w, base);
    c.closePath();
    c.fill();
    if (!old) {
      c.strokeStyle = 'rgba(255,79,163,0.7)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x, top + t.h * 0.08);
      c.lineTo(x + t.w, top);
      c.stroke();
    }
  } else {
    c.rect(x, top, t.w, t.h);
    c.fill();
  }
  // edge highlights and windows
  if (!old) {
    c.strokeStyle = 'rgba(93,216,255,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x + 0.5, base);
    c.lineTo(x + 0.5, top + (t.kind === 'box' ? 0 : t.h * 0.12));
    c.stroke();
  }
  const cols = Math.max(2, Math.floor(t.w / 6));
  const rows = Math.floor((t.h * 0.85) / 7);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lit = r();
      const wx = x + 2 + (i * (t.w - 4)) / cols;
      const wy = top + t.h * 0.16 + j * 7;
      if (old) {
        if (lit > 0.8) {
          c.fillStyle = lit > 0.95 ? '#ffd38a' : 'rgba(255,170,90,0.6)';
          c.fillRect(wx, wy, 2, 3);
        }
      } else if (lit > 0.45) {
        c.fillStyle = lit > 0.9 ? '#e8fbff' : lit > 0.7 ? 'rgba(93,216,255,0.85)' : 'rgba(93,140,255,0.45)';
        c.fillRect(wx, wy, 2.4, 2.6);
      }
    }
  }
}

function paintRenCen(c: CanvasRenderingContext2D, cx: number, base: number, H: number, w: number) {
  const cyl = (x: number, cw: number, ch: number, shade: number) => {
    const g = c.createLinearGradient(x - cw / 2, 0, x + cw / 2, 0);
    g.addColorStop(0, `rgba(${8 + shade},${14 + shade},${30 + shade},1)`);
    g.addColorStop(0.35, `rgba(${40 + shade},${62 + shade},${100 + shade},1)`);
    g.addColorStop(0.6, `rgba(${18 + shade},${28 + shade},${54 + shade},1)`);
    g.addColorStop(1, `rgba(${5 + shade},${9 + shade},${20 + shade},1)`);
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(x - cw / 2, base - ch, cw, ch, [cw * 0.08, cw * 0.08, 0, 0]);
    c.fill();
    // floor lines and a lit glass stripe
    c.strokeStyle = 'rgba(140,200,255,0.08)';
    c.lineWidth = 1;
    c.beginPath();
    for (let y = base - ch + 6; y < base; y += 4) {
      c.moveTo(x - cw / 2, y);
      c.lineTo(x + cw / 2, y);
    }
    c.stroke();
    c.fillStyle = 'rgba(160,220,255,0.18)';
    c.fillRect(x - cw * 0.18, base - ch, cw * 0.08, ch);
  };
  const cw = w * 0.05;
  cyl(cx - cw * 0.95, cw * 0.82, H * 0.66, 0);
  cyl(cx + cw * 0.95, cw * 0.82, H * 0.66, 0);
  cyl(cx, cw, H, 12);
  // crown ring
  c.fillStyle = '#0a1226';
  c.fillRect(cx - cw * 0.56, base - H - H * 0.04, cw * 1.12, H * 0.05);
  cyl(cx - cw * 0.55, cw * 0.78, H * 0.58, 6);
  cyl(cx + cw * 0.55, cw * 0.78, H * 0.58, 6);
}

function paintEra(s: State, env: SceneEnv, era: 1 | 2, towers: Tower[]) {
  const { w, h, dpr } = env;
  const { cv, c } = layer(era === 1 ? s.a : s.b, w, h, dpr);
  const base = s.base;
  const old = era === 1;
  // sky
  const sky = c.createLinearGradient(0, 0, 0, base);
  if (old) {
    sky.addColorStop(0, '#2a1a1a');
    sky.addColorStop(0.45, '#6b3a24');
    sky.addColorStop(0.8, '#c4692e');
    sky.addColorStop(1, '#e89a4d');
  } else {
    sky.addColorStop(0, '#04050d');
    sky.addColorStop(0.55, '#0d0f2a');
    sky.addColorStop(0.85, '#28164a');
    sky.addColorStop(1, '#4a1d5e');
  }
  c.fillStyle = sky;
  c.fillRect(0, 0, w, base);
  if (old) {
    // a low hazy sun and bands of smog
    const sx = w * 0.3;
    const sy = base - h * 0.08;
    const sg = c.createRadialGradient(sx, sy, 0, sx, sy, h * 0.35);
    sg.addColorStop(0, 'rgba(255,220,150,0.9)');
    sg.addColorStop(0.12, 'rgba(255,170,90,0.55)');
    sg.addColorStop(1, 'rgba(255,120,60,0)');
    c.fillStyle = sg;
    c.fillRect(0, 0, w, base);
    c.fillStyle = 'rgba(255,236,190,0.9)';
    c.beginPath();
    c.arc(sx, sy, h * 0.045, 0, TAU);
    c.fill();
    for (let i = 0; i < 5; i++) {
      c.fillStyle = `rgba(90,50,35,${0.12 + i * 0.03})`;
      c.fillRect(0, base - h * (0.05 + i * 0.05), w, h * 0.025);
    }
  } else {
    const r = mulberry(77);
    c.fillStyle = '#e8ecff';
    for (let i = 0; i < 90; i++) {
      c.globalAlpha = r() * 0.6 + 0.1;
      const sz = r() < 0.1 ? 1.6 : 1;
      c.fillRect(r() * w, r() * base * 0.7, sz, sz);
    }
    c.globalAlpha = 1;
    const glowB = c.createLinearGradient(0, base - h * 0.25, 0, base);
    glowB.addColorStop(0, 'rgba(93,216,255,0)');
    glowB.addColorStop(1, 'rgba(93,160,255,0.22)');
    c.fillStyle = glowB;
    c.fillRect(0, base - h * 0.25, w, h * 0.25);
  }

  // skyline
  const H = h * 0.42;
  s.stacks = [];
  s.winB = [];
  for (const t of towers) {
    if (t.era === 1 && !old) continue;
    if (t.era === 2 && old) continue;
    paintTower(c, t, base, era, t.kind === 'factory' ? s.stacks : old ? null : s.winB);
  }
  if (!old) paintRenCen(c, w * RENCEN, base, H * 0.98, w);

  // Ambassador Bridge on the left: towers, deck and a main cable
  const bx0 = -w * 0.04;
  const bx1 = w * 0.3;
  const deckY = base - h * 0.07;
  const t0 = bx0 + (bx1 - bx0) * 0.22;
  const t1 = bx0 + (bx1 - bx0) * 0.82;
  const towerTop = deckY - h * 0.15;
  c.strokeStyle = old ? '#3b2416' : '#0c1630';
  c.fillStyle = old ? '#3b2416' : '#0c1630';
  c.lineWidth = 3;
  for (const tx of [t0, t1]) {
    c.fillRect(tx - 4, towerTop, 8, base - towerTop);
    c.fillRect(tx - 7, towerTop + 6, 14, 3);
  }
  c.fillRect(bx0, deckY, bx1 - bx0, 5);
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(bx0, deckY - h * 0.02);
  c.quadraticCurveTo((bx0 + t0) / 2, deckY - h * 0.02, t0, towerTop);
  c.quadraticCurveTo((t0 + t1) / 2, deckY + h * 0.11, t1, towerTop);
  c.quadraticCurveTo((t1 + bx1) / 2, deckY - h * 0.02, bx1 + w * 0.02, deckY);
  c.stroke();
  // hangers
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 1; i < 16; i++) {
    const u = i / 16;
    const x = lerp(t0, t1, u);
    const y = towerTop + (deckY + h * 0.11 - towerTop) * 2 * u * (1 - u) * 1;
    const cy = lerp(towerTop, towerTop, u) + (y - towerTop);
    c.moveTo(x, cy);
    c.lineTo(x, deckY);
  }
  c.stroke();
  s.bridge = [bx0, bx1, t0, t1, towerTop, deckY, h * 0.11];

  // river
  const river = c.createLinearGradient(0, base, 0, s.beltY);
  if (old) {
    river.addColorStop(0, '#7a4524');
    river.addColorStop(1, '#1e120c');
  } else {
    river.addColorStop(0, '#1a1440');
    river.addColorStop(1, '#05060f');
  }
  c.fillStyle = river;
  c.fillRect(0, base, w, s.beltY - base);
  // the skyline mirrored in the water, broken up by ripples
  c.save();
  c.beginPath();
  c.rect(0, base, w, s.beltY - base);
  c.clip();
  c.globalAlpha = old ? 0.28 : 0.4;
  c.translate(0, base);
  c.scale(1, -0.55);
  c.translate(0, -base);
  c.drawImage(cv, 0, 0, cv.width, base * dpr, 0, 0, w, base);
  c.restore();
  c.fillStyle = river;
  c.globalAlpha = 0.55;
  for (let y = base + 2; y < s.beltY; y += 3 + (y - base) * 0.04) c.fillRect(0, y, w, 1 + (y - base) * 0.02);
  c.globalAlpha = 1;
  const fade = c.createLinearGradient(0, base, 0, s.beltY);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, old ? 'rgba(20,12,8,0.85)' : 'rgba(4,5,12,0.85)');
  c.fillStyle = fade;
  c.fillRect(0, base, w, s.beltY - base);
  // the far shore edge
  c.fillStyle = old ? '#1c120c' : '#05070f';
  c.fillRect(0, base - 2, w, 4);
  // factory floor under the belt
  const floor = c.createLinearGradient(0, s.beltY, 0, h);
  floor.addColorStop(0, old ? '#1a110c' : '#060813');
  floor.addColorStop(1, old ? '#0b0705' : '#020309');
  c.fillStyle = floor;
  c.fillRect(0, s.beltY, w, h - s.beltY);
  if (era === 1) s.a = cv;
  else s.b = cv;
}

/* ---------- cars on the belt ---------- */

function carPath(c: CanvasRenderingContext2D, x: number, y: number, L: number) {
  // a long sedan with a hump roof and tail fins, nose to the right
  const H = L * 0.3;
  c.beginPath();
  c.moveTo(x - L * 0.5, y - H * 0.25);
  c.lineTo(x - L * 0.52, y - H * 0.55);
  c.lineTo(x - L * 0.44, y - H * 0.62);
  c.lineTo(x - L * 0.3, y - H * 0.62);
  c.quadraticCurveTo(x - L * 0.2, y - H * 1.15, x - L * 0.02, y - H * 1.15);
  c.quadraticCurveTo(x + L * 0.14, y - H * 1.15, x + L * 0.2, y - H * 0.66);
  c.lineTo(x + L * 0.46, y - H * 0.6);
  c.quadraticCurveTo(x + L * 0.53, y - H * 0.5, x + L * 0.5, y - H * 0.2);
  c.lineTo(x + L * 0.5, y);
  c.lineTo(x - L * 0.5, y);
  c.closePath();
}

function drawCarOld(c: CanvasRenderingContext2D, x: number, y: number, L: number, style: number, stamp: number) {
  const H = L * 0.3;
  const cols = [
    ['#5c1b14', '#a8382a', '#e07a5f'],
    ['#2a3a3a', '#5e7a78', '#a7c4bf'],
    ['#4a3a20', '#9a7a3a', '#e3c27a'],
  ][style % 3];
  carPath(c, x, y - L * 0.06, L);
  const g = c.createLinearGradient(0, y - H * 1.2, 0, y);
  g.addColorStop(0, cols[2]);
  g.addColorStop(0.35, cols[1]);
  g.addColorStop(1, cols[0]);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(255,230,190,0.35)';
  c.lineWidth = 1;
  c.stroke();
  // window glass and chrome strip
  c.fillStyle = 'rgba(30,20,16,0.8)';
  c.beginPath();
  c.moveTo(x - L * 0.22, y - L * 0.06 - H * 0.66);
  c.quadraticCurveTo(x - L * 0.16, y - L * 0.06 - H * 1.04, x - L * 0.02, y - L * 0.06 - H * 1.04);
  c.quadraticCurveTo(x + L * 0.1, y - L * 0.06 - H * 1.04, x + L * 0.15, y - L * 0.06 - H * 0.66);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(255,240,210,0.7)';
  c.fillRect(x - L * 0.48, y - L * 0.06 - H * 0.42, L * 0.96, 1.5);
  // wheels
  for (const wx of [-0.3, 0.3]) {
    c.fillStyle = '#100a08';
    c.beginPath();
    c.arc(x + wx * L, y - L * 0.06, H * 0.32, 0, TAU);
    c.fill();
    c.fillStyle = '#c9c2b8';
    c.beginPath();
    c.arc(x + wx * L, y - L * 0.06, H * 0.13, 0, TAU);
    c.fill();
  }
  if (stamp > 0) {
    c.fillStyle = `rgba(255,240,200,${(stamp * 0.5).toFixed(3)})`;
    carPath(c, x, y - L * 0.06, L);
    c.fill();
  }
}

function drawCarNew(c: CanvasRenderingContext2D, x: number, y: number, L: number, t: number, pulse: number) {
  const H = L * 0.3;
  // low, smooth EV body as a glowing wireframe
  c.beginPath();
  c.moveTo(x - L * 0.5, y - L * 0.06 - H * 0.2);
  c.lineTo(x - L * 0.5, y - L * 0.06 - H * 0.6);
  c.quadraticCurveTo(x - L * 0.3, y - L * 0.06 - H * 1.12, x, y - L * 0.06 - H * 1.08);
  c.quadraticCurveTo(x + L * 0.26, y - L * 0.06 - H * 1.02, x + L * 0.5, y - L * 0.06 - H * 0.45);
  c.lineTo(x + L * 0.5, y - L * 0.06);
  c.lineTo(x - L * 0.5, y - L * 0.06);
  c.closePath();
  c.fillStyle = 'rgba(20,60,110,0.35)';
  c.fill();
  c.strokeStyle = `rgba(93,216,255,${(0.75 + pulse * 0.25).toFixed(3)})`;
  c.lineWidth = 1.5;
  c.stroke();
  // structure lines
  c.strokeStyle = 'rgba(93,216,255,0.35)';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 1; i < 6; i++) {
    const u = -0.5 + i / 6;
    c.moveTo(x + u * L, y - L * 0.06);
    c.lineTo(x + u * L * 0.9, y - L * 0.06 - H * (0.6 + 0.45 * (1 - Math.abs(u * 1.6))));
  }
  c.moveTo(x - L * 0.5, y - L * 0.06 - H * 0.42);
  c.lineTo(x + L * 0.5, y - L * 0.06 - H * 0.42);
  c.stroke();
  // light bar
  c.fillStyle = '#e8fbff';
  c.fillRect(x + L * 0.42, y - L * 0.06 - H * 0.5, L * 0.08, 2);
  c.fillStyle = '#ff4fa3';
  c.fillRect(x - L * 0.5, y - L * 0.06 - H * 0.5, L * 0.06, 2);
  for (const wx of [-0.3, 0.3]) {
    c.strokeStyle = 'rgba(93,216,255,0.9)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x + wx * L, y - L * 0.06, H * 0.3, 0, TAU);
    c.stroke();
    c.beginPath();
    const a = t * 6;
    for (let i = 0; i < 3; i++) {
      c.moveTo(x + wx * L, y - L * 0.06);
      c.lineTo(x + wx * L + Math.cos(a + (i * TAU) / 3) * H * 0.26, y - L * 0.06 + Math.sin(a + (i * TAU) / 3) * H * 0.26);
    }
    c.stroke();
  }
}

/* ---------- interaction ---------- */

function launch(s: State, env: SceneEnv, x: number, user: boolean) {
  if (user) {
    s.touched = true;
    s.idle = 0;
  }
  const r = s.rockets.find((q) => !q.live);
  if (r) {
    r.live = true;
    r.x = clamp(x, env.w * 0.05, env.w * 0.95);
    r.y = s.base;
    r.vy = -env.h * rand(0.85, 1.05);
    r.ty = env.h * rand(0.1, 0.28);
    r.hue = Math.floor(rand(0, FIRE.length));
  }
  s.pulse = 1;
  // the press stamps the car under the seam
  for (const car of s.cars) if (Math.abs(car.x - s.seam * env.w) < CAR_GAP * 0.5) car.stamp = 1;
  const bus = env.audio();
  if (bus) {
    tone(bus, 500, { type: 'sine', attack: 0.02, decay: 0.7, gain: 0.05, glideTo: 1500 });
    hit(bus, { freq: 220, q: 0.8, gain: 0.3, decay: 0.12 });
  }
  if (user) env.wake(2600);
}

function explode(s: State, env: SceneEnv, r: Rocket) {
  r.live = false;
  const n = 70;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.05, 0.05);
    const v = rand(0.75, 1) * env.h * 0.32;
    emit(s.parts, r.x, r.y, Math.cos(a) * v, Math.sin(a) * v, rand(1.2, 1.8), rand(1.6, 2.4), r.hue, 1.6, env.h * 0.18);
  }
  burst(s.parts, 16, r.x, r.y, 0, Math.PI, env.h * 0.12, 1, 3, 9, 2, env.h * 0.1);
  const bus = env.audio();
  if (bus) {
    hit(bus, { freq: 120, q: 0.7, gain: 0.5, decay: 0.6 });
    for (let i = 0; i < 6; i++) hit(bus, { freq: 3000, q: 0.6, gain: 0.08, decay: 0.05, type: 'highpass', delay: 0.25 + i * rand(0.04, 0.09) });
  }
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'ew-resize',
    posterTime: 3.2,
    init: () => ({
      seam: 0.46,
      seamT: 0.46,
      amb: 0,
      belt: 0,
      mover: 0.2,
      pulse: 0,
      touched: false,
      idle: 0,
      autoT: 1.6,
      cars: [],
      streams: [],
      rockets: Array.from({ length: 6 }, () => ({ x: 0, y: 0, vy: 0, ty: 0, hue: 0, live: false })),
      plumes: [],
      parts: makePool(520),
      sparkT: 0,
      base: 0,
      river: 0,
      beltY: 0,
      stacks: [],
      winB: [],
      bridge: [],
      a: null,
      b: null,
      atlas: makeGlyphAtlas(['#eaffff', '#5dd8ff', '#2a7fff', '#ff4fa3'], 32),
      hot: glowSprite(96, [
        [0, 'rgba(255,255,240,1)'],
        [0.2, 'rgba(255,230,170,0.7)'],
        [0.55, 'rgba(255,140,60,0.2)'],
        [1, 'rgba(255,90,30,0)'],
      ]),
      cyan: glowSprite(96, [
        [0, 'rgba(230,252,255,1)'],
        [0.25, 'rgba(93,216,255,0.6)'],
        [1, 'rgba(40,120,255,0)'],
      ]),
      amber: glowSprite(96, [
        [0, 'rgba(255,200,120,0.6)'],
        [1, 'rgba(255,140,60,0)'],
      ]),
      smoke: glowSprite(64, [
        [0, 'rgba(70,52,44,0.55)'],
        [0.6, 'rgba(60,44,38,0.25)'],
        [1, 'rgba(50,36,30,0)'],
      ]),
      vignette: null,
    }),
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.base = h * 0.6;
      s.beltY = h * 0.84;
      const towers = skyline(w, h);
      paintEra(s, env, 1, towers);
      const stacks = s.stacks;
      paintEra(s, env, 2, towers);
      s.stacks = stacks;
      s.cars = [];
      for (let x = -CAR_GAP * 0.4; x < w + CAR_GAP; x += CAR_GAP) s.cars.push({ x, style: s.cars.length, stamp: 0 });
      s.streams = [];
      const cols = Math.floor(w / 20);
      const r = mulberry(5);
      for (let i = 0; i < cols; i++) {
        s.streams.push({
          x: (i + 0.5) * (w / cols) + (r() - 0.5) * 8,
          y: r() * h,
          v: lerp(30, 80, r()),
          len: Math.floor(lerp(5, 14, r())),
          g: Array.from({ length: 14 }, () => Math.floor(r() * CODE_GLYPH_COUNT)),
          tint: r() < 0.12 ? 3 : 1,
        });
      }
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      s.vignette = v;
    },
    update: (s, env, dt) => {
      const { w, h, pointer } = env;
      s.amb += dt;
      s.idle += dt;
      s.pulse = Math.max(0, s.pulse - dt * 0.8);
      stepPool(s.parts, dt);
      if (env.interactive && pointer.inside && s.touched) s.seamT = clamp(pointer.x / w, 0.04, 0.96);
      else if (env.interactive && pointer.inside) {
        s.seamT = clamp(pointer.x / w, 0.04, 0.96);
        s.touched = true;
      } else if (!env.reducedMotion) s.seamT = 0.5 + Math.sin(s.amb * 0.25) * 0.24;
      s.seam = damp(s.seam, s.seamT, 5, dt);
      const sx = s.seam * w;

      // belt and cars
      const speed = 46;
      s.belt += dt * speed;
      for (const car of s.cars) {
        car.x += dt * speed;
        car.stamp = Math.max(0, car.stamp - dt * 2.5);
        if (car.x > w + CAR_GAP * 0.6) {
          car.x -= CAR_GAP * s.cars.length;
          car.style++;
        }
      }
      // welding sparks where the seam crosses the belt
      s.sparkT -= dt;
      if (s.sparkT <= 0) {
        s.sparkT = rand(0.03, 0.08);
        const y = s.beltY - rand(4, 40);
        burst(s.parts, 3, sx, y, -Math.PI / 2 + rand(-0.6, 0.6), 1.1, h * 0.35, 0.6, 1.4, 6, 0.8, h * 0.9);
        if (Math.random() < 0.4) emit(s.parts, sx + rand(-3, 3), rand(s.base, s.beltY), rand(-10, 10), -rand(20, 60), rand(0.6, 1.2), rand(5, 8), 7, 0.5, 0);
      }

      // smoke from the stacks
      if (s.plumes.length < 60 && Math.random() < dt * 14) {
        const st = s.stacks[Math.floor(Math.random() * s.stacks.length)];
        if (st) s.plumes.push({ x: st[0], y: st[1], r: rand(5, 9), age: 0, stack: 0 });
      }
      for (let i = s.plumes.length - 1; i >= 0; i--) {
        const p = s.plumes[i];
        p.age += dt;
        p.y -= dt * (18 + p.age * 4);
        p.x += dt * (10 + p.age * 6);
        p.r += dt * 7;
        if (p.age > 7) s.plumes.splice(i, 1);
      }

      // code streams climb out of the river
      for (const st of s.streams) {
        st.y -= dt * st.v * (1 + s.pulse * 2.5);
        if (st.y < -st.len * 16) {
          st.y = s.beltY + rand(0, h * 0.2);
          st.g[Math.floor(Math.random() * st.g.length)] = Math.floor(Math.random() * CODE_GLYPH_COUNT);
        }
        if (Math.random() < dt * 3) st.g[Math.floor(Math.random() * st.g.length)] = Math.floor(Math.random() * CODE_GLYPH_COUNT);
      }
      s.mover = (s.mover + dt * 0.045) % 1;

      // rockets
      for (const r of s.rockets) {
        if (!r.live) continue;
        r.y += r.vy * dt;
        r.vy *= Math.exp(-1.2 * dt);
        if (Math.random() < 0.8) emit(s.parts, r.x + rand(-1, 1), r.y + 4, rand(-6, 6), rand(10, 30), 0.4, 1.4, 8, 1, 0);
        if (r.y <= r.ty || r.vy > -h * 0.15) explode(s, env, r);
      }
      // autopilot fireworks
      const auto = !env.interactive || !s.touched || s.idle > 6;
      if (auto && !env.reducedMotion) {
        s.autoT -= dt;
        if (s.autoT <= 0) {
          s.autoT = rand(2.4, 4.2);
          launch(s, env, rand(0.15, 0.9) * w, false);
        }
      }
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const sx = s.seam * w;
      const base = s.base;
      const by = s.beltY;

      // the two cities, split at the seam
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, sx, h);
      ctx.clip();
      if (s.a) ctx.drawImage(s.a, 0, 0, w, h);
      // smoke drifting off the stacks
      for (const p of s.plumes) {
        const a = Math.min(1, p.age * 2) * (1 - p.age / 7);
        glow(ctx, s.smoke, p.x, p.y, p.r * 2.4, a);
      }
      ctx.globalAlpha = 1;
      // warm glints on the old river
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,190,110,0.35)';
      for (let i = 0; i < 40; i++) {
        const gx = ((i * 97.3 + t * 12 * (1 + (i % 3))) % (w + 60)) - 30;
        const gy = lerp(base + 4, by - 8, ((i * 0.618) % 1) ** 1.6);
        const len = 6 + (i % 5) * 4 * (gy - base) / (by - base);
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 2 + i);
        ctx.fillRect(gx, gy, len, 1);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, 0, w - sx, h);
      ctx.clip();
      if (s.b) ctx.drawImage(s.b, 0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      // RenCen crown light and the Penobscot mast blinking
      const rcx = w * RENCEN;
      const rtop = base - h * 0.42 * 0.98;
      glow(ctx, s.cyan, rcx, rtop - h * 0.015, w * 0.06, 0.55 + 0.25 * Math.sin(t * 1.5) + s.pulse * 0.4);
      ctx.fillStyle = `rgba(93,216,255,${(0.7 + 0.3 * Math.sin(t * 1.5)).toFixed(3)})`;
      ctx.fillRect(rcx - w * 0.028, rtop - h * 0.018, w * 0.056, 2);
      for (const m of s.winB) {
        if (m[2] === 1) glow(ctx, s.hot, m[0], m[1], 8, Math.sin(t * 3) > 0 ? 0.9 : 0.15);
        else if (m[2] === 2) glow(ctx, s.cyan, m[0], m[1], 10, 0.5 + 0.3 * Math.sin(t * 2 + m[0]));
      }
      // bridge cables strung with light, a chase running along them
      const [bx0, bx1, t0, t1, towerTop, deckY, sag] = s.bridge;
      void bx0;
      void bx1;
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        const x = lerp(t0, t1, u);
        const y = towerTop + (deckY + sag - towerTop) * 2 * u * (1 - u);
        const chase = 0.5 + 0.5 * Math.sin(u * 18 - t * 4);
        glow(ctx, s.cyan, x, y, 5 + chase * 4, 0.35 + chase * 0.5);
      }
      for (let i = 0; i < 18; i++) glow(ctx, s.amber, lerp(-w * 0.04, w * 0.3, i / 17), deckY + 1, 4, 0.7);
      // code climbing out of the river into the skyline
      const cell = Math.max(10, Math.min(16, w / 70));
      for (const st of s.streams) {
        if (st.x < sx - 10) continue;
        for (let j = 0; j < st.len; j++) {
          const y = st.y + j * cell * 1.1;
          if (y < 0 || y > by) continue;
          const fade = 1 - j / st.len;
          // fainter where the stream crosses the buildings, brightest over the river
          const over = y > base ? 1 : 0.55;
          ctx.globalAlpha = Math.min(1, fade * over * (0.8 + s.pulse * 0.6));
          drawGlyph(ctx, s.atlas, st.g[j % st.g.length], j === 0 ? 0 : st.tint, st.x, y, cell);
        }
      }
      ctx.globalAlpha = 1;
      // neon reflections on the river
      for (let i = 0; i < 60; i++) {
        const gx = ((i * 71.7 + t * 8 * (1 + (i % 4))) % (w + 60)) - 30;
        const gy = lerp(base + 4, by - 6, ((i * 0.618) % 1) ** 1.4);
        ctx.fillStyle = i % 5 === 0 ? 'rgba(255,79,163,0.5)' : 'rgba(93,216,255,0.45)';
        ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 2.4 + i * 1.7);
        ctx.fillRect(gx, gy, 6 + (i % 6) * 3, 1);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // People Mover on its elevated track
      const trackY = base - h * 0.05;
      ctx.fillStyle = '#0a1022';
      ctx.fillRect(w * 0.3, trackY, w * 0.75, 3);
      for (let x = w * 0.32; x < w; x += w * 0.08) ctx.fillRect(x, trackY, 3, base - trackY);
      const mx = lerp(w * 0.2, w * 1.15, s.mover);
      ctx.fillStyle = '#1b2a4d';
      ctx.beginPath();
      ctx.roundRect(mx - 46, trackY - 13, 44, 12, 4);
      ctx.roundRect(mx + 1, trackY - 13, 44, 12, 4);
      ctx.fill();
      ctx.fillStyle = '#bfe9ff';
      for (let i = 0; i < 8; i++) ctx.fillRect(mx - 42 + i * 11, trackY - 10, 6, 4);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.cyan, mx + 46, trackY - 7, 14, 0.8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      // the assembly belt runs the full width; cars change at the seam
      const L = Math.min(150, w * 0.16);
      ctx.fillStyle = '#121217';
      ctx.fillRect(0, by - 2, w, 10);
      ctx.fillStyle = '#2b2b33';
      for (let x = -(s.belt % 22); x < w; x += 22) ctx.fillRect(x, by + 1, 12, 3);
      ctx.fillStyle = '#0a0a0e';
      for (let x = -(s.belt % 44) + 22; x < w; x += 44) {
        ctx.beginPath();
        ctx.arc(x, by + 12, 5, 0, TAU);
        ctx.fill();
      }
      for (const car of s.cars) {
        if (car.x + L < 0 || car.x - L > w) continue;
        if (car.x - L * 0.6 < sx) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, sx, h);
          ctx.clip();
          drawCarOld(ctx, car.x, by - 2, L, car.style, car.stamp);
          ctx.restore();
        }
        if (car.x + L * 0.6 > sx) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(sx, 0, w - sx, h);
          ctx.clip();
          ctx.globalCompositeOperation = 'lighter';
          drawCarNew(ctx, car.x, by - 2, L, t, s.pulse);
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();
        }
      }
      // overhead line: hooks on the old side, robot arms on the new side
      ctx.fillStyle = '#16161b';
      ctx.fillRect(0, by - h * 0.17, w, 4);
      for (let x = w * 0.08; x < w; x += w * 0.16) {
        const reach = 0.5 + 0.5 * Math.sin(t * 1.6 + x * 0.01);
        if (x < sx) {
          ctx.strokeStyle = '#2a2018';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, by - h * 0.17);
          ctx.lineTo(x, by - h * 0.12 - reach * h * 0.01);
          ctx.arc(x + 4, by - h * 0.12 - reach * h * 0.01, 4, Math.PI, Math.PI * 0.2, true);
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#3a4a6e';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          const ex = x + Math.cos(t * 1.4 + x) * 10;
          const ey = by - h * 0.12 + reach * h * 0.03;
          ctx.beginPath();
          ctx.moveTo(x, by - h * 0.17);
          ctx.lineTo(x - 14, by - h * 0.14);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, s.cyan, ex, ey + 2, 7, 0.8);
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      // the seam itself: a bright weld line
      ctx.globalCompositeOperation = 'lighter';
      const sg = ctx.createLinearGradient(sx - 16, 0, sx + 16, 0);
      sg.addColorStop(0, 'rgba(255,140,60,0)');
      sg.addColorStop(0.45, 'rgba(255,200,120,0.35)');
      sg.addColorStop(0.55, 'rgba(93,216,255,0.35)');
      sg.addColorStop(1, 'rgba(93,216,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 16, 0, 32, h);
      ctx.fillStyle = 'rgba(255,250,235,0.85)';
      ctx.fillRect(sx - 0.75, 0, 1.5, h);
      glow(ctx, s.hot, sx, by - 10, 46 + Math.sin(t * 40) * 6, 0.9);

      // particles: sparks, rocket trails, firework stars, glyph motes
      for (const p of s.parts.items) {
        if (p.life <= 0) continue;
        const f = p.life / p.max;
        if (p.kind < FIRE.length) {
          const rgb = FIRE_RGB[p.kind];
          const tw = f < 0.3 ? (Math.sin(t * 40 + p.rot * 10) > 0 ? 1 : 0.3) : 1;
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(f * tw).toFixed(3)})`;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          glow(ctx, p.x < sx ? s.amber : s.cyan, p.x, p.y, p.size * 4, f * 0.35);
        } else if (p.kind === 6 || p.kind === 9) {
          ctx.strokeStyle = `rgba(255,${Math.round(200 + 55 * f)},${Math.round(120 * f + 60)},${f.toFixed(3)})`;
          ctx.lineWidth = p.size * 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
          ctx.stroke();
        } else if (p.kind === 7) {
          ctx.globalAlpha = f;
          drawGlyph(ctx, s.atlas, Math.floor(p.rot * 3) % CODE_GLYPH_COUNT, 1, p.x, p.y, p.size * 1.6);
          ctx.globalAlpha = 1;
        } else {
          glow(ctx, s.hot, p.x, p.y, 4, f * 0.7);
        }
      }
      ctx.globalAlpha = 1;
      // rockets
      for (const r of s.rockets) if (r.live) glow(ctx, s.hot, r.x, r.y, 9, 1);
      // the code surge washes the right side
      if (s.pulse > 0) {
        const k = easeOutCubic(1 - s.pulse);
        const band = sx + (w - sx) * k;
        const g = ctx.createLinearGradient(band - 160, 0, band + 40, 0);
        g.addColorStop(0, 'rgba(93,216,255,0)');
        g.addColorStop(0.75, `rgba(93,216,255,${(0.1 * s.pulse).toFixed(3)})`);
        g.addColorStop(1, 'rgba(93,216,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(Math.max(sx, band - 160), 0, band + 40 - Math.max(sx, band - 160), by);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = s.vignette ?? 'transparent';
      ctx.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env, x) => launch(s, env, x, true),
    onPointerMove: (s, env) => {
      s.touched = true;
      s.idle = 0;
      if (env.reducedMotion) env.wake(700);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down && !e.repeat) launch(s, env, rand(0.2, 0.85) * env.w, true);
      return true;
    },
    dispose: (s) => {
      freeCanvas(s.a, s.b, s.atlas.canvas, s.hot, s.cyan, s.amber, s.smoke);
    },
  });
