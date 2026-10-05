import { createCanvasScene, clamp, damp, easeInOutCubic, easeOutBack, easeOutCubic, lerp, noise, rand, TAU, tone } from './runtime';
import type { AudioBus, SceneEnv } from './runtime';
import type { MountScene } from './types';
import {
  capsule,
  drawLayer,
  enterStage,
  fitStage,
  freeLayer,
  glow,
  hash,
  makeLayer,
  makeStage,
  Painter,
  Pool,
  prepLayer,
  shapeHum,
  startHum,
  stopHum,
  vignette,
} from './games-kit';
import type { Hum, Stage } from './games-kit';

/**
 * Link and the Master Sword: a clearing deep in the Lost Woods, light falling through
 * the canopy onto a stone pedestal. Link, in the green tunic and long cap with the shield
 * on his back, grips the hilt. Hold to pull (the blade rises, the light swells and three
 * golden shards circle the hilt); let go when it is free to raise it overhead with a
 * flash, a spin ring and a rising chime while fairies scatter. Let go early and it
 * sinks back into the stone.
 */

const PED_X = 70;
const PED_TOP = -84;
const LINK_X = -18;
const BLADE = 210;
const GRIP = 44;
const PULL_MAX = 56;
const CHARGE_RATE = 0.52;
const FAIRIES = 7;
/** Actors (dais, pedestal, Link, sword, magic) are drawn at this scale about the ground origin */
const ZS = 1.4;

const TUNIC = ['#8fd46a', '#3b8a36', '#1c4a1f'] as const;
const TUNIC_D = ['#6fae52', '#2e6e2b', '#153a17'] as const;
const CREAM = ['#fff6e2', '#ddd0b2', '#9c8f72'] as const;
const LEATHER = ['#b7824e', '#6e4526', '#351f10'] as const;
const SKIN = ['#ffe0c2', '#e9b58e', '#b27c5a'] as const;
const HAIR = ['#fff0a0', '#e6bd4f', '#9a7422'] as const;
const STEEL = ['#ffffff', '#cfd8e6', '#7f8aa0'] as const;
const HILT = ['#8f8cff', '#4a45c0', '#221f6e'] as const;

interface Fairy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hx: number;
  hy: number;
  ph: number;
  hue: number;
  flee: number;
}

interface State {
  st: Stage;
  bg: HTMLCanvasElement;
  paint: Painter | null;
  motes: Pool;
  sparks: Pool;
  leaves: Pool;
  fairies: Fairy[];
  // input
  pressing: boolean;
  keyDown: boolean;
  touched: boolean;
  demoT: number;
  // sword
  phase: number; // 0 seated, 1 drawing, 2 raised, 3 returning
  phaseT: number;
  charge: number;
  pull: number;
  full: boolean;
  shards: number;
  flash: number;
  ring: number;
  spin: number;
  idle: number;
  // sword pose in stage space: grip centre and angle of the blade
  gx: number;
  gy: number;
  ga: number;
  lean: number;
  shake: number;
  hum: Hum | null;
  time: number;
}

/* ---------- mount ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 3.4,
    init: (env) => ({
      st: makeStage(),
      bg: makeLayer(),
      paint: new Painter(env.ctx),
      motes: new Pool(110),
      sparks: new Pool(200),
      leaves: new Pool(16),
      fairies: Array.from({ length: FAIRIES }, (_, i) => {
        const hx = -420 + ((i * 137) % 840);
        const hy = -420 + ((i * 89) % 260);
        return { x: hx, y: hy, vx: 0, vy: 0, hx, hy, ph: i * 1.7, hue: i % 3, flee: 0 };
      }),
      pressing: false,
      keyDown: false,
      touched: false,
      demoT: 0,
      phase: 0,
      phaseT: 0,
      charge: 0,
      pull: 0,
      full: false,
      shards: 0,
      flash: 0,
      ring: -1,
      spin: -1,
      idle: 0,
      gx: PED_X,
      gy: PED_TOP - 96,
      ga: Math.PI / 2,
      lean: 0,
      shake: 0,
      hum: null,
      time: 0,
    }),
    resize: (s, env) => {
      fitStage(s.st, env.w, env.h);
      const c = prepLayer(s.bg, env.w, env.h, env.dpr, s.st);
      if (c) renderBackdrop(c, s.st);
      if (s.motes.items.every((p) => p.life <= 0)) for (let i = 0; i < 90; i++) spawnMote(s, true);
    },
    update: (s, env, dt, t) => {
      const rm = env.reducedMotion;
      s.time = t;
      if (!s.touched && (!env.interactive || rm)) runDemo(s, env, dt);
      const holding = s.pressing || s.keyDown;
      s.phaseT += dt;

      if (s.phase === 0) {
        if (holding) {
          s.charge = Math.min(1, s.charge + dt * CHARGE_RATE * (1.15 - s.charge * 0.3));
          if (rm) env.wake(300);
          if (s.charge >= 1 && !s.full) {
            s.full = true;
            const bus = env.audio();
            if (bus) tone(bus, 1760, { type: 'sine', attack: 0.005, decay: 0.5, gain: 0.05 });
          }
        } else {
          s.charge = Math.max(0, s.charge - dt * 1.6);
          s.full = false;
        }
        s.pull = damp(s.pull, s.charge * PULL_MAX, 10, dt);
      }
      if (s.hum) shapeHum(s.hum, 180 + s.charge * 260, 900 + s.charge * 2600, 0.015 + s.charge * 0.05, 1.5);

      updateSword(s, env, dt, t);

      // shards circle in with the charge and flare out when raised
      const shardT = s.phase === 0 ? s.charge : s.phase === 1 || s.phase === 2 ? 1 : 0;
      s.shards = damp(s.shards, shardT, s.phase === 0 ? 6 : 3, dt);
      s.flash = Math.max(0, s.flash - dt * 1.4);
      s.shake = Math.max(0, s.shake - dt * 3);
      if (s.ring >= 0) {
        s.ring += dt;
        if (s.ring > 1.1) s.ring = -1;
      }
      if (s.spin >= 0) {
        s.spin += dt;
        if (s.spin > 0.5) s.spin = -1;
      }

      // motes rise faster and golden while the sword is drawn
      for (const p of s.motes.items) if (p.life <= 0 || p.y < s.st.top - 20) spawnMote(s, false);
      const lift = 1 + s.charge * 3 + (s.phase === 2 ? 1 : 0);
      s.motes.step(dt * lift);
      if (s.charge > 0.2 && Math.random() < s.charge * dt * 40) {
        s.sparks.spawn(s.gx + rand(-40, 40), PED_TOP + rand(-10, 10), rand(-20, 20), rand(-160, -60), rand(0.8, 1.6), rand(1.5, 3), 1, -20, 0.5);
      }
      s.sparks.step(dt);
      if (Math.random() < dt * 0.8) {
        const st = s.st;
        const lf = s.leaves.spawn(rand(st.left, st.right), st.top - 20, rand(10, 40), rand(30, 60), 14, rand(5, 8), 0);
        lf.rot = rand(0, TAU);
        lf.vr = rand(-2, 2);
      }
      s.leaves.step(dt);
      updateFairies(s, dt, t);
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const st = s.st;
      const p = s.paint;
      if (!p) return;
      p.ctx = ctx;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#081510';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      const amp = env.reducedMotion ? 0 : s.shake * s.shake * 7 * st.k;
      if (amp > 0.05) ctx.translate(Math.sin(t * 81) * amp, Math.cos(t * 67) * amp * 0.7);
      drawLayer(ctx, s.bg, w, h);
      ctx.save();
      enterStage(ctx, st);
      drawRays(ctx, s, t);
      drawLeaves(ctx, s, t);
      ctx.save();
      ctx.scale(ZS, ZS);
      drawGroundGlow(ctx, s, t);
      drawLink(p, s, t, true);
      drawSword(p, s, t);
      drawLink(p, s, t, false);
      drawMagic(ctx, s, t);
      ctx.restore();
      drawMotes(ctx, s, t);
      drawFairies(ctx, s, t);
      ctx.restore();
      if (s.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,248,220,${(s.flash * s.flash * 0.55).toFixed(3)})`;
        ctx.fillRect(-30, -30, w + 60, h + 60);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      vignette(ctx, w, h, 0.62, '2,10,6');
    },
    onPointerDown: (s, env) => press(s, env),
    onPointerUp: (s, env) => {
      if (!s.pressing) return;
      s.pressing = false;
      release(s, env);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (down) {
        if (!e.repeat && !s.keyDown) {
          s.keyDown = true;
          press(s, env, true);
        }
      } else if (s.keyDown) {
        s.keyDown = false;
        release(s, env);
      }
      return true;
    },
    dispose: (s) => {
      if (s.hum) stopHum(s.hum);
      s.hum = null;
      freeLayer(s.bg);
      s.paint = null;
    },
  });

/* ---------- input ---------- */

