// Parallax backgrounds. Each theme is painted ONCE at stage load into tiled
// offscreen layers (sky, far, mid, wall, floor, foreground) using a seeded RNG,
// then scrolled at different factors each frame with integer offsets.
import { createSurface, Surface } from './canvas';
import { FLOOR_TOP, OUTLINE, VIEW_H, VIEW_W } from './constants';
import { drawText } from './font';
import { makeRng, shade } from './math';
import { StageTheme } from './stages';

interface Layer {
  img: HTMLCanvasElement;
  factor: number;
  y: number;
}

export interface Backdrop {
  sky: HTMLCanvasElement;
  layers: Layer[]; // drawn back-to-front behind actors
  fg: Layer | null; // drawn in front of actors
}

type C = CanvasRenderingContext2D;
const R = (c: C, col: string, x: number, y: number, w: number, h: number) => {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

const bandSky = (c: C, cols: string[], h: number) => {
  const bh = Math.ceil(h / cols.length);
  cols.forEach((col, i) => {
    R(c, col, 0, i * bh, VIEW_W, bh + 1);
    // dithered seam between bands
    if (i < cols.length - 1) {
      c.fillStyle = cols[i + 1];
      for (let x = 0; x < VIEW_W; x += 2) c.fillRect(x + ((i & 1) ^ 0), i * bh + bh - 2, 1, 1);
      for (let x = 1; x < VIEW_W; x += 2) c.fillRect(x, i * bh + bh - 1, 1, 1);
    }
  });
};

const disc = (c: C, x: number, y: number, r: number, col: string) => {
  c.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy));
    c.fillRect(Math.round(x - hw), Math.round(y + dy), hw * 2 + 1, 1);
  }
};

const layer = (w: number, h: number, paint: (c: C) => void): HTMLCanvasElement => {
  const s: Surface = createSurface(w, h);
  if (s.ctx) paint(s.ctx);
  return s.canvas;
};

