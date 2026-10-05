// Pickups, breakable crates, projectiles and stage hazards (all pooled), plus
// their pre-rendered pixel sprites.
import { createSurface, hardenAlpha } from './canvas';
import { OUTLINE } from './constants';

export type ItemKind =
  'donut' | 'pizza' | 'turkey' | 'coin' | 'trophy' | 'bottle' | 'pipe' | 'crate';

export interface ItemInfo {
  kind: ItemKind;
  heal?: number;
  score?: number;
  weapon?: boolean;
  label: string;
}

export const ITEM_INFO: Record<ItemKind, ItemInfo> = {
  donut: { kind: 'donut', heal: 20, label: 'DONUT' },
  pizza: { kind: 'pizza', heal: 40, label: 'PIZZA' },
  turkey: { kind: 'turkey', heal: 100, label: 'FEAST' },
  coin: { kind: 'coin', score: 500, label: '+500' },
  trophy: { kind: 'trophy', score: 2000, label: '+2000' },
  bottle: { kind: 'bottle', weapon: true, label: 'BOTTLE' },
  pipe: { kind: 'pipe', weapon: true, label: 'PIPE' },
  crate: { kind: 'crate', label: 'CRATE' },
};

export class Item {
  active = false;
  kind: ItemKind = 'donut';
  x = 0;
  y = 0;
  z = 0;
  vz = 0;
  px = 0;
  pz = 0;
  hp = 0;
  /** contents for crates */
  drop: ItemKind | null = null;
  life = 0;
  flash = 0;
}

export type ProjKind = 'bottle' | 'pipe' | 'pie' | 'orb' | 'web' | 'batarang' | 'homing' | 'wave';

export class Projectile {
  active = false;
  kind: ProjKind = 'bottle';
  team: 0 | 1 = 1;
  owner: number = -1; // actor id
  slot = -1; // player slot for scoring
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  px = 0;
  pz = 0;
  g = 0;
  life = 0;
  t = 0;
  damage = 8;
  knock = 120;
  launch = 0;
  stun = 0;
  hitstop = 60;
  w = 10;
  h = 10;
  depth = 9;
  pierce = 1;
  interval = 0;
  hitList: number[] = new Array(12).fill(0);
  hitCount = 0;
  returning = false;
  color = '#fff';
}

export type HazardKind = 'steam' | 'laser' | 'shock' | 'pillar';

export class Hazard {
  active = false;
  kind: HazardKind = 'steam';
  x = 0;
  y = 0;
  w = 20;
  depth = 10;
  warn = 40; // ticks of telegraph
  life = 30; // ticks active
  t = 0;
  damage = 12;
  launch = 180;
  color = '#fff';
  hitList: number[] = new Array(4).fill(0);
  hitCount = 0;
}

export class Pool<T extends { active: boolean }> {
  readonly items: T[];
  constructor(n: number, make: () => T) {
    this.items = Array.from({ length: n }, make);
  }
  get(): T | null {
    for (const it of this.items) if (!it.active) return it;
    return null;
  }
  clear(): void {
    for (const it of this.items) it.active = false;
  }
  count(): number {
    let n = 0;
    for (const it of this.items) if (it.active) n++;
    return n;
  }
}

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------

type Painter = (c: CanvasRenderingContext2D) => void;

const px = (c: CanvasRenderingContext2D, col: string, x: number, y: number, w = 1, h = 1) => {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
};

const blob = (
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string
) => {
  c.beginPath();
  c.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, Math.PI * 2);
  c.fillStyle = OUTLINE;
  c.fill();
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
};

