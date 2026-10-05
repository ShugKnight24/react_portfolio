import { createCanvasScene, clamp, damp, easeInOutCubic, lerp, rand, tone, TAU } from './runtime';
import type { SceneEnv } from './runtime';
import type { MountScene } from './types';
import { burst, emit, freeCanvas, glow, glowSprite, hit, makePool, mulberry, stepPool } from './theater-kit';
import type { Pool } from './theater-kit';

/**
 * Caucasus Origins: Azerbaijan from a high crest. Faceted ridges of the Greater Caucasus
 * step down to the Caspian; Baku sits on its bay with the three Flame Towers burning on the
 * hill, a stone watchtower keeps the old pass and the hillside gas fire of Yanar Dag never
 * goes out. A lone traveller stands on the crest with his staff, cloak in the wind, looking
 * east over the water, the road that led him across continents. Holding brings the sunrise
 * up over the Caspian and lets it sink back to night on release; a tap makes the land of
 * fire flare: the towers run a wave of flame and Yanar Dag throws embers into the sky.
 */

type RGB = [number, number, number];

interface Ridge {
  pts: number[]; // y as fractions of h, evenly spaced from x0 to x1 (fractions of w)
  x0: number;
  x1: number;
  par: number;
  night: RGB;
  dawn: RGB;
  snow: number; // snowline as a fraction of h, or 0
  shore: number;
  floor: number;
  haze: number;
}

interface Bird {
  x: number;
  y: number;
  r: number;
  ph: number;
  sp: number;
}

interface State {
  dawn: number;
  held: boolean;
  holdT: number;
  touched: boolean;
  idle: number;
  amb: number;
  px: number;
  flare: number;
  wave: number;
  note: number;
  ridges: Ridge[];
  stars: { x: number; y: number; r: number; ph: number }[];
  birds: Bird[];
  mist: { x: number; y: number; w: number; sp: number }[];
  parts: Pool;
  autoT: number;
  shoot: number;
  sx: number;
  sy: number;
  hor: number;
  sun: HTMLCanvasElement;
  moon: HTMLCanvasElement;
  fire: HTMLCanvasElement;
  ember: HTMLCanvasElement;
  mistS: HTMLCanvasElement;
  vignette: CanvasGradient | null;
}

const mix = (a: RGB, b: RGB, k: number, m = 1) =>
  `rgb(${Math.round(lerp(a[0], b[0], k) * m)},${Math.round(lerp(a[1], b[1], k) * m)},${Math.round(lerp(a[2], b[2], k) * m)})`;
const mixA = (a: RGB, b: RGB, k: number, alpha: number) =>
  `rgba(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))},${alpha.toFixed(3)})`;

// Shur mode on D, close to the scale a tar player would reach for
const SHUR = [293.66, 311.13, 349.23, 392, 440, 466.16, 523.25, 587.33];
const MOTIF = [0, 2, 3, 4, 3, 2, 1, 0, 4, 5, 4, 3];

function makeRidge(seed: number, n: number, x0: number, x1: number, top: number, bottom: number, rough: number, shape: (u: number) => number) {
  const r = mulberry(seed);
  // midpoint displacement for craggy profiles
  let pts = [0.5, 0.5];
  let amp = 1;
  while (pts.length < n) {
    const next: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      next.push(pts[i]);
      next.push((pts[i] + pts[i + 1]) / 2 + (r() - 0.5) * amp);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
    amp *= rough;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    lo = Math.min(lo, p);
    hi = Math.max(hi, p);
  }
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const u = i / (pts.length - 1);
    const v = (pts[i] - lo) / (hi - lo || 1);
    out.push(lerp(bottom, top, shape(u) * (0.4 + 0.6 * v)));
  }
  return { pts: out, x0, x1 };
}

/* ---------- drawing ---------- */

