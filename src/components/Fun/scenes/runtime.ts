import type { SceneHandle, SceneOptions } from './types';

/**
 * Shared canvas runtime for the Fun scenes.
 * Owns the canvas, DPR sizing, the rAF loop, pausing (manual, tab hidden, offscreen),
 * reduced motion, pointer/keyboard input and the audio bus, so scene modules only
 * describe state, update and draw. Everything it creates is torn down in dispose().
 */

export interface AudioBus {
  ctx: AudioContext;
  /** Master gain node; connect voices here */
  out: GainNode;
}

export interface PointerState {
  x: number;
  y: number;
  down: boolean;
  /** Pointer is over the canvas */
  inside: boolean;
}

export interface SceneEnv {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  /** CSS pixel size of the canvas */
  w: number;
  h: number;
  dpr: number;
  reducedMotion: boolean;
  interactive: boolean;
  pointer: PointerState;
  /** Audio bus when unmuted (created on first call after a user gesture), else null */
  audio(): AudioBus | null;
  /** Under reduced motion, let the loop run for a moment after an interaction */
  wake(ms?: number): void;
}

export interface CanvasScene<S> {
  init(env: SceneEnv): S;
  /** Called after the canvas changes size (and once after init) */
  resize?(s: S, env: SceneEnv): void;
  /** Advance the simulation; dt is clamped to 50ms, t is scene seconds (frozen while paused) */
  update?(s: S, env: SceneEnv, dt: number, t: number): void;
  draw(s: S, env: SceneEnv, t: number): void;
  /** Seconds simulated before the still frame used for posters and reduced motion (default 2.5) */
  posterTime?: number;
  onPointerDown?(s: S, env: SceneEnv, x: number, y: number): void;
  onPointerMove?(s: S, env: SceneEnv, x: number, y: number): void;
  onPointerUp?(s: S, env: SceneEnv, x: number, y: number): void;
  onPointerLeave?(s: S, env: SceneEnv): void;
  /** Return true when the key was used; arrows, Escape and Tab never reach scenes */
  onKey?(s: S, env: SceneEnv, e: KeyboardEvent, down: boolean): boolean | void;
  /** CSS touch-action for the canvas; use 'none' only for drag-driven scenes */
  touchAction?: string;
  cursor?: string;
  dispose?(s: S): void;
}

const RESERVED_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Escape',
  'Tab',
]);
const STEP = 1 / 30;
const MAX_DPR = 2;