function press(s: State, env: SceneEnv, key = false) {
  s.touched = true;
  if (!key) s.pressing = true;
  s.idle = 0;
  if (s.phase === 2) {
    // reduced motion: a tap puts the sword back instead of a spin, so it can be drawn again
    if (env.reducedMotion) {
      s.phase = 3;
      s.phaseT = 0;
    } else spinAttack(s, env);
    return;
  }
  if (s.phase !== 0) return;
  const bus = env.audio();
  if (bus && !s.hum) s.hum = startHum(bus, { type: 'sine', freq: 180, ratio: 1.5, noise: 0.08, filter: 900, gain: 0.015, attack: 0.2 });
}

function release(s: State, env: SceneEnv) {
  if (s.pressing || s.keyDown) return;
  if (s.hum) {
    stopHum(s.hum, 0.15);
    s.hum = null;
  }
  if (s.phase !== 0) return;
  if (s.charge >= 0.98) freeSword(s, env);
  else if (s.charge > 0.08) {
    // not yet: the blade slides home with a stony knock
    const bus = env.audio();
    if (bus) {
      tone(bus, 110, { type: 'triangle', attack: 0.003, decay: 0.2, gain: 0.12, glideTo: 70 });
      noise(bus, { duration: 0.2, gain: 0.08, freq: 600, q: 0.8, type: 'lowpass' });
    }
    for (let i = 0; i < 10; i++) s.sparks.spawn(PED_X + rand(-40, 40), PED_TOP, rand(-60, 60), rand(-60, -10), rand(0.4, 0.8), rand(6, 12), 3, 80, 2);
  }
}

function freeSword(s: State, env: SceneEnv) {
  s.phase = 1;
  s.phaseT = 0;
  s.charge = 0;
  s.full = false;
  s.idle = 0;
  const bus = env.audio();
  if (bus) chime(bus);
}

function spinAttack(s: State, env: SceneEnv) {
  if (s.spin >= 0) return;
  s.spin = 0;
  s.ring = 0;
  if (!env.reducedMotion) s.shake = 0.5;
  scatter(s, 0.7);
  const bus = env.audio();
  if (bus) {
    noise(bus, { duration: 0.35, gain: 0.12, freq: 1800, q: 0.6 });
    tone(bus, 660, { type: 'triangle', attack: 0.01, decay: 0.3, gain: 0.05, glideTo: 1320 });
  }
}

/** A bright rising arpeggio with a shimmering tail, in the spirit of a treasure found */
function chime(bus: AudioBus) {
  const notes = [587.33, 739.99, 880, 1174.66, 1479.98, 1760];
  notes.forEach((f, i) => {
    tone(bus, f, { type: 'triangle', attack: 0.004, decay: 0.5, gain: 0.07, delay: i * 0.085 });
    tone(bus, f * 2, { type: 'sine', attack: 0.004, decay: 0.35, gain: 0.02, delay: i * 0.085 + 0.02 });
  });
  const end = notes.length * 0.085 + 0.05;
  tone(bus, 1174.66, { type: 'sine', attack: 0.02, decay: 1.6, gain: 0.06, delay: end });
  tone(bus, 1760, { type: 'sine', attack: 0.02, decay: 1.8, gain: 0.04, delay: end });
  tone(bus, 2349.32, { type: 'sine', attack: 0.03, decay: 1.4, gain: 0.025, delay: end + 0.05 });
  noise(bus, { duration: 0.6, gain: 0.05, freq: 7000, q: 0.7, type: 'highpass' });
}

function runDemo(s: State, env: SceneEnv, dt: number) {
  s.demoT += dt;
  const T = s.demoT % 9;
  const want = T > 0.4 && T < 2.9;
  if (want && !s.pressing && s.phase === 0) s.pressing = true;
  if (!want && s.pressing) {
    s.pressing = false;
    release(s, env);
  }
}

/* ---------- simulation ---------- */

function spawnMote(s: State, anywhere: boolean) {
  const st = s.st;
  const x = rand(st.left, st.right);
  const y = anywhere ? rand(st.top, 20) : rand(-40, 40);
  const p = s.motes.spawn(x, y, rand(-6, 6), rand(-26, -8), rand(8, 20), rand(1, 2.6), Math.random() < 0.3 ? 1 : 0);
  p.rot = rand(0, TAU);
}