function drawRidge(c: CanvasRenderingContext2D, rg: Ridge, w: number, h: number, d: number, off: number, light: number) {
  const n = rg.pts.length;
  const X = (i: number) => (rg.x0 + ((rg.x1 - rg.x0) * i) / (n - 1)) * w + off;
  const Y = (i: number) => rg.pts[i] * h;
  const base = rg.night;
  const lit = rg.dawn;
  const bottom = rg.floor >= 1 ? h + 4 : rg.floor * h;
  c.beginPath();
  c.moveTo(X(0), bottom);
  for (let i = 0; i < n; i++) c.lineTo(X(i), Y(i));
  // the shore runs back toward the land as it comes forward
  c.lineTo(X(n - 1) - (bottom - Y(n - 1)) * rg.shore, bottom);
  c.closePath();
  const g = c.createLinearGradient(0, h * 0.2, 0, h);
  g.addColorStop(0, mix(base, lit, d * 0.6));
  g.addColorStop(1, mix(base, lit, d * 0.25, 0.55));
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  // low poly facets: slopes facing the light (east at dawn, the moon at night) are brighter
  const depth = h * 0.09;
  for (let i = 0; i < n - 1; i++) {
    const dx = X(i + 1) - X(i);
    const dy = Y(i + 1) - Y(i);
    const slope = dy / (Math.abs(dx) + 0.001);
    const face = clamp(slope * light, -1, 1);
    if (Math.abs(face) < 0.08) continue;
    const top = Math.min(Y(i), Y(i + 1));
    const fg = c.createLinearGradient(0, top, 0, top + depth * 1.2);
    fg.addColorStop(0, face > 0 ? mixA([190, 205, 255], [255, 180, 120], d, face * (0.12 + d * 0.22)) : `rgba(0,0,12,${(-face * 0.4).toFixed(3)})`);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fg;
    c.beginPath();
    c.moveTo(X(i), Y(i));
    c.lineTo(X(i + 1), Y(i + 1));
    c.lineTo(X(i + 1) + depth * 0.25 * Math.sign(light), Y(i + 1) + depth);
    c.lineTo(X(i) + depth * 0.25 * Math.sign(light), Y(i) + depth);
    c.closePath();
    c.fill();
  }
  // snow above the snowline with a ragged lower edge
  if (rg.snow > 0) {
    const sl = rg.snow * h;
    c.beginPath();
    c.moveTo(X(0), 0);
    for (let i = 0; i < n; i++) c.lineTo(X(i), sl + Math.sin(i * 2.7) * h * 0.012 + Math.sin(i * 0.9) * h * 0.01);
    c.lineTo(X(n - 1), 0);
    c.closePath();
    c.fillStyle = mix([150, 165, 200], [255, 226, 205], d);
    c.globalAlpha = 0.92;
    c.fill();
    c.globalAlpha = 1;
    // shadowed snow faces
    for (let i = 0; i < n - 1; i++) {
      const dx = X(i + 1) - X(i);
      const dy = Y(i + 1) - Y(i);
      const face = (dy / (Math.abs(dx) + 0.001)) * light;
      if (face > -0.1) continue;
      c.fillStyle = mixA([40, 50, 90], [120, 90, 140], d, clamp(-face * 0.5, 0, 0.55));
      c.beginPath();
      c.moveTo(X(i), Y(i));
      c.lineTo(X(i + 1), Y(i + 1));
      c.lineTo(X(i + 1) - h * 0.02, Y(i + 1) + h * 0.07);
      c.lineTo(X(i) - h * 0.02, Y(i) + h * 0.07);
      c.closePath();
      c.fill();
    }
  }
  // atmospheric haze toward the bottom of far ridges
  if (rg.haze > 0) {
    const hz = c.createLinearGradient(0, h * 0.3, 0, h * 0.7);
    hz.addColorStop(0, 'rgba(0,0,0,0)');
    hz.addColorStop(1, mixA([40, 50, 90], [230, 150, 130], d, rg.haze));
    c.fillStyle = hz;
    c.fillRect(X(0), h * 0.3, X(n - 1) - X(0), h * 0.7);
  }
  c.restore();
}