// ---------------------------------------------------------------------------
// STREETS — Detroit at night
// ---------------------------------------------------------------------------
const streets = (): Backdrop => {
  const rnd = makeRng(1701);
  const sky = layer(VIEW_W, VIEW_H, (c) => {
    bandSky(c, ['#070a24', '#0d1236', '#151a48', '#211f58', '#322463', '#48296a'], 140);
    for (let i = 0; i < 70; i++)
      R(c, rnd() < 0.2 ? '#ffe9a8' : '#cfd6ff', rnd() * VIEW_W, rnd() * 100, 1, 1);
    disc(c, 318, 34, 14, '#fff3c4');
    disc(c, 313, 30, 3, '#eadca0');
    disc(c, 323, 40, 2, '#eadca0');
    disc(c, 320, 28, 1, '#eadca0');
  });
  const far = layer(512, 140, (c) => {
    let x = 0;
    while (x < 512) {
      const bw = 18 + Math.floor(rnd() * 28);
      const bh = 30 + Math.floor(rnd() * 60);
      R(c, '#1a1e48', x, 132 - bh, bw, bh + 8);
      for (let wy = 132 - bh + 4; wy < 128; wy += 5)
        for (let wx = x + 3; wx < x + bw - 3; wx += 4)
          if (rnd() < 0.3) R(c, rnd() < 0.8 ? '#f7d774' : '#8fd0ff', wx, wy, 2, 2);
      if (rnd() < 0.3) {
        R(c, '#1a1e48', x + bw / 2, 132 - bh - 10, 1, 10);
        R(c, '#ff4d4d', x + bw / 2, 132 - bh - 11, 1, 1);
      }
      x += bw + Math.floor(rnd() * 4);
    }
    // Renaissance-style tower cluster
    const cx = 250;
    [
      [-26, 70],
      [-14, 88],
      [0, 108],
      [14, 88],
      [26, 70],
    ].forEach(([dx, h]) => {
      R(c, '#252c62', cx + dx - 6, 132 - h, 12, h + 8);
      R(c, '#2f3876', cx + dx - 6, 132 - h, 4, h + 8);
      for (let yy = 132 - h + 3; yy < 130; yy += 3) R(c, '#6d7bd0', cx + dx - 5, yy, 10, 1);
    });
  });
  const mid = layer(512, 140, (c) => {
    // suspension bridge silhouette
    const deck = 116;
    for (const tx of [90, 400]) {
      R(c, '#2b3070', tx - 3, 60, 6, deck - 60 + 4);
      R(c, '#2b3070', tx - 6, 58, 12, 3);
    }
    c.fillStyle = '#3a3f88';
    for (let x = 0; x < 512; x++) {
      const t = ((x - 90) / 310) * Math.PI;
      const y =
        x >= 90 && x <= 400
          ? 62 + Math.sin(t) * 44
          : x < 90
            ? 62 + (90 - x) * 0.5
            : 62 + (x - 400) * 0.5;
      c.fillRect(x, Math.round(y), 1, 1);
      if (x % 8 === 0 && y < deck) c.fillRect(x, Math.round(y), 1, deck - Math.round(y));
    }
    R(c, '#2b3070', 0, deck, 512, 4);
    for (let x = 4; x < 512; x += 10) R(c, '#ffd97a', x, deck + 1, 2, 1);
    // low buildings
    let x = 0;
    while (x < 512) {
      const bw = 26 + Math.floor(rnd() * 30);
      const bh = 14 + Math.floor(rnd() * 26);
      R(c, '#222659', x, 140 - bh, bw, bh);
      for (let wy = 140 - bh + 3; wy < 138; wy += 5)
        for (let wx = x + 3; wx < x + bw - 3; wx += 5)
          if (rnd() < 0.35) R(c, '#f0c060', wx, wy, 2, 2);
      x += bw + 2;
    }
  });
  const signs = ['DONUTS', 'ARCADE', 'PIZZA', 'COMICS'];
  const signCols = ['#ff4fa3', '#39e8ff', '#ffd35a', '#7dff6a'];
  const facades = ['#7a2e3a', '#1e5a64', '#5a3a7a', '#7a5a2e'];
  const wall = layer(512, FLOOR_TOP, (c) => {
    for (let i = 0; i < 4; i++) {
      const x0 = i * 128;
      const top = 30 + ((i * 17) % 22);
      const col = facades[i];
      R(c, OUTLINE, x0, top - 2, 128, FLOOR_TOP - top + 2);
      R(c, col, x0 + 1, top, 126, FLOOR_TOP - top);
      for (let y = top + 3; y < 90; y += 4) {
        R(c, shade(col, -0.25), x0 + 1, y, 126, 1);
        for (let bx = x0 + ((y >> 2) % 2) * 4; bx < x0 + 127; bx += 8)
          R(c, shade(col, -0.25), bx, y - 3, 1, 3);
      }
      R(c, shade(col, 0.2), x0 + 1, top, 126, 2);
      // upper windows
      for (const wx of [x0 + 18, x0 + 74]) {
        R(c, OUTLINE, wx - 1, top + 12, 36, 26);
        const lit = rnd() < 0.6;
        R(c, lit ? '#ffd97a' : '#2a2f5a', wx, top + 13, 34, 24);
        R(c, OUTLINE, wx + 16, top + 13, 2, 24);
        if (lit) R(c, '#fff3c4', wx + 2, top + 15, 6, 3);
      }
      // awning
      for (let ax = 0; ax < 120; ax += 8)
        R(c, (ax / 8) % 2 ? '#f2f2f2' : signCols[i], x0 + 4 + ax, 92, 8, 8);
      R(c, OUTLINE, x0 + 4, 100, 120, 1);
      for (let ax = 0; ax < 120; ax += 8) R(c, OUTLINE, x0 + 4 + ax, 100, 4, 2);
      // neon sign
      const txt = signs[i];
      R(c, '#140c24', x0 + 64 - txt.length * 6 - 4, 72, txt.length * 12 + 6, 16);
      c.globalAlpha = 0.35;
      R(c, signCols[i], x0 + 64 - txt.length * 6 - 6, 70, txt.length * 12 + 10, 20);
      c.globalAlpha = 1;
      drawText(c, txt, x0 + 64, 73, signCols[i], 2, 'center', null);
      // shop window + door
      R(c, OUTLINE, x0 + 8, 104, 76, 34);
      R(c, '#ffe7a3', x0 + 9, 105, 74, 32);
      R(c, '#d9a95a', x0 + 9, 122, 74, 2);
      for (let k = 0; k < 6; k++)
        R(c, ['#ff6fb5', '#6fd3ff', '#ffd35a', '#8f6bff'][k % 4], x0 + 14 + k * 11, 115, 6, 7);
      R(c, OUTLINE, x0 + 92, 102, 28, 38);
      R(c, shade(col, -0.45), x0 + 93, 103, 26, 37);
      R(c, '#ffd35a', x0 + 114, 120, 2, 2);
    }
    R(c, '#241c3c', 0, FLOOR_TOP - 4, 512, 4);
  });
  const floor = layer(128, VIEW_H - FLOOR_TOP + 4, (c) => {
    const h = VIEW_H - FLOOR_TOP + 4;
    R(c, '#8d8aa6', 0, 0, 128, 26);
    for (let x = 0; x < 128; x += 32) R(c, '#6f6c8a', x, 0, 1, 26);
    R(c, '#6f6c8a', 0, 12, 128, 1);
    R(c, '#a8a5c2', 0, 0, 128, 1);
    R(c, '#4a4866', 0, 26, 128, 4);
    R(c, '#bdbad6', 0, 26, 128, 1);
    R(c, '#34344a', 0, 30, 128, h - 30);
    for (let i = 0; i < 90; i++)
      R(c, rnd() < 0.5 ? '#2c2c40' : '#3e3e56', rnd() * 128, 30 + rnd() * (h - 30), 1, 1);
    R(c, '#f2c230', 8, 50, 20, 2);
    R(c, '#f2c230', 72, 50, 20, 2);
    disc(c, 100, h - 12, 5, '#2a2a3c');
    R(c, '#44445c', 96, h - 13, 9, 1);
  });
  const fg = layer(640, VIEW_H, (c) => {
    R(c, OUTLINE, 70, 52, 5, VIEW_H - 52);
    R(c, '#2e2e48', 71, 52, 3, VIEW_H - 52);
    R(c, OUTLINE, 62, 46, 22, 8);
    R(c, '#ffe9a8', 64, 48, 18, 4);
    c.globalAlpha = 0.18;
    R(c, '#ffe9a8', 56, 54, 34, 30);
    c.globalAlpha = 1;
  });
  return {
    sky,
    layers: [
      { img: far, factor: 0.15, y: 0 },
      { img: mid, factor: 0.4, y: 0 },
      { img: wall, factor: 1, y: 0 },
      { img: floor, factor: 1, y: FLOOR_TOP - 4 },
    ],
    fg: { img: fg, factor: 1.3, y: 0 },
  };
};