/** Grip and blade angle for the current phase */
function updateSword(s: State, env: SceneEnv, dt: number, t: number) {
  const rm = env.reducedMotion;
  const seatX = PED_X;
  const seatY = PED_TOP - 96;
  const upX = LINK_X + 16;
  const upY = -304;
  let gx = seatX;
  let gy = seatY - s.pull;
  let ga = Math.PI / 2;
  let lean = 0.14 - 0.26 * s.charge;
  if (s.phase === 0) {
    const tremble = s.charge > 0.3 && !rm ? (s.charge - 0.3) * 2.2 : 0;
    gx += Math.sin(t * 57) * tremble;
    ga += Math.sin(t * 43) * tremble * 0.006;
  } else if (s.phase === 1) {
    const k = Math.min(1, s.phaseT / 0.75);
    const e = easeOutBack(k);
    const m = easeInOutCubic(k);
    // arc forward and up over the pedestal, then overhead
    const cx = lerp(seatX, upX, m);
    const cy = lerp(seatY - PULL_MAX, upY, e) - Math.sin(m * Math.PI) * 70;
    gx = cx + Math.sin(m * Math.PI) * 60;
    gy = cy;
    ga = lerp(Math.PI / 2, -Math.PI / 2, easeOutCubic(k));
    lean = lerp(-0.12, -0.04, m);
    if (k > 0.45 && s.flash < 0.5 && s.ring < 0) {
      s.flash = rm ? 0.5 : 1;
      s.ring = 0;
      if (!rm) s.shake = 0.8;
      scatter(s, 1);
      for (let i = 0; i < 70; i++) {
        const a = rand(0, TAU);
        const v = rand(100, 520);
        s.sparks.spawn(upX, upY - 100, Math.cos(a) * v, Math.sin(a) * v, rand(0.5, 1.2), rand(1.5, 3), i % 2, 60, 1.6);
      }
    }
    if (k >= 1) {
      s.phase = 2;
      s.phaseT = 0;
    }
  } else if (s.phase === 2) {
    gx = upX + Math.sin(t * 1.4) * 2;
    gy = upY + Math.sin(t * 2.1) * 3;
    ga = -Math.PI / 2 + Math.sin(t * 1.2) * 0.02;
    lean = -0.05;
    if (s.spin >= 0) {
      const k = s.spin / 0.5;
      ga = -Math.PI / 2 + Math.sin(k * Math.PI) * 0.2;
    }
    if (Math.random() < dt * 14) s.sparks.spawn(gx + rand(-5, 5), gy - rand(20, BLADE), rand(-10, 10), rand(-30, 10), rand(0.4, 0.9), rand(1, 2.2), 0, 0, 1);
    s.idle += dt;
    if (s.idle > 7) {
      s.phase = 3;
      s.phaseT = 0;
    }
  } else if (s.phase === 3) {
    const k = Math.min(1, s.phaseT / 1.2);
    const m = easeInOutCubic(k);
    gx = lerp(upX, seatX, m) + Math.sin(m * Math.PI) * 50;
    gy = lerp(upY, seatY, m) - Math.sin(m * Math.PI) * 40;
    ga = lerp(-Math.PI / 2, Math.PI / 2, m);
    lean = lerp(-0.04, 0.14, m);
    s.pull = 0;
    if (k >= 1) {
      s.phase = 0;
      s.phaseT = 0;
      s.charge = 0;
      const bus = env.audio();
      if (bus) tone(bus, 140, { type: 'triangle', attack: 0.003, decay: 0.3, gain: 0.1, glideTo: 80 });
      for (let i = 0; i < 14; i++) s.sparks.spawn(PED_X + rand(-40, 40), PED_TOP, rand(-70, 70), rand(-70, -10), rand(0.4, 0.9), rand(6, 12), 3, 80, 2);
    }
  }
  s.gx = gx;
  s.gy = gy;
  s.ga = ga;
  s.lean = damp(s.lean, lean, 8, dt);
}

function scatter(s: State, power: number) {
  for (const f of s.fairies) {
    const dx = f.x - LINK_X * ZS;
    const dy = f.y + 250 * ZS;
    const d = Math.hypot(dx, dy) || 1;
    const v = (380 + Math.random() * 260) * power;
    f.vx = (dx / d) * v;
    f.vy = (dy / d) * v - 120 * power;
    f.flee = 2.2;
  }
}

function updateFairies(s: State, dt: number, t: number) {
  for (const f of s.fairies) {
    if (f.flee > 0) {
      f.flee -= dt;
      f.vx *= Math.exp(-1.6 * dt);
      f.vy *= Math.exp(-1.6 * dt);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    } else {
      // wander on a slow lissajous around home
      const tx = f.hx + Math.sin(t * 0.7 + f.ph) * 70 + Math.sin(t * 1.9 + f.ph * 2) * 18;
      const ty = f.hy + Math.cos(t * 0.9 + f.ph) * 40 + Math.sin(t * 2.7 + f.ph) * 10;
      f.x = damp(f.x, tx, 1.4, dt);
      f.y = damp(f.y, ty, 1.4, dt);
    }
  }
}

/* ---------- backdrop (cached) ---------- */