export function createCanvasScene<S>(
  container: HTMLElement,
  opts: SceneOptions,
  def: CanvasScene<S>
): SceneHandle {
  const interactive = opts.interactive ?? true;
  const reducedMotion = opts.reducedMotion;
  let muted = opts.muted;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    touchAction: interactive ? def.touchAction ?? 'manipulation' : 'auto',
    cursor: interactive ? def.cursor ?? 'default' : 'inherit',
    pointerEvents: interactive ? 'auto' : 'none',
  });
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is unavailable');

  let bus: AudioBus | null = null;
  const pointer: PointerState = { x: 0, y: 0, down: false, inside: false };
  let awakeUntil = 0;

  const env: SceneEnv = {
    ctx,
    canvas,
    container,
    w: 0,
    h: 0,
    dpr: 1,
    reducedMotion,
    interactive,
    pointer,
    audio() {
      if (muted || !interactive) return null;
      if (!bus) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        const actx = new Ctor();
        const out = actx.createGain();
        out.gain.value = 0.55;
        out.connect(actx.destination);
        bus = { ctx: actx, out };
      }
      if (bus.ctx.state === 'suspended') void bus.ctx.resume();
      return bus;
    },
    wake(ms = 1600) {
      if (!reducedMotion) return;
      awakeUntil = Math.max(awakeUntil, performance.now() + ms);
      ensureLoop();
    },
  };

  const measure = () => {
    const rect = container.getBoundingClientRect();
    env.w = Math.max(0, Math.round(rect.width));
    env.h = Math.max(0, Math.round(rect.height));
    env.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.max(1, Math.round(env.w * env.dpr));
    canvas.height = Math.max(1, Math.round(env.h * env.dpr));
  };

  measure();
  const state = def.init(env);
  def.resize?.(state, env);

  let t = 0;
  let raf = 0;
  let last = 0;
  let disposed = false;
  let userPaused = false;
  let onscreen = true;

  const render = () => {
    if (env.w < 2 || env.h < 2) return;
    ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    def.draw(state, env, t);
  };

  const canRun = () =>
    !disposed &&
    !userPaused &&
    !document.hidden &&
    onscreen &&
    (!reducedMotion || performance.now() < awakeUntil);

  // True while a frame runs, so env.wake() from inside update() cannot queue a second loop
  let ticking = false;

  const tick = (now: number) => {
    raf = 0;
    if (!canRun()) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    t += dt;
    ticking = true;
    try {
      def.update?.(state, env, dt, t);
      render();
    } finally {
      ticking = false;
    }
    if (!raf) raf = requestAnimationFrame(tick);
  };

  function ensureLoop() {
    if (raf || ticking || !canRun()) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }

  const stopLoop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  // Warm the simulation so still frames (posters, reduced motion) look settled
  const posterTime = def.posterTime ?? 2.5;
  if (reducedMotion || !interactive) {
    for (let i = 0; i < Math.ceil(posterTime / STEP); i++) {
      t += STEP;
      def.update?.(state, env, STEP, t);
    }
  }
  render();

  const ro = new ResizeObserver(() => {
    const pw = env.w;
    const ph = env.h;
    measure();
    if (pw === env.w && ph === env.h && canvas.width > 1) {
      render();
      return;
    }
    def.resize?.(state, env);
    render();
  });
  ro.observe(container);

  const io = new IntersectionObserver((entries) => {
    onscreen = entries[entries.length - 1]?.isIntersecting ?? true;
    if (onscreen) ensureLoop();
    else stopLoop();
  });
  io.observe(container);

  const onVisibility = () => {
    if (document.hidden) {
      stopLoop();
      if (bus && bus.ctx.state === 'running') void bus.ctx.suspend();
    } else {
      if (bus && !muted) void bus.ctx.resume();
      ensureLoop();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const listeners = new AbortController();
  if (interactive) {
    const { signal } = listeners;
    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        local(e);
        pointer.down = true;
        pointer.inside = true;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* capture is best effort */
        }
        env.wake();
        def.onPointerDown?.(state, env, pointer.x, pointer.y);
        if (!raf) render();
      },
      { signal }
    );
    canvas.addEventListener(
      'pointermove',
      (e) => {
        local(e);
        pointer.inside = true;
        if (pointer.down) env.wake();
        def.onPointerMove?.(state, env, pointer.x, pointer.y);
      },
      { signal }
    );
    const up = (e: PointerEvent) => {
      local(e);
      if (!pointer.down) return;
      pointer.down = false;
      env.wake();
      def.onPointerUp?.(state, env, pointer.x, pointer.y);
    };
    canvas.addEventListener('pointerup', up, { signal });
    canvas.addEventListener('pointercancel', up, { signal });
    canvas.addEventListener(
      'pointerleave',
      () => {
        pointer.inside = false;
        if (def.onPointerLeave) {
          env.wake(400);
          def.onPointerLeave(state, env);
          if (!raf) render();
        }
      },
      { signal }
    );

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (!def.onKey || e.defaultPrevented || RESERVED_KEYS.has(e.key)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((e.key === ' ' || e.key === 'Enter') && target?.closest('button, a')) return;
      if (def.onKey(state, env, e, down)) {
        e.preventDefault();
        env.wake();
        if (!raf) render();
      }
    };
    document.addEventListener('keydown', onKey(true), { signal });
    document.addEventListener('keyup', onKey(false), { signal });
  }

  ensureLoop();

  return {
    pause() {
      userPaused = true;
      stopLoop();
    },
    resume() {
      userPaused = false;
      ensureLoop();
    },
    setMuted(next: boolean) {
      muted = next;
      if (!bus) return;
      if (next) void bus.ctx.suspend();
      else void bus.ctx.resume();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      ro.disconnect();
      io.disconnect();
      listeners.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      def.dispose?.(state);
      if (bus) {
        void bus.ctx.close();
        bus = null;
      }
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
    },
  };
}

/* ---------- small shared helpers for scene modules ---------- */

export const TAU = Math.PI * 2;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeInOutCubic = (k: number) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
export const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
export const easeOutBack = (k: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
/** Frame-rate independent smoothing toward a target */
export const damp = (current: number, target: number, rate: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-rate * dt));
export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Short enveloped oscillator voice on the bus */
export function tone(
  bus: AudioBus,
  freq: number,
  {
    type = 'sine',
    attack = 0.005,
    decay = 0.4,
    gain = 0.25,
    glideTo,
    delay = 0,
  }: {
    type?: OscillatorType;
    attack?: number;
    decay?: number;
    gain?: number;
    glideTo?: number;
    delay?: number;
  } = {}
) {
  const { ctx, out } = bus;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + attack + decay);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + attack + decay + 0.05);
}

/** Burst of filtered noise, e.g. for whooshes, shutters and impacts */
export function noise(
  bus: AudioBus,
  {
    duration = 0.2,
    gain = 0.2,
    freq = 1200,
    q = 0.8,
    type = 'bandpass',
  }: { duration?: number; gain?: number; freq?: number; q?: number; type?: BiquadFilterType } = {}
) {
  const { ctx, out } = bus;
  const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(out);
  src.start();
}
