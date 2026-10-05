import { createCanvasScene, clamp, damp, lerp, noise, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { drawGlyph, GLYPH_COUNT, greenGrade, limb, makeGlyphAtlas, seeded, TINT_BRIGHT, TINT_HEAD, TINT_MID } from './matrix-kit';
import type { GlyphAtlas } from './matrix-kit';

/**
 * There Is No Spoon: a close still life in the Oracle's waiting room. A child's hand holds a
 * spoon up to the light; its bowl carries a small upside down reflection of the room, of Neo
 * leaning in, and of the code underneath it all. Dragging bends the spoon along a smooth
 * curvature profile (the glints slide along the metal as it bends, and loose glyphs peel off
 * the bend). Letting go springs it back with a damped wobble, a bright ping, a ripple through
 * the reflection and a ring of code that washes out across the room.
 */

interface Peel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: number;
}

interface Bokeh {
  x: number;
  y: number;
  r: number;
  a: number;
  warm: number;
  phase: number;
}

interface State {
  atlas: GlyphAtlas;
  bend: number;
  vel: number;
  target: number;
  held: boolean;
  keyDir: number;
  downX: number;
  downBend: number;
  demo: boolean;
  demoT: number;
  idle: number;
  touched: boolean;
  lastTick: number;
  // ripple after release
  ripple: number;
  rippleK: number;
  ring: number;
  ringK: number;
  code: number;
  shake: number;
  peels: Peel[];
  peelNext: number;
  peelAcc: number;
  bokeh: Bokeh[];
  refl: Uint8Array;
  // spoon geometry, world pixels
  px: Float32Array;
  py: Float32Array;
  pa: Float32Array;
  bx: number;
  by: number;
  ba: number;
  // layout
  s: number;
  gx: number;
  gy: number;
  bg: HTMLCanvasElement | null;
  vignette: CanvasGradient | null;
}

const N = 28;
const HANDLE = 110;
const BOWL_RX = 30;
const BOWL_RY = 40;
const MAX_PEELS = 90;
const LIGHT = -2.3; // light comes from the upper left

function buildSpoon(s: State, t: number) {
  const u = s.s;
  const seg = (HANDLE * u) / (N - 1);
  let a = 0;
  let x = s.gx;
  let y = s.gy - 30 * u;
  const b = s.bend;
  for (let i = 0; i < N; i++) {
    const q = i / (N - 1);
    s.px[i] = x;
    s.py[i] = y;
    s.pa[i] = a;
    // curvature lives in the upper middle of the handle, like the spoon in the film
    const w = smooth(0.18, 0.5, q) * (1 - smooth(0.72, 0.97, q));
    a += b * 0.14 * w + Math.sin(t * 0.7) * 0.0015;
    x += Math.sin(a) * seg;
    y -= Math.cos(a) * seg;
  }
  s.ba = a;
  s.bx = x + Math.sin(a) * BOWL_RY * 0.92 * u;
  s.by = y - Math.cos(a) * BOWL_RY * 0.92 * u;
}

const smooth = (e0: number, e1: number, x: number) => {
  const k = clamp((x - e0) / (e1 - e0), 0, 1);
  return k * k * (3 - 2 * k);
};

/** Half width of the handle at q along it (0 at the grip, 1 at the bowl) */
const handleW = (q: number) => lerp(8, 4, smooth(0.1, 0.95, q)) + (q > 0.9 ? (q - 0.9) * 50 : 0);

function peel(s: State, x: number, y: number) {
  const p = s.peels[s.peelNext];
  s.peelNext = (s.peelNext + 1) % MAX_PEELS;
  p.x = x + rand(-6, 6) * s.s;
  p.y = y + rand(-6, 6) * s.s;
  p.vx = rand(-30, 30) * s.s;
  p.vy = rand(-70, -25) * s.s;
  p.max = rand(0.8, 1.6);
  p.life = p.max;
  p.g = (Math.random() * GLYPH_COUNT) | 0;
}

