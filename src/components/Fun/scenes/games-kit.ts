import type { AudioBus } from './runtime';

/**
 * Shared helpers for the Games lane scenes (Master Chief, Gears of War, Link):
 * a stage transform that keeps the actors framed at any aspect, a shaded part painter
 * (rim, base and core shadow from one path, no shadowBlur), a pooled particle system,
 * cached background layers and a held audio voice for revs and hums.
 */

/* ---------- stage ---------- */

/** Stage units: x from the centre, y up from the ground line (negative is up). */
export interface Stage {
  k: number;
  ox: number;
  oy: number;
  /** Visible stage bounds */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const makeStage = (): Stage => ({ k: 1, ox: 0, oy: 0, left: 0, right: 0, top: 0, bottom: 0 });

/** Fit a 960 x 900 action area; wider screens reveal more scenery, taller ones more sky and ground */
export function fitStage(st: Stage, w: number, h: number) {
  st.k = Math.max(0.05, Math.min(h / 900, w / 960));
  st.ox = w / 2;
  st.oy = Math.min(h, h / 2 + 470 * st.k);
  st.left = -st.ox / st.k;
  st.right = st.ox / st.k;
  st.top = -st.oy / st.k;
  st.bottom = (h - st.oy) / st.k;
}

export const toStageX = (st: Stage, x: number) => (x - st.ox) / st.k;
export const toStageY = (st: Stage, y: number) => (y - st.oy) / st.k;

/** Apply the stage transform on top of the current (DPR) transform */
export function enterStage(ctx: CanvasRenderingContext2D, st: Stage) {
  ctx.translate(st.ox, st.oy);
  ctx.scale(st.k, st.k);
}

/* ---------- cached layers ---------- */

/** Margin in CSS px around cached layers so camera shake never shows an edge */
export const LAYER_PAD = 18;

export function makeLayer(): HTMLCanvasElement {
  return document.createElement('canvas');
}

/**
 * Size a cached layer for the current canvas and hand back a context already
 * set to the stage transform. The layer is drawn back with drawLayer().
 */
export function prepLayer(layer: HTMLCanvasElement, w: number, h: number, dpr: number, st: Stage) {
  layer.width = Math.max(1, Math.round((w + LAYER_PAD * 2) * dpr));
  layer.height = Math.max(1, Math.round((h + LAYER_PAD * 2) * dpr));
  const c = layer.getContext('2d');
  if (!c) return null;
  c.setTransform(dpr, 0, 0, dpr, LAYER_PAD * dpr, LAYER_PAD * dpr);
  c.clearRect(-LAYER_PAD, -LAYER_PAD, w + LAYER_PAD * 2, h + LAYER_PAD * 2);
  return c;
}

export function drawLayer(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement, w: number, h: number) {
  if (layer.width < 2) return;
  ctx.drawImage(layer, -LAYER_PAD, -LAYER_PAD, w + LAYER_PAD * 2, h + LAYER_PAD * 2);
}

export function freeLayer(layer: HTMLCanvasElement) {
  layer.width = 0;
  layer.height = 0;
}

/* ---------- painter ---------- */

/**
 * Paints a closed shape in three values from a single trace: a lit rim on the side
 * facing the key light, a mid base, and a core shadow on the far side. With `glow`
 * set it instead paints an additive energy overlay (shield shimmer, flashes).
 */
export class Painter {
  ctx: CanvasRenderingContext2D;
  /** Direction toward the key light, in the local frame */
  lx = 0.8;
  ly = -0.6;
  rimW = 3;
  shadeW = 8;
  glow = false;
  glowFill = 'rgba(255,200,80,0.2)';
  glowStroke = 'rgba(255,230,140,0.8)';
  /** Ink line around every part; empty for none */
  outline = '';
  outlineW = 1.5;
  /**
   * Optional second rim from a back light: a thin sliver in this colour on the edge facing
   * (bx, by), shown where the core shadow sits. Empty for none.
   */
  back = '';
  bx = -0.9;
  by = -0.35;
  backW = 2.4;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  part(trace: () => void, rim: string, base: string, dark: string, rimW = this.rimW, shadeW = this.shadeW) {
    const ctx = this.ctx;
    if (this.glow) {
      ctx.beginPath();
      trace();
      ctx.fillStyle = this.glowFill;
      ctx.fill();
      ctx.strokeStyle = this.glowStroke;
      ctx.stroke();
      return;
    }
    ctx.save();
    ctx.beginPath();
    trace();
    if (this.back) {
      // back-light sliver first, then the core shadow over all but that edge
      ctx.fillStyle = this.back;
      ctx.fill();
      ctx.clip();
      ctx.save();
      ctx.translate(-this.bx * this.backW, -this.by * this.backW);
      ctx.beginPath();
      trace();
      ctx.restore();
      ctx.fillStyle = dark;
      ctx.fill();
    } else {
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.clip();
    }
    // everything except the far-side sliver takes the rim colour...
    ctx.save();
    ctx.translate(this.lx * shadeW, this.ly * shadeW);
    ctx.beginPath();
    trace();
    ctx.restore();
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.clip();
    // ...and everything except the light-side sliver takes the base
    ctx.translate(-this.lx * rimW, -this.ly * rimW);
    ctx.beginPath();
    trace();
    ctx.fillStyle = base;
    ctx.fill();
    ctx.restore();
    if (this.outline) {
      ctx.beginPath();
      trace();
      ctx.strokeStyle = this.outline;
      ctx.lineWidth = this.outlineW;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  /** Flat fill, skipped in the glow pass unless asked */
  flat(trace: () => void, fill: string | CanvasGradient, inGlow = false) {
    const ctx = this.ctx;
    if (this.glow && !inGlow) return;
    ctx.beginPath();
    trace();
    ctx.fillStyle = this.glow ? this.glowFill : fill;
    ctx.fill();
  }
}

/** Tapered capsule from (x1,y1) radius r1 to (x2,y2) radius r2, added to the current path */
export function capsule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r1: number,
  r2: number
) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.moveTo(x1 + Math.cos(a + Math.PI / 2) * r1, y1 + Math.sin(a + Math.PI / 2) * r1);
  ctx.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}

/** Closed polygon from flat [x0, y0, x1, y1, ...] with rounded corners, added to the current path; dy shifts it */
export function rpoly(ctx: CanvasRenderingContext2D, pts: readonly number[], r: number, dy = 0) {
  const n = pts.length / 2;
  ctx.moveTo((pts[0] + pts[2 * n - 2]) / 2, (pts[1] + pts[2 * n - 1]) / 2 + dy);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ctx.arcTo(pts[i * 2], pts[i * 2 + 1] + dy, (pts[i * 2] + pts[j * 2]) / 2, (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2 + dy, r);
  }
  ctx.closePath();
}

/** Additive-friendly radial glow; set the composite mode before calling */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) {
  if (a <= 0.003 || r <= 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.35, `rgba(${rgb},${a * 0.38})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, a: number, rgb = '0,0,0') {
  const v = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.34, w / 2, h * 0.52, Math.max(w, h) * 0.78);
  v.addColorStop(0, `rgba(${rgb},0)`);
  v.addColorStop(1, `rgba(${rgb},${a})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** Deterministic hash noise in [0,1), for layered backgrounds that must not reshuffle on resize */
export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export const easeOutQuad = (k: number) => 1 - (1 - k) * (1 - k);
export const easeInQuad = (k: number) => k * k;
export const smooth = (k: number) => k * k * (3 - 2 * k);

/* ---------- particles ---------- */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  /** Gravity in stage units per second squared */
  g: number;
  /** Velocity damping per second */
  drag: number;
  rot: number;
  vr: number;
  kind: number;
  /** Bounce off the floor callback when > 0 (restitution) */
  bounce: number;
}

export class Pool {
  readonly items: Particle[];
  private next = 0;

  constructor(n: number) {
    this.items = Array.from({ length: n }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      max: 1,
      size: 1,
      g: 0,
      drag: 0,
      rot: 0,
      vr: 0,
      kind: 0,
      bounce: 0,
    }));
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, kind = 0, g = 0, drag = 0) {
    const p = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.kind = kind;
    p.g = g;
    p.drag = drag;
    p.rot = 0;
    p.vr = 0;
    p.bounce = 0;
    return p;
  }

  step(dt: number, floor?: (x: number) => number) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += p.g * dt;
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (floor && p.bounce > 0) {
        const fy = floor(p.x);
        if (p.y > fy && p.vy > 0) {
          p.y = fy;
          p.vy *= -p.bounce;
          p.vx *= 0.6;
          p.vr *= 0.5;
          if (Math.abs(p.vy) < 30) p.bounce = 0;
        }
      }
    }
  }

  clear() {
    for (const p of this.items) p.life = 0;
  }
}