const PAINTERS: Record<string, [number, number, Painter]> = {
  donut: [
    16,
    12,
    (c) => {
      blob(c, 8, 6, 6.5, 4.5, '#e8a15a');
      blob(c, 8, 5.5, 5.5, 3.5, '#ff6fb5');
      blob(c, 8, 5.5, 1.6, 1, '#170d22');
      px(c, '#fff', 5, 4);
      px(c, '#7ef', 10, 3);
      px(c, '#ff0', 11, 6);
      px(c, '#7f7', 6, 7);
    },
  ],
  pizza: [
    18,
    12,
    (c) => {
      c.beginPath();
      c.moveTo(1, 2);
      c.lineTo(17, 2);
      c.lineTo(9, 11);
      c.closePath();
      c.fillStyle = OUTLINE;
      c.fill();
      c.beginPath();
      c.moveTo(2.5, 3);
      c.lineTo(15.5, 3);
      c.lineTo(9, 9.6);
      c.closePath();
      c.fillStyle = '#ffd35a';
      c.fill();
      px(c, '#c8702a', 2, 2, 14, 2);
      px(c, '#d62828', 6, 5, 2, 2);
      px(c, '#d62828', 10, 4, 2, 2);
      px(c, '#d62828', 8, 7, 2, 1);
    },
  ],
  turkey: [
    20,
    14,
    (c) => {
      blob(c, 10, 8, 8, 5, '#b8662a');
      px(c, '#e0a060', 6, 5, 4, 1);
      px(c, OUTLINE, 16, 3, 3, 3);
      px(c, '#fff', 17, 3, 2, 2);
      px(c, '#dfe6ee', 1, 12, 18, 1);
    },
  ],
  coin: [
    14,
    14,
    (c) => {
      blob(c, 7, 8, 5.5, 5, '#6fbf4a');
      px(c, OUTLINE, 5, 1, 4, 3);
      px(c, '#6fbf4a', 6, 2, 2, 2);
      px(c, '#fff', 6, 6, 2, 5);
      px(c, '#fff', 5, 7, 4, 1);
      px(c, '#fff', 5, 9, 4, 1);
    },
  ],
  trophy: [
    14,
    16,
    (c) => {
      px(c, OUTLINE, 1, 1, 12, 9);
      px(c, '#f7c948', 2, 2, 10, 7);
      px(c, OUTLINE, 5, 10, 4, 3);
      px(c, '#f7c948', 6, 10, 2, 3);
      px(c, OUTLINE, 3, 13, 8, 3);
      px(c, '#b8862a', 4, 14, 6, 1);
      px(c, '#fff8c0', 4, 3, 2, 4);
    },
  ],
  bottle: [
    8,
    16,
    (c) => {
      px(c, OUTLINE, 2, 0, 4, 16);
      px(c, OUTLINE, 1, 6, 6, 10);
      px(c, '#3fae5a', 3, 1, 2, 6);
      px(c, '#3fae5a', 2, 7, 4, 8);
      px(c, '#aef0c0', 3, 8, 1, 5);
    },
  ],
  pipe: [
    22,
    8,
    (c) => {
      px(c, OUTLINE, 0, 2, 22, 5);
      px(c, '#9aa7b4', 1, 3, 20, 3);
      px(c, '#dfe6ee', 1, 3, 20, 1);
      px(c, OUTLINE, 0, 1, 4, 7);
      px(c, '#7a8794', 1, 2, 2, 5);
    },
  ],
  crate: [
    22,
    22,
    (c) => {
      px(c, OUTLINE, 0, 0, 22, 22);
      px(c, '#c8863a', 1, 1, 20, 20);
      px(c, '#8a5424', 1, 1, 20, 2);
      px(c, '#8a5424', 1, 19, 20, 2);
      px(c, '#8a5424', 1, 1, 2, 20);
      px(c, '#8a5424', 19, 1, 2, 20);
      for (let i = 3; i < 19; i++) px(c, '#8a5424', i, i, 2, 1);
      px(c, '#e8b070', 4, 4, 3, 1);
    },
  ],
  pie: [
    14,
    8,
    (c) => {
      blob(c, 7, 4, 6, 3, '#f4f0e0');
      px(c, '#e0a060', 1, 5, 12, 2);
      px(c, '#ff6fb5', 5, 2, 2, 1);
    },
  ],
  orb: [
    20,
    20,
    (c) => {
      blob(c, 10, 10, 8.5, 8.5, '#6a2cc8');
      blob(c, 10, 10, 6, 6, '#b15cff');
      blob(c, 9, 9, 3, 3, '#f0d8ff');
    },
  ],
  web: [
    16,
    12,
    (c) => {
      c.strokeStyle = '#f2f2f2';
      c.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(8, 6);
        c.lineTo(8 + Math.cos((i * Math.PI) / 4) * 7, 6 + Math.sin((i * Math.PI) / 4) * 5);
        c.moveTo(8, 6);
        c.lineTo(8 - Math.cos((i * Math.PI) / 4) * 7, 6 - Math.sin((i * Math.PI) / 4) * 5);
        c.stroke();
      }
      c.beginPath();
      c.ellipse(8, 6, 4, 3, 0, 0, Math.PI * 2);
      c.stroke();
    },
  ],
  batarang: [
    18,
    8,
    (c) => {
      c.beginPath();
      c.moveTo(0, 2);
      c.lineTo(6, 4);
      c.lineTo(9, 1);
      c.lineTo(12, 4);
      c.lineTo(18, 2);
      c.lineTo(14, 7);
      c.lineTo(9, 5);
      c.lineTo(4, 7);
      c.closePath();
      c.fillStyle = OUTLINE;
      c.fill();
      px(c, '#9aa7b4', 5, 4, 8, 1);
    },
  ],
  homing: [
    14,
    14,
    (c) => {
      blob(c, 7, 7, 5.5, 5.5, '#ff2d95');
      blob(c, 7, 7, 3, 3, '#ffd1ec');
    },
  ],
  wave: [
    12,
    24,
    (c) => {
      px(c, OUTLINE, 3, 0, 6, 24);
      px(c, '#8dff6a', 4, 1, 4, 22);
      px(c, '#e6ffd8', 5, 3, 2, 18);
    },
  ],
};

const sprites = new Map<string, HTMLCanvasElement>();

export const itemSprite = (key: string): HTMLCanvasElement | null => {
  const hit = sprites.get(key);
  if (hit) return hit;
  const p = PAINTERS[key];
  if (!p) return null;
  const s = createSurface(p[0], p[1]);
  if (s.ctx) {
    p[2](s.ctx);
    hardenAlpha(s);
  }
  sprites.set(key, s.canvas);
  return s.canvas;
};

const shadows = new Map<number, HTMLCanvasElement>();

/** Pre-rendered ground shadow ellipse of a given width bucket. */
export const shadowSprite = (w: number): HTMLCanvasElement => {
  const bucket = Math.max(6, Math.min(60, Math.round(w / 2) * 2));
  const hit = shadows.get(bucket);
  if (hit) return hit;
  const h = Math.max(3, Math.round(bucket * 0.28));
  const s = createSurface(bucket, h);
  if (s.ctx) {
    s.ctx.fillStyle = '#000000';
    s.ctx.beginPath();
    s.ctx.ellipse(bucket / 2, h / 2, bucket / 2, h / 2, 0, 0, Math.PI * 2);
    s.ctx.fill();
    hardenAlpha(s, 128);
  }
  shadows.set(bucket, s.canvas);
  return s.canvas;
};