function release(s: State, env: SceneEnv) {
  const k = Math.abs(s.bend);
  if (k < 0.12) return;
  s.ripple = 0;
  s.rippleK = k;
  s.ring = 0;
  s.ringK = k;
  s.code = Math.max(s.code, 0.4 + k * 0.6);
  if (!env.reducedMotion) s.shake = 0.3 * k;
  env.wake(2600);
  const bus = s.touched ? env.audio() : null;
  if (bus) {
    // a struck spoon: inharmonic partials with a long tail
    const f = 1180 + k * 160;
    tone(bus, f, { type: 'sine', attack: 0.002, decay: 1.6, gain: 0.08 * k + 0.02 });
    tone(bus, f * 2.76, { type: 'sine', attack: 0.002, decay: 0.9, gain: 0.04 * k + 0.01 });
    tone(bus, f * 5.4, { type: 'sine', attack: 0.001, decay: 0.4, gain: 0.02 });
    tone(bus, 180, { type: 'sine', attack: 0.05, decay: 1.2, gain: 0.05, glideTo: 90 });
    noise(bus, { duration: 0.5, gain: 0.04, freq: 5000, q: 1.2 });
  }
}

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'grab',
    touchAction: 'none',
    posterTime: 1.7,
    init: () => {
      const r = seeded(11);
      return {
        atlas: makeGlyphAtlas(40),
        bend: 0,
        vel: 0,
        target: 0,
        held: false,
        keyDir: 0,
        downX: 0,
        downBend: 0,
        demo: true,
        demoT: 0,
        idle: 0,
        touched: false,
        lastTick: 0,
        ripple: 9,
        rippleK: 0,
        ring: 9,
        ringK: 0,
        code: 0,
        shake: 0,
        peels: Array.from({ length: MAX_PEELS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, g: 0 })),
        peelNext: 0,
        peelAcc: 0,
        bokeh: Array.from({ length: 18 }, () => ({
          x: r(),
          y: r() * 0.8,
          r: 0.03 + r() * 0.09,
          a: 0.05 + r() * 0.12,
          warm: r() < 0.45 ? 1 : 0,
          phase: r() * TAU,
        })),
        refl: Uint8Array.from({ length: 40 }, () => (Math.random() * GLYPH_COUNT) | 0),
        px: new Float32Array(N),
        py: new Float32Array(N),
        pa: new Float32Array(N),
        bx: 0,
        by: 0,
        ba: 0,
        s: 1,
        gx: 0,
        gy: 0,
        bg: null,
        vignette: null,
      };
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.s = Math.min(w / 540, h / 330);
      const u = s.s;
      s.gy = h * 0.8;
      s.gx = w * 0.54;
      // the room, soft and out of focus, baked once
      const bg = s.bg ?? document.createElement('canvas');
      bg.width = Math.max(1, Math.round(w * env.dpr));
      bg.height = Math.max(1, Math.round(h * env.dpr));
      const g = bg.getContext('2d');
      if (g) {
        g.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
        const base = g.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, '#0c1712');
        base.addColorStop(0.6, '#15241b');
        base.addColorStop(1, '#070d0a');
        g.fillStyle = base;
        g.fillRect(0, 0, w, h);
        // tall window glow, upper right
        const win = g.createRadialGradient(w * 0.8, h * 0.28, 0, w * 0.8, h * 0.28, h * 0.6);
        win.addColorStop(0, 'rgba(215,255,220,0.42)');
        win.addColorStop(0.35, 'rgba(120,210,150,0.16)');
        win.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = win;
        g.fillRect(0, 0, w, h);
        // window mullions, blurred to soft bars
        g.fillStyle = 'rgba(10,20,14,0.35)';
        g.fillRect(w * 0.79, 0, 10 * u, h * 0.62);
        g.fillRect(w * 0.64, h * 0.3, w * 0.36, 8 * u);
        // warm lamp, far left
        const lamp = g.createRadialGradient(w * 0.13, h * 0.42, 0, w * 0.13, h * 0.42, h * 0.45);
        lamp.addColorStop(0, 'rgba(255,215,150,0.3)');
        lamp.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = lamp;
        g.fillRect(0, 0, w, h);
        // the boy himself, out of focus behind his spoon: shaved head and robed shoulders
        const hx = w * 0.3;
        const hy = h * 0.5;
        const body = g.createRadialGradient(hx, h * 1.05, 0, hx, h * 1.05, h * 0.5);
        body.addColorStop(0, 'rgba(120,110,85,0.55)');
        body.addColorStop(0.75, 'rgba(90,85,65,0.4)');
        body.addColorStop(1, 'rgba(90,85,65,0)');
        g.fillStyle = body;
        g.fillRect(0, 0, w, h);
        const head = g.createRadialGradient(hx + 14 * u, hy - 20 * u, 0, hx, hy, 72 * u);
        head.addColorStop(0, 'rgba(210,175,145,0.5)');
        head.addColorStop(0.6, 'rgba(150,110,85,0.42)');
        head.addColorStop(0.85, 'rgba(90,65,50,0.3)');
        head.addColorStop(1, 'rgba(90,65,50,0)');
        g.fillStyle = head;
        g.beginPath();
        g.ellipse(hx, hy, 72 * u, 84 * u, 0, 0, TAU);
        g.fill();
        // his rim of window light
        const rim = g.createRadialGradient(hx + 40 * u, hy - 30 * u, 0, hx + 40 * u, hy - 30 * u, 60 * u);
        rim.addColorStop(0, 'rgba(210,255,220,0.18)');
        rim.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rim;
        g.fillRect(0, 0, w, h);
        for (const b of s.bokeh) {
          const r = b.r * h;
          const x = b.x * w;
          const y = b.y * h;
          const gg = g.createRadialGradient(x, y, r * 0.2, x, y, r);
          const c = b.warm ? '255,210,150' : '170,255,200';
          gg.addColorStop(0, `rgba(${c},${b.a})`);
          gg.addColorStop(0.8, `rgba(${c},${b.a * 0.7})`);
          gg.addColorStop(1, `rgba(${c},0)`);
          g.fillStyle = gg;
          g.beginPath();
          g.arc(x, y, r, 0, TAU);
          g.fill();
        }
      }
      s.bg = bg;
      const v = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.7)');
      s.vignette = v;
      buildSpoon(s, 0);
    },
    update: (s, env, dt, t) => {
      const u = s.s;
      // the idle demo bends and lets go every few seconds
      if (s.demo) {
        s.demoT += dt;
        const c = s.demoT % 5.5;
        const wasHeld = s.held;
        s.held = c < 1.9;
        s.target = s.held ? 0.85 * smooth(0, 1.6, c) : 0;
        if (wasHeld && !s.held) release(s, env);
      } else if (!s.held) {
        s.idle += dt;
        if (s.idle > 8) {
          s.demo = true;
          s.demoT = 2;
        }
      }
      if (s.keyDir !== 0) s.target = clamp(s.target + s.keyDir * dt * 1.4, -1, 1);

      if (s.held) {
        // the hand wins: follow the target, a little heavy
        const prev = s.bend;
        s.bend = damp(s.bend, s.target, 9, dt);
        s.vel = (s.bend - prev) / Math.max(dt, 1e-3);
        // creaks as the metal gives
        if (Math.abs(s.bend - s.lastTick) > 0.12) {
          s.lastTick = s.bend;
          const bus = s.touched ? env.audio() : null;
          if (bus) tone(bus, 300 + Math.abs(s.bend) * 500, { type: 'triangle', attack: 0.002, decay: 0.05, gain: 0.025 });
        }
      } else {
        // spring back with a damped wobble
        const acc = -150 * s.bend - 5.5 * s.vel;
        s.vel += acc * dt;
        s.bend += s.vel * dt;
        s.lastTick = 0;
      }
      buildSpoon(s, t);

      // glyphs peel off the bend while it is under strain
      const strain = Math.abs(s.bend);
      if (strain > 0.35) {
        s.peelAcc += dt * (strain - 0.3) * 16;
        const i = Math.round(N * (0.4 + Math.random() * 0.3));
        while (s.peelAcc > 1) {
          s.peelAcc -= 1;
          peel(s, s.px[i], s.py[i]);
        }
      }
      for (const p of s.peels) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vx *= 1 - dt * 0.8;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      s.ripple += dt;
      s.ring += dt;
      s.code = damp(s.code, 0, 1.3, dt);
      s.shake = Math.max(0, s.shake - dt * 2);
      if (Math.random() < dt * 8) s.refl[(Math.random() * s.refl.length) | 0] = (Math.random() * GLYPH_COUNT) | 0;
      void u;
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const u = s.s;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#070d0a';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      const amp = s.shake * 5 * u;
      if (amp > 0.05) ctx.translate(Math.sin(t * 80) * amp, Math.cos(t * 67) * amp);
      // the room sways very slightly with the bend: it is not the spoon that bends
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-s.bend * 0.012);
      ctx.translate(-w / 2, -h / 2);
      if (s.bg) ctx.drawImage(s.bg, -8, -8, w + 16, h + 16);
      ctx.restore();

      drawRing(ctx, s, w, h);
      drawArm(ctx, s);
      drawSpoon(ctx, s, t);
      drawHand(ctx, s);

      // peeled glyphs
      ctx.globalCompositeOperation = 'lighter';
      for (const p of s.peels) {
        if (p.life <= 0) continue;
        ctx.globalAlpha = (p.life / p.max) * 0.9;
        drawGlyph(ctx, s.atlas, p.g, p.life / p.max > 0.7 ? TINT_HEAD : TINT_BRIGHT, p.x, p.y, 13 * u);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      greenGrade(ctx, w, h, 0.32);
      if (s.vignette) {
        ctx.fillStyle = s.vignette;
        ctx.fillRect(0, 0, w, h);
      }
    },
    onPointerDown: (s, env, x) => {
      s.demo = false;
      s.touched = true;
      s.idle = 0;
      s.held = true;
      s.downX = x;
      s.downBend = s.bend;
      s.target = s.bend;
      s.vel = 0;
      env.canvas.style.cursor = 'grabbing';
      const bus = env.audio();
      if (bus) tone(bus, 90, { type: 'sine', attack: 0.04, decay: 0.5, gain: 0.05 });
    },
    onPointerMove: (s, env, x) => {
      if (!s.held || s.demo) return;
      s.target = clamp(s.downBend + (x - s.downX) / (170 * s.s), -1, 1);
      env.wake(2600);
    },
    onPointerUp: (s, env) => {
      if (s.demo) return;
      s.held = false;
      s.idle = 0;
      env.canvas.style.cursor = 'grab';
      release(s, env);
    },
    onKey: (s, env, e, down) => {
      const key = e.key.toLowerCase();
      let dir = 0;
      if (key === 'a') dir = -1;
      else if (key === 'd' || key === ' ' || key === 'enter') dir = 1;
      else return false;
      if (e.repeat) return true;
      if (down) {
        s.demo = false;
        s.touched = true;
        s.idle = 0;
        if (!s.held) {
          s.held = true;
          s.target = s.bend;
          s.vel = 0;
        }
        s.keyDir = dir;
      } else if (s.keyDir === dir) {
        s.keyDir = 0;
        s.held = false;
        release(s, env);
      }
      env.wake(3000);
      return true;
    },
    dispose: (s) => {
      s.atlas.canvas.width = 0;
      if (s.bg) s.bg.width = 0;
    },
  });