/* ---------- held voice ---------- */

export interface Hum {
  bus: AudioBus;
  a: OscillatorNode;
  b: OscillatorNode;
  src: AudioBufferSourceNode;
  nGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

/** A held, shapeable voice: two detuned oscillators and looped noise through a filter */
export function startHum(
  bus: AudioBus,
  {
    type = 'sawtooth',
    freq = 110,
    ratio = 1.5,
    noise = 0.3,
    filter = 800,
    q = 1,
    gain = 0.1,
    attack = 0.08,
  }: {
    type?: OscillatorType;
    freq?: number;
    ratio?: number;
    noise?: number;
    filter?: number;
    q?: number;
    gain?: number;
    attack?: number;
  } = {}
): Hum {
  const { ctx, out } = bus;
  const now = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + attack);
  g.connect(out);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filter;
  f.Q.value = q;
  f.connect(g);
  const a = ctx.createOscillator();
  a.type = type;
  a.frequency.value = freq;
  a.connect(f);
  const b = ctx.createOscillator();
  b.type = type;
  b.frequency.value = freq * ratio;
  const bg = ctx.createGain();
  bg.gain.value = 0.4;
  b.connect(bg).connect(f);
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const nGain = ctx.createGain();
  nGain.gain.value = noise;
  src.connect(nGain).connect(f);
  a.start(now);
  b.start(now);
  src.start(now);
  return { bus, a, b, src, nGain, filter: f, gain: g };
}

export function shapeHum(h: Hum, freq: number, filter: number, gain: number, ratio = 1.5) {
  const now = h.bus.ctx.currentTime;
  h.a.frequency.setTargetAtTime(freq, now, 0.04);
  h.b.frequency.setTargetAtTime(freq * ratio, now, 0.04);
  h.filter.frequency.setTargetAtTime(filter, now, 0.05);
  h.gain.gain.setTargetAtTime(Math.max(0.0001, gain), now, 0.05);
}

export function stopHum(h: Hum, release = 0.12) {
  const now = h.bus.ctx.currentTime;
  h.gain.gain.cancelScheduledValues(now);
  h.gain.gain.setTargetAtTime(0.0001, now, release);
  for (const n of [h.a, h.b, h.src]) {
    try {
      n.stop(now + release * 6);
    } catch {
      /* already stopped */
    }
  }
}