// ---------------------------------------------------------------------------
// CARNIVAL — boardwalk at sunset
// ---------------------------------------------------------------------------
const carnival = (): Backdrop => {
  const rnd = makeRng(2202);
  const sky = layer(VIEW_W, VIEW_H, (c) => {
    bandSky(c, ['#3a2a78', '#5a3290', '#8a3a98', '#c24a8a', '#ee6a7a', '#ff9a5a', '#ffc15a'], 140);
    disc(c, 200, 124, 26, '#ffe38a');
    disc(c, 200, 124, 20, '#fff3c4');
    for (let i = 0; i < 6; i++)
      R(c, '#ffb3c8', rnd() * VIEW_W, 20 + rnd() * 60, 20 + rnd() * 40, 2);
  });
  const far = layer(512, 140, (c) => {
    const cx = 130;
    const cy = 64;
    const r = 52;
    c.fillStyle = '#3d2459';
    for (let a = 0; a < 360; a += 1.5) {
      const t = (a * Math.PI) / 180;
      c.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 2, 2);
    }
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2;
      for (let d = 0; d < r; d += 1)
        c.fillRect(Math.round(cx + Math.cos(t) * d), Math.round(cy + Math.sin(t) * d), 1, 1);
      const gx = cx + Math.cos(t) * r;
      const gy = cy + Math.sin(t) * r;
      R(c, ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0'][k % 4], gx - 3, gy + 1, 6, 5);
    }
    R(c, '#3d2459', cx - 20, cy, 3, 76);
    R(c, '#3d2459', cx + 18, cy, 3, 76);
    // coaster
    c.fillStyle = '#4a2a66';
    for (let x = 250; x < 512; x++) {
      const y = 70 + Math.sin((x - 250) / 22) * 26 + (x - 250) * 0.08;
      c.fillRect(x, Math.round(y), 1, 2);
      if (x % 14 === 0) c.fillRect(x, Math.round(y), 1, 140 - Math.round(y));
    }
  });
  const mid = layer(512, 140, (c) => {
    for (const [x, h] of [
      [40, 60],
      [220, 70],
      [400, 54],
    ]) {
      const base = 138;
      for (let y = 0; y < h; y++) {
        const hw = Math.round((y / h) * 44);
        for (let k = -hw; k < hw; k++) {
          const stripe = Math.floor((k + 100) / 8) % 2;
          c.fillStyle =
            y > h - 22 ? (stripe ? '#c8324a' : '#f2e6d8') : stripe ? '#a82840' : '#e8d6c8';
          c.fillRect(x + k, base - h + y, 1, 1);
        }
      }
      R(c, '#5a2a40', x, base - h - 10, 1, 10);
      R(c, '#ffd35a', x + 1, base - h - 10, 6, 4);
    }
  });
  const booths = ['PIE TOSS', 'HIGH STRIKER', 'BALLOONS', 'FORTUNE'];
  const aw = [
    ['#e63946', '#f2f2f2'],
    ['#2a6fdb', '#ffd35a'],
    ['#06d6a0', '#f2f2f2'],
    ['#8f3ad6', '#ffd35a'],
  ];
  const wall = layer(512, FLOOR_TOP, (c) => {
    // string lights
    for (let x = 0; x < 512; x++) {
      const y = 44 + Math.sin((x / 128) * Math.PI) * -8 + 8;
      R(c, '#2a1a3a', x, y, 1, 1);
      if (x % 12 === 0)
        R(c, ['#ff4d6d', '#ffd166', '#4cc9f0', '#7dff6a'][(x / 12) % 4], x - 1, y + 1, 3, 3);
    }
    for (let i = 0; i < 4; i++) {
      const x0 = i * 128 + 18;
      const bw = 92;
      R(c, OUTLINE, x0 - 1, 79, bw + 2, FLOOR_TOP - 79);
      R(c, '#8a5a3a', x0, 96, bw, FLOOR_TOP - 96);
      for (let y = 100; y < FLOOR_TOP; y += 6) R(c, '#6a4028', x0, y, bw, 1);
      R(c, '#2a1a24', x0 + 6, 96, bw - 12, 18);
      for (let k = 0; k < 6; k++)
        R(c, ['#ff6fb5', '#ffd35a', '#6fd3ff'][k % 3], x0 + 10 + k * 13, 104, 7, 8);
      for (let ax = 0; ax < bw; ax += 10) {
        R(c, aw[i][(ax / 10) % 2], x0 + ax, 80, Math.min(10, bw - ax), 14);
        disc(c, x0 + ax + 5, 94, 5, aw[i][(ax / 10) % 2]);
      }
      R(c, OUTLINE, x0 + 3, 62, bw - 6, 18);
      R(c, '#fff0c8', x0 + 4, 63, bw - 8, 16);
      drawText(c, booths[i], x0 + bw / 2, 68, '#c8324a', 1, 'center', null);
      R(c, '#5a3a2a', x0, 114, bw, 4);
      // posts
      R(c, OUTLINE, x0 - 1, 62, 3, 80);
      R(c, OUTLINE, x0 + bw - 2, 62, 3, 80);
    }
  });
  const floor = layer(128, VIEW_H - FLOOR_TOP + 4, (c) => {
    const h = VIEW_H - FLOOR_TOP + 4;
    for (let x = 0; x < 128; x += 10) {
      const col = ['#b07a4a', '#a8703f', '#b98452', '#a06a3c'][Math.floor(rnd() * 4)];
      R(c, col, x, 0, 10, h);
      R(c, '#6a4024', x, 0, 1, h);
      R(c, '#d09a66', x + 1, 0, 1, h);
      R(c, '#5a3420', x + 5, 10 + Math.floor(rnd() * 40), 1, 1);
      R(c, '#5a3420', x + 5, 40 + Math.floor(rnd() * 20), 1, 1);
    }
    R(c, '#5a3420', 0, 0, 128, 3);
    for (let y = 22; y < h; y += 24) R(c, 'rgba(60,30,20,0.25)', 0, y, 128, 1);
  });
  const fg = layer(600, VIEW_H, (c) => {
    R(c, OUTLINE, 40, 30, 4, VIEW_H);
    R(c, '#e8d6c8', 41, 30, 2, VIEW_H);
    for (let x = 44; x < 600; x += 12) {
      const y = 32 + Math.sin(((x - 44) / 556) * Math.PI) * 10;
      c.fillStyle = OUTLINE;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 10, y);
      c.lineTo(x + 5, y + 9);
      c.fill();
      c.fillStyle = ['#e63946', '#ffd35a', '#2a6fdb', '#06d6a0'][((x / 12) % 4) | 0];
      c.beginPath();
      c.moveTo(x + 1, y + 1);
      c.lineTo(x + 9, y + 1);
      c.lineTo(x + 5, y + 7);
      c.fill();
    }
  });
  return {
    sky,
    layers: [
      { img: far, factor: 0.15, y: 0 },
      { img: mid, factor: 0.45, y: 0 },
      { img: wall, factor: 1, y: 0 },
      { img: floor, factor: 1, y: FLOOR_TOP - 4 },
    ],
    fg: { img: fg, factor: 1.3, y: 0 },
  };
};