/** A ring of code washing out across the room after a release */
function drawRing(ctx: CanvasRenderingContext2D, s: State, w: number, h: number) {
  if (s.ring > 2.2) return;
  const u = s.s;
  const q = s.ring / 2.2;
  const R = (40 + q * Math.hypot(w, h)) * u * 0.9;
  const a = (1 - q) * (1 - q) * s.ringK;
  if (a < 0.01) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(120,255,160,${(a * 0.25).toFixed(3)})`;
  ctx.lineWidth = 16 * u * (1 - q * 0.5);
  ctx.beginPath();
  ctx.arc(s.bx, s.by, R, 0, TAU);
  ctx.stroke();
  const step = 17 * u;
  const n = Math.min(260, Math.floor((TAU * R) / step));
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU;
    const x = s.bx + Math.cos(ang) * R;
    const y = s.by + Math.sin(ang) * R;
    if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
    ctx.globalAlpha = a * (0.4 + 0.6 * ((i * 7) % 5) / 5);
    drawGlyph(ctx, s.atlas, (i * 13 + Math.floor(s.ring * 20)) % GLYPH_COUNT, i % 4 ? TINT_MID : TINT_HEAD, x, y, 14 * u);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawSpoon(ctx: CanvasRenderingContext2D, s: State, t: number) {
  const u = s.s;
  // handle outline from both edges of the centreline
  const trace = () => {
    for (let i = 0; i < N; i++) {
      const q = i / (N - 1);
      const hw = handleW(q) * u;
      const x = s.px[i] + Math.cos(s.pa[i]) * hw;
      const y = s.py[i] + Math.sin(s.pa[i]) * hw;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = N - 1; i >= 0; i--) {
      const q = i / (N - 1);
      const hw = handleW(q) * u;
      ctx.lineTo(s.px[i] - Math.cos(s.pa[i]) * hw, s.py[i] - Math.sin(s.pa[i]) * hw);
    }
    ctx.closePath();
  };
  // soft contact shadow of the handle on the hand is handled by the hand; here the metal
  ctx.beginPath();
  trace();
  ctx.fillStyle = '#6f7f76';
  ctx.fill();
  // dark edge on the shadow side, bright rail on the lit side, sliding glints
  ctx.save();
  ctx.clip();
  ctx.lineCap = 'round';
  for (let i = 0; i < N - 1; i++) {
    const q = i / (N - 1);
    const hw = handleW(q) * u;
    const c = Math.cos(s.pa[i]);
    const sn = Math.sin(s.pa[i]);
    const c2 = Math.cos(s.pa[i + 1]);
    const s2 = Math.sin(s.pa[i + 1]);
    const hw2 = handleW((i + 1) / (N - 1)) * u;
    // shadow side
    ctx.strokeStyle = '#27302b';
    ctx.lineWidth = hw * 0.9;
    ctx.beginPath();
    ctx.moveTo(s.px[i] + c * hw, s.py[i] + sn * hw);
    ctx.lineTo(s.px[i + 1] + c2 * hw2, s.py[i + 1] + s2 * hw2);
    ctx.stroke();
    // specular: facing the light
    const face = Math.max(0, Math.cos(s.pa[i] - (LIGHT + Math.PI / 2) + 0.9));
    const spec = Math.pow(face, 6);
    ctx.strokeStyle = `rgba(245,255,245,${(0.25 + spec * 0.75).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, hw * 0.45);
    ctx.beginPath();
    ctx.moveTo(s.px[i] - c * hw * 0.45, s.py[i] - sn * hw * 0.45);
    ctx.lineTo(s.px[i + 1] - c2 * hw2 * 0.45, s.py[i + 1] - s2 * hw2 * 0.45);
    ctx.stroke();
  }
  ctx.restore();
  // rim light from the window
  ctx.beginPath();
  trace();
  ctx.strokeStyle = 'rgba(190,255,210,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // the bowl, tipped with the end of the handle
  ctx.save();
  ctx.translate(s.bx, s.by);
  ctx.rotate(s.ba);
  const rx = BOWL_RX * u;
  const ry = BOWL_RY * u;
  // outer metal
  const outer = ctx.createLinearGradient(-rx, -ry, rx, ry);
  outer.addColorStop(0, '#e7f2ea');
  outer.addColorStop(0.35, '#8d9c93');
  outer.addColorStop(0.7, '#3a4640');
  outer.addColorStop(1, '#9fb0a6');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  // the reflection inside the hollow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0.5 * u, rx * 0.86, ry * 0.88, 0, 0, TAU);
  ctx.clip();
  drawReflection(ctx, s, rx, ry, t);
  ctx.restore();
  // spherical shading over the reflection: dark toward the lower edge, a hot highlight up top
  const shade = ctx.createRadialGradient(-rx * 0.25, -ry * 0.3, rx * 0.1, 0, 0, ry * 1.05);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.7, 'rgba(0,0,0,0.12)');
  shade.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(0, 0.5 * u, rx * 0.86, ry * 0.88, 0, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  const hl = ctx.createRadialGradient(-rx * 0.38, -ry * 0.45, 0, -rx * 0.38, -ry * 0.45, rx * 0.5);
  hl.addColorStop(0, 'rgba(255,255,255,0.75)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(-rx, -ry, rx * 1.2, ry * 1.2);
  ctx.globalCompositeOperation = 'source-over';
  // lip of the bowl
  ctx.strokeStyle = 'rgba(235,255,240,0.65)';
  ctx.lineWidth = 1.4 * u;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx - 0.7 * u, ry - 0.7 * u, 0, Math.PI * 0.95, Math.PI * 1.75);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20,30,25,0.8)';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx - 0.7 * u, ry - 0.7 * u, 0, Math.PI * 1.9, Math.PI * 2.8);
  ctx.stroke();
  ctx.restore();
}