function renderBackdrop(c: CanvasRenderingContext2D, st: Stage) {
  c.save();
  enterStage(c, st);
  const L = st.left - 40;
  const R = st.right + 40;
  const T = st.top - 40;
  const B = st.bottom + 40;

  // deep woods: dark teal edges, misty green light in the middle distance
  const bg = c.createLinearGradient(0, Math.min(T, -900), 0, 0);
  bg.addColorStop(0, '#07160f');
  bg.addColorStop(0.5, '#123526');
  bg.addColorStop(0.85, '#2a5a3a');
  bg.addColorStop(1, '#1d4a2c');
  c.fillStyle = bg;
  c.fillRect(L, T, R - L, B - T);
  c.globalCompositeOperation = 'lighter';
  glow(c, 0, -360, 620, '120,200,140', 0.2);
  glow(c, -120, -620, 420, '220,240,170', 0.14);
  c.globalCompositeOperation = 'source-over';

  // far trunks lost in mist, then mid trunks with flared roots
  for (let i = 0; i < 16; i++) {
    const x = L + hash(i + 10) * (R - L);
    if (Math.abs(x - 20) < 180) continue;
    trunk(c, x, -40, 22 + hash(i + 20) * 30, '#2b5a44', 'rgba(150,210,170,0.18)', false);
  }
  mist(c, L, R, -520, -40, 'rgba(90,150,110,0.35)');
  for (let i = 0; i < 9; i++) {
    const x = L + hash(i + 40) * (R - L);
    if (Math.abs(x - 20) < 260) continue;
    trunk(c, x, -20, 44 + hash(i + 50) * 40, '#173627', 'rgba(170,220,150,0.22)', true);
  }
  mist(c, L, R, -300, -10, 'rgba(70,130,90,0.3)');

  // canopy overhead with gaps for the light
  const gapX = -170;
  const gapY = T + 40;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 260; i++) {
      const x = L + hash(i + 200) * (R - L);
      const depth = hash(i + 300);
      // foliage hangs lower toward the edges of the frame
      const y = T - 30 + depth * (140 + Math.abs(x - gapX) * 0.22) + Math.sin(x * 0.02) * 20;
      const r = 26 + hash(i + 400) * 56;
      if (Math.hypot(x - gapX, (y - gapY) * 1.3) < 190 + r * 0.3) continue;
      if (pass === 0) {
        c.fillStyle = depth > 0.6 ? '#0c2616' : '#06140c';
        c.beginPath();
        c.arc(x, y, r, 0, TAU);
        c.fill();
      } else if (hash(i + 450) > 0.55) {
        // leaves catching light on the side facing the gap
        const a = Math.atan2(gapY - y, gapX - x);
        c.fillStyle = 'rgba(90,160,80,0.14)';
        c.beginPath();
        c.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.55, 0, TAU);
        c.fill();
      }
    }
  }
  // hanging vines
  c.strokeStyle = 'rgba(20,50,30,0.9)';
  c.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const x = L + hash(i + 500) * (R - L);
    const len = 120 + hash(i + 510) * 260;
    c.beginPath();
    c.moveTo(x, T + 100);
    c.quadraticCurveTo(x + 20, T + 100 + len * 0.6, x - 6, T + 100 + len);
    c.stroke();
  }

  // grassy floor with a lit clearing
  const floor = c.createLinearGradient(0, -60, 0, B);
  floor.addColorStop(0, '#2f6b32');
  floor.addColorStop(0.25, '#1d4a22');
  floor.addColorStop(1, '#0b2010');
  c.fillStyle = floor;
  c.beginPath();
  c.moveTo(L, -40);
  for (let x = L; x <= R; x += 30) c.lineTo(x, -46 + Math.sin(x * 0.01) * 6);
  c.lineTo(R, B);
  c.lineTo(L, B);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'lighter';
  c.save();
  c.translate((PED_X - 30) * ZS, -30);
  c.scale(1, 0.22);
  glow(c, 0, 0, 640, '220,240,150', 0.35);
  c.restore();
  c.globalCompositeOperation = 'source-over';

  // near trunks framing the clearing
  trunk(c, L + 40, 60, 150, '#0a1a10', 'rgba(170,230,150,0.25)', true);
  trunk(c, R - 30, 60, 130, '#0a1a10', 'rgba(170,230,150,0.2)', true);

  // the stone dais and pedestal
  c.save();
  c.scale(ZS, ZS);
  dais(c);
  c.restore();

  // grass tufts, ferns and flowers
  for (let i = 0; i < 220; i++) {
    const x = L + hash(i + 600) * (R - L);
    const y = -40 + hash(i + 700) * (B + 40);
    const d = Math.hypot((x - PED_X * ZS + 20) / (260 * ZS), (y + 24) / (50 * ZS));
    if (d < 1) continue;
    const h = 8 + hash(i + 800) * 16 * (1 + y / 200);
    c.strokeStyle = hash(i + 900) > 0.5 ? 'rgba(120,190,90,0.7)' : 'rgba(60,120,60,0.8)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x - 3, y - h * 0.6, x - 6 + hash(i) * 12, y - h);
    c.moveTo(x + 3, y);
    c.quadraticCurveTo(x + 5, y - h * 0.5, x + 9, y - h * 0.8);
    c.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const x = L + hash(i + 1000) * (R - L);
    const y = -30 + hash(i + 1100) * 120;
    if (Math.hypot((x - PED_X * ZS + 20) / (260 * ZS), (y + 24) / (50 * ZS)) < 1.1) continue;
    c.fillStyle = ['#f6f0ff', '#ffd6f0', '#fff4a8', '#bfe6ff'][i % 4];
    c.beginPath();
    c.arc(x, y, 2.4, 0, TAU);
    c.fill();
  }
  fern(c, L + 150, 20, 1.2);
  fern(c, R - 160, 30, -1.1);
  fern(c, -420, -30, 0.8);
  fern(c, 460, -30, -0.8);
  c.restore();
}

function mist(c: CanvasRenderingContext2D, L: number, R: number, y0: number, y1: number, col: string) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, col);
  c.fillStyle = g;
  c.fillRect(L, y0, R - L, y1 - y0);
}

function trunk(c: CanvasRenderingContext2D, x: number, base: number, w: number, col: string, rim: string, roots: boolean) {
  c.beginPath();
  c.moveTo(x - w / 2, -1600);
  c.lineTo(x - w / 2, base - w * 0.8);
  if (roots) {
    c.quadraticCurveTo(x - w / 2, base - w * 0.2, x - w * 1.3, base);
    c.lineTo(x + w * 1.3, base);
    c.quadraticCurveTo(x + w / 2, base - w * 0.2, x + w / 2, base - w * 0.8);
  } else {
    c.lineTo(x - w / 2, base);
    c.lineTo(x + w / 2, base);
  }
  c.lineTo(x + w / 2, -1600);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.save();
  c.clip();
  // bark lines and a lit edge toward the clearing
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    const bx = x - w / 2 + (k + 0.5) * (w / 4);
    c.beginPath();
    c.moveTo(bx, -1600);
    c.lineTo(bx + Math.sin(k) * 4, base);
    c.stroke();
  }
  c.fillStyle = rim;
  const side = x < 0 ? 1 : -1;
  c.fillRect(side > 0 ? x + w / 2 - w * 0.18 : x - w / 2, -1600, w * 0.18, 1600 + base);
  // moss
  c.fillStyle = 'rgba(80,150,70,0.35)';
  c.beginPath();
  c.ellipse(x, base - w * 0.6, w * 0.8, w * 0.35, 0, 0, TAU);
  c.fill();
  c.restore();
}

function fern(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.save();
  c.translate(x, y);
  c.scale(s, Math.abs(s));
  c.fillStyle = '#0d2a14';
  for (let k = 0; k < 5; k++) {
    c.save();
    c.rotate(-1.2 + k * 0.45);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(40, -30, 90, -10);
    c.quadraticCurveTo(40, -10, 0, 0);
    c.fill();
    c.restore();
  }
  c.restore();
}