// ---------------------------------------------------------------------------
// FACTORY — smog-dusk rooftops
// ---------------------------------------------------------------------------
const factory = (): Backdrop => {
  const rnd = makeRng(3303);
  const sky = layer(VIEW_W, VIEW_H, (c) => {
    bandSky(c, ['#1e2230', '#2c2e3e', '#44404c', '#6a5048', '#9a6440', '#c88040'], 140);
    for (let i = 0; i < 9; i++)
      disc(c, rnd() * VIEW_W, 30 + rnd() * 50, 6 + Math.floor(rnd() * 10), 'rgba(90,80,90,0.35)');
  });
  const far = layer(512, 140, (c) => {
    for (const x of [60, 150]) {
      for (let y = 0; y < 70; y++) {
        const t = y / 70;
        const hw = Math.round(22 - Math.sin(t * Math.PI) * 7 + (t > 0.7 ? (t - 0.7) * 20 : 0));
        R(c, '#454656', x - hw, 138 - 70 + y, hw * 2, 1);
      }
      disc(c, x, 60, 10, 'rgba(220,220,230,0.5)');
      disc(c, x + 8, 50, 8, 'rgba(220,220,230,0.4)');
    }
    for (const x of [280, 320, 440]) {
      R(c, '#3a3a48', x, 40, 10, 100);
      R(c, '#c8324a', x, 48, 10, 4);
      R(c, '#c8324a', x, 60, 10, 4);
      disc(c, x + 6, 32, 6, 'rgba(120,110,120,0.6)');
      disc(c, x + 12, 22, 8, 'rgba(120,110,120,0.4)');
    }
  });
  const mid = layer(512, 140, (c) => {
    let x = 0;
    while (x < 512) {
      const bw = 50 + Math.floor(rnd() * 40);
      const bh = 20 + Math.floor(rnd() * 26);
      R(c, '#34323e', x, 140 - bh, bw, bh);
      x += bw + 6;
    }
    // water tower
    R(c, '#2a2832', 100, 70, 2, 40);
    R(c, '#2a2832', 124, 70, 2, 40);
    R(c, '#5a3a2a', 96, 48, 34, 24);
    R(c, '#6a4a32', 96, 48, 34, 3);
    c.fillStyle = '#4a2a1a';
    c.beginPath();
    c.moveTo(94, 48);
    c.lineTo(113, 36);
    c.lineTo(132, 48);
    c.fill();
    // billboard
    R(c, '#2a2832', 330, 80, 2, 30);
    R(c, '#2a2832', 390, 80, 2, 30);
    R(c, OUTLINE, 312, 56, 100, 28);
    R(c, '#f2c230', 313, 57, 98, 26);
    drawText(c, 'GEARWORKS', 362, 62, '#2a2832', 1, 'center', null);
    drawText(c, 'EST 1899', 362, 72, '#8a3a2a', 1, 'center', null);
  });
  const wall = layer(512, FLOOR_TOP, (c) => {
    R(c, OUTLINE, 0, 116, 512, FLOOR_TOP - 116);
    R(c, '#6a6a7a', 0, 117, 512, FLOOR_TOP - 117);
    R(c, '#8a8a9a', 0, 117, 512, 2);
    for (let y = 122; y < FLOOR_TOP; y += 5)
      for (let x = ((y / 5) % 2) * 8; x < 512; x += 16) R(c, '#5a5a6a', x, y, 1, 5);
    for (let y = 121; y < FLOOR_TOP; y += 5) R(c, '#5a5a6a', 0, y, 512, 1);
    // AC units
    for (const x of [30, 200, 380]) {
      R(c, OUTLINE, x - 1, 88, 52, 30);
      R(c, '#a8b0bc', x, 89, 50, 28);
      R(c, '#7a828e', x, 110, 50, 7);
      disc(c, x + 16, 100, 8, '#5a626e');
      for (let k = -6; k <= 6; k += 3) R(c, '#3a424e', x + 10, 100 + k, 12, 1);
      for (let k = 0; k < 5; k++) R(c, '#7a828e', x + 30, 93 + k * 3, 16, 1);
    }
    // pipes
    R(c, OUTLINE, 120, 70, 8, 48);
    R(c, '#b87a3a', 121, 71, 6, 47);
    R(c, OUTLINE, 110, 66, 28, 6);
    R(c, '#b87a3a', 111, 67, 26, 4);
    R(c, OUTLINE, 300, 96, 40, 22);
    R(c, '#4a5a6a', 301, 97, 38, 20);
    R(c, '#8fd0ff', 304, 100, 32, 4);
  });
  const floor = layer(128, VIEW_H - FLOOR_TOP + 4, (c) => {
    const h = VIEW_H - FLOOR_TOP + 4;
    R(c, '#4a4652', 0, 0, 128, h);
    for (let i = 0; i < 260; i++)
      R(c, rnd() < 0.5 ? '#5a5662' : '#3a3642', rnd() * 128, rnd() * h, 1, 1);
    R(c, '#3a3642', 0, 36, 128, 1);
    R(c, '#2a2632', 0, 0, 128, 3);
    R(c, OUTLINE, 60, 44, 26, 12);
    R(c, '#2a2a32', 61, 45, 24, 10);
    for (let x = 63; x < 85; x += 3) R(c, '#55555f', x, 45, 1, 10);
  });
  const fg = layer(700, VIEW_H, (c) => {
    R(c, OUTLINE, 80, 0, 20, VIEW_H);
    R(c, '#5a5a6a', 81, 0, 18, VIEW_H);
    R(c, '#7a7a8a', 81, 0, 4, VIEW_H);
    R(c, '#c8324a', 81, 60, 18, 6);
  });
  return {
    sky,
    layers: [
      { img: far, factor: 0.12, y: 0 },
      { img: mid, factor: 0.4, y: 0 },
      { img: wall, factor: 1, y: 0 },
      { img: floor, factor: 1, y: FLOOR_TOP - 4 },
    ],
    fg: { img: fg, factor: 1.35, y: 0 },
  };
};