/** Upside down, as a spoon shows it: window light below, Neo's head hanging in the middle */
function drawReflection(ctx: CanvasRenderingContext2D, s: State, rx: number, ry: number, t: number) {
  const u = s.s;
  const slide = s.bend * 8 * u;
  const g = ctx.createLinearGradient(0, -ry, 0, ry);
  g.addColorStop(0, '#0d1712');
  g.addColorStop(0.55, '#2c4637');
  g.addColorStop(1, '#bfe8cc');
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
  // window bars, bent by the curve of the bowl
  ctx.strokeStyle = 'rgba(10,20,14,0.5)';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(rx * 0.4 + slide, ry);
  ctx.quadraticCurveTo(rx * 0.25 + slide, ry * 0.4, rx * 0.5 + slide, 0);
  ctx.stroke();
  // Neo leaning in, upside down: shoulders at the top, head below
  ctx.fillStyle = '#060a08';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.05 - slide, -ry * 0.78, rx * 0.95, ry * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-rx * 0.05 - slide, -ry * 0.2, rx * 0.36, ry * 0.36, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(190,230,200,0.22)';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.13 - slide, -ry * 0.12, rx * 0.18, ry * 0.22, 0, 0, TAU);
  ctx.fill();

  // the code under it all, stronger after a release, rippling out from the centre
  const codeA = 0.14 + s.code * 0.86;
  const wave = s.ripple < 2 ? s.rippleK * (1 - s.ripple / 2) : 0;
  const size = 8.5 * u;
  ctx.globalCompositeOperation = 'lighter';
  let n = 0;
  for (let cx = -3; cx <= 3; cx++) {
    const colPhase = (t * (1.2 + (cx & 1) * 0.5) + cx * 0.37) % 1;
    for (let cy = -4; cy <= 4; cy++) {
      let x = cx * size * 1.05;
      // falls upward: the reflection is inverted
      let y = (cy - colPhase) * size * 1.1;
      const d = Math.hypot(x, y);
      if (wave > 0) {
        const push = Math.sin(d / (6 * u) - s.ripple * 14) * wave * 4 * u;
        x += (x / (d || 1)) * push;
        y += (y / (d || 1)) * push;
      }
      const lead = cy === -4 || ((cx + cy + Math.floor(t * 3)) & 7) === 0;
      ctx.globalAlpha = codeA * (lead ? 1 : 0.55);
      drawGlyph(ctx, s.atlas, s.refl[n++ % s.refl.length], lead ? TINT_HEAD : TINT_BRIGHT, x, y, size);
    }
  }
  ctx.globalAlpha = 1;
  if (wave > 0) {
    const r = (s.ripple / 2) * ry * 1.4;
    ctx.strokeStyle = `rgba(200,255,215,${(wave * 0.7).toFixed(3)})`;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (rx / ry), r, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

const SKIN = '#c59576';
const SKIN_HI = '#efc6a2';
const SKIN_LO = '#7b503c';
const SKIN_RIM = 'rgba(190,255,205,0.8)';

function drawArm(ctx: CanvasRenderingContext2D, s: State) {
  const u = s.s;
  const x = s.gx;
  const y = s.gy;
  // forearm down to the robe sleeve at the bottom of the frame
  ctx.beginPath();
  limb(ctx, x + 10 * u, y + 20 * u, x + 70 * u, y + 190 * u, 26 * u, 34 * u);
  const g = ctx.createLinearGradient(x - 20 * u, 0, x + 80 * u, 0);
  g.addColorStop(0, SKIN_LO);
  g.addColorStop(0.45, SKIN);
  g.addColorStop(1, '#5d3b2c');
  ctx.fillStyle = g;
  ctx.fill();
  // cream robe sleeve
  ctx.beginPath();
  ctx.moveTo(x - 30 * u, y + 250 * u);
  ctx.quadraticCurveTo(x - 20 * u, y + 110 * u, x + 20 * u, y + 95 * u);
  ctx.quadraticCurveTo(x + 80 * u, y + 88 * u, x + 130 * u, y + 110 * u);
  ctx.lineTo(x + 170 * u, y + 250 * u);
  ctx.closePath();
  const sl = ctx.createLinearGradient(0, y + 90 * u, 0, y + 250 * u);
  sl.addColorStop(0, '#b9ad8f');
  sl.addColorStop(1, '#4d4636');
  ctx.fillStyle = sl;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,34,25,0.5)';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(x + 10 * u, y + 120 * u);
  ctx.quadraticCurveTo(x + 50 * u, y + 160 * u, x + 40 * u, y + 250 * u);
  ctx.moveTo(x + 75 * u, y + 108 * u);
  ctx.quadraticCurveTo(x + 100 * u, y + 170 * u, x + 110 * u, y + 250 * u);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230,255,225,0.35)';
  ctx.beginPath();
  ctx.moveTo(x - 20 * u, y + 110 * u);
  ctx.quadraticCurveTo(x + 5 * u, y + 96 * u, x + 20 * u, y + 95 * u);
  ctx.stroke();
}