/** Height of a ridge at screen x, as a y in pixels */
function ridgeY(rg: Ridge, w: number, h: number, x: number, off: number) {
  const n = rg.pts.length;
  const u = ((x - off) / w - rg.x0) / (rg.x1 - rg.x0);
  const f = clamp(u, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  return lerp(rg.pts[i], rg.pts[i + 1], f - i) * h;
}

function flameTower(c: CanvasRenderingContext2D, x: number, base: number, H: number, W: number, flip: number) {
  // a tall curved flame: one side nearly straight, the other swelling and tapering to a tip
  c.beginPath();
  c.moveTo(x - W * 0.5 * flip, base);
  c.bezierCurveTo(x - W * 0.55 * flip, base - H * 0.5, x - W * 0.35 * flip, base - H * 0.85, x + W * 0.08 * flip, base - H);
  c.bezierCurveTo(x + W * 0.3 * flip, base - H * 0.8, x + W * 0.75 * flip, base - H * 0.45, x + W * 0.5 * flip, base);
  c.closePath();
}

/* ---------- interaction ---------- */

function press(s: State, env: SceneEnv) {
  s.held = true;
  s.holdT = 0;
  s.touched = true;
  s.idle = 0;
  s.flare = 1;
  s.wave = 0;
  burst(s.parts, 40, s.sx, s.sy, -Math.PI / 2, 0.7, env.h * 0.5, 2.6, 2.4, 0, 1.2, -env.h * 0.04);
  const bus = env.audio();
  if (bus) {
    hit(bus, { freq: 420, q: 0.5, gain: 0.25, decay: 0.8 });
    const f = SHUR[MOTIF[s.note % MOTIF.length]];
    s.note++;
    // a plucked string: bright attack, a fifth and an octave fading fast
    tone(bus, f, { type: 'triangle', attack: 0.003, decay: 1.1, gain: 0.16 });
    tone(bus, f * 2, { type: 'sine', attack: 0.002, decay: 0.5, gain: 0.07 });
    tone(bus, f * 3, { type: 'sine', attack: 0.002, decay: 0.25, gain: 0.03 });
    tone(bus, f * 1.003, { type: 'sawtooth', attack: 0.002, decay: 0.18, gain: 0.025 });
  }
  env.wake(3000);
}

function release(s: State, env: SceneEnv) {
  if (!s.held) return;
  s.held = false;
  env.wake(2500);
}

/* ---------- scene ---------- */

export const mount: MountScene = (container, opts) =>
  createCanvasScene<State>(container, opts, {
    cursor: 'pointer',
    posterTime: 2.6,
    init: () => {
      const far = makeRidge(4, 80, -0.08, 0.8, 0.1, 0.6, 0.64, (u) => clamp(1 - Math.pow(u, 1.7), 0, 1));
      const mid = makeRidge(9, 56, -0.08, 0.62, 0.3, 0.63, 0.6, (u) => clamp(1 - Math.pow(u * 1.05, 1.5), 0, 1));
      const near = makeRidge(17, 44, -0.08, 0.5, 0.44, 0.7, 0.55, (u) => clamp(1 - Math.pow(u * 1.02, 1.3), 0, 1));
      const crest = makeRidge(23, 32, -0.1, 0.56, 0.62, 1.05, 0.4, (u) => clamp(1 - Math.pow(u, 3) * 1.05, 0, 1));
      const ridges: Ridge[] = [
        { ...far, par: 0.015, night: [52, 62, 98], dawn: [176, 120, 140], snow: 0.3, shore: 0.6, floor: 0.6, haze: 0.5 },
        { ...mid, par: 0.03, night: [30, 38, 66], dawn: [118, 74, 92], snow: 0.4, shore: 2.5, floor: 0.62, haze: 0.4 },
        { ...near, par: 0.05, night: [17, 22, 40], dawn: [70, 42, 56], snow: 0, shore: 1.1, floor: 1, haze: 0.25 },
        { ...crest, par: 0.09, night: [6, 8, 16], dawn: [24, 14, 22], snow: 0, shore: 0.8, floor: 1, haze: 0 },
      ];
      return {
        dawn: 0.42,
        held: false,
        holdT: 0,
        touched: false,
        idle: 0,
        amb: 0,
        px: 0,
        flare: 0,
        wave: 1,
        note: 0,
        ridges,
        stars: Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.pow(Math.random(), 1.4) * 0.55, r: rand(0.5, 1.6), ph: rand(0, TAU) })),
        birds: Array.from({ length: 2 }, (_, i) => ({ x: 0.42 + i * 0.1, y: 0.22 + i * 0.06, r: rand(0.04, 0.07), ph: rand(0, TAU), sp: rand(0.25, 0.4) * (i ? -1 : 1) })),
        mist: Array.from({ length: 7 }, (_, i) => ({ x: Math.random(), y: 0.5 + (i % 3) * 0.05, w: rand(0.2, 0.4), sp: rand(0.004, 0.012) })),
        parts: makePool(320),
        autoT: 0,
        shoot: 0,
        sx: 0,
        sy: 0,
        hor: 0,
        sun: glowSprite(128, [
          [0, 'rgba(255,250,225,1)'],
          [0.12, 'rgba(255,220,150,0.9)'],
          [0.35, 'rgba(255,150,90,0.35)'],
          [1, 'rgba(255,90,80,0)'],
        ]),
        moon: glowSprite(96, [
          [0, 'rgba(240,244,255,0.9)'],
          [0.3, 'rgba(160,190,255,0.25)'],
          [1, 'rgba(120,150,255,0)'],
        ]),
        fire: glowSprite(64, [
          [0, 'rgba(255,240,190,1)'],
          [0.3, 'rgba(255,160,60,0.7)'],
          [0.7, 'rgba(230,60,20,0.2)'],
          [1, 'rgba(180,20,0,0)'],
        ]),
        ember: glowSprite(24, [
          [0, 'rgba(255,230,170,1)'],
          [0.5, 'rgba(255,140,50,0.5)'],
          [1, 'rgba(255,80,20,0)'],
        ]),
        mistS: glowSprite(64, [
          [0, 'rgba(255,255,255,0.5)'],
          [1, 'rgba(255,255,255,0)'],
        ]),
        vignette: null,
      };
    },
    resize: (s, env) => {
      const { ctx, w, h } = env;
      s.hor = h * 0.6;
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.5)');
      s.vignette = v;
    },
    update: (s, env, dt) => {
      const { w, h, pointer } = env;
      s.amb += dt;
      s.idle += dt;
      stepPool(s.parts, dt);
      s.flare = Math.max(0, s.flare - dt * 0.7);
      s.wave = Math.min(1, s.wave + dt * 0.55);
      const auto = !env.interactive || !s.touched || s.idle > 8;
      if (s.held) {
        s.holdT += dt;
        // keep a still frame scene running for as long as the hold lasts
        if (env.reducedMotion) env.wake(300);
        s.dawn = Math.min(1, s.dawn + dt * 0.32);
      } else if (auto && !env.reducedMotion) {
        // a slow day: night, a long dawn, back to night
        s.autoT += dt;
        const target = 0.5 - 0.5 * Math.cos((s.autoT / 46) * TAU);
        s.dawn = damp(s.dawn, lerp(0.15, 0.95, target), 0.6, dt);
      } else if (s.touched) s.dawn = Math.max(0.12, s.dawn - dt * 0.05);
      const tx = env.interactive && pointer.inside ? (pointer.x / w - 0.5) * 2 : Math.sin(s.amb * 0.1) * 0.3;
      s.px = damp(s.px, tx, 2, dt);

      // Yanar Dag burns on the near ridge
      const nr = s.ridges[2];
      s.sx = w * 0.3 - s.px * w * nr.par;
      s.sy = ridgeY(nr, w, h, w * 0.3, -s.px * w * nr.par) + h * 0.02;
      if (Math.random() < dt * (6 + s.flare * 40)) {
        emit(s.parts, s.sx + rand(-w * 0.03, w * 0.03), s.sy - h * 0.01, rand(-8, 8), -rand(h * 0.05, h * 0.12) * (1 + s.flare), rand(1.6, 3.2), rand(1.2, 2.2), 0, 0.4, -h * 0.01);
      }
      for (const b of s.birds) {
        b.ph += dt * b.sp;
        b.x += dt * b.sp * 0.02;
      }
      for (const m of s.mist) m.x = ((m.x + dt * m.sp + 0.4) % 1.8) - 0.4;
      // a shooting star now and then at night
      s.shoot -= dt * (s.shoot > 0 ? 1.6 : 1);
      if (s.shoot < -rand(6, 14) && s.dawn < 0.5) s.shoot = 1;
    },
    draw: (s, env, t) => {
      const { ctx, w, h } = env;
      const d = easeInOutCubic(s.dawn);
      const hor = s.hor;

      // sky: from deep night to a Caspian sunrise in the east (right)
      const sky = ctx.createLinearGradient(0, 0, 0, hor);
      sky.addColorStop(0, mix([4, 7, 20], [40, 48, 104], d));
      sky.addColorStop(0.5, mix([10, 18, 44], [150, 96, 150], d));
      sky.addColorStop(0.85, mix([22, 32, 66], [244, 150, 120], d));
      sky.addColorStop(1, mix([40, 46, 80], [255, 200, 140], d));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, hor + 2);
      const east = ctx.createRadialGradient(w * 0.84, hor, 0, w * 0.84, hor, w * 0.7);
      east.addColorStop(0, `rgba(255,190,120,${(0.6 * d).toFixed(3)})`);
      east.addColorStop(1, 'rgba(255,120,120,0)');
      ctx.fillStyle = east;
      ctx.fillRect(0, 0, w, hor + 2);

      // stars and the moon fade with the light
      const night = 1 - d;
      ctx.fillStyle = '#eef2ff';
      for (const st of s.stars) {
        const a = night * (0.4 + 0.4 * Math.sin(t * 1.4 + st.ph));
        if (a < 0.03) continue;
        ctx.globalAlpha = a;
        ctx.fillRect(st.x * w - s.px * 3, st.y * hor, st.r, st.r);
      }
      ctx.globalAlpha = 1;
      if (s.shoot > 0) {
        const k = 1 - s.shoot;
        const x = w * (0.25 + k * 0.3);
        const y = h * (0.06 + k * 0.12);
        ctx.strokeStyle = `rgba(255,255,255,${(s.shoot * night).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - w * 0.06, y - h * 0.024);
        ctx.stroke();
      }
      const mx = w * 0.2 - s.px * 4;
      const my = h * 0.14;
      const mr = Math.min(w, h) * 0.035;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.moon, mx, my, mr * 7, night * 0.7);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.25 + night * 0.75;
      ctx.fillStyle = '#f2f4fb';
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = mix([12, 20, 46], [120, 90, 150], d);
      ctx.beginPath();
      ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.92, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      // the sun climbing out of the sea
      const sunX = w * 0.84 - s.px * 2;
      const sunR = Math.min(w, h) * 0.05;
      const sunY = hor + sunR * 1.2 - d * h * 0.2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, hor);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.sun, sunX, sunY, sunR * 6, d);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = mixA([255, 140, 90], [255, 238, 200], d, clamp(d * 1.4, 0, 1));
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, TAU);
      ctx.fill();
      ctx.restore();

      // birds riding the thermals
      ctx.strokeStyle = mix([20, 26, 44], [60, 34, 40], d);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (const b of s.birds) {
        const bx = (((b.x + Math.cos(b.ph) * b.r) % 1.2) + 1.2) % 1.2 * w - w * 0.1;
        const by = (b.y + Math.sin(b.ph) * b.r * 0.4) * h;
        const flap = Math.sin(t * 5 + b.ph * 3) * 0.5 + 0.2;
        const span = Math.min(w, h) * 0.022;
        ctx.beginPath();
        ctx.moveTo(bx - span, by - flap * span * 0.6);
        ctx.quadraticCurveTo(bx - span * 0.4, by - span * 0.3, bx, by);
        ctx.quadraticCurveTo(bx + span * 0.4, by - span * 0.3, bx + span, by - flap * span * 0.6);
        ctx.stroke();
      }

      // the Caspian
      const sea = ctx.createLinearGradient(0, hor, 0, h);
      sea.addColorStop(0, mix([26, 34, 66], [236, 160, 130], d));
      sea.addColorStop(0.3, mix([12, 18, 40], [90, 70, 110], d));
      sea.addColorStop(1, mix([4, 6, 16], [26, 22, 44], d));
      ctx.fillStyle = sea;
      ctx.fillRect(0, hor, w, h - hor);
      // light path on the water under the sun or the moon
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 70; i++) {
        const k = i / 70;
        const y = hor + 2 + Math.pow(k, 1.6) * (h - hor);
        const spread = 6 + k * w * 0.12;
        const wob = Math.sin(t * 1.6 + i * 1.7) * spread;
        const lenS = 6 + k * 40;
        ctx.fillStyle = mixA([170, 190, 255], [255, 210, 150], d, (0.35 + 0.3 * Math.sin(t * 3 + i)) * (0.4 + d * 0.6));
        ctx.fillRect(sunX + wob - lenS / 2, y, lenS, 1 + k * 1.5);
      }
      // oil rigs and ships far out, blinking
      for (let i = 0; i < 6; i++) {
        const x = w * (0.7 + i * 0.05) + Math.sin(i * 7) * 10;
        const on = Math.sin(t * (1.5 + i * 0.3) + i) > -0.3 ? 1 : 0.3;
        glow(ctx, s.ember, x, hor + 2 + (i % 2), 3.5, on * (0.4 + night * 0.6));
      }
      ctx.globalCompositeOperation = 'source-over';
      // wave lines
      ctx.strokeStyle = mixA([120, 140, 200], [255, 200, 170], d, 0.18);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 40; i++) {
        const k = ((i * 0.618 + t * 0.01) % 1);
        const y = hor + 3 + Math.pow(k, 1.8) * (h - hor);
        const x = ((i * 137.7 + t * (6 + i % 4)) % (w + 80)) - 40;
        const len = 10 + k * 50;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + len / 2, y - 1.5 - k * 2, x + len, y);
      }
      ctx.stroke();

      // the ranges, back to front, with mist between them
      const [far, mid, near, crest] = s.ridges;
      drawRidge(ctx, far, w, h, d, -s.px * w * far.par, 1);
      for (const m of s.mist.slice(0, 3)) {
        ctx.globalAlpha = 0.18 + d * 0.1;
        ctx.drawImage(s.mistS, m.x * w, m.y * h - h * 0.04, m.w * w, h * 0.08);
      }
      ctx.globalAlpha = 1;

      // Baku on the bay: the hill, TV tower, the boulevard lights and the Flame Towers
      const hillX = w * 0.66 - s.px * w * 0.035;
      const hillTop = hor - h * 0.035;
      ctx.fillStyle = mix([14, 18, 34], [70, 44, 60], d);
      ctx.beginPath();
      ctx.moveTo(w * 0.42, hor + 1);
      ctx.bezierCurveTo(w * 0.5, hor - h * 0.01, hillX - w * 0.1, hillTop, hillX, hillTop);
      ctx.bezierCurveTo(hillX + w * 0.06, hillTop, hillX + w * 0.08, hor - h * 0.01, hillX + w * 0.14, hor + 1);
      ctx.closePath();
      ctx.fill();
      // city blocks along the shore
      const r = mulberry(3);
      for (let i = 0; i < 30; i++) {
        const bx = lerp(w * 0.45, w * 0.82, r()) - s.px * w * 0.035;
        const bh = h * lerp(0.008, 0.03, r());
        const bw = w * lerp(0.006, 0.014, r());
        const gy = hor + 1 - (bx > hillX - w * 0.1 && bx < hillX + w * 0.1 ? 0 : 0);
        ctx.fillStyle = mix([10, 14, 28], [60, 40, 56], d);
        ctx.fillRect(bx, gy - bh, bw, bh);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 70; i++) {
        const bx = lerp(w * 0.43, w * 0.83, (i * 0.618) % 1) - s.px * w * 0.035;
        const by = hor - ((i * 0.37) % 1) * h * 0.02;
        ctx.fillStyle = i % 4 === 0 ? 'rgba(255,240,200,0.9)' : 'rgba(255,190,110,0.7)';
        ctx.globalAlpha = (0.35 + night * 0.65) * (0.6 + 0.4 * Math.sin(t * 2 + i));
        ctx.fillRect(bx, by, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // TV tower on the ridge with red lights
      const tvx = hillX - w * 0.085;
      const tvb = hor - h * 0.012;
      const tvh = h * 0.13;
      ctx.fillStyle = mix([12, 16, 30], [60, 40, 56], d);
      ctx.beginPath();
      ctx.moveTo(tvx - 4, tvb);
      ctx.lineTo(tvx - 1.2, tvb - tvh);
      ctx.lineTo(tvx + 1.2, tvb - tvh);
      ctx.lineTo(tvx + 4, tvb);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(tvx - 4, tvb - tvh * 0.7, 8, tvh * 0.06);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.ember, tvx, tvb - tvh, 5, Math.sin(t * 2.4) > 0 ? 0.9 : 0.2);
      ctx.globalCompositeOperation = 'source-over';
      // three flame towers
      const FT = [
        [hillX - w * 0.03, h * 0.15, w * 0.028, -1],
        [hillX + w * 0.026, h * 0.15, w * 0.028, 1],
        [hillX - w * 0.002, h * 0.19, w * 0.032, 1],
      ];
      for (let i = 0; i < 3; i++) {
        const [fx, fh, fw, flip] = FT[i];
        flameTower(ctx, fx, hillTop + 2, fh, fw, flip);
        const glass = ctx.createLinearGradient(fx - fw, 0, fx + fw, 0);
        glass.addColorStop(0, mix([16, 22, 44], [26, 18, 34], d));
        glass.addColorStop(0.6, mix([30, 40, 70], [52, 36, 60], d));
        glass.addColorStop(0.85, mix([30, 40, 70], [230, 160, 130], d));
        glass.addColorStop(1, mix([10, 14, 30], [44, 30, 50], d));
        ctx.fillStyle = glass;
        ctx.fill();
        // the LED facades burn at night and run a wave of fire on a tap
        ctx.save();
        ctx.clip();
        const led = clamp(night * 1.2 + s.flare * 0.8, 0, 1);
        if (led > 0.02) {
          ctx.globalCompositeOperation = 'lighter';
          const rows = 18;
          for (let j = 0; j < rows; j++) {
            const y = hillTop + 2 - (fh * (j + 0.5)) / rows;
            const u = j / rows;
            const tongue = 0.5 + 0.5 * Math.sin(t * 6 - u * 9 + i * 1.3 + Math.sin(t * 2.3 + u * 4) * 1.2);
            const sweep = s.wave < 1 ? clamp(1 - Math.abs(u - s.wave * 1.3) * 4, 0, 1) : 0;
            const a = led * (0.25 + 0.55 * tongue * (1 - u * 0.6) + sweep * 0.9);
            ctx.fillStyle = `rgba(255,${Math.round(90 + 120 * tongue * (1 - u))},${Math.round(30 + 40 * sweep)},${clamp(a, 0, 1).toFixed(3)})`;
            ctx.fillRect(fx - fw, y - fh / rows / 2, fw * 2, fh / rows - 1);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, s.fire, hillX, hillTop - h * 0.08, h * 0.14, (night * 0.35 + s.flare * 0.5) * 0.8);
      // the towers' reflection in the bay
      ctx.fillStyle = `rgba(255,140,60,${(0.25 * night + s.flare * 0.3).toFixed(3)})`;
      for (let i = 0; i < 14; i++) {
        const y = hor + 3 + i * 4;
        const wob = Math.sin(t * 2 + i) * 4;
        ctx.fillRect(hillX - w * 0.025 + wob, y, w * 0.05 * (1 - i / 16), 1.5);
      }
      ctx.globalCompositeOperation = 'source-over';

      drawRidge(ctx, mid, w, h, d, -s.px * w * mid.par, 1);
      // stone watchtower on a mid ridge peak, the slit window lit
      const wtx = w * 0.12 - s.px * w * mid.par;
      const wty = ridgeY(mid, w, h, wtx, -s.px * w * mid.par) + 2;
      const tw = Math.max(8, w * 0.014);
      const th = tw * 3.4;
      ctx.fillStyle = mix([20, 26, 46], [96, 62, 70], d);
      ctx.beginPath();
      ctx.moveTo(wtx - tw * 0.6, wty);
      ctx.lineTo(wtx - tw * 0.42, wty - th);
      ctx.lineTo(wtx + tw * 0.42, wty - th);
      ctx.lineTo(wtx + tw * 0.6, wty);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = mix([12, 16, 30], [60, 36, 44], d);
      ctx.beginPath();
      ctx.moveTo(wtx - tw * 0.56, wty - th);
      ctx.lineTo(wtx, wty - th - tw * 0.8);
      ctx.lineTo(wtx + tw * 0.56, wty - th);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,214,140,${(0.4 + night * 0.6).toFixed(3)})`;
      ctx.fillRect(wtx - 1, wty - th * 0.7, 2, th * 0.22);

      for (const m of s.mist.slice(3)) {
        ctx.globalAlpha = 0.14 + d * 0.08;
        ctx.drawImage(s.mistS, m.x * w, m.y * h + h * 0.04, m.w * w, h * 0.07);
      }
      ctx.globalAlpha = 1;
      drawRidge(ctx, near, w, h, d, -s.px * w * near.par, 1);

      // Yanar Dag: a strip of fire along the hillside that never goes out
      ctx.globalCompositeOperation = 'lighter';
      const fw2 = w * 0.06;
      glow(ctx, s.fire, s.sx, s.sy, fw2 * (1.1 + s.flare), 0.35 + s.flare * 0.3);
      for (let i = 0; i < 16; i++) {
        const u = i / 15 - 0.5;
        const x = s.sx + u * fw2 + Math.sin(i * 7.3) * 3;
        const y = s.sy + Math.abs(u) * h * 0.012;
        const fl = 0.55 + 0.45 * Math.sin(t * 9 + i * 2.1) * Math.sin(t * 5.3 + i * 1.3);
        const hgt = h * (0.018 + 0.03 * fl) * (1 + s.flare * 1.8) * (1 - Math.abs(u) * 0.9);
        const wd = fw2 * 0.05;
        const sway = Math.sin(t * 4 + i) * wd * 1.4 + wd;
        const fg = ctx.createLinearGradient(0, y, 0, y - hgt);
        fg.addColorStop(0, 'rgba(255,240,190,0.9)');
        fg.addColorStop(0.35, 'rgba(255,160,50,0.7)');
        fg.addColorStop(1, 'rgba(220,40,10,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(x - wd, y);
        ctx.quadraticCurveTo(x - wd * 0.8, y - hgt * 0.5, x + sway, y - hgt);
        ctx.quadraticCurveTo(x + wd * 0.9, y - hgt * 0.45, x + wd, y);
        ctx.closePath();
        ctx.fill();
      }
      for (const p of s.parts.items) {
        if (p.life <= 0) continue;
        const f = p.life / p.max;
        glow(ctx, s.ember, p.x + Math.sin(t * 3 + p.rot) * 4, p.y, p.size * 1.6, f);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      drawRidge(ctx, crest, w, h, d, -s.px * w * crest.par, 1);

      // the traveller on the crest, facing east over the water
      const cx = w * 0.22 - s.px * w * crest.par;
      const cy = ridgeY(crest, w, h, cx, -s.px * w * crest.par) + 1;
      const sc = Math.min(w, h) * 0.002;
      const wind = Math.sin(t * 2.2) * 0.5 + Math.sin(t * 3.7) * 0.3;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      const ink = mix([3, 4, 10], [16, 8, 14], d);
      ctx.fillStyle = ink;
      ctx.strokeStyle = ink;
      // staff
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(16, -64);
      ctx.lineTo(20, 0);
      ctx.stroke();
      // legs
      ctx.fillRect(-6, -26, 6, 26);
      ctx.fillRect(2, -26, 6, 26);
      // cloak blowing back toward the mountains
      ctx.beginPath();
      ctx.moveTo(-6, -50);
      ctx.bezierCurveTo(-16 - wind * 4, -36, -26 - wind * 10, -20, -32 - wind * 12, -12 + wind * 3);
      ctx.lineTo(-20 - wind * 6, -14);
      ctx.lineTo(-8, -18);
      ctx.lineTo(10, -20);
      ctx.lineTo(10, -50);
      ctx.closePath();
      ctx.fill();
      // body, pack and hood
      ctx.beginPath();
      ctx.roundRect(-8, -54, 18, 34, 6);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-16, -52, 10, 20, 3);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(3, -61, 7.5, 0, TAU);
      ctx.fill();
      // arm to the staff
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(4, -48);
      ctx.lineTo(16, -40);
      ctx.stroke();
      // rim light from the sunrise
      ctx.strokeStyle = `rgba(255,190,130,${(d * 0.8).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(3, -61, 7.5, -Math.PI * 0.6, Math.PI * 0.2);
      ctx.moveTo(10, -50);
      ctx.lineTo(10, -22);
      ctx.stroke();
      ctx.restore();

      // grass blades on the crest leaning in the wind
      ctx.strokeStyle = mix([6, 8, 14], [26, 16, 22], d);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 60; i++) {
        const x = (i / 60) * w * 0.55;
        const y = ridgeY(crest, w, h, x, -s.px * w * crest.par) + 2;
        const len = 6 + (i % 5) * 2;
        const lean = (wind + Math.sin(t * 2 + i)) * 3;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + lean * 0.4, y - len * 0.6, x + lean, y - len);
      }
      ctx.stroke();

      // warm wash across everything as the sun clears the sea
      if (d > 0) {
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = `rgba(255,170,110,${(d * 0.25).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = s.vignette ?? 'transparent';
      ctx.fillRect(0, 0, w, h);
    },
    onPointerDown: (s, env) => press(s, env),
    onPointerUp: (s, env) => release(s, env),
    onPointerLeave: (s, env) => release(s, env),
    onPointerMove: (_s, env) => {
      if (env.reducedMotion) env.wake(700);
    },
    onKey: (s, env, e, down) => {
      if (e.key !== ' ' && e.key !== 'Enter') return false;
      if (e.repeat) return true;
      if (down) press(s, env);
      else release(s, env);
      return true;
    },
    dispose: (s) => {
      freeCanvas(s.sun, s.moon, s.fire, s.ember, s.mistS);
    },
  });