// ---------------------------------------------------------------------------
// LAIR — neon arcade
// ---------------------------------------------------------------------------
const lair = (): Backdrop => {
  const rnd = makeRng(4404);
  const sky = layer(VIEW_W, VIEW_H, (c) => {
    bandSky(c, ['#07040f', '#0c0719', '#120a24', '#1a0e34', '#221040'], 140);
    for (let x = 0; x < VIEW_W; x += 24) R(c, '#2a1450', x, 0, 1, 140);
  });
  const far = layer(512, 140, (c) => {
    R(c, OUTLINE, 96, 14, 320, 90);
    R(c, '#0a0a1a', 98, 16, 316, 86);
    for (let i = 0; i < 18; i++)
      R(
        c,
        ['#ff2d95', '#34e7ff', '#ffd35a'][i % 3],
        98 + rnd() * 280,
        18 + rnd() * 80,
        10 + rnd() * 40,
        2
      );
    // invaders
    const inv = [0x18, 0x3c, 0x7e, 0xdb, 0xff, 0x24, 0x5a, 0xa5];
    for (let k = 0; k < 5; k++) {
      const ox = 150 + k * 44;
      inv.forEach((row, y) => {
        for (let x = 0; x < 8; x++)
          if (row & (1 << (7 - x))) R(c, '#7dff6a', ox + x * 2, 40 + y * 2, 2, 2);
      });
    }
    for (let y = 16; y < 102; y += 2) {
      c.globalAlpha = 0.25;
      R(c, '#000000', 98, y, 316, 1);
      c.globalAlpha = 1;
    }
  });
  const mid = layer(512, 140, (c) => {
    for (let x = 0; x < 512; x += 30) {
      R(c, '#1c1238', x, 96, 26, 44);
      R(c, ['#34e7ff', '#ff2d95', '#ffd35a', '#7dff6a'][(x / 30) % 4], x + 5, 102, 16, 10);
      R(c, '#2a1a50', x, 96, 26, 2);
    }
  });
  const cabCols = ['#e63946', '#2a6fdb', '#06d6a0', '#8f3ad6', '#ffb400', '#ff2d95'];
  const wall = layer(512, FLOOR_TOP, (c) => {
    R(c, '#ff2d95', 0, 40, 512, 2);
    R(c, '#34e7ff', 0, 46, 512, 1);
    for (let i = 0; i < 10; i++) {
      const x0 = i * 51 + 3;
      const col = cabCols[i % cabCols.length];
      R(c, OUTLINE, x0 - 1, 62, 46, FLOOR_TOP - 62);
      R(c, col, x0, 63, 44, FLOOR_TOP - 63);
      R(c, shade(col, -0.3), x0, 63, 6, FLOOR_TOP - 63);
      R(c, '#fff3c4', x0 + 4, 65, 36, 8);
      R(c, shade(col, -0.2), x0 + 6, 67, 32, 4);
      R(c, OUTLINE, x0 + 5, 76, 34, 26);
      const scr = ['#34e7ff', '#7dff6a', '#ff6fb5', '#ffd35a'][i % 4];
      R(c, shade(scr, -0.6), x0 + 6, 77, 32, 24);
      for (let k = 0; k < 5; k++) R(c, scr, x0 + 8 + rnd() * 24, 79 + rnd() * 18, 3, 2);
      R(c, shade(col, -0.4), x0 + 2, 104, 40, 8);
      R(c, '#e63946', x0 + 10, 106, 3, 3);
      R(c, '#ffd35a', x0 + 26, 106, 3, 3);
      R(c, '#34e7ff', x0 + 31, 106, 3, 3);
      R(c, OUTLINE, x0 + 16, 118, 12, 14);
      R(c, '#ffd35a', x0 + 19, 122, 6, 2);
    }
  });
  const floor = layer(128, VIEW_H - FLOOR_TOP + 4, (c) => {
    const h = VIEW_H - FLOOR_TOP + 4;
    R(c, '#1a0f33', 0, 0, 128, h);
    for (let i = 0; i < 14; i++) {
      const x = rnd() * 120;
      const y = 4 + rnd() * (h - 10);
      const col = ['#34e7ff', '#ff2d95', '#ffd35a', '#7dff6a'][i % 4];
      const kind = i % 3;
      if (kind === 0) {
        for (let k = 0; k < 6; k++) R(c, col, x + k, y + k, 1, 1);
        for (let k = 0; k < 6; k++) R(c, col, x + k, y + 6, 1, 1);
      } else if (kind === 1) {
        for (let k = 0; k < 8; k++) R(c, col, x + k, y + Math.round(Math.sin(k) * 2), 1, 1);
      } else {
        R(c, col, x, y, 3, 1);
        R(c, col, x, y + 2, 3, 1);
        R(c, col, x, y, 1, 3);
        R(c, col, x + 2, y, 1, 3);
      }
    }
    R(c, '#34e7ff', 0, 0, 128, 1);
    R(c, '#2a1a50', 0, 1, 128, 2);
  });
  const fg = layer(620, VIEW_H, (c) => {
    R(c, OUTLINE, 60, 0, 10, VIEW_H);
    R(c, '#ff2d95', 62, 0, 6, VIEW_H);
    c.globalAlpha = 0.2;
    R(c, '#ff2d95', 54, 0, 22, VIEW_H);
    c.globalAlpha = 1;
    R(c, '#ffd1ec', 64, 0, 2, VIEW_H);
  });
  return {
    sky,
    layers: [
      { img: far, factor: 0.12, y: 0 },
      { img: mid, factor: 0.4, y: 0 },
      { img: wall, factor: 1, y: 0 },
      { img: floor, factor: 1, y: FLOOR_TOP - 4 },
    ],
    fg: { img: fg, factor: 1.3, y: 0 },
  };
};

const BUILDERS: Record<StageTheme, () => Backdrop> = { streets, carnival, factory, lair };
const cache = new Map<StageTheme, Backdrop>();

export const getBackdrop = (theme: StageTheme): Backdrop => {
  let b = cache.get(theme);
  if (!b) {
    b = BUILDERS[theme]();
    cache.set(theme, b);
  }
  return b;
};

const drawTiled = (ctx: C, l: Layer, camX: number) => {
  const w = l.img.width;
  const off = Math.round(camX * l.factor) % w;
  for (let x = -off; x < VIEW_W; x += w) ctx.drawImage(l.img, x, l.y);
};

export const drawBackdrop = (ctx: C, b: Backdrop, camX: number): void => {
  ctx.drawImage(b.sky, 0, 0);
  for (const l of b.layers) drawTiled(ctx, l, camX);
};

export const drawForeground = (ctx: C, b: Backdrop, camX: number): void => {
  if (b.fg) drawTiled(ctx, b.fg, camX);
};