function dais(c: CanvasRenderingContext2D) {
  // two stepped rings of stone
  const ring = (y: number, rx: number, ry: number, h: number, top: string, side: string) => {
    c.fillStyle = side;
    c.beginPath();
    c.ellipse(PED_X - 20, y + h, rx, ry, 0, 0, Math.PI);
    c.lineTo(PED_X - 20 - rx, y);
    c.ellipse(PED_X - 20, y, rx, ry, 0, Math.PI, 0, true);
    c.closePath();
    c.fill();
    c.fillStyle = top;
    c.beginPath();
    c.ellipse(PED_X - 20, y, rx, ry, 0, 0, TAU);
    c.fill();
  };
  ring(-24, 250, 42, 18, '#7d8a7a', '#434d44');
  ring(-40, 190, 30, 16, '#96a291', '#525c52');
  // worn tiles and a carved circle on the top step
  c.strokeStyle = 'rgba(40,50,40,0.5)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.ellipse(PED_X - 20, -40, 150, 22, 0, 0, TAU);
  c.stroke();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    c.beginPath();
    c.moveTo(PED_X - 20 + Math.cos(a) * 150, -40 + Math.sin(a) * 22);
    c.lineTo(PED_X - 20 + Math.cos(a) * 190, -40 + Math.sin(a) * 30);
    c.stroke();
  }
  // moss creeping over the steps
  c.fillStyle = 'rgba(80,140,60,0.5)';
  for (let k = 0; k < 12; k++) {
    const a = hash(k + 1300) * Math.PI;
    c.beginPath();
    c.ellipse(PED_X - 20 + Math.cos(a) * 240, -24 + Math.sin(a) * 44, 18 + hash(k) * 16, 5, 0, 0, TAU);
    c.fill();
  }
  // pedestal block: front face, top face, carved glyph
  const w = 92;
  const top = PED_TOP;
  c.fillStyle = '#5c675a';
  c.beginPath();
  c.moveTo(PED_X - w / 2, -46);
  c.lineTo(PED_X - w / 2 + 6, top + 6);
  c.lineTo(PED_X + w / 2 - 6, top + 6);
  c.lineTo(PED_X + w / 2, -46);
  c.closePath();
  c.fill();
  c.fillStyle = '#434d43';
  c.fillRect(PED_X - w / 2 + 2, -58, w - 4, 12);
  c.fillStyle = 'rgba(200,230,190,0.25)';
  c.fillRect(PED_X + w / 2 - 16, top + 8, 10, -46 - top - 8);
  c.fillStyle = '#a9b5a4';
  c.beginPath();
  c.moveTo(PED_X - w / 2 + 6, top + 6);
  c.lineTo(PED_X - w / 2 + 14, top - 6);
  c.lineTo(PED_X + w / 2 - 2, top - 6);
  c.lineTo(PED_X + w / 2 - 6, top + 6);
  c.closePath();
  c.fill();
  // slot where the blade enters
  c.fillStyle = '#20261f';
  c.beginPath();
  c.ellipse(PED_X, top, 16, 4, 0, 0, TAU);
  c.fill();
  // carved ring glyph
  c.strokeStyle = 'rgba(30,38,30,0.7)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(PED_X, top + 34, 13, 0, TAU);
  c.moveTo(PED_X - 20, top + 34);
  c.lineTo(PED_X + 20, top + 34);
  c.stroke();
}

/* ---------- per-frame drawing ---------- */