/** A small fist around the handle: four curled fingers facing us, the thumb wrapped over */
function drawHand(ctx: CanvasRenderingContext2D, s: State) {
  const u = s.s;
  const x = s.gx;
  const y = s.gy;
  // back of the hand mass
  ctx.beginPath();
  ctx.moveTo(x - 30 * u, y - 26 * u);
  ctx.bezierCurveTo(x - 10 * u, y - 36 * u, x + 26 * u, y - 34 * u, x + 36 * u, y - 14 * u);
  ctx.bezierCurveTo(x + 44 * u, y + 8 * u, x + 38 * u, y + 40 * u, x + 22 * u, y + 52 * u);
  ctx.lineTo(x - 18 * u, y + 50 * u);
  ctx.bezierCurveTo(x - 34 * u, y + 30 * u, x - 38 * u, y - 10 * u, x - 30 * u, y - 26 * u);
  ctx.closePath();
  const g = ctx.createLinearGradient(x - 30 * u, y - 30 * u, x + 40 * u, y + 40 * u);
  g.addColorStop(0, SKIN_HI);
  g.addColorStop(0.5, SKIN);
  g.addColorStop(1, SKIN_LO);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = SKIN_RIM;
  ctx.lineWidth = 1.4 * u;
  ctx.beginPath();
  ctx.moveTo(x + 36 * u, y - 14 * u);
  ctx.bezierCurveTo(x + 44 * u, y + 8 * u, x + 38 * u, y + 40 * u, x + 22 * u, y + 52 * u);
  ctx.stroke();

  // curled fingers, stacked, each with a lit top and a crease under it
  for (let i = 0; i < 4; i++) {
    const fy = y - 20 * u + i * 16.5 * u;
    const fx0 = x - 32 * u + i * 2.5 * u;
    const fx1 = x + 14 * u - i * 3 * u;
    const r = (8.6 - i * 0.6) * u;
    ctx.beginPath();
    limb(ctx, fx0, fy, fx1, fy + 2 * u, r, r * 0.95);
    const fg = ctx.createLinearGradient(0, fy - r, 0, fy + r);
    fg.addColorStop(0, SKIN_HI);
    fg.addColorStop(0.45, SKIN);
    fg.addColorStop(1, SKIN_LO);
    ctx.fillStyle = fg;
    ctx.fill();
    // knuckle crease
    ctx.strokeStyle = 'rgba(80,45,32,0.55)';
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(fx0 + 16 * u, fy - r * 0.6);
    ctx.quadraticCurveTo(fx0 + 19 * u, fy, fx0 + 16 * u, fy + r * 0.6);
    ctx.stroke();
    // fingernail at the tip, on the handle side
    ctx.fillStyle = 'rgba(245,215,195,0.8)';
    ctx.beginPath();
    ctx.ellipse(fx1 + r * 0.25, fy + 1.5 * u, r * 0.42, r * 0.55, 0, 0, TAU);
    ctx.fill();
  }
  // the handle enters above the index finger; a contact shadow on the finger
  ctx.fillStyle = 'rgba(40,20,14,0.35)';
  ctx.beginPath();
  ctx.ellipse(s.px[0] + 2 * u, y - 28 * u, 9 * u, 3 * u, 0, 0, TAU);
  ctx.fill();
  // the thumb wraps over the front, tip pressing the handle
  ctx.beginPath();
  limb(ctx, x + 34 * u, y - 6 * u, x + 4 * u, y - 25 * u, 10 * u, 7.8 * u);
  const tg = ctx.createLinearGradient(x, y - 36 * u, x, y - 10 * u);
  tg.addColorStop(0, SKIN_HI);
  tg.addColorStop(1, SKIN_LO);
  ctx.fillStyle = tg;
  ctx.fill();
  ctx.fillStyle = 'rgba(250,225,205,0.85)';
  ctx.beginPath();
  ctx.ellipse(x + 6 * u, y - 27 * u, 5 * u, 3.4 * u, -0.55, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = SKIN_RIM;
  ctx.lineWidth = 1.2 * u;
  ctx.beginPath();
  ctx.moveTo(x + 36 * u, y - 14 * u);
  ctx.quadraticCurveTo(x + 20 * u, y - 30 * u, x + 4 * u, y - 33 * u);
  ctx.stroke();
}
