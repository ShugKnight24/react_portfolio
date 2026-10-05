import { TAU } from './runtime';
import type { AudioBus } from './runtime';

/**
 * Small shared toolkit for the hero scenes (Iron Man, Chainsaw Man, the League champions):
 * seeded randomness, cached glow sprites, a fixed-size particle pool that never allocates
 * after init, a sustained audio voice for engines and beams, and a camera shake helper.
 */

export function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Radial gradient baked once into a square canvas, drawn later with drawImage */
export function glowSprite(size: number, stops: [number, string][]) {
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

/** Additive glow centred on x, y with radius r */
export function glow(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, r: number, alpha = 1) {
  if (alpha <= 0.003 || r <= 0.5) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
}

/** Offscreen canvas sized in CSS pixels at the given pixel ratio */
export function layer(prev: HTMLCanvasElement | null, w: number, h: number, dpr: number) {
  const cv = prev ?? document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const c = cv.getContext('2d');
  if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { cv, c };
}

export function freeCanvas(...list: (HTMLCanvasElement | null | undefined)[]) {
  for (const c of list) if (c) c.width = c.height = 0;
}

/* ---------- particle pool ---------- */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  /** Scene defined: which look to draw */
  kind: number;
  drag: number;
  grav: number;
  rot: number;
  spin: number;
}

export interface Pool {
  items: Particle[];
  next: number;
}

export function makePool(n: number): Pool {
  const items: Particle[] = [];
  for (let i = 0; i < n; i++)
    items.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, kind: 0, drag: 0, grav: 0, rot: 0, spin: 0 });
  return { items, next: 0 };
}

export function emit(
  pool: Pool,
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  size: number,
  kind: number,
  drag = 0,
  grav = 0
) {
  const p = pool.items[pool.next];
  pool.next = (pool.next + 1) % pool.items.length;
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.life = life;
  p.max = life;
  p.size = size;
  p.kind = kind;
  p.drag = drag;
  p.grav = grav;
  p.rot = Math.random() * TAU;
  p.spin = (Math.random() - 0.5) * 8;
  return p;
}

/** Spray n particles from a point in a cone around dir */
export function burst(
  pool: Pool,
  n: number,
  x: number,
  y: number,
  dir: number,
  spread: number,
  speed: number,
  life: number,
  size: number,
  kind: number,
  drag = 0,
  grav = 0
) {
  for (let i = 0; i < n; i++) {
    const a = dir + (Math.random() * 2 - 1) * spread;
    const v = speed * (0.3 + Math.random() * 0.7);
    emit(pool, x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.5 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.6), kind, drag, grav);
  }
}

export function stepPool(pool: Pool, dt: number) {
  for (const p of pool.items) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.drag) {
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
    }
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
  }
}

/* ---------- camera shake ---------- */

/** Smooth pseudo random offset for a shake of amplitude amp at time t */
export function shakeX(amp: number, t: number) {
  return amp * (Math.sin(t * 57) * 0.6 + Math.sin(t * 31 + 1.7) * 0.4);
}
export function shakeY(amp: number, t: number) {
  return amp * (Math.sin(t * 49 + 0.6) * 0.6 + Math.sin(t * 27 + 2.3) * 0.4);
}

/* ---------- sustained voice (engines, beams, hums) ---------- */

export interface Hum {
  bus: AudioBus;
  osc: OscillatorNode;
  sub: OscillatorNode;
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  nGain: GainNode;
  gain: GainNode;
  stopped: boolean;
}

export function startHum(
  bus: AudioBus,
  { type = 'sawtooth', freq = 80, cutoff = 900, noiseAmt = 0.3 }: { type?: OscillatorType; freq?: number; cutoff?: number; noiseAmt?: number } = {}
): Hum {
  const { ctx, out } = bus;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.connect(out);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  filter.Q.value = 4;
  filter.connect(gain);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(filter);
  const sub = ctx.createOscillator();
  sub.type = 'square';
  sub.frequency.value = freq * 0.5;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.3;
  sub.connect(subGain).connect(filter);
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const nGain = ctx.createGain();
  nGain.gain.value = noiseAmt;
  src.connect(nGain).connect(filter);
  osc.start(now);
  sub.start(now);
  src.start(now);
  return { bus, osc, sub, src, filter, nGain, gain, stopped: false };
}

export function setHum(h: Hum, freq: number, level: number, cutoff: number) {
  if (h.stopped) return;
  const now = h.bus.ctx.currentTime;
  h.osc.frequency.setTargetAtTime(freq, now, 0.05);
  h.sub.frequency.setTargetAtTime(freq * 0.5, now, 0.05);
  h.gain.gain.setTargetAtTime(Math.max(0.0001, level), now, 0.05);
  h.filter.frequency.setTargetAtTime(cutoff, now, 0.05);
}

export function stopHum(h: Hum | null) {
  if (!h || h.stopped) return;
  h.stopped = true;
  try {
    const now = h.bus.ctx.currentTime;
    h.gain.gain.cancelScheduledValues(now);
    h.gain.gain.setTargetAtTime(0.0001, now, 0.08);
    for (const n of [h.osc, h.sub, h.src]) n.stop(now + 0.6);
  } catch {
    /* context already closed */
  }
}