function drawRays(ctx: CanvasRenderingContext2D, s: State, t: number) {
  // god rays from the gap in the canopy onto the pedestal, stronger with the charge
  const power = 0.55 + s.charge * 0.6 + (s.phase === 2 ? 0.35 : 0) + s.flash * 0.6;
  ctx.globalCompositeOperation = 'lighter';
  const sx = -170;
  const sy = s.st.top - 40;
  for (let i = 0; i < 6; i++) {
    const off = (i - 2.5) * 70;
    const sway = Math.sin(t * 0.35 + i * 1.3) * 18;
    const w0 = 30 + hash(i + 20) * 30;
    const w1 = 90 + hash(i + 30) * 80;
    const tx = PED_X * ZS + off * 1.8 + sway;
    const g = ctx.createLinearGradient(sx, sy, tx, -20);
    const a = (0.06 + 0.05 * Math.sin(t * 0.6 + i * 2)) * power;
    g.addColorStop(0, `rgba(255,250,200,${a * 1.4})`);
    g.addColorStop(0.7, `rgba(230,250,180,${a})`);
    g.addColorStop(1, 'rgba(230,250,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx + off - w0, sy);
    ctx.lineTo(sx + off + w0, sy);
    ctx.lineTo(tx + w1, -10);
    ctx.lineTo(tx - w1, -10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawGroundGlow(ctx: CanvasRenderingContext2D, s: State, t: number) {
  ctx.globalCompositeOperation = 'lighter';
  const k = s.charge + (s.phase === 2 ? 0.5 : 0) + s.flash;
  if (k > 0.01) {
    ctx.save();
    ctx.translate(PED_X - 20, -38);
    ctx.scale(1, 0.2);
    glow(ctx, 0, 0, 300 + k * 120, '160,210,255', 0.25 * k);
    ctx.restore();
    glow(ctx, s.gx, s.gy, 140 + k * 80, '170,220,255', 0.16 * k * (1 + 0.1 * Math.sin(t * 9)));
  }
  // spin ring on the ground plane
  if (s.ring >= 0) {
    const k2 = s.ring / 1.1;
    const r = 40 + easeOutCubic(k2) * 480;
    ctx.save();
    ctx.translate(LINK_X, -16);
    ctx.scale(1, 0.24);
    ctx.strokeStyle = `rgba(150,220,255,${(1 - k2) * 0.9})`;
    ctx.lineWidth = 26 * (1 - k2) + 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${(1 - k2) * 0.9})`;
    ctx.lineWidth = 6 * (1 - k2) + 1;
    ctx.stroke();
    ctx.restore();
    // a swept crescent at waist height
    const sweep = Math.min(1, s.ring / 0.35);
    ctx.save();
    ctx.translate(LINK_X, -150);
    ctx.scale(1, 0.35);
    ctx.strokeStyle = `rgba(190,235,255,${(1 - k2) * 0.8})`;
    ctx.lineWidth = 30 * (1 - k2);
    ctx.beginPath();
    ctx.arc(0, 0, 150 + k2 * 60, -Math.PI / 2, -Math.PI / 2 + sweep * TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawSword(p: Painter, s: State, t: number) {
  const ctx = p.ctx;
  ctx.save();
  if (s.phase === 0) {
    // the stone hides the buried length of the blade
    ctx.beginPath();
    ctx.rect(-2000, -2000, 4000, 2000 + PED_TOP + 1);
    ctx.clip();
  }
  ctx.translate(s.gx, s.gy);
  ctx.rotate(s.ga);
  p.lx = 0.7;
  p.ly = -0.7;
  p.outline = 'rgba(10,14,30,0.85)';
  p.outlineW = 1.4;
  // +x runs from the grip toward the tip
  const g = GRIP / 2;
  // blade with a fuller
  p.part(
    () => {
      ctx.moveTo(g + 10, -6.5);
      ctx.lineTo(g + BLADE - 22, -6.5);
      ctx.lineTo(g + BLADE, 0);
      ctx.lineTo(g + BLADE - 22, 6.5);
      ctx.lineTo(g + 10, 6.5);
      ctx.closePath();
    },
    STEEL[0],
    STEEL[1],
    STEEL[2],
    2,
    6
  );
  ctx.strokeStyle = 'rgba(120,140,190,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g + 14, 0);
  ctx.lineTo(g + BLADE - 40, 0);
  ctx.stroke();
  // blade shine that runs along with the charge
  const shine = s.phase === 0 ? s.charge : 1;
  if (shine > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    const run = ((t * 0.8) % 1) * BLADE;
    ctx.fillStyle = `rgba(200,235,255,${0.5 * shine})`;
    ctx.fillRect(g + 10 + run * 0.9, -7, 26, 14);
    ctx.globalCompositeOperation = 'source-over';
  }
  // grip wrapped in blue, winged crossguard, gold gem, pommel
  p.part(() => capsule(ctx, -g, 0, g, 0, 7, 7), HILT[0], HILT[1], HILT[2], 1.5, 4);
  ctx.strokeStyle = 'rgba(20,18,70,0.8)';
  ctx.lineWidth = 1.5;
  for (let k = -g + 6; k < g; k += 7) {
    ctx.beginPath();
    ctx.moveTo(k, -7);
    ctx.lineTo(k + 4, 7);
    ctx.stroke();
  }
  p.part(
    () => {
      // wings sweep back toward the grip
      ctx.moveTo(g + 14, -6);
      ctx.bezierCurveTo(g + 12, -18, g + 2, -28, g - 14, -32);
      ctx.bezierCurveTo(g - 4, -22, g - 2, -14, g - 2, -6);
      ctx.lineTo(g - 2, 6);
      ctx.bezierCurveTo(g - 2, 14, g - 4, 22, g - 14, 32);
      ctx.bezierCurveTo(g + 2, 28, g + 12, 18, g + 14, 6);
      ctx.closePath();
    },
    HILT[0],
    HILT[1],
    HILT[2],
    2,
    5
  );
  p.part(() => ctx.arc(-g - 4, 0, 8, 0, TAU), HILT[0], HILT[1], HILT[2], 1.5, 4);
  p.outline = '';
  ctx.fillStyle = '#ffd84a';
  ctx.beginPath();
  ctx.moveTo(g + 6, 0);
  ctx.lineTo(g + 11, -5);
  ctx.lineTo(g + 16, 0);
  ctx.lineTo(g + 11, 5);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, g + 11, 0, 14, '255,220,90', 0.6 + 0.3 * Math.sin(t * 4));
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function drawMagic(ctx: CanvasRenderingContext2D, s: State, t: number) {
  ctx.globalCompositeOperation = 'lighter';
  // three golden shards circling the hilt, drawn in as the charge builds
  const k = s.shards;
  if (k > 0.02) {
    const cx = s.gx + Math.cos(s.ga) * (s.phase >= 1 ? 110 : 0);
    const cy = s.gy + Math.sin(s.ga) * (s.phase >= 1 ? 110 : 0);
    const r = lerp(170, 70, clamp(k, 0, 1)) + (s.phase === 2 ? Math.sin(t * 2) * 8 : 0);
    for (let i = 0; i < 3; i++) {
      const a = t * (0.9 + k * 1.4) + (i * TAU) / 3;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.55;
      const size = 16 + k * 12;
      glow(ctx, x, y, size * 3, '255,210,80', 0.35 * k);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 1.5 + i * 2);
      ctx.fillStyle = `rgba(255,226,120,${0.75 * k})`;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.87, size * 0.5);
      ctx.lineTo(-size * 0.87, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,230,${0.8 * k})`;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.45);
      ctx.lineTo(size * 0.39, size * 0.22);
      ctx.lineTo(-size * 0.39, size * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  // radiant burst behind the raised blade
  if (s.phase === 2 || s.flash > 0.02) {
    const tipX = s.gx + Math.cos(s.ga) * (GRIP / 2 + BLADE * 0.7);
    const tipY = s.gy + Math.sin(s.ga) * (GRIP / 2 + BLADE * 0.7);
    const a = (s.phase === 2 ? 0.35 : 0) + s.flash * 0.8;
    glow(ctx, tipX, tipY, 260 + s.flash * 300, '200,235,255', 0.35 * a);
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(t * 0.2);
    for (let i = 0; i < 12; i++) {
      const L = 220 + (i % 2) * 140 + s.flash * 260;
      ctx.rotate(TAU / 12);
      ctx.fillStyle = `rgba(255,250,220,${(0.08 + (i % 2) * 0.04) * a})`;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(L, 0);
      ctx.lineTo(0, 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  // sparkles: 0 white, 1 gold
  for (const q of s.sparks.items) {
    if (q.life <= 0 || q.kind === 3) continue;
    const f = q.life / q.max;
    ctx.globalAlpha = f;
    ctx.fillStyle = q.kind === 0 ? '#eef8ff' : '#ffe07a';
    const sz = q.size * (0.6 + 0.4 * Math.sin(t * 20 + q.x));
    ctx.fillRect(q.x - sz, q.y - 0.5, sz * 2, 1);
    ctx.fillRect(q.x - 0.5, q.y - sz, 1, sz * 2);
    ctx.fillRect(q.x - 1, q.y - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  for (const q of s.sparks.items) {
    if (q.life <= 0 || q.kind !== 3) continue;
    const f = q.life / q.max;
    ctx.globalAlpha = f * 0.35;
    ctx.fillStyle = '#9aa592';
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.size * (1.6 - f * 0.6), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMotes(ctx: CanvasRenderingContext2D, s: State, t: number) {
  ctx.globalCompositeOperation = 'lighter';
  const gold = s.charge + (s.phase === 2 ? 0.6 : 0);
  for (const p of s.motes.items) {
    if (p.life <= 0) continue;
    const f = Math.min(1, p.life / p.max, (p.max - p.life) * 1.5);
    const x = p.x + Math.sin(t * 0.8 + p.rot) * 10;
    // brighter inside the light shafts
    const inLight = Math.max(0, 1 - Math.abs(x - (PED_X * ZS - 60 + (p.y + 400) * -0.25)) / 260);
    ctx.globalAlpha = f * (0.2 + inLight * 0.6);
    ctx.fillStyle = gold > 0.3 && p.kind ? '#ffe68a' : '#e8ffd8';
    ctx.fillRect(x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawLeaves(ctx: CanvasRenderingContext2D, s: State, t: number) {
  ctx.fillStyle = '#2f6a2a';
  for (const p of s.leaves.items) {
    if (p.life <= 0) continue;
    ctx.save();
    ctx.translate(p.x + Math.sin(t * 1.5 + p.rot) * 30, p.y);
    ctx.rotate(p.rot + Math.sin(t * 2 + p.x) * 0.8);
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawFairies(ctx: CanvasRenderingContext2D, s: State, t: number) {
  ctx.globalCompositeOperation = 'lighter';
  const cols = ['255,170,220', '170,220,255', '255,255,210'];
  for (const f of s.fairies) {
    const c = cols[f.hue];
    const flick = 0.8 + 0.2 * Math.sin(t * 13 + f.ph);
    glow(ctx, f.x, f.y, 34, c, 0.45 * flick);
    glow(ctx, f.x, f.y, 9, '255,255,255', 0.9);
    // fluttering wings
    const wing = Math.abs(Math.sin(t * 24 + f.ph));
    ctx.fillStyle = `rgba(${c},0.45)`;
    ctx.beginPath();
    ctx.ellipse(f.x - 7, f.y - 4, 8, 3 + wing * 3, -0.6, 0, TAU);
    ctx.ellipse(f.x + 7, f.y - 4, 8, 3 + wing * 3, 0.6, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- Link ---------- */

function ik(sx: number, sy: number, hx: number, hy: number, l1: number, l2: number, bend: number) {
  const dx = hx - sx;
  const dy = hy - sy;
  const d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.01);
  const a = Math.atan2(dy, dx);
  const c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const off = Math.acos(c) * bend;
  return [sx + Math.cos(a + off) * l1, sy + Math.sin(a + off) * l1] as const;
}

/**
 * Link in two passes: the back pass paints what sits behind the sword (shield, far
 * arm, legs, body, head), the front pass the near arm and hands over the grip.
 */
function drawLink(p: Painter, s: State, t: number, backPass: boolean) {
  const ctx = p.ctx;
  p.lx = 0.72;
  p.ly = -0.69;
  p.outline = 'rgba(8,20,10,0.85)';
  p.outlineW = 1.6;
  const breathe = Math.sin(t * 1.7) * 1.2;
  const lean = s.lean;
  const pelvisY = -128;
  const hip = [LINK_X, pelvisY] as const;
  // world → torso frame
  const cl = Math.cos(-lean);
  const sl = Math.sin(-lean);
  const toT = (x: number, y: number) => {
    const dx = x - hip[0];
    const dy = y - hip[1];
    return [dx * cl - dy * sl, dx * sl + dy * cl] as const;
  };
  // both hands on the grip
  const ca = Math.cos(s.ga);
  const sa = Math.sin(s.ga);
  const [h1x, h1y] = toT(s.gx + ca * 8, s.gy + sa * 8);
  const [h2x, h2y] = toT(s.gx - ca * 12, s.gy - sa * 12);
  const raised = s.phase === 1 || s.phase === 2 || s.phase === 3;

  if (backPass) {
    ctx.fillStyle = 'rgba(0,10,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(LINK_X, -36, 70, 9, 0, 0, TAU);
    ctx.fill();
    // legs: cream leggings and tall brown boots
    lLeg(p, LINK_X - 12, pelvisY + 6, LINK_X - 50, -40, true);
    lLeg(p, LINK_X + 12, pelvisY + 6, LINK_X + 38, -40, false);

    ctx.save();
    ctx.translate(hip[0], hip[1]);
    ctx.rotate(lean);
    // far arm (reaches the lower hand)
    lArm(p, -14, -84 + breathe, raised ? h1x : h2x, raised ? h1y : h2y, true);
    // shield on the back, tilted
    ctx.save();
    ctx.translate(-34, -60 + breathe);
    ctx.rotate(-0.18);
    shield(p);
    ctx.restore();
    // tunic, flared skirt and belt
    p.part(
      () => {
        ctx.moveTo(-24, -92 + breathe);
        ctx.bezierCurveTo(-30, -60, -34, -10, -44, 30);
        ctx.lineTo(-20, 22);
        ctx.lineTo(-6, 34);
        ctx.lineTo(10, 24);
        ctx.lineTo(28, 34);
        ctx.lineTo(40, 26);
        ctx.bezierCurveTo(30, -10, 30, -60, 24, -92 + breathe);
        ctx.bezierCurveTo(8, -100 + breathe, -10, -100 + breathe, -24, -92 + breathe);
        ctx.closePath();
      },
      TUNIC[0],
      TUNIC[1],
      TUNIC[2],
      3,
      10
    );
    p.part(() => ctx.rect(-30, -14, 60, 12), LEATHER[0], LEATHER[1], LEATHER[2], 2, 4);
    // strap for the shield across the chest
    p.part(
      () => {
        ctx.moveTo(-24, -86 + breathe);
        ctx.lineTo(-16, -92 + breathe);
        ctx.lineTo(26, -18);
        ctx.lineTo(18, -12);
        ctx.closePath();
      },
      LEATHER[0],
      LEATHER[1],
      LEATHER[2],
      1.5,
      3
    );
    if (!p.glow) {
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(-4, -13, 10, 10);
      ctx.fillStyle = '#7a5a10';
      ctx.fillRect(-1, -10, 4, 4);
    }
    // collar of the undershirt
    p.part(() => ctx.ellipse(2, -94 + breathe, 16, 6, 0, 0, TAU), CREAM[0], CREAM[1], CREAM[2], 1.5, 3);
    // head, looking at the blade
    ctx.save();
    ctx.translate(6, -120 + breathe);
    const look = raised ? -0.35 : 0.22 - s.charge * 0.1;
    ctx.rotate(look - lean * 0.5);
    linkHead(p, t, s);
    ctx.restore();
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(hip[0], hip[1]);
    ctx.rotate(lean);
    lArm(p, 16, -84 + breathe, raised ? h2x : h1x, raised ? h2y : h1y, false);
    ctx.restore();
  }
  p.outline = '';
}

function lLeg(p: Painter, hx: number, hy: number, fx: number, fy: number, back: boolean) {
  const ctx = p.ctx;
  const C = back ? ([CREAM[1], CREAM[2], '#6e6450'] as const) : CREAM;
  const B = back ? ([LEATHER[1], LEATHER[2], '#1c1008'] as const) : LEATHER;
  const [kx, ky] = ik(hx, hy, fx, fy - 6, 48, 48, -1);
  p.part(() => capsule(ctx, hx, hy, kx, ky, 11, 9), C[0], C[1], C[2], 2, 4);
  // tall boot from below the knee
  p.part(
    () => {
      capsule(ctx, lerp(kx, fx, 0.1), lerp(ky, fy, 0.1), fx, fy - 6, 11, 9);
      ctx.moveTo(fx - 12, fy - 12);
      ctx.lineTo(fx + 20, fy - 6);
      ctx.quadraticCurveTo(fx + 24, fy + 2, fx + 16, fy + 3);
      ctx.lineTo(fx - 12, fy + 3);
      ctx.closePath();
    },
    B[0],
    B[1],
    B[2],
    2,
    5
  );
}

function lArm(p: Painter, sx: number, sy: number, hx: number, hy: number, back: boolean) {
  const ctx = p.ctx;
  const C = back ? ([CREAM[1], CREAM[2], '#6e6450'] as const) : CREAM;
  const T = back ? TUNIC_D : TUNIC;
  const B = back ? ([LEATHER[1], LEATHER[2], '#1c1008'] as const) : LEATHER;
  // keep the hand on a reachable point so it never floats free of the arm
  const d = Math.hypot(hx - sx, hy - sy);
  const reach = 98;
  if (d > reach) {
    hx = sx + ((hx - sx) / d) * reach;
    hy = sy + ((hy - sy) / d) * reach;
  }
  const [ex, ey] = ik(sx, sy, hx, hy, 50, 49, 1);
  // tunic sleeve over the shoulder, then the light undershirt, then a leather bracer
  p.part(() => capsule(ctx, sx, sy, lerp(sx, ex, 0.55), lerp(sy, ey, 0.55), 12, 10), T[0], T[1], T[2], 2, 4);
  p.part(() => capsule(ctx, lerp(sx, ex, 0.5), lerp(sy, ey, 0.5), ex, ey, 9, 8), C[0], C[1], C[2], 1.5, 3);
  p.part(() => capsule(ctx, ex, ey, lerp(ex, hx, 0.85), lerp(ey, hy, 0.85), 9, 8), B[0], B[1], B[2], 1.5, 3);
  p.part(() => ctx.arc(hx, hy, 8, 0, TAU), B[0], B[1], B[2], 1.5, 3);
}

function shield(p: Painter) {
  const ctx = p.ctx;
  const outline = () => {
    ctx.moveTo(-38, -46);
    ctx.quadraticCurveTo(0, -58, 38, -46);
    ctx.lineTo(36, 10);
    ctx.quadraticCurveTo(26, 44, 0, 62);
    ctx.quadraticCurveTo(-26, 44, -36, 10);
    ctx.closePath();
  };
  p.part(outline, '#eef2f8', '#aab2c2', '#5d6578', 2, 5);
  ctx.save();
  ctx.scale(0.84, 0.86);
  ctx.translate(0, 2);
  p.part(outline, '#5f86e0', '#2e53b0', '#16296a', 2, 8);
  ctx.restore();
  if (p.glow) return;
  // red bird crest, stylised as a swooping wing shape
  ctx.fillStyle = '#d23b3b';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.bezierCurveTo(10, -16, 24, -14, 28, -4);
  ctx.bezierCurveTo(18, -6, 10, 0, 6, 8);
  ctx.lineTo(4, 30);
  ctx.lineTo(0, 36);
  ctx.lineTo(-4, 30);
  ctx.lineTo(-6, 8);
  ctx.bezierCurveTo(-10, 0, -18, -6, -28, -4);
  ctx.bezierCurveTo(-24, -14, -10, -16, 0, -6);
  ctx.closePath();
  ctx.fill();
  // a single small gold chevron above
  ctx.fillStyle = '#f2cf4a';
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.lineTo(9, -24);
  ctx.lineTo(-9, -24);
  ctx.closePath();
  ctx.fill();
}

function linkHead(p: Painter, t: number, s: State) {
  const ctx = p.ctx;
  // neck
  p.part(() => capsule(ctx, -2, 22, 0, 6, 7, 7), SKIN[0], SKIN[1], SKIN[2], 1.5, 3);
  // long cap flowing back, tip hanging down
  const sway = Math.sin(t * 1.8) * 3 + (s.phase === 1 ? -8 : 0);
  p.part(
    () => {
      ctx.moveTo(-18, -8);
      ctx.bezierCurveTo(-20, -30, 2, -40, 18, -26);
      ctx.bezierCurveTo(8, -24, -6, -16, -16, 4);
      ctx.bezierCurveTo(-26, 16, -40 + sway, 30, -46 + sway, 50);
      ctx.bezierCurveTo(-50 + sway, 30, -44, 10, -32, -4);
      ctx.closePath();
    },
    TUNIC[0],
    TUNIC[1],
    TUNIC[2],
    2.5,
    7
  );
  // face
  const face = () => {
    ctx.moveTo(-14, -10);
    ctx.bezierCurveTo(-12, -24, 10, -26, 18, -14);
    ctx.lineTo(22, -2);
    ctx.lineTo(19, 1);
    ctx.bezierCurveTo(20, 10, 14, 18, 4, 18);
    ctx.bezierCurveTo(-8, 18, -16, 8, -14, -10);
    ctx.closePath();
  };
  p.part(face, SKIN[0], SKIN[1], SKIN[2], 2, 6);
  // long pointed ear
  p.part(
    () => {
      ctx.moveTo(-6, -4);
      ctx.lineTo(-28, -16);
      ctx.lineTo(-10, 6);
      ctx.closePath();
    },
    SKIN[0],
    SKIN[1],
    SKIN[2],
    1.5,
    3
  );
  // blond hair: sweep over the brow, bangs and a lock at the side
  p.part(
    () => {
      ctx.moveTo(-16, -8);
      ctx.bezierCurveTo(-18, -26, 6, -32, 20, -16);
      ctx.lineTo(16, -12);
      ctx.lineTo(14, -2);
      ctx.lineTo(8, -12);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, -12);
      ctx.lineTo(-6, -4);
      ctx.lineTo(-10, 12);
      ctx.closePath();
    },
    HAIR[0],
    HAIR[1],
    HAIR[2],
    2,
    5
  );
  // cap band over the hair
  p.part(
    () => {
      ctx.moveTo(-18, -12);
      ctx.bezierCurveTo(-14, -30, 8, -34, 20, -22);
      ctx.bezierCurveTo(6, -26, -8, -22, -18, -12);
      ctx.closePath();
    },
    TUNIC[0],
    TUNIC[1],
    TUNIC[2],
    2,
    4
  );
  if (p.glow) return;
  // eye, brow, mouth
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(12, -4, 3.4, 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2f7ad6';
  ctx.beginPath();
  ctx.arc(13.4, -4, 2.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#10223a';
  ctx.beginPath();
  ctx.arc(13.8, -4, 1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#8a5a1a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(8, -10);
  ctx.lineTo(17, -9);
  ctx.moveTo(12, 11);
  ctx.lineTo(17, 10);
  ctx.stroke();
}
